import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import type { Express, Request, Response, NextFunction } from "express";
import { pool } from "../../db";
import { authStorage } from "./storage";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const PgStore = ConnectPgSimple(session);
  const sessionStore = new PgStore({
    pool,
    createTableIfMissing: false,
    ttl: sessionTtl / 1000,
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: "lax",
    },
    store: sessionStore,
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  app.use(async (req: Request, _res: Response, next: NextFunction) => {
    const userId = req.headers["x-replit-user-id"] as string | undefined;
    if (userId && (!req.session.userId || req.session.userId !== userId)) {
      const userName = req.headers["x-replit-user-name"] as string ?? "";
      const userEmail = req.headers["x-replit-user-email"] as string ?? undefined;
      const profileImage = req.headers["x-replit-user-profile-image"] as string ?? undefined;
      try {
        await authStorage.upsertUser({
          id: userId,
          email: userEmail ?? null,
          firstName: userName || null,
          lastName: null,
          profileImageUrl: profileImage ?? null,
        });
      } catch {
        // non-fatal
      }
      req.session.userId = userId;
      req.session.userName = userName;
      req.session.userEmail = userEmail;
      req.session.profileImageUrl = profileImage;
    }
    next();
  });
}
