// Durable authorized media storage. Bytes live under A0_MEDIA_ROOT on the VM;
// database rows carry ownership and metadata. Retrieval is always authorized.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { mediaPaths, config } from './config.js';

export function storageKeyFor(userId) {
  const today = new Date().toISOString().slice(0, 10);
  return `${userId}/${today}/${crypto.randomUUID()}`;
}

export async function writeUpload(userId, filename, stream) {
  const dirs = mediaPaths();
  const key = storageKeyFor(userId);
  const full = path.join(dirs.uploads, key);
  fs.mkdirSync(path.dirname(full), { recursive: true, mode: 0o750 });
  let size = 0;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(full, { mode: 0o640 });
    stream.on('data', (chunk) => {
      size += chunk.length;
      if (size > config.maxUploadBytes) {
        stream.destroy(new Error('upload_too_large'));
        out.destroy();
      }
    });
    stream.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    stream.on('error', reject);
  });
  if (size > config.maxUploadBytes) {
    fs.rmSync(full, { force: true });
    const err = new Error(`File exceeds the ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB limit.`);
    err.status = 413;
    throw err;
  }
  return { key, size };
}

export function readUpload(storageKey) {
  const full = path.join(mediaPaths().uploads, storageKey);
  return fs.createReadStream(full);
}

export async function readUploadBase64(storageKey) {
  const full = path.join(mediaPaths().uploads, storageKey);
  return fs.promises.readFile(full, { encoding: 'base64' });
}

export function removeUpload(storageKey) {
  const full = path.join(mediaPaths().uploads, storageKey);
  fs.rmSync(full, { force: true });
}
