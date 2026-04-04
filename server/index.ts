import "./types.d.ts";
import path from "path";
import fs from "fs";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";

const app = express();
const PORT = parseInt(process.env.PORT ?? "5000", 10);
const PYTHON_URL = "http://localhost:8001";
const VITE_URL = "http://localhost:5001";
const IS_PROD = process.env.NODE_ENV === "production";

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

(async () => {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.use(
    "/api",
    (req, _res, next) => {
      if (req.isAuthenticated() && req.user?.claims?.sub) {
        req.headers["x-replit-user-id"] = req.user.claims.sub;
        req.headers["x-replit-user-name"] =
          req.user.claims.first_name ?? req.user.claims.name ?? "";
        req.headers["x-replit-user-email"] = req.user.claims.email ?? "";
        req.headers["x-replit-user-profile-image"] =
          req.user.claims.profile_image_url ?? "";
      } else {
        delete req.headers["x-replit-user-id"];
        delete req.headers["x-replit-user-name"];
        delete req.headers["x-replit-user-email"];
      }
      next();
    },
    createProxyMiddleware({
      target: PYTHON_URL,
      changeOrigin: true,
      on: {
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
