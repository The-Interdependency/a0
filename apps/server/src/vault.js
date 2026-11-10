// Replaceable secrets adapter. Production store is OpenBao (pinned fork) via
// its HTTP API with a scoped application token. The adapter fails closed when
// the vault is unavailable, sealed, or returns an unexpected identity.
import fs from 'node:fs';
import { config } from './config.js';

export function readTokenFile(path) {
  let fd;
  try {
    fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const s = fs.fstatSync(fd);
    if (!s.isFile() || (s.mode & 0o027) || s.size > 4096) throw new Error('permissions');
    const token = fs.readFileSync(fd, 'utf8').trim();
    if (!token || /[\r\n]/.test(token)) throw new Error('shape');
    return token;
  } catch { throw new VaultError('Protected credential file unavailable or unsafe.', 503); }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

class VaultError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'VaultError';
    this.status = status;
  }
}

export class OpenBaoAdapter {
  constructor({ addr = config.baoAddr, token = config.baoToken, kvMount = config.baoKvMount, tokenFile = config.baoTokenFile, clusterId = config.baoClusterId } = {}) {
    this.addr = addr.replace(/\/$/, '');
    this.token = token;
    this.kvMount = kvMount;
    this.tokenFile = tokenFile;
    this.clusterId = clusterId;
  }

  async request(method, path, { body, retries = 2 } = {}) {
    const token = this.tokenFile ? readTokenFile(this.tokenFile) : this.token;
    if (!token) throw new VaultError('Vault token is not configured; refusing request.', 500);
    const url = `${this.addr}/v1${path}`;
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const res = await fetch(url, {
          method,
          redirect: 'error',
          headers: {
            'X-Vault-Token': token,
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        const text = await res.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { raw: text };
        }
        if (!res.ok) {
          throw new VaultError(`Vault HTTP ${res.status}`, res.status);
        }
        return data;
      } catch (err) {
        lastErr = err;
        if (err instanceof VaultError && err.status >= 400 && err.status < 500) throw err;
        if (attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  // Validates that the store is the expected OpenBao identity and is unsealed.
  // Startup calls this and refuses to serve if it fails (fail closed).
  async healthCheck() {
    const data = await this.request('GET', '/sys/seal-status');
    if (!data || data.sealed !== false) {
      throw new VaultError('Vault is sealed; refusing to start with an unavailable store.', 503);
    }
    if (data.initialized !== true) {
      throw new VaultError('Vault is not initialized; refusing to auto-initialize during startup.', 503);
    }
    if (this.clusterId && data.cluster_id !== this.clusterId) throw new VaultError('Vault cluster identity mismatch.', 503);
    if (config.nodeEnv === 'production' && !this.clusterId) throw new VaultError('BAO_CLUSTER_ID is required; provision the existing store first.', 503);
    const identity = await this.request('GET', '/auth/token/lookup-self');
    const policies = identity?.data?.policies;
    if (!Array.isArray(policies) || !policies.includes('a0-app') || policies.some(p => !['a0-app', 'default'].includes(p))) throw new VaultError('A0 requires its scoped a0-app credential.', 503);
    return { initialized: true, sealed: false, version: data.version || 'unknown', clusterId: data.cluster_id || null };
  }

  kvPath(key) {
    // KV v2: the mount name is the path prefix (a0/data/<key>), not "secret/data/a0/".
    return `/${this.kvMount}/data/${key}`;
  }

  async readSecret(key) {
    let data;
    try {
      data = await this.request('GET', this.kvPath(key));
    } catch (err) {
      if (err instanceof VaultError && err.status === 404) return null; // missing secret is an empty credential, not a vault failure
      throw err;
    }
    const value = data?.data?.data;
    if (!value || typeof value !== 'object') return null;
    return value;
  }

  async writeSecret(key, fields) {
    return this.request('POST', this.kvPath(key), { body: { data: fields } });
  }

  async deleteSecret(key) {
    try {
      return await this.request('DELETE', this.kvPath(key));
    } catch (err) {
      if (err instanceof VaultError && err.status === 404) return { data: {} }; // already absent
      throw err;
    }
  }

  async listSecrets(prefix) {
    const data = await this.request('LIST', `/${this.kvMount}/metadata/${prefix}`);
    return data?.data?.keys || [];
  }
}

// Test-only in-memory store. Explicitly identified as a test double; it never
// satisfies live-provider or production-vault gates.
export class MemoryVault {
  constructor() {
    this.store = new Map();
  }
  async healthCheck() {
    return { initialized: true, sealed: false, version: 'memory-test-double' };
  }
  async readSecret(key) {
    return this.store.get(key) || null;
  }
  async writeSecret(key, fields) {
    this.store.set(key, { ...fields });
    return {};
  }
  async deleteSecret(key) {
    this.store.delete(key);
    return {};
  }
}

export function makeVault() {
  if (config.nodeEnv === 'test' && !config.baoToken && !config.baoTokenFile) return new MemoryVault();
  return new OpenBaoAdapter();
}

export { VaultError };
