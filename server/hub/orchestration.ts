/**
 * hub/orchestration.ts — TypeScript port of aimmh_lib/conversations.py
 *
 * Six orchestration patterns, pure async, zero external deps:
 *   fan_out          — parallel call to N models
 *   daisy_chain      — A → B gets A's output → C gets B's output ...
 *   room_all         — all respond, see each other, respond again
 *   room_synthesized — all respond, synthesizer combines, synthesis drives next round
 *   council          — all respond, each synthesizes all responses (incl. own)
 *   roleplay         — DM + players, initiative ordering, sequential turns, optional reactions
 *
 * CallFn: async (modelId: string, messages: Message[]) -> string
 *   On error, return a string starting with "[ERROR]"
 */

import { CallFn, Message, ModelResult } from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function injectSystem(
  messages: Message[],
  slotIdx: number,
  slotContexts?: (string | null)[] | null,
): Message[] {
  if (!slotContexts || slotIdx >= slotContexts.length) return messages;
  const sys = slotContexts[slotIdx];
  if (!sys) return messages;
  return [{ role: "system", content: sys }, ...messages];
}

function trim(history: Message[], maxHistory: number): Message[] {
  return history.length > maxHistory ? history.slice(-maxHistory) : history;
}

async function callOne(
  call: CallFn,
  modelId: string,
  messages: Message[],
  slotContexts: (string | null)[] | null | undefined,
  slotIdx: number,
  roundNum: number,
  stepNum: number,
  role: ModelResult["role"] = "player",
  initiative = 0,
): Promise<ModelResult> {
  const msgs = injectSystem(messages, slotIdx, slotContexts);
  const t = Date.now();
  let content: string;
  let error: string | undefined;
  try {
    content = await call(modelId, msgs);
    if (content.startsWith("[ERROR]")) error = content;
  } catch (e: any) {
    content = `[ERROR] ${e?.message ?? e}`;
    error = content;
  }
  return {
    model: modelId,
    content,
    responseTimeMs: Date.now() - t,
    error,
    roundNum,
    stepNum,
    initiative,
    role,
    slotIdx,
  };
}

// ---------------------------------------------------------------------------
// fan_out — parallel call to N models (core building block)
// ---------------------------------------------------------------------------

/**
 * Call all models in parallel with the same messages.
 * Returns one ModelResult per model.
 */
export async function fanOut(
  call: CallFn,
  modelIds: string[],
  messages: Message[],
  slotContexts?: (string | null)[] | null,
  roundNum = 0,
): Promise<ModelResult[]> {
  return Promise.all(
    modelIds.map((mid, idx) =>
      callOne(call, mid, messages, slotContexts, idx, roundNum, idx)
    )
  );
}

// ---------------------------------------------------------------------------
// daisy_chain — sequential: each model builds on the last
// ---------------------------------------------------------------------------

/**
 * Chain models sequentially: model A's response becomes the user message
 * fed to model B, whose response feeds model C, and so on.
 *
 * Returns one ModelResult per model.
 */
