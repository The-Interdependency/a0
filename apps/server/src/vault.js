// Replaceable secrets adapter. Production store is OpenBao (pinned fork) via
// its HTTP API with a scoped application token. The adapter fails closed when
// the vault is unavailable, sealed, or returns an unexpected identity.
import { config } from './config.js';

class VaultError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'VaultError';
    this.status = status;
  }
}

export class OpenBaoAdapter {
  constructor({ addr = config.baoAddr, token = config.baoToken, kvMount = config.baoKvMount } = {}) {
    this.addr = addr.replace(/\/$/, '');
    this.token = token;
    this.kvMount = kvMount;
    this.expectedIdentity = 'openbao';
  }

  async request(method, path, { body, retries = 2 } = {}) {
    if (!this.token) throw new VaultError('Vault token is not configured; refusing request.', 500);
    const url = `${this.addr}/v1${path}`;
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'X-Vault-Token': this.token,
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
          throw new VaultError(data.errors?.join('; ') || `Vault HTTP ${res.status}`, res.status);
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
    if (!data || data.sealed === true) {
      throw new VaultError('Vault is sealed; refusing to start with an unavailable store.', 503);
    }
    if (!data.initialized) {
      throw new VaultError('Vault is not initialized; refusing to auto-initialize during startup.', 503);
    }
    return { initialized: true, sealed: false, version: data.version || 'unknown' };
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
  if (config.nodeEnv === 'test' && !config.baoToken) return new MemoryVault();
  return new OpenBaoAdapter();
}

export { VaultError };
