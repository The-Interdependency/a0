/**
 * hub/types.ts — TypeScript port of aimmh_lib types.
 *
 * CallFn contract: async (modelId: string, messages: Message[]) -> string
 *   - messages follow OpenAI role format
 *   - returns full response string
 *   - on error, returns string starting with "[ERROR]"
 */

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/** async fn(modelId, messages) -> complete response string */
export type CallFn = (modelId: string, messages: Message[]) => Promise<string>;

/**
 * A single model response within a conversation pattern.
 *
 * stepNum = -1 is a sentinel for synthesis/DM steps between rounds.
 * Filter helpers:
 *   responses only:   results.filter(r => r.stepNum >= 0)
 *   synthesis/DM:     results.filter(r => r.stepNum === -1)
 *   by round:         results.filter(r => r.roundNum === n)
 *   by slot:          results.filter(r => r.slotIdx === i)
 */
export interface ModelResult {
  model: string;
  content: string;
  responseTimeMs: number;
  error?: string;
  roundNum: number;
  stepNum: number;
  initiative: number;
  role: "player" | "dm" | "synthesizer" | "council" | "reaction";
  slotIdx: number;
}

export interface HubRunRequest {
  /** Orchestration pattern to run */
  pattern: "fan_out" | "daisy_chain" | "room_all" | "room_synthesized" | "council" | "roleplay";
  /** Model slot keys to use as participants (e.g. ["a", "b", "c"]) */
  slots: string[];
  /** Initial prompt / user message */
  prompt: string;
  /** Optional per-slot system context overrides (aligned by index with slots) */
  slotContexts?: (string | null)[];
  /** Number of rounds (room_all, room_synthesized, roleplay) — default 2 */
  rounds?: number;
  /** Synthesizer slot key (room_synthesized) */
  synthSlot?: string;
  /** DM slot key (roleplay) */
  dmSlot?: string;
  /** Max conversation history to carry forward — default 20 */
  maxHistory?: number;
  /** Whether to use initiative rolling in roleplay — default true */
  useInitiative?: boolean;
  /** Whether to allow reactions in roleplay — default false */
  allowReactions?: boolean;
  /** Action word limit per roleplay turn — default 80 */
  actionWordLimit?: number;
}
