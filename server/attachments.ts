// 90:4
import path from "path";
import fs from "fs";
import crypto from "crypto";
import type { Express, Request, Response } from "express";
import multer from "multer";
import { db } from "./db";
import { messageAttachments } from "@shared/schema";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const IMAGE_MIME = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
]);
const DOC_MIME = new Set([
  "application/pdf",
  "text/plain", "text/markdown", "text/csv",
  "text/html", "text/x-python", "text/javascript", "text/typescript",
  "application/json", "application/xml", "application/yaml", "text/yaml",
  "application/zip",
]);
// Some browsers send "" or "application/octet-stream" for code files.
// Fall back to extension whitelist for those.
const DOC_EXT = new Set([
  ".pdf", ".txt", ".md", ".csv", ".tsv", ".json", ".yaml", ".yml",
  ".xml", ".html", ".htm", ".py", ".js", ".ts", ".tsx", ".jsx",
  ".go", ".rs", ".java", ".c", ".cc", ".cpp", ".h", ".sh", ".sql",
  ".log", ".toml", ".ini", ".env",
]);

function classifyKind(mimetype: string, originalName: string): "image" | "document" | null {
  if (IMAGE_MIME.has(mimetype)) return "image";
  if (DOC_MIME.has(mimetype)) return "document";
  const ext = path.extname(originalName || "").toLowerCase();
  if (DOC_EXT.has(ext)) return "document";
  return null;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase().slice(0, 8) || ".bin";
    const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : ".bin";
    const id = crypto.randomBytes(12).toString("hex");
    cb(null, `att-${id}${safeExt}`);
  },
});

// 25MB ceiling covers PDFs and reasonable document sizes; multer caps the
// stream so an oversized upload fails fast instead of filling the disk.
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (classifyKind(file.mimetype, file.originalname || "") === null) {
      return cb(new Error(`unsupported file type: ${file.mimetype || "unknown"} (${file.originalname || ""})`));
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
        const kind = classifyKind(file.mimetype, file.originalname || "") ?? "document";
        const storageUrl = `/uploads/${file.filename}`;
        const [row] = await db.insert(messageAttachments).values({
          ownerUserId: userId,
          kind,
          mimeType: file.mimetype,
          storageUrl,
          bytes: file.size,
        }).returning();
        res.json({
          id: row.id,
          storage_url: storageUrl,
          mime_type: file.mimetype,
          bytes: file.size,
          name: file.originalname,
          kind,
        });
      } catch (e) {
        try { fs.unlinkSync(file.path); } catch {}
        const msg = e instanceof Error ? e.message : "db insert failed";
        res.status(500).json({ error: msg });
      }
    });
  });
}
// 90:4
