// 1:0
import path from "path";
import fs from "fs";
import crypto from "crypto";
import type { Express, Request, Response } from "express";
import multer from "multer";
import { db } from "./db";
import { messageAttachments } from "@shared/schema";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase().slice(0, 8) || ".bin";
    const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : ".bin";
    const id = crypto.randomBytes(12).toString("hex");
    cb(null, `att-${id}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`unsupported mime_type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

export function registerAttachmentRoutes(app: Express) {
  app.post("/api/v1/attachments", (req: Request, res: Response) => {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    upload.single("file")(req, res, async (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "upload failed";
        return res.status(400).json({ error: msg });
      }
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) return res.status(400).json({ error: "no file" });
      try {
        const storageUrl = `/uploads/${file.filename}`;
        const [row] = await db.insert(messageAttachments).values({
          ownerUserId: userId,
          kind: "image",
          mimeType: file.mimetype,
          storageUrl,
          bytes: file.size,
        }).returning();
        res.json({ id: row.id, storage_url: storageUrl, mime_type: file.mimetype, bytes: file.size });
      } catch (e) {
        try { fs.unlinkSync(file.path); } catch {}
        const msg = e instanceof Error ? e.message : "db insert failed";
        res.status(500).json({ error: msg });
      }
    });
  });
}
// 1:0
