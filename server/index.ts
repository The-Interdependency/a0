import "./types.d.ts";
import path from "path";
import fs from "fs";
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
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "a0p-dev-internal-secret";

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
      app.use(express.static(STATIC_DIR));
      app.get("/{*path}", (_req, res) => {
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
