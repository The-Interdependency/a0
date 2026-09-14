// 395:44 1:1 1:3
import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { authStorage } from "./storage";
import { hashPassphrase, verifyPassphrase, validatePassphrase } from "./password";
import { regenerateSession } from "./setup";
import { consumePublicRateLimit } from "./serv_auth_rate_limt_v0.0.0alpha";
import { toPublicUser } from "./serv_auth_user_view_v0.0.0alpha";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** sha256 of an attacker-supplied value — hashed before storage so we never keep plaintext credentials. */
function probeHash(value: string): string {
  return sha256Hex(value);
}

/** Returns a stable hash of the request IP for storage, never the raw address. */
function ipHash(req: Request): string {
  return sha256Hex(String(req.ip ?? req.socket?.remoteAddress ?? "unknown"));
}

/**
 * Fire-and-forget probe logger.  Never awaited on the hot path.
 */
function logProbe(
  probeType: string,
  req: Request,
  accountKey: string | null,
  detail: Record<string, unknown>
): void {
  const ih = ipHash(req);
  const ah = accountKey ? probeHash(accountKey) : null;
  const ua = String(req.headers["user-agent"] ?? "");
  authStorage
    .logSecurityProbe(probeType, ih, ah, {
      ua_hash: probeHash(ua),
      ...detail,
    })
    .catch((err) => console.warn("[probe] log failed:", err));
}

/**
 * Fire-and-forget call to the FastAPI internal endpoint that promotes
 * recognized work-email accounts to the WS tier. Failures are logged
 * but never block the auth flow.
 */
