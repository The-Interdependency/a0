// 51:17
// === MODULE_BUILD ===
// id: check_a0_public_request_rate_limit
//   module_name: public request rate limit check
//   module_kind: experiment
//   summary: Verifies public endpoint recognition and atomic IP/account request limits against PostgreSQL.
//   owner: Erin Spencer
//   public_surface: none
//   internal_surface: fakeRequest, clean, main
//   auth_boundary: read
//   storage_boundary: write
//   network_boundary: none
//   user_data_boundary: none
//   admin_only: false
//   tests: self
//   rollout: CI only
//   rollback: Remove this check with the public request limiter.
// === END MODULE_BUILD ===
import assert from "node:assert/strict";
import type { Request } from "express";

process.env.AUTH_LOGIN_ATTEMPT_LIMIT = "1";
process.env.AUTH_LOGIN_WINDOW_SECONDS = "60";
process.env.SESSION_SECRET ??= "ci-public-rate-limit-secret";

const { pool } = await import("../server/db");
const {
  consumePublicRateLimit,
  isMeteredPublicModelPath,
} = await import("../server/auth/serv_auth_rate_limt_v0.0.0alpha");

function fakeRequest(ip: string): Request {
  return { ip, socket: { remoteAddress: ip } } as unknown as Request;
}

async function clean(): Promise<void> {
  await pool.query("DELETE FROM security_probes WHERE probe_type = 'rate_login'");
}

async function main(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_probes (
      id SERIAL PRIMARY KEY,
      probe_type VARCHAR(64) NOT NULL,
      ip_hash VARCHAR(64),
      account_hash VARCHAR(64),
      detail JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  assert.equal(isMeteredPublicModelPath("POST", "/api/v1/conversations/12/messages"), true);
  assert.equal(isMeteredPublicModelPath("GET", "/api/v1/conversations/12/messages"), false);

  await clean();
  const byAccount = await Promise.all([
    consumePublicRateLimit(fakeRequest("192.0.2.1"), "login", "same-account"),
    consumePublicRateLimit(fakeRequest("192.0.2.2"), "login", "same-account"),
  ]);
  assert.equal(byAccount.filter((result) => result.allowed).length, 1);

  await clean();
  const byIp = await Promise.all([
    consumePublicRateLimit(fakeRequest("192.0.2.3"), "login", "account-one"),
    consumePublicRateLimit(fakeRequest("192.0.2.3"), "login", "account-two"),
  ]);
  assert.equal(byIp.filter((result) => result.allowed).length, 1);

  await clean();
  await pool.end();
  console.log("public request rate limit check passed");
}

main().catch(async (error) => {
  console.error(error);
  await clean().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
// 51:17
