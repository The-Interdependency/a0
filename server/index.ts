import "./types.d.ts";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";

const app = express();
const PORT = parseInt(process.env.PORT ?? "5000", 10);
const PYTHON_URL = "http://localhost:8001";
const VITE_URL = "http://localhost:5001";

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[express] Auth + proxy server on port ${PORT}`);
});

export default app;
