import type { Request, Response, NextFunction } from "express";

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId || req.headers["x-replit-user-id"];
  if (userId) return next();
  res.status(401).json({ message: "Unauthorized" });
}
