// 88:3 0:1 0:1
import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { getOrCreateGuestWindow, incrementGuestTokensAtomic } from "./storage";

const PYTHON_URL = "http://localhost:8001";
const DEFAULT_TOKEN_LIMIT = 2000;
const MAX_GUEST_MESSAGE_CHARS = 4000;
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
    if (message.length > MAX_GUEST_MESSAGE_CHARS) {
      return res.status(413).json({
        message: `Guest messages are limited to ${MAX_GUEST_MESSAGE_CHARS} characters`,
      });
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

      // Reserve the worst-case response budget before making a paid provider
      // call. Charging after the response allowed concurrent requests to all
      // pass the same stale balance and spend beyond the public limit.
      const estimatedInputTokens = Math.ceil(message.trim().length / 3);
      const reservedTokens = Math.min(LIMIT, estimatedInputTokens + 512);
      const reservation = await incrementGuestTokensAtomic(window.id, reservedTokens, LIMIT);
      if (!reservation.accepted) {
        return res.status(429).json({
          message: "Token limit reached for this hour",
          tokensUsed: reservation.tokensUsed,
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
        return res.status(502).json({ message: "AI backend error" });
      }

      const data = (await pyRes.json()) as { content: string; tokens_used: number };
      const tokensUsed = reservation.tokensUsed;
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
// 88:3 0:1 0:1
