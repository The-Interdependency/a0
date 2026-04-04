import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { authStorage } from "./storage";
import { hashPassphrase, verifyPassphrase, validatePassphrase } from "./password";

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
    const { email, passphrase } = req.body ?? {};
    if (!email || !passphrase) {
      return res.status(400).json({ message: "Email and passphrase are required" });
    }
    try {
      const user = await authStorage.getUserByEmail(email);
      if (!user || !user.passphraseHash || !user.isActive) {
        return res.status(401).json({ message: "Invalid email or passphrase" });
      }
      const ok = await verifyPassphrase(passphrase, user.passphraseHash);
      if (!ok) {
        return res.status(401).json({ message: "Invalid email or passphrase" });
      }
      await authStorage.updateLastLogin(user.id);
      req.session.userId = user.id;
      req.session.userEmail = user.email ?? undefined;
      req.session.userRole = user.role;
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

      req.session.userId = user.id;
      req.session.userEmail = user.email ?? undefined;
      req.session.userRole = user.role;

      const { passphraseHash: _, ...safe } = user;
      res.status(201).json({ user: safe });
    } catch (err: any) {
      if (err?.code === "23505") {
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
      req.session.resetToken = resetToken;
      req.session.resetTokenExpiry = Date.now() + FIFTEEN_MIN;
      req.session.resetVerifiedUserId = userId;
      delete req.session.pendingResetUserId;
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
    const tokenValid =
      req.session.resetToken &&
      req.session.resetTokenExpiry &&
      req.session.resetToken === resetToken &&
      Date.now() <= req.session.resetTokenExpiry;
    if (!tokenValid || !req.session.resetVerifiedUserId) {
      delete req.session.resetToken;
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
      delete req.session.resetToken;
      delete req.session.resetTokenExpiry;
      delete req.session.resetVerifiedUserId;
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
