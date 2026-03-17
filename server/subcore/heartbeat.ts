/**
 * Heartbeat — the 30-second clock
 *
 * Drives the sub-core tick cycle.
 * On missed beat: braking field increases (automatic conservatism).
 * Server and phone both run at 30s.
 */

import { SubCore } from './subcore.js';
import type { AuditoryProjection, VisualProjection, MemoryProjection, SyncPayload } from './types.js';

export interface HeartbeatEvent {
  heartbeat: number;
  timestamp: number;
  auditory: AuditoryProjection;
  visual: VisualProjection;
  memory: MemoryProjection;
  missed: boolean;
}

export type HeartbeatListener = (event: HeartbeatEvent) => void;
export type SyncHandler = (payload: SyncPayload) => Promise<SyncPayload | null>;

export class Heartbeat {
  private subCore: SubCore;
  private interval: ReturnType<typeof setInterval> | null = null;
  private listeners: HeartbeatListener[] = [];
  private syncHandler: SyncHandler | null = null;

  /** Heartbeat period in ms */
  readonly periodMs: number = 30_000;

  /** Last successful beat timestamp */
  private lastBeatTime: number = 0;

  /** Consecutive missed beats */
  private missedBeats: number = 0;

  /** Mode: server runs 3 cores, phone runs 1 superimposed */
  private mode: 'server' | 'phone';

  constructor(subCore: SubCore, mode: 'server' | 'phone') {
    this.subCore = subCore;
    this.mode = mode;
  }

  /** Register a listener for heartbeat events */
  onBeat(listener: HeartbeatListener): void {
    this.listeners.push(listener);
  }

  /** Register the sync handler (called each beat to exchange with peer) */
  onSync(handler: SyncHandler): void {
    this.syncHandler = handler;
  }

  /** Start the heartbeat clock */
  start(): void {
    if (this.interval) return;

    this.lastBeatTime = Date.now();
    this.interval = setInterval(() => this.beat(), this.periodMs);

    // Immediate first beat
    this.beat();
  }

  /** Stop the heartbeat clock */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /** Manual beat trigger (for testing or forced sync) */
  async forceBeat(): Promise<HeartbeatEvent> {
    return this.beat();
  }

  private async beat(): Promise<HeartbeatEvent> {
    const now = Date.now();
    const elapsed = now - this.lastBeatTime;

    // Detect missed beats: if more than 1.5x period has passed
    const missed = this.lastBeatTime > 0 && elapsed > this.periodMs * 1.5;
    if (missed) {
      this.missedBeats++;
    } else {
      this.missedBeats = 0;
    }

    this.lastBeatTime = now;

    // Tick the sub-core — get all three projections
    const { auditory, visual, memory } = this.subCore.tick();

    const event: HeartbeatEvent = {
      heartbeat: this.subCore.getHeartbeat(),
      timestamp: now,
      auditory,
      visual,
      memory,
      missed,
    };

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Heartbeat listener error:', err);
      }
    }

    // Sync with peer
    if (this.syncHandler) {
      try {
        const direction = this.mode === 'server'
          ? 'server-to-phone' as const
          : 'phone-to-server' as const;

        const outgoing = this.subCore.exportSync(direction);
        const incoming = await this.syncHandler(outgoing);

        if (incoming) {
          this.subCore.importSync(incoming);
        }
      } catch (err) {
        // Sync failure = missed beat from peer's perspective
        // Automatic conservatism: don't update, don't crash
        console.error('Sync failure at heartbeat', event.heartbeat, err);
      }
    }

    return event;
  }

  /** Get consecutive missed beats (for braking field calculation) */
  getMissedBeats(): number {
    return this.missedBeats;
  }

  isRunning(): boolean {
    return this.interval !== null;
  }
}
