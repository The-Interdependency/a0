// 71:7 1:1 1:1
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import type { Express } from "express";
import { pool } from "../db";

export async function setupAuth(app: Express) {
  // Cloud Run supplies the client and frontend address as the final two XFF
  // entries. Never trust a caller-supplied leftmost prefix or local-dev headers.
  // Usage: keep Express private behind Cloud Run; verify this suffix in staging.
  app.set("trust proxy", process.env.K_SERVICE ? 2 : false);

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

  // Durable per-account rate-limit table for the recovery flow.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS recovery_attempts (
        user_id      VARCHAR PRIMARY KEY,
        fail_count   INTEGER   NOT NULL DEFAULT 0,
        locked_until TIMESTAMP,
        updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[auth] recovery_attempts table ensured");
  } catch (err) {
    console.error("[auth] Failed to ensure recovery_attempts table:", err);
  }

  // Honeypot / deception intelligence table — captures attacker fingerprints,
  // probe patterns, and credentials attempted during fake-success flows.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS security_probes (
        id           SERIAL PRIMARY KEY,
        probe_type   VARCHAR(64)  NOT NULL,
        ip_hash      VARCHAR(64),
        account_hash VARCHAR(64),
        detail       JSONB        NOT NULL DEFAULT '{}',
        created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_security_probes_type_time
        ON security_probes (probe_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_security_probes_account
        ON security_probes (account_hash, created_at DESC);
    `);
    console.log("[auth] security_probes table ensured");
  } catch (err) {
    console.error("[auth] Failed to ensure security_probes table:", err);
  }

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
// 71:7 1:1 1:1
