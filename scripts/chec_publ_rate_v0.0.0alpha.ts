// 156:19
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
import express, { type Request } from "express";
import { readFileSync } from "node:fs";

process.env.AUTH_LOGIN_ATTEMPT_LIMIT = "1";
process.env.AUTH_LOGIN_WINDOW_SECONDS = "60";
process.env.SESSION_SECRET ??= "ci-public-rate-limit-secret";

const { pool } = await import("../server/db");
const {
  consumePublicRateLimit,
  isMeteredPublicModelPath,
  publicClientIp, publicModelAccountKey,
} = await import("../server/auth/serv_auth_rate_limt_v0.0.0alpha");

function fakeRequest(ip: string): Request {
  return { ip, socket: { remoteAddress: ip } } as unknown as Request;
}

async function clean(): Promise<void> {
  await pool.query("DELETE FROM security_probes WHERE probe_type = 'rate_login'");
}

// Usage: DATABASE_URL=<isolated test database> node --import tsx scripts/chec_publ_rate_v0.0.0alpha.ts
// --unit exercises pure request boundaries without opening a database connection.
async function main(): Promise<void> {
  for (const path of [
    "/api/v1/conversations/%31/messages", "/api/v1/conversations%2F1%2Fmessages",
    "/api/v1/conversations/1/messages/", "/api/v1/cli/chat?x=1",
  ]) assert.equal(isMeteredPublicModelPath("POST", path), true, path);
  assert.throws(() => isMeteredPublicModelPath("POST", "/api/v1/conversations/%ZZ/messages"), URIError);
  const cliRequest = {
    method: "POST", originalUrl: "/api/v1/cli/%63hat",
    headers: { authorization: "Bearer a0k_CaseSensitive" },
  } as Request;
  assert.equal(publicModelAccountKey(cliRequest), "cli:a0k_CaseSensitive");
  cliRequest.headers = { "x-api-key": "a0k_other" };
  assert.equal(publicModelAccountKey(cliRequest), "cli:a0k_other");
  cliRequest.headers = {};
  assert.equal(publicModelAccountKey(cliRequest), "cli:anonymous");
  const incoming = { ...fakeRequest("127.0.0.1"), headers: { "x-forwarded-for": "spoof, 192.0.2.1, 169.254.1.1" } } as Request;
  process.env.K_SERVICE = "a0p-test";
  assert.equal(publicClientIp(incoming), "192.0.2.1");
  incoming.headers["x-forwarded-for"] = "different, 192.0.2.2, 169.254.1.1";
  assert.equal(publicClientIp(incoming), "192.0.2.2");
  incoming.headers["x-forwarded-for"] = "2001:db8::1, 2001:db8::2";
  assert.equal(publicClientIp(incoming), "2001:db8::1");
  incoming.headers["x-forwarded-for"] = "192.0.2.1";
  assert.throws(() => publicClientIp(incoming));
  delete process.env.K_SERVICE;
  assert.equal(publicClientIp(incoming), "127.0.0.1");
  const deployment = readFileSync(".github/workflows/deploy.yml", "utf8");
  assert.match(deployment, /\npermissions:\n  contents: read/);
  assert.match(deployment, /ADMIN_PASSWORD=a0p-admin-password:latest/);
  const entry = readFileSync("server/index.ts", "utf8");
  assert.match(entry, /fontSrc:.*https:\/\/fonts.gstatic.com/);
  assert.match(entry, /styleSrc:.*https:\/\/fonts.googleapis.com/);
  if (process.argv.includes("--unit")) {
    await pool.end();
    console.log("public request boundary unit checks passed");
    return;
  }
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
  await pool.query("INSERT INTO security_probes (probe_type, created_at) SELECT 'rate_login', NOW() - INTERVAL '2 minutes' FROM generate_series(1, 105)");
  await pool.query("INSERT INTO security_probes (probe_type, created_at) VALUES ('test_keep_probe', NOW() - INTERVAL '2 days')");
  await consumePublicRateLimit(fakeRequest("192.0.2.10"), "login", "retention");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM security_probes WHERE probe_type = 'rate_login' AND created_at < NOW() - INTERVAL '60 seconds'")).rows[0].n, 5);
  await consumePublicRateLimit(fakeRequest("192.0.2.10"), "login", "retention");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM security_probes WHERE probe_type = 'rate_login'")).rows[0].n, 1);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM security_probes WHERE probe_type = 'test_keep_probe'")).rows[0].n, 1);
  await pool.query("DELETE FROM security_probes WHERE probe_type = 'test_keep_probe'");
  process.env.PUBLIC_MODEL_REQUEST_LIMIT = "1";
  const cliKey = "cli:a0k_test-limit";
  assert.equal((await consumePublicRateLimit(fakeRequest("192.0.2.11"), "model", cliKey)).allowed, true);
  assert.equal((await consumePublicRateLimit(fakeRequest("192.0.2.12"), "model", cliKey)).allowed, false);
  await pool.query("DELETE FROM security_probes WHERE probe_type = 'rate_model'");
  await checkGuestAndBootstrap();
  await clean();
  await pool.end();
  console.log("public request rate limit check passed");
}