async function tryPromoteWs(userId: string, email: string | null | undefined): Promise<void> {
  try {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) {
      return;
    }
    const port = process.env.PYTHON_PORT || "8001";
    const url = `http://127.0.0.1:${port}/api/v1/billing/internal/promote-ws`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-a0p-internal": secret,
          "x-internal-secret": secret,
        },
        body: JSON.stringify({ user_id: userId, email: email ?? null }),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn(`[auth] promote-ws non-OK: ${res.status} ${await res.text().catch(() => "")}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.warn("[auth] promote-ws call failed (non-fatal):", err);
  }
}

export function registerAuthRoutes(app: Express) {
  app.get("/api/auth/user", async (req: Request, res: Response) => {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const user = await authStorage.getUser(userId);
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "User not found" });
      }
      res.json(toPublicUser(user));
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { username, passphrase } = req.body ?? {};
    if (!username || !passphrase) {
      return res.status(400).json({ message: "Username and passphrase are required" });
    }
    if (typeof username !== "string" || username.length > 80 || typeof passphrase !== "string" || passphrase.length > 512) {
      return res.status(400).json({ message: "Invalid username or passphrase" });
    }
    try {
      const rate = await consumePublicRateLimit(req, "login", username);
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds));
        return res.status(429).json({ message: "Too many sign-in attempts. Please wait and try again." });
      }
      const user = await authStorage.getUserByUsername(username);
      if (!user || !user.passphraseHash || !user.isActive) {
        return res.status(401).json({ message: "Invalid username or passphrase" });
      }
      const ok = await verifyPassphrase(passphrase, user.passphraseHash);
      if (!ok) {
        return res.status(401).json({ message: "Invalid username or passphrase" });
      }
      await authStorage.updateLastLogin(user.id);
      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.userEmail = user.email ?? undefined;
      req.session.userRole = user.role;
      void tryPromoteWs(user.id, user.email);
      res.json({ user: toPublicUser(user) });
    } catch (err) {
      console.error("[auth] Login error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { username, email, passphrase, displayName, challenges } = req.body ?? {};

    if (!username || !email || !passphrase) {
      return res.status(400).json({ message: "Username, email, and passphrase are required" });
    }
    if (
      typeof username !== "string" ||
      !/^[a-zA-Z0-9_.-]{3,40}$/.test(username) ||
      typeof email !== "string" ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof passphrase !== "string" ||
      passphrase.length > 512 ||
      (displayName !== undefined && (typeof displayName !== "string" || displayName.length > 80)) ||
      (challenges !== undefined && (
        !Array.isArray(challenges) ||
        challenges.length > 3 ||
        challenges.some((challenge: unknown) => {
          if (!challenge || typeof challenge !== "object") return true;
          const value = challenge as Record<string, unknown>;
          return (
            typeof value.question !== "string" ||
            value.question.length < 5 ||
            value.question.length > 200 ||
            typeof value.answer !== "string" ||
            value.answer.length < 2 ||
            Buffer.byteLength(value.answer, "utf8") > 72
          );
        })
      ))
    ) {
      return res.status(400).json({ message: "Invalid registration fields" });
    }

    const validation = validatePassphrase(passphrase);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.error });
    }

    try {
      const rate = await consumePublicRateLimit(req, "signup", email);
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds));
        return res.status(429).json({ message: "Too many account requests. Please wait and try again." });
      }
      const existing = await authStorage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with that email already exists" });
      }

      const passphraseHash = await hashPassphrase(passphrase);
      const user = await authStorage.createUser({
        username,
        email,
        passphraseHash,
        displayName: displayName || username,
        role: "user",
      });

      if (Array.isArray(challenges) && challenges.length > 0) {
        for (let i = 0; i < Math.min(challenges.length, 3); i++) {
          const { question, answer } = challenges[i] ?? {};
          if (question && answer && question.trim() && answer.trim()) {
            const answerHash = await hashPassphrase(answer.trim().toLowerCase());
            await authStorage.addChallengeResponse(user.id, question.trim(), answerHash, i);
          }
        }
      }

      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.userEmail = user.email ?? undefined;
      req.session.userRole = user.role;
      void tryPromoteWs(user.id, user.email);

      res.status(201).json({ user: toPublicUser(user) });
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as Record<string, unknown>).code === "23505"
      ) {
        return res.status(409).json({ message: "Username or email already taken" });
      }
      console.error("[auth] Register error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  // ─── Password-recovery flow ────────────────────────────────────────────────

  // Pool of plausible recovery questions used to build per-email decoys.
  // Derived deterministically from sha256(email) — same address always gets the
  // same question (repeated probes are consistent), different addresses get
  // different ones (no fixed fingerprint to detect as fake).
  const DECOY_POOL = [
    "What is the name of your childhood best friend?",
    "What was the make and model of your first car?",
    "In what city were you born?",
    "What is your mother's maiden name?",
    "What was the name of your first school?",
    "What is the name of your oldest sibling?",
    "What was your childhood nickname?",
    "What is the name of the street you grew up on?",
    "What was the name of your first pet?",
    "What is your paternal grandmother's first name?",
    "What was the mascot of your high school?",
    "What is the first concert you attended?",
    "What was the name of your favourite teacher?",
    "In what city did your parents meet?",
    "What was the name of the hospital where you were born?",
    "What was your childhood hero's name?",
  ];

  function decoyQuestionFor(email: string): { id: number; question: string; sortOrder: number } {
    const hash = crypto.createHash("sha256").update(email.toLowerCase().trim()).digest();
    const idx = hash.readUInt32BE(0) % DECOY_POOL.length;
    return { id: 0, question: DECOY_POOL[idx], sortOrder: 0 };
  }

  /**
   * Issues a honeypot reset token indistinguishable from a real one.
   * The attacker believes they have succeeded; the session is flagged so
   * /reset/passphrase will log their chosen credentials and return fake 200.
   */
  function issueHoneypotToken(req: Request, res: Response): void {
    const fakeToken = crypto.randomBytes(32).toString("hex");
    const FIFTEEN_MIN = 15 * 60 * 1000;
    // Store the hash identically to the real flow so the passphrase endpoint's
    // token-validation logic still passes — we just check resetIsHoneypot first.
    req.session.resetTokenHash = sha256Hex(fakeToken);
    req.session.resetTokenExpiry = Date.now() + FIFTEEN_MIN;
    req.session.resetIsHoneypot = true;
    delete req.session.pendingResetUserId;
    delete req.session.pendingResetExpiry;
    delete req.session.pendingResetIsDecoy;
    res.json({ resetToken: fakeToken });
  }

  app.get("/api/auth/reset/questions", async (req: Request, res: Response) => {
    const { email } = req.query as { email?: string };
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    const FIFTEEN_MIN = 15 * 60 * 1000;
    try {
      const user = await authStorage.getUserByEmail(email);
      if (!user) {
        // Return 200 + per-email decoy — callers cannot distinguish "no account"
        // from "account without recovery questions" by status code or question text.
        req.session.pendingResetIsDecoy = true;
        req.session.pendingResetExpiry = Date.now() + FIFTEEN_MIN;
        return res.json({ questions: [decoyQuestionFor(email)] });
      }
      // Gate on the durable account-level lockout before revealing any real state.
      const locked = await authStorage.isRecoveryLocked(user.id);
      if (locked) {
        return res.status(429).json({ message: "Too many failed recovery attempts. Please wait before trying again." });
      }
      const allQuestions = await authStorage.getChallengeQuestions(user.id);
      if (allQuestions.length === 0) {
        // Decoy path — indistinguishable from "no account".
        req.session.pendingResetIsDecoy = true;
        req.session.pendingResetExpiry = Date.now() + FIFTEEN_MIN;
        return res.json({ questions: [decoyQuestionFor(email)] });
      }
      // Pick exactly one question at random — never expose the full set.
      const picked = allQuestions[Math.floor(Math.random() * allQuestions.length)];
      req.session.pendingResetUserId = user.id;
      req.session.pendingResetExpiry = Date.now() + FIFTEEN_MIN;
      res.json({ questions: [{ id: picked.id, question: picked.question, sortOrder: picked.sortOrder }] });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/reset/verify", async (req: Request, res: Response) => {
    const { challengeId, answer } = req.body ?? {};
    if (!challengeId || !answer) {
      return res.status(400).json({ message: "challengeId and answer are required" });
    }

    // TTL check applies to both real and decoy sessions.
    if (!req.session.pendingResetExpiry || Date.now() > req.session.pendingResetExpiry) {
      delete req.session.pendingResetUserId;
      delete req.session.pendingResetExpiry;
      delete req.session.pendingResetIsDecoy;
      return res.status(400).json({ message: "Recovery session expired. Please start over." });
    }

    // Decoy sessions — no matching account or account has no recovery questions.
    // Log the probe so we capture what answers they're trying, then fail gracefully.
    if (req.session.pendingResetIsDecoy) {
      logProbe("decoy_probe", req, null, {
        answer_hash: probeHash(String(answer)),
        challenge_id: challengeId,
      });
      delete req.session.pendingResetIsDecoy;
      delete req.session.pendingResetExpiry;
      return res.status(401).json({ message: "Incorrect answer" });
    }

    const userId = req.session.pendingResetUserId;
    if (!userId) {
      return res.status(400).json({ message: "No pending reset session. Start from the email step." });
    }

    try {
      // Check durable account-level lockout BEFORE bcrypt — blocks session-restart bypass.
      // If already locked while they have an active session: issue honeypot instead of
      // revealing the lockout state, capturing their next attempted passphrase.
      const alreadyLocked = await authStorage.isRecoveryLocked(userId);
      if (alreadyLocked) {
        logProbe("honeypot_trigger", req, userId, {
          reason: "already_locked",
          answer_hash: probeHash(String(answer)),
        });
        return issueHoneypotToken(req, res);
      }

      // Log every real verify attempt (before bcrypt) for pattern analysis.
      logProbe("recovery_probe", req, userId, {
        answer_hash: probeHash(String(answer)),
        challenge_id: challengeId,
      });

      const ok = await authStorage.verifyChallengeAnswer(userId, Number(challengeId), answer);
      if (!ok) {
        const { locked } = await authStorage.recordRecoveryFailure(userId);
        if (locked) {
          // Lockout threshold just crossed. Trap the attacker in the honeypot
          // instead of returning 429 — they believe they've succeeded.
          logProbe("honeypot_trigger", req, userId, {
            reason: "lockout_threshold",
            answer_hash: probeHash(String(answer)),
          });
          return issueHoneypotToken(req, res);
        }
        return res.status(401).json({ message: "Incorrect answer" });
      }

      // Genuine success — clear attempt record and issue the real token.
      await authStorage.clearRecoveryAttempts(userId);
      const resetToken = crypto.randomBytes(32).toString("hex");
      const FIFTEEN_MIN = 15 * 60 * 1000;
      req.session.resetTokenHash = sha256Hex(resetToken);
      req.session.resetTokenExpiry = Date.now() + FIFTEEN_MIN;
      req.session.resetVerifiedUserId = userId;
      delete req.session.pendingResetUserId;
      delete req.session.pendingResetExpiry;
      delete req.session.resetToken;
      res.json({ resetToken });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/reset/passphrase", async (req: Request, res: Response) => {
    const { resetToken, newPassphrase } = req.body ?? {};
    if (!resetToken || !newPassphrase) {
      return res.status(400).json({ message: "resetToken and newPassphrase are required" });
    }

    // ── Honeypot path ────────────────────────────────────────────────────────
    // Validate the token shape first so we don't expose a bypass via this check.
    if (req.session.resetIsHoneypot) {
      const storedHash = req.session.resetTokenHash;
      const presentedHash = typeof resetToken === "string" ? sha256Hex(resetToken) : "";
      let tokenShapeValid = false;
      if (
        storedHash &&
        req.session.resetTokenExpiry &&
        presentedHash.length === storedHash.length &&
        Date.now() <= req.session.resetTokenExpiry
      ) {
        tokenShapeValid = crypto.timingSafeEqual(
          Buffer.from(storedHash, "hex"),
          Buffer.from(presentedHash, "hex"),
        );
      }
      if (tokenShapeValid) {
        // Capture the attacker's chosen new password (hashed) and all fingerprint
        // data, then return a fake success — they believe the account is theirs.
        logProbe("honeypot_passphrase", req, null, {
          passphrase_hash: probeHash(String(newPassphrase)),
          passphrase_len: String(newPassphrase).length,
        });
      }
      // Clear honeypot session state regardless of token validity.
      delete req.session.resetIsHoneypot;
      delete req.session.resetTokenHash;
      delete req.session.resetTokenExpiry;
      // Return fake 200 OK — attacker thinks they've reset the password.
      return res.json({ ok: true });
    }
    // ── End honeypot path ────────────────────────────────────────────────────

    const storedHash = req.session.resetTokenHash;
    const presentedHash = typeof resetToken === "string" ? sha256Hex(resetToken) : "";
    let tokenValid = false;
    if (
      storedHash &&
      req.session.resetTokenExpiry &&
      presentedHash.length === storedHash.length &&
      Date.now() <= req.session.resetTokenExpiry
    ) {
      tokenValid = crypto.timingSafeEqual(
        Buffer.from(storedHash, "hex"),
        Buffer.from(presentedHash, "hex"),
      );
    }
    if (!tokenValid || !req.session.resetVerifiedUserId) {
      delete req.session.resetTokenHash;
      delete req.session.resetTokenExpiry;
      delete req.session.resetVerifiedUserId;
      return res.status(401).json({ message: "Invalid or expired reset token" });
    }

    const validation = validatePassphrase(newPassphrase);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.error });
    }

    const resetUserId = req.session.resetVerifiedUserId;

    try {
      const newHash = await hashPassphrase(newPassphrase);
      await authStorage.updatePassphrase(resetUserId, newHash);
      await regenerateSession(req);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
// 395:44 1:1 1:3
