// 39:1
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import type { Express } from "express";
import { pool } from "../db";

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  const IS_PROD = process.env.NODE_ENV === "production";
  const secret = process.env.SESSION_SECRET;
  if (!secret && IS_PROD) {
    throw new Error("[auth] SESSION_SECRET env var is required in production. Set it before starting the server.");
  }

  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const PgStore = ConnectPgSimple(session);

  const sessionStore = new PgStore({
    pool,
    tableName: "sessions",
    createTableIfMissing: true,
    ttl: sessionTtl / 1000,
  });

  app.use(
    session({
      secret: secret ?? "a0p-dev-secret-change-in-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: IS_PROD,
        maxAge: sessionTtl,
        sameSite: "strict",
      },
      store: sessionStore,
    })
  );
}

/** Promise-style wrapper around req.session.regenerate to use after auth events. */
export function regenerateSession(req: import("express").Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}
// 39:1
