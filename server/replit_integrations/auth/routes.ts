import type { Express, Request, Response } from "express";
import { authStorage } from "./storage";

export function registerAuthRoutes(app: Express) {
  app.get("/api/auth/user", async (req: Request, res: Response) => {
    const userId = req.session.userId || (req.headers["x-replit-user-id"] as string);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      let user = await authStorage.getUser(userId);
      if (!user) {
        user = await authStorage.upsertUser({
          id: userId,
          email: (req.headers["x-replit-user-email"] as string) ?? null,
          firstName: (req.headers["x-replit-user-name"] as string) ?? null,
          lastName: null,
          profileImageUrl: (req.headers["x-replit-user-profile-image"] as string) ?? null,
        });
      }
      res.json(user);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/login", (req: Request, res: Response) => {
    const domains = process.env.REPLIT_DOMAINS ?? "";
    const domain = domains.split(",")[0].trim();
    if (domain) {
      return res.redirect(`https://${domain}/`);
    }
    res.redirect("/");
  });

  app.get("/api/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.redirect("/");
    });
  });
}
