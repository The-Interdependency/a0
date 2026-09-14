// 100:20 2:2 2:1
// === MODULE_BUILD ===
// id: a0_public_request_rate_limit
//   module_name: public request rate limit
//   module_kind: service
//   summary: Atomically limits public authentication and model-request traffic across all application instances.
//   owner: Erin Spencer
//   public_surface: consumePublicRateLimit, isMeteredPublicModelPath, PublicRateLimitKind
//   internal_surface: hashBoundaryValue, positiveIntEnv, LIMITS, MODEL_REQUEST_PATHS
//   auth_boundary: read
//   storage_boundary: write
//   network_boundary: none
//   user_data_boundary: write
//   admin_only: false
//   tests: npm run check; public endpoint contract tests
//   rollout: default_enabled with environment overrides
//   rollback: Remove the middleware calls; stored probe rows expire from limit consideration automatically.
// === END MODULE_BUILD ===
import crypto from "crypto";
import type { Request } from "express";
import { pool } from "../db";

export type PublicRateLimitKind = "login" | "signup" | "model";

type LimitConfig = {
  limitEnv: string;
  windowEnv: string;
  defaultLimit: number;
  defaultWindowSeconds: number;
};

const LIMITS: Record<PublicRateLimitKind, LimitConfig> = {
  login: {
    limitEnv: "AUTH_LOGIN_ATTEMPT_LIMIT",
    windowEnv: "AUTH_LOGIN_WINDOW_SECONDS",
    defaultLimit: 10,
    defaultWindowSeconds: 15 * 60,
  },
  signup: {
    limitEnv: "AUTH_SIGNUP_ATTEMPT_LIMIT",
    windowEnv: "AUTH_SIGNUP_WINDOW_SECONDS",
    defaultLimit: 5,
    defaultWindowSeconds: 60 * 60,
  },
  model: {
    limitEnv: "PUBLIC_MODEL_REQUEST_LIMIT",
    windowEnv: "PUBLIC_MODEL_WINDOW_SECONDS",
    defaultLimit: 24,
    defaultWindowSeconds: 60 * 60,
  },
};

const MODEL_REQUEST_PATHS = [
  /^\/api\/v1\/conversations\/\d+\/messages$/,
  /^\/api\/v1\/conversations\/\d+\/focus$/,
  /^\/api\/v1\/fleet\/benchmarks\/\d+\/run$/,
  /^\/api\/v1\/agents\/instances\/\d+\/chat$/,
];

export function isMeteredPublicModelPath(method: string, originalUrl: string): boolean {
  if (method.toUpperCase() !== "POST") return false;
  const path = originalUrl.split("?", 1)[0];
  return MODEL_REQUEST_PATHS.some((pattern) => pattern.test(path));
}

function positiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hashBoundaryValue(kind: "ip" | "account", value: string): string {
  const secret = process.env.SESSION_SECRET ?? "a0p-dev-secret-change-in-production";
  return crypto.createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");
}

export async function consumePublicRateLimit(
  req: Request,
  kind: PublicRateLimitKind,
  accountKey?: string | null,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const config = LIMITS[kind];
  const limit = positiveIntEnv(config.limitEnv, config.defaultLimit);
  const windowSeconds = positiveIntEnv(config.windowEnv, config.defaultWindowSeconds);
  const ip = String(req.ip ?? req.socket?.remoteAddress ?? "unknown");
  const ipHash = hashBoundaryValue("ip", ip);
  const accountHash = accountKey
    ? hashBoundaryValue("account", accountKey.trim().toLowerCase())
    : null;
  const probeType = `rate_${kind}`;
  const ipLockKey = `${probeType}:ip:${ipHash}`;
  const accountLockKey = accountHash ? `${probeType}:account:${accountHash}` : null;

  // Acquire both dimensions in a stable order, then count in a later statement.
  // PostgreSQL assigns a statement snapshot before a blocked CTE resumes, so a
  // single-statement lock/count/insert can miss the request that held the lock.
  const lockKeys = [ipLockKey, accountLockKey].filter((key): key is string => Boolean(key)).sort();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const key of lockKeys) {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
    }
    const counts = await client.query<{ ip_count: number; account_count: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE ip_hash = $3)::integer AS ip_count,
         COUNT(*) FILTER (WHERE $4::varchar IS NOT NULL AND account_hash = $4)::integer AS account_count
       FROM security_probes
       WHERE probe_type = $1
         AND created_at >= clock_timestamp() - ($2 * INTERVAL '1 second')
         AND (ip_hash = $3 OR ($4::varchar IS NOT NULL AND account_hash = $4))`,
      [probeType, windowSeconds, ipHash, accountHash],
    );
    const { ip_count: ipCount, account_count: accountCount } = counts.rows[0];
    const allowed = ipCount < limit && (!accountHash || accountCount < limit);
    if (allowed) {
      await client.query(
        `INSERT INTO security_probes (probe_type, ip_hash, account_hash, detail)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [probeType, ipHash, accountHash, JSON.stringify({ window_seconds: windowSeconds, limit })],
      );
    }
    await client.query("COMMIT");
    return { allowed, retryAfterSeconds: windowSeconds };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
// 100:20 2:2 2:1
