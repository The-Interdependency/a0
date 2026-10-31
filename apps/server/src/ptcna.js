// A0 client for the pinned PTCNA producer sidecar (operations/ptcna-sidecar.py).
// Fail-closed: if the sidecar is unavailable, no state is invented.
const SIDECAR = process.env.A0_PTCNA_URL || 'http://127.0.0.1:8791';

async function call(method, path, body) {
  try {
    const res = await fetch(`${SIDECAR}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `ptcna ${res.status}`);
      err.status = 502;
      err.code = 'ptcna_unavailable';
      throw err;
    }
    return data;
  } catch (err) {
    if (err.code === 'ptcna_unavailable') throw err;
    const wrapped = new Error(`PTCNA sidecar unavailable: ${err.message}`);
    wrapped.status = 502;
    wrapped.code = 'ptcna_unavailable';
    throw wrapped;
  }
}

export const ptcna = {
  available: async () => call('GET', '/health', null).then(() => true).catch(() => false),
  newRuntime: (id) => call('POST', '/new', { id }),
  infer: (id, input) => call('POST', '/infer', { id, input }),
  reward: (id, value) => call('POST', '/reward', { id, value }),
  state: (id) => call('GET', `/state/${id}`),
  fork: (id, childId) => call('POST', '/fork', { id, childId }),
};

// Extract the ring summary A0 displays/uses for an agent.
export function ringSummary(state) {
  const rings = state?.target?.neural?.rings || {};
  return {
    phi: rings.phi ? { n: rings.phi.n, coherence: Number(rings.phi.ring_coherence || 0), steps: rings.phi.step_count || 0 } : null,
    psi: rings.psi ? { n: rings.psi.n, coherence: Number(rings.psi.ring_coherence || 0), steps: rings.psi.step_count || 0 } : null,
    omega: rings.omega ? { n: rings.omega.n, coherence: Number(rings.omega.ring_coherence || 0), steps: rings.omega.step_count || 0 } : null,
    memory_l: rings.memory_l ? { n: rings.memory_l.n } : null,
    memory_s: rings.memory_s ? { n: rings.memory_s.n } : null,
    backend: state?.target?.backend || null,
    engine: state?.target?.neural?.engine || null,
  };
}
