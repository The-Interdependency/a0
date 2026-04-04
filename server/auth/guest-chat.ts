import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { getOrCreateGuestWindow, incrementGuestTokensAtomic } from "./storage";

const PYTHON_URL = "http://localhost:8001";
const DEFAULT_TOKEN_LIMIT = 2000;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "a0p-dev-internal-secret";

function hashIp(ip: string): string {
  return crypto
    .createHash("sha256")
    .update(ip + (process.env.SESSION_SECRET ?? "a0p-dev-secret-change-in-production"))
    .digest("hex");
}

function getClientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

export function registerGuestChatRoute(app: Express) {
  const LIMIT = parseInt(process.env.GUEST_TOKEN_LIMIT ?? String(DEFAULT_TOKEN_LIMIT), 10);

  app.get("/api/guest/status", async (req: Request, res: Response) => {
    const ipHash = hashIp(getClientIp(req));
    try {
      const window = await getOrCreateGuestWindow(ipHash);
      const remaining = Math.max(0, LIMIT - window.tokensUsed);
      res.json({ tokensUsed: window.tokensUsed, tokensLimit: LIMIT, tokensRemaining: remaining });
    } catch {
      res.json({ tokensUsed: 0, tokensLimit: LIMIT, tokensRemaining: LIMIT });
    }
  });

  app.post("/api/guest/chat", async (req: Request, res: Response) => {
    const { message } = req.body ?? {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "message is required" });
    }

    const ipHash = hashIp(getClientIp(req));

    try {
      const window = await getOrCreateGuestWindow(ipHash);
      if (window.tokensUsed >= LIMIT) {
        return res.status(429).json({
          message: "Token limit reached for this hour",
          tokensUsed: window.tokensUsed,
          tokensLimit: LIMIT,
          tokensRemaining: 0,
          retryAfter: "Try again next hour",
        });
      }

      const pyRes = await fetch(`${PYTHON_URL}/api/v1/guest/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-a0p-internal": INTERNAL_SECRET,
        },
        body: JSON.stringify({ message: message.trim() }),
      });

      if (!pyRes.ok) {
        const err = await pyRes.text();
        return res.status(502).json({ message: "AI backend error", detail: err });
      }

      const data = (await pyRes.json()) as { content: string; tokens_used: number };
      const tokensToAdd = typeof data.tokens_used === "number" ? data.tokens_used : 50;

      const { accepted, tokensUsed } = await incrementGuestTokensAtomic(window.id, tokensToAdd, LIMIT);
      if (!accepted) {
        return res.status(429).json({
          message: "Token limit reached for this hour",
          tokensUsed,
          tokensLimit: LIMIT,
          tokensRemaining: 0,
          retryAfter: "Try again next hour",
        });
      }

      const remaining = Math.max(0, LIMIT - tokensUsed);

      res.json({
        content: data.content,
        tokensUsed,
        tokensLimit: LIMIT,
        tokensRemaining: remaining,
      });
    } catch (err) {
      console.error("[guest-chat] Error:", err);
      res.status(502).json({ message: "AI backend unavailable" });
    }
  });
}
