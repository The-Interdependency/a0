// 112:0
import "./types.d.ts";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { spawn, type ChildProcess } from "child_process";
import express from "express";
import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";
import {
  setupAuth,
  registerAuthRoutes,
  registerGuestChatRoute,
  seedAdminUser,
} from "./auth";

const app = express();
const PORT = parseInt(process.env.PORT ?? "5000", 10);
const PYTHON_URL = "http://localhost:8001";
const VITE_URL = "http://localhost:5001";
const IS_PROD = process.env.NODE_ENV === "production";
const _ENV_INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;
if (!_ENV_INTERNAL_SECRET && IS_PROD) {
  throw new Error(
    "[express] INTERNAL_API_SECRET env var is required in production. Set it before starting the server.",
  );
}
if (!_ENV_INTERNAL_SECRET) {
  console.warn(
    "[express] WARNING: INTERNAL_API_SECRET is unset — generating an ephemeral per-process secret. " +
      "Cross-process calls to the Python backend will fail until you set INTERNAL_API_SECRET " +
      "(scripts/start-dev.sh sets it automatically).",
  );
}
// No hardcoded default secret. In dev, scripts/start-dev.sh exports a shared
// random value before forking both processes; if it's still unset here we
// generate a per-process random so the secret is never a known constant.
const INTERNAL_SECRET =
  _ENV_INTERNAL_SECRET ?? `dev-${crypto.randomBytes(24).toString("hex")}`;

function spawnPython(): ChildProcess {
  const proc = spawn(
    "uvicorn",
    ["python.main:app", "--host", "0.0.0.0", "--port", "8001"],
    { stdio: "inherit", env: { ...process.env } }
  );
  proc.on("error", (err) => console.error("[python] failed to start uvicorn:", err.message));
  proc.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") {
      console.error(`[python] uvicorn exited (code=${code} signal=${signal}) — restarting in 3 s`);
      setTimeout(spawnPython, 3_000);
    }
  });
  console.log("[python] uvicorn started (pid=" + proc.pid + ")");
  return proc;
}

if (IS_PROD) {
  spawnPython();
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

async function waitForPython(maxWaitMs = 120_000): Promise<void> {
  if (!IS_PROD) return;
  console.log("[express] waiting for Python backend to be ready...");
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${PYTHON_URL}/api/health`);
      if (r.ok) {
        console.log("[express] Python backend ready — accepting connections");
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 2_000));
  }
  console.warn("[express] Python backend not ready after 120 s — continuing anyway");
}

(async () => {
  await waitForPython();
  await setupAuth(app);
  registerAuthRoutes(app);
  registerGuestChatRoute(app);
  await seedAdminUser();

  app.use("/api/v1/guest", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(
    "/api",
    (req, _res, next) => {
      const userId = req.session?.userId;
      if (userId) {
        req.headers["x-user-id"] = userId;
        req.headers["x-user-email"] = req.session?.userEmail ?? "";
        req.headers["x-user-role"] = req.session?.userRole ?? "user";
      } else {
        delete req.headers["x-user-id"];
        delete req.headers["x-user-email"];
        delete req.headers["x-user-role"];
      }
      delete req.headers["x-replit-user-id"];
      delete req.headers["x-replit-user-name"];
      delete req.headers["x-replit-user-email"];
      delete req.headers["x-replit-user-profile-image"];
      req.headers["x-a0p-internal"] = INTERNAL_SECRET;
      next();
    },
    createProxyMiddleware({
      target: PYTHON_URL,
      changeOrigin: true,
      // Forward client IP / proto / host headers so Python sees real client info
      // through the X-Forwarded-* set (Express has trust proxy = 1).
      xfwd: true,
      pathRewrite: { "^/": "/api/" },
      on: {
        proxyReq: fixRequestBody,
        error: (_err, _req, res) => {
          (res as express.Response)
            .status(502)
            .json({ error: "Python backend unavailable" });
        },
      },
    })
  );

  if (IS_PROD) {
    const STATIC_DIR = path.resolve(__dirname, "..", "dist", "public");
    if (fs.existsSync(STATIC_DIR)) {
      // Hashed assets (JS/CSS): cache forever — filename changes on each build
      app.use("/assets", express.static(path.join(STATIC_DIR, "assets"), {
        maxAge: "1y",
        immutable: true,
      }));
      // Everything else (index.html, robots.txt, etc.): never cache
      app.use(express.static(STATIC_DIR, {
        setHeaders(res, filePath) {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-store");
          }
        },
      }));
      app.get("/{*path}", (_req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.sendFile(path.join(STATIC_DIR, "index.html"));
      });
    } else {
      console.warn("[express] dist/public not found — run npm run build first");
    }
  } else {
    app.use(
      "/",
      createProxyMiddleware({
        target: VITE_URL,
        changeOrigin: true,
        ws: true,
        on: {
          error: (_err, _req, res) => {
            (res as express.Response)
              .status(502)
              .send("Frontend build server unavailable");
          },
        },
      })
    );
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[express] Auth + proxy server on port ${PORT} (${IS_PROD ? "production" : "development"})`
    );
  });
})();

export default app;
// 112:0