async function checkGuestAndBootstrap(): Promise<void> {
  const { getOrCreateGuestWindow, incrementGuestTokensAtomic, settleGuestTokensAtomic, authStorage } = await import("../server/auth/storage");
  const windows = await Promise.all(Array.from({ length: 8 }, () => getOrCreateGuestWindow("ci-guest-window")));
  assert.equal(new Set(windows.map((w) => w.id)).size, 1, "concurrent requests share one hour/IP window");
  const id = windows[0].id;
  const reservations = await Promise.all(Array.from({ length: 4 }, () => incrementGuestTokensAtomic(id, 512, 2000)));
  assert.equal(reservations.filter((r) => r.accepted).length, 3);
  await Promise.all([settleGuestTokensAtomic(id, 512, 10), settleGuestTokensAtomic(id, 512, 20), settleGuestTokensAtomic(id, 512, 0)]);
  assert.equal((await getOrCreateGuestWindow("ci-guest-window")).tokensUsed, 30);

  const { registerGuestChatRoute } = await import("../server/auth/guest-chat");
  const app = express();
  app.use(express.json());
  registerGuestChatRoute(app);
  const listener = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => listener.on("listening", resolve));
  const address = listener.address() as { port: number };
  const originalFetch = globalThis.fetch;
  const url = `http://127.0.0.1:${address.port}`;
  const send = () => originalFetch(`${url}/api/guest/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "hello" }),
  });
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ content: "ok", tokens_used: 12 }), { status: 200 });
    const response = await send();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).tokensUsed, 12);
    globalThis.fetch = async () => new Response("failure", { status: 500 });
    assert.equal((await send()).status, 502);
    globalThis.fetch = async () => { throw new Error("simulated backend outage"); };
    assert.equal((await send()).status, 502);
    assert.equal((await (await originalFetch(`${url}/api/guest/status`)).json()).tokensUsed, 12);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
    await pool.query("DELETE FROM guest_token_usage");
  }

  const { seedAdminUser } = await import("../server/auth/seed");
  process.env.ADMIN_EMAIL = "ci-bootstrap@example.test";
  process.env.ADMIN_PASSWORD = "ci-only-bootstrap-passphrase";
  await seedAdminUser();
  const owner = await authStorage.getUserByEmail(process.env.ADMIN_EMAIL);
  assert.equal(owner?.role, "admin");
  assert.equal(owner?.subscriptionTier, "admin");
  await seedAdminUser();
  assert.equal((await authStorage.getUserByEmail(process.env.ADMIN_EMAIL))?.id, owner?.id);
  await pool.query("UPDATE users SET role = 'user' WHERE id = $1", [owner!.id]);
  await assert.rejects(seedAdminUser(), /non-admin account/);
  await pool.query("DELETE FROM users WHERE id = $1", [owner!.id]);
  delete process.env.ADMIN_PASSWORD;
  await assert.rejects(seedAdminUser(), /ADMIN_PASSWORD/);
  delete process.env.ADMIN_EMAIL;
}

main().catch(async (error) => {
  console.error(error);
  await clean().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
// 156:19
