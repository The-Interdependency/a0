// 99:20 2:2 2:1
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

  // The sorted advisory locks and insert share one transaction-sized statement.
  // Lock both dimensions so distributed callers cannot race either the IP or
  // account limit across Cloud Run instances.
  const result = await pool.query<{ id: number }>(
    `WITH lock_keys AS (
       SELECT unnest(array_remove(ARRAY[$1::text, $8::text], NULL)) AS key
     ), gate AS MATERIALIZED (
       SELECT pg_advisory_xact_lock(hashtextextended(key, 0))
       FROM lock_keys
       ORDER BY key
     ), gate_ready AS (
       SELECT COUNT(*) FROM gate
     ), recent AS (
       SELECT COUNT(*)::integer AS count
       FROM security_probes, gate_ready
       WHERE probe_type = $2
         AND created_at >= NOW() - ($3 * INTERVAL '1 second')
         AND (ip_hash = $4 OR ($5::varchar IS NOT NULL AND account_hash = $5))
     )
     INSERT INTO security_probes (probe_type, ip_hash, account_hash, detail)
     SELECT $2, $4, $5, $6::jsonb
     FROM recent
     WHERE recent.count < $7
     RETURNING id`,
    [
      ipLockKey,
      probeType,
      windowSeconds,
      ipHash,
      accountHash,
      JSON.stringify({ window_seconds: windowSeconds, limit }),
      limit,
      accountLockKey,
    ],
  );

  return { allowed: result.rowCount === 1, retryAfterSeconds: windowSeconds };
}
// 99:20 2:2 2:1
