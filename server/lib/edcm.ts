import { computeEdcmMetrics, generateEdcmDirectives, buildDirectivePromptInjection } from "../a0p-engine";
import { logEdcm } from "../logger";

export async function recomputeEdcmAfterToolCall(
  accumulatedResponse: string,
  conversationId: number,
  round: number
): Promise<string> {
  try {
    const metrics = computeEdcmMetrics(accumulatedResponse);
    const directives = await generateEdcmDirectives(metrics);
    const injection = buildDirectivePromptInjection(directives);
    const firedDirs = directives.filter(d => d.fired).map(d => d.type);

    await logEdcm("directives_recomputed_after_tool", {
      conversationId,
      round,
      directivesFired: firedDirs,
      metricsSnapshot: {
        CM: metrics.CM.value,
        DA: metrics.DA.value,
        DRIFT: metrics.DRIFT.value,
      },
    });

    return injection;
  } catch (e: any) {
    console.error("[a0p:edcm] Recompute after tool call error:", e.message);
    return "";
  }
}
