// 226:16
import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { authStorage } from "./storage";
import { hashPassphrase, verifyPassphrase, validatePassphrase } from "./password";
import { regenerateSession } from "./setup";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
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
      // start-dev.sh exports a per-run secret in dev; if it's missing,
      // skip the call rather than 401-ing the user.
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
      const { passphraseHash: _, ...safe } = user;
      res.json(safe);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { username, passphrase } = req.body ?? {};
    if (!username || !passphrase) {
      return res.status(400).json({ message: "Username and passphrase are required" });
    }
    try {
      const user = await authStorage.getUserByUsername(username);
      if (!user || !user.passphraseHash || !user.isActive) {
        return res.status(401).json({ message: "Invalid username or passphrase" });
      }
      const ok = await verifyPassphrase(passphrase, user.passphraseHash);
      if (!ok) {
        return res.status(401).json({ message: "Invalid username or passphrase" });
      }
      await authStorage.updateLastLogin(user.id);
      // Regenerate session to prevent session-fixation attacks across the auth boundary.
      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.userEmail = user.email ?? undefined;
      req.session.userRole = user.role;
      // Fire-and-forget: promote work-email accounts to WS tier on every login.
      void tryPromoteWs(user.id, user.email);
      const { passphraseHash: _, ...safe } = user;
      res.json({ user: safe });
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

    const validation = validatePassphrase(passphrase);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.error });
    }

    try {
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

      // Regenerate session before establishing the new authenticated identity.
      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.userEmail = user.email ?? undefined;
      req.session.userRole = user.role;
      // Fire-and-forget: promote work-email accounts to WS tier on registration.
      void tryPromoteWs(user.id, user.email);

      const { passphraseHash: _, ...safe } = user;
      res.status(201).json({ user: safe });
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

  app.get("/api/auth/reset/questions", async (req: Request, res: Response) => {
    const { email } = req.query as { email?: string };
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    try {
      const user = await authStorage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "No account found with that email" });
      }
      const questions = await authStorage.getChallengeQuestions(user.id);
      if (questions.length === 0) {
        return res.status(404).json({ message: "No recovery questions set for this account" });
      }
      req.session.pendingResetUserId = user.id;
      res.json({ userId: user.id, questions });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/reset/verify", async (req: Request, res: Response) => {
    const { challengeId, answer } = req.body ?? {};
    if (!challengeId || !answer) {
      return res.status(400).json({ message: "challengeId and answer are required" });
    }
    const userId = req.session.pendingResetUserId;
    if (!userId) {
      return res.status(400).json({ message: "No pending reset session. Start from the email step." });
    }
    try {
      const ok = await authStorage.verifyChallengeAnswer(userId, Number(challengeId), answer);
      if (!ok) {
        return res.status(401).json({ message: "Incorrect answer" });
      }
      const resetToken = crypto.randomBytes(32).toString("hex");
      const FIFTEEN_MIN = 15 * 60 * 1000;
      // Store only the hash of the reset token in the session — never plaintext.
      // The plaintext is returned to the caller once and must be presented back.
      req.session.resetTokenHash = sha256Hex(resetToken);
      req.session.resetTokenExpiry = Date.now() + FIFTEEN_MIN;
      req.session.resetVerifiedUserId = userId;
      delete req.session.pendingResetUserId;
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
    const storedHash = req.session.resetTokenHash;
    const presentedHash = typeof resetToken === "string" ? sha256Hex(resetToken) : "";
    let tokenValid = false;
    if (
      storedHash &&
      req.session.resetTokenExpiry &&
      presentedHash.length === storedHash.length &&
      Date.now() <= req.session.resetTokenExpiry
    ) {
      // Constant-time comparison of the two SHA-256 hashes.
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
      // Burn any existing session and start fresh — invalidates other tabs that
      // may have been mid-flow with the prior credentials.
      await regenerateSession(req);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
// 226:16
