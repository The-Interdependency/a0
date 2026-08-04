// 274:32 0:1 0:3
import "./types.d.ts";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { spawn, type ChildProcess } from "child_process";
import type { Server } from "http";
import express from "express";
import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";
import {
  setupAuth,
  registerAuthRoutes,
  registerGuestChatRoute,
  seedAdminUser,
} from "./auth";
import { registerAttachmentRoutes } from "./attachments";
import { db } from "./db";
import { messageAttachments } from "@shared/schema";
import { eq } from "drizzle-orm";

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

let pythonProcess: ChildProcess | null = null;
let httpServer: Server | null = null;
let shuttingDown = false;

function terminateDeployment(exitCode: number, reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(reason);

  const child = pythonProcess;
  let childClosed = !child || child.exitCode !== null;
  let serverClosed = !httpServer;

  const forceExit = setTimeout(() => {
    if (child && child.exitCode === null && !child.killed) {
      child.kill("SIGKILL");
    }
    process.exit(exitCode);
  }, 5_000);
  forceExit.unref();

  const finish = () => {
    if (!childClosed || !serverClosed) return;
    clearTimeout(forceExit);
    process.exit(exitCode);
  };

  if (child && !childClosed) {
    child.once("close", () => {
      childClosed = true;
      finish();
    });
    child.kill("SIGTERM");
  }

  if (httpServer) {
    httpServer.close(() => {
      serverClosed = true;
      finish();
    });
  }

  finish();
}

function spawnPython(): ChildProcess {
  if (pythonProcess && pythonProcess.exitCode === null && !pythonProcess.killed) {
    return pythonProcess;
  }

  const proc = spawn(
    "uvicorn",
    ["python.main:app", "--host", "0.0.0.0", "--port", "8001"],
    { stdio: "inherit", env: { ...process.env } },
  );
  pythonProcess = proc;

  proc.once("error", (err) => {
    terminateDeployment(
      1,
      `[python] failed to start uvicorn: ${err.message}`,
    );
  });
  proc.once("exit", (code, signal) => {
    if (pythonProcess === proc) pythonProcess = null;
    if (!shuttingDown) {
      terminateDeployment(
        1,
        `[python] uvicorn exited (code=${code} signal=${signal}); terminating the deployment unit`,
      );
    }
  });
  console.log("[python] uvicorn started (pid=" + proc.pid + ")");
  return proc;
}

process.once("SIGTERM", () =>
  terminateDeployment(0, "[express] SIGTERM received; shutting down"),
);
process.once("SIGINT", () =>
  terminateDeployment(0, "[express] SIGINT received; shutting down"),
);

if (IS_PROD) {
  spawnPython();
}

// Stripe webhook signature verification (construct_event) is computed over the
// exact raw bytes Stripe sent. If express.json() parses the body first it
// re-serialises it before the proxy forwards it, corrupting the HMAC. Skip ALL
// body parsing for this one path so the raw stream flows through to FastAPI
// unchanged and construct_event sees the original bytes.
app.use((req, res, next) => {
  if (req.path === "/api/v1/billing/webhook") return next();
  express.json({ limit: "1mb" })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path === "/api/v1/billing/webhook") return next();
  express.urlencoded({ extended: false, limit: "1mb" })(req, res, next);
});

async function waitForPython(maxWaitMs = 120_000): Promise<void> {
  if (!IS_PROD) return;
  console.log("[express] waiting for Python dependencies to be ready...");
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${PYTHON_URL}/api/v1/runtime/ready`, {
        headers: { "x-a0p-internal": INTERNAL_SECRET },
      });
      if (r.ok) {
        console.log("[express] Python backend ready — accepting connections");
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error("Python backend did not become ready within 120 seconds");
}

void (async () => {
  await waitForPython();
  await setupAuth(app);
  registerAuthRoutes(app);
  registerGuestChatRoute(app);
  registerAttachmentRoutes(app);
  await seedAdminUser();

  // Serve uploaded files with per-file ownership checks.
  // Files are forced to download (Content-Disposition: attachment) so no
  // uploaded content — including code or markup — can execute in the browser
  // as same-origin active content.
  const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  app.get("/uploads/:filename", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { filename } = req.params;
    // Reject any path traversal attempts before touching the DB or filesystem.
    if (!filename || filename.includes("/") || filename.includes("..")) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const storageUrl = `/uploads/${filename}`;
    let row: { ownerUserId: string | null } | undefined;
    try {
      [row] = await db
        .select({ ownerUserId: messageAttachments.ownerUserId })
        .from(messageAttachments)
        .where(eq(messageAttachments.storageUrl, storageUrl))
        .limit(1);
    } catch (e) {
      console.error("[uploads] db lookup failed:", e);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (!row) return res.status(404).json({ error: "Not found" });
    // Return 404 rather than 403 so the existence of another user's filename
    // is not leaked to an authenticated attacker.
    if (row.ownerUserId !== userId) return res.status(404).json({ error: "Not found" });

    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });

    // Harden response headers so uploaded content can never execute as
    // same-origin active content even if an active file type slips through:
    //
    // • CSP sandbox — strips all browsing-context privileges from the document:
    //   no script, no same-origin access, no plugins, no form submission.
    //   This is the primary active-content neutralisation layer.
    // • Content-Disposition: attachment — browser must prompt a download rather
    //   than rendering the file inline, providing a second layer.
    // • X-Content-Type-Options: nosniff — prevents MIME-type sniffing that
    //   could cause a text file to be interpreted as HTML.
    res.setHeader("Content-Security-Policy", "sandbox");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.sendFile(filePath);
  });

  // Serve the a0 CLI script as plain text so users can `curl -fsSL <host>/a0 -o ~/.local/bin/a0`.
  app.get("/a0", (_req, res) => {
    const cliPath = path.resolve(process.cwd(), "scripts", "a0-cli.sh");
    if (!fs.existsSync(cliPath)) {
      res.status(404).type("text/plain").send("# a0 CLI script missing");
      return;
    }
    res.setHeader("Content-Type", "text/x-shellscript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.sendFile(cliPath);
  });

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
    }),
  );

  if (IS_PROD) {
    const STATIC_DIR = path.resolve(__dirname, "..", "dist", "public");
    if (fs.existsSync(STATIC_DIR)) {
      // Hashed assets (JS/CSS): cache forever — filename changes on each build
      app.use("/assets", express.static(path.join(STATIC_DIR, "assets"), {
        maxAge: "1y",
        immutable: true,
      }));
      // Everything else (index.html, robots.txt, etc.): never cache.
      // X-Robots-Tag: index, follow explicitly overrides any platform-injected
      // noindex header so deployed pages remain crawlable.
      app.use(express.static(STATIC_DIR, {
        setHeaders(res, filePath) {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("X-Robots-Tag", "index, follow");
          }
        },
      }));
      app.get("/{*path}", (_req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Robots-Tag", "index, follow");
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
      }),
    );
  }

  httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[express] Auth + proxy server on port ${PORT} (${IS_PROD ? "production" : "development"})`,
    );
  });
})().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  terminateDeployment(1, `[express] startup failed: ${message}`);
});

export default app;
// 274:32 0:1 0:3
