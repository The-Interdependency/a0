/**
 * PTCA Sub-Core Module
 *
 * 17-seed shared substrate with three projection modes.
 * The compression bridge between server and phone a0.
 *
 * Usage:
 *
 *   import { SubCore, Heartbeat, CoreId } from './subcore';
 *
 *   const subcore = new SubCore();
 *   const heartbeat = new Heartbeat(subcore, 'server');
 *
 *   heartbeat.onBeat((event) => {
 *     // event.auditory — what changed (Psi reads this)
 *     // event.visual   — what shape is this (Omega reads this)
 *     // event.memory   — the raw page (everything reads this)
 *
 *     if (event.auditory.anomalies.length > 0) {
 *       // hmmm block: temporal coherence break detected
 *     }
 *
 *     if (event.visual.coherence < 0.5) {
 *       // hmmm block: structural pattern degraded
 *     }
 *   });
 *
 *   heartbeat.onSync(async (outgoing) => {
 *     // Send to peer, receive response
 *     const response = await fetch('/sync', {
 *       method: 'POST',
 *       body: JSON.stringify(outgoing),
 *     });
 *     return response.json();
 *   });
 *
 *   heartbeat.start(); // 30-second clock begins
 */

export { SubCore } from './subcore.js';
export { Heartbeat } from './heartbeat.js';
export type { HeartbeatEvent, HeartbeatListener, SyncHandler } from './heartbeat.js';
export {
  CoreId,
  SEED_STATE_DEPTH,
  SUBCORE_PRIMES,
} from './types.js';
export type {
  SubCoreSeed,
  AuditoryProjection,
  AuditoryAnomaly,
  VisualProjection,
  MemoryProjection,
  SyncPayload,
} from './types.js';
