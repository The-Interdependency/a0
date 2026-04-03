import type { Express } from "express";
import passport from "passport";
import { authStorage } from "./storage";

export function registerAuthRoutes(app: Express) {
  app.get("/api/login", (req, res, next) => {
    const domain =
      req.hostname ||
      (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
    passport.authenticate(`replitauth:${domain}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    const domain =
      req.hostname ||
      (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
    passport.authenticate(`replitauth:${domain}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });

  app.get("/api/auth/user", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.claims?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const user = await authStorage.getUser(req.user.claims.sub);
      res.json(user);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