export async function daisyChain(
  call: CallFn,
  modelIds: string[],
  prompt: string,
  slotContexts?: (string | null)[] | null,
  maxHistory = 20,
): Promise<ModelResult[]> {
  const results: ModelResult[] = [];
  let currentPrompt = prompt;

  for (let i = 0; i < modelIds.length; i++) {
    const messages: Message[] = [{ role: "user", content: currentPrompt }];
    const result = await callOne(call, modelIds[i], messages, slotContexts, i, 0, i);
    results.push(result);
    if (!result.error) {
      currentPrompt = result.content;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// room_all — all models respond, see each other, respond again
// ---------------------------------------------------------------------------

/**
 * Multi-round room: each round all models see the full conversation history
 * (including each other's previous responses) and respond again.
 *
 * Returns all ModelResults across all rounds.
 */
export async function roomAll(
  call: CallFn,
  modelIds: string[],
  prompt: string,
  rounds = 2,
  slotContexts?: (string | null)[] | null,
  maxHistory = 20,
): Promise<ModelResult[]> {
  const allResults: ModelResult[] = [];
  const sharedHistory: Message[] = [{ role: "user", content: prompt }];

  for (let round = 0; round < rounds; round++) {
    const roundMessages = trim(sharedHistory, maxHistory);
    const roundResults = await Promise.all(
      modelIds.map((mid, idx) =>
        callOne(call, mid, roundMessages, slotContexts, idx, round, idx)
      )
    );
    allResults.push(...roundResults);

    // Each response is appended as an assistant message visible to all next round
    for (const r of roundResults) {
      sharedHistory.push({
        role: "assistant",
        content: `[${r.model}]: ${r.content}`,
      });
    }

    if (round < rounds - 1) {
      sharedHistory.push({
        role: "user",
        content: "Continue the conversation, responding to what you just heard.",
      });
    }
  }

  return allResults;
}

// ---------------------------------------------------------------------------
// room_synthesized — all respond, synthesizer combines, synthesis drives next round
// ---------------------------------------------------------------------------

/**
 * Like room_all but with a dedicated synthesizer that merges all responses
 * into a single prompt that seeds the next round.
 *
 * Returns all ModelResults across all rounds including synthesis steps (stepNum=-1).
 */
export async function roomSynthesized(
  call: CallFn,
  modelIds: string[],
  prompt: string,
  synthModelId: string,
  rounds = 2,
  slotContexts?: (string | null)[] | null,
  maxHistory = 20,
): Promise<ModelResult[]> {
  const allResults: ModelResult[] = [];
  const sharedHistory: Message[] = [{ role: "user", content: prompt }];
  let currentPrompt = prompt;

  for (let round = 0; round < rounds; round++) {
    const roundMessages = trim(sharedHistory, maxHistory);
    const roundResults = await Promise.all(
      modelIds.map((mid, idx) =>
        callOne(call, mid, roundMessages, slotContexts, idx, round, idx)
      )
    );
    allResults.push(...roundResults);

    // Build synthesis prompt from all responses
    const responsesText = roundResults
      .filter(r => !r.error)
      .map(r => `[${r.model}]: ${r.content}`)
      .join("\n\n");

    const synthPrompt =
      `[ROUND ${round + 1} SYNTHESIS]\n\n` +
      `All responses:\n${responsesText}\n\n` +
      `Synthesize these perspectives into a unified response that captures the key insights and resolves any contradictions.`;

    const synthMessages = trim(sharedHistory, maxHistory).concat([
      { role: "user", content: synthPrompt },
    ]);
    const synthSlotIdx = modelIds.length; // beyond player slots
    const synthContexts = slotContexts ? [...slotContexts] : [];
    const synthResult = await callOne(
      call, synthModelId, synthMessages, synthContexts, synthSlotIdx, round, -1, "synthesizer"
    );
    allResults.push(synthResult);

    // Synthesis output becomes the prompt for the next round
    currentPrompt = synthResult.content;
    sharedHistory.push({ role: "user", content: synthPrompt });
    sharedHistory.push({ role: "assistant", content: synthResult.content });
  }

  return allResults;
}

// ---------------------------------------------------------------------------
// council — all respond, each synthesizes all responses (including own)
// ---------------------------------------------------------------------------

/**
 * Each model first contributes a response, then every model independently
 * synthesizes the full set of responses (including its own) in parallel.
 *
 * Returns: N initial ModelResults (stepNum=0) + N synthesis ModelResults (stepNum=1).
 */
export async function council(
  call: CallFn,
  modelIds: string[],
  prompt: string,
  slotContexts?: (string | null)[] | null,
): Promise<ModelResult[]> {
  const messages: Message[] = [{ role: "user", content: prompt }];

  // Step 1: all models respond in parallel
  const initialResults = await Promise.all(
    modelIds.map((mid, idx) =>
      callOne(call, mid, messages, slotContexts, idx, 0, 0, "council")
    )
  );

  // Step 2: each model synthesizes all responses (including its own)
  const allResponsesText = initialResults
    .filter(r => !r.error)
    .map(r => `[${r.model}]: ${r.content}`)
    .join("\n\n---\n\n");

  const synthesisResults = await Promise.all(
    modelIds.map((mid, idx) => {
      const synthPrompt =
        `[COUNCIL SYNTHESIS]\n\n` +
        `All council responses to: "${prompt}"\n\n` +
        `${allResponsesText}\n\n` +
        `As ${mid}, synthesize these perspectives into your own unified view.`;
      const synthMessages: Message[] = [
        { role: "user", content: prompt },
        { role: "assistant", content: initialResults[idx].content },
        { role: "user", content: synthPrompt },
      ];
      return callOne(call, mid, synthMessages, slotContexts, idx, 0, 1, "council");
    })
  );

  return [...initialResults, ...synthesisResults];
}

// ---------------------------------------------------------------------------
// roleplay — DM + players, initiative ordering, sequential turns
// ---------------------------------------------------------------------------

export interface RoleplayOptions {
  rounds?: number;
  useInitiative?: boolean;
  allowReactions?: boolean;
  actionWordLimit?: number;
  maxHistory?: number;
  dmContext?: string;
  slotContexts?: (string | null)[] | null;
}

/**
 * DM-driven roleplay with initiative ordering:
 * - DM narrates the scene
 * - Players roll initiative (random 1–20) to determine order
 * - Each player acts in initiative order, seeing previous actions
 * - Optionally: other players may react after each action
 * - DM narrates the outcome and sets up the next scene
 *
 * Returns all ModelResults including DM narrations (stepNum=-1).
 */
export async function roleplay(
  call: CallFn,
  playerModels: string[],
  dmModelId: string,
  initialPrompt: string,
  options: RoleplayOptions = {},
): Promise<ModelResult[]> {
  const {
    rounds = 2,
    useInitiative = true,
    allowReactions = false,
    actionWordLimit = 80,
    maxHistory = 20,
    dmContext,
    slotContexts,
  } = options;

  const allResults: ModelResult[] = [];
  const sharedHistory: Message[] = [{ role: "user", content: initialPrompt }];
  let dmNarration = initialPrompt;

  for (let round = 0; round < rounds; round++) {
    // Roll initiative for this round
    const rolls: Record<number, number> = {};
    if (useInitiative) {
      for (let i = 0; i < playerModels.length; i++) {
        rolls[i] = Math.floor(Math.random() * 20) + 1;
      }
    } else {
      for (let i = 0; i < playerModels.length; i++) {
        rolls[i] = playerModels.length - i; // stable order
      }
    }

    // Sort players by initiative descending
    const orderedPlayers = playerModels
      .map((pm, i) => ({ pm, i, initiative: rolls[i] }))
      .sort((a, b) => b.initiative - a.initiative);

    const roundActions: ModelResult[] = [];

    // Each player acts in initiative order, seeing all previous actions this round
    for (let step = 0; step < orderedPlayers.length; step++) {
      const { pm, i: slotIdx, initiative } = orderedPlayers[step];
      const prevActions = roundActions
        .map(r => `${r.model} (initiative ${r.initiative}): ${r.content}`)
        .join("\n");

      const actionPrompt =
        `[ROUND ${round + 1} — Your turn, initiative ${initiative}]\n\n` +
        `Scene: ${dmNarration}\n\n` +
        (prevActions ? `Actions so far this round:\n${prevActions}\n\n` : "") +
        `Describe your action in ${actionWordLimit} words or fewer.`;

      const actionMessages = trim(sharedHistory, maxHistory).concat([
        { role: "user", content: actionPrompt },
      ]);
      const result = await callOne(
        call, pm, actionMessages, slotContexts, slotIdx, round, step, "player", initiative
      );
      roundActions.push(result);
      allResults.push(result);

      sharedHistory.push({ role: "user", content: actionPrompt });
      sharedHistory.push({ role: "assistant", content: result.content });

      // Optional reactions from other players
      if (allowReactions && !result.error) {
        const remaining = orderedPlayers
          .slice(step + 1)
          .map(p => [p.i, p.pm] as [number, string]);

        if (remaining.length > 0) {
          const reactionPrompt =
            `[REACTION — ${pm} just acted: "${result.content}"]\n\n` +
            `Do you react? Describe briefly in ${Math.floor(actionWordLimit / 2)} words or fewer, or say "No reaction."`;

          const reactionMessages = trim(sharedHistory, maxHistory).concat([
            { role: "user", content: reactionPrompt },
          ]);
          const reactions = await Promise.all(
            remaining.map(([si, rpm]) =>
              callOne(call, rpm, reactionMessages, slotContexts, si, round, step, "reaction", rolls[si])
            )
          );
          allResults.push(...reactions);
          sharedHistory.push({ role: "user", content: reactionPrompt });
          for (const rx of reactions) {
            sharedHistory.push({ role: "assistant", content: rx.content });
          }
        }
      }
    }

    // DM narrates the round outcome (stepNum = -1)
    const allActionsText = roundActions
      .filter(r => !r.error)
      .map(r => `${r.model} (initiative ${r.initiative}): ${r.content}`)
      .join("\n\n");

    const reactionResults = allResults.filter(
      r => r.roundNum === round && r.role === "reaction"
    );
    const reactionsText = reactionResults.length
      ? "\n\nReactions:\n" +
        reactionResults
          .filter(r => !r.error)
          .map(r => `${r.model} reacted: ${r.content}`)
          .join("\n\n")
      : "";

    const dmPrompt =
      `[ROUND ${round + 1} — DM NARRATION]\n\n` +
      `Player actions this round:\n${allActionsText}` +
      `${reactionsText}\n\n` +
      `Narrate the outcome and set up the next scene.`;

    const dmSlotIdx = playerModels.length;
    const dmContexts = [...(slotContexts || [])];
    if (dmContext) dmContexts[dmSlotIdx] = dmContext;

    const dmMessages = trim(sharedHistory, maxHistory).concat([
      { role: "user", content: dmPrompt },
    ]);
    const dmResult = await callOne(
      call, dmModelId, dmMessages, dmContexts, dmSlotIdx, round, -1, "dm"
    );
    allResults.push(dmResult);
    sharedHistory.push({ role: "user", content: dmPrompt });
    sharedHistory.push({ role: "assistant", content: dmResult.content });
    dmNarration = dmResult.content;
  }

  return allResults;
}
