// Owner identity, sessions, CSRF, and authorization middleware.
// One stable verified owner; no public registration and no first-visitor claim.
import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';

const scryptAsync = (password, salt, keylen) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key)));
  });

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hex] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !hex) return false;
    const key = await scryptAsync(password, salt, 64);
    const a = Buffer.from(hex, 'hex');
    const b = Buffer.from(key);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function makeToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signSessionToken(token) {
  // Signed value in the cookie lets us reject forgeries before a DB lookup.
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(token).digest('base64url');
  return `${token}.${sig}`;
}

export function verifySessionCookie(cookie) {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf('.');
  if (dot < 0) return null;
  const token = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expect = crypto.createHmac('sha256', config.sessionSecret).update(token).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return token;
}

export async function createSession(userId, req) {
  const token = makeToken();
  const expires = new Date(Date.now() + config.sessionTtlMs);
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip)
     VALUES ($1,$2,$3,$4,$5)`,
    [hashToken(token), userId, expires, req?.get('user-agent') || null, req?.ip || null],
  );
  return { token, expires };
}

export async function destroySession(req) {
  const token = verifySessionCookie(req?.cookies?.[config.cookieName]);
  if (!token) return;
  await query(`UPDATE sessions SET revoked_at = now() WHERE token_hash = $1`, [hashToken(token)]);
}

export async function sessionUser(req) {
  const token = verifySessionCookie(req?.cookies?.[config.cookieName]);
  if (!token) return null;
  const { rows } = await query(
    `SELECT u.id, u.username
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [hashToken(token)],
  );
  if (!rows.length) return null;
  return rows[0];
}

export function requireAuth(req, res, next) {
  sessionUser(req)
    .then((user) => {
      if (!user) return res.status(401).json({ error: 'unauthorized', message: 'Sign in required.' });
      req.user = user;
      next();
    })
    .catch(next);
}

export function requireCsrf(req, res, next) {
  // SameSite=Lax cookies plus a custom header for mutating requests. This is
  // checked in addition to the session cookie.
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const header = req.get('x-a0-csrf');
  const body = req.body?.csrfToken;
  const token = header || body;
  if (!token) {
    return res.status(403).json({ error: 'csrf', message: 'Missing CSRF token.' });
  }
  // The CSRF token is the session token (signed) replayed in a header; browsers
  // cannot set custom cross-origin headers without CORS approval.
  const sessionToken = verifySessionCookie(req.cookies?.[config.cookieName]);
  if (!sessionToken || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(sessionToken))) {
    return res.status(403).json({ error: 'csrf', message: 'Invalid CSRF token.' });
  }
  next();
}

export function csrfTokenFor(req) {
  const sessionToken = verifySessionCookie(req?.cookies?.[config.cookieName]);
  return sessionToken || '';
}

export async function countOwners() {
  const { rows } = await query('SELECT count(*)::int AS n FROM users');
  return rows[0].n;
}

export async function createOwner(username, password) {
  if (await countOwners() > 0) {
    const err = new Error('An owner already exists.');
    err.status = 409;
    throw err;
  }
  const passwordHash = await hashPassword(password);
  const { rows } = await query(
    `INSERT INTO users (username, password_hash) VALUES ($1,$2) RETURNING id, username`,
    [username, passwordHash],
  );
  return rows[0];
}
