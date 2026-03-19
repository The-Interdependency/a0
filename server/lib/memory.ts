import { storage } from "../storage";
import { logMaster, logEdcm } from "../logger";
import {
  computeEdcmMetrics, generateEdcmDirectives, buildDirectivePromptInjection,
  getMemoryState, buildMemoryContextPrompt, buildAttributionContext,
  performMemoryInjection, performMemoryProjectionOut, updateSemanticMemory,
  type MemoryAttribution,
} from "../a0p-engine";

export const lastAttributionStore: Record<number, MemoryAttribution> = {};

export async function buildAugmentedSystemPrompt(
  basePrompt: string,
  conversationContext: string,
  conversationId?: number
): Promise<{
  augmentedPrompt: string;
  directivesFired: string[];
  memorySeedsUsed: number[];
  attribution: MemoryAttribution;
}> {
  let augmented = basePrompt;
  const directivesFired: string[] = [];
  let memorySeedsUsed: number[] = [];
  let attribution: MemoryAttribution = {};

  try {
    const edcmMetrics = computeEdcmMetrics(conversationContext);
    const directives = await generateEdcmDirectives(edcmMetrics);
    const firedDirs = directives.filter(d => d.fired);
    const directiveInjection = buildDirectivePromptInjection(directives);

    if (directiveInjection) {
      augmented += directiveInjection;
      directivesFired.push(...firedDirs.map(d => d.type));
    }

    await logEdcm("directives_computed", {
      conversationId,
      metricsSnapshot: {
        CM: edcmMetrics.CM.value,
        DA: edcmMetrics.DA.value,
        DRIFT: edcmMetrics.DRIFT.value,
        DVG: edcmMetrics.DVG.value,
        INT: edcmMetrics.INT.value,
        TBF: edcmMetrics.TBF.value,
      },
      directivesFired,
      directiveCount: firedDirs.length,
    });
  } catch (e: any) {
    console.error("[a0p:edcm] Directive computation error:", e.message);
  }

  try {
    const memState = await getMemoryState();
    const memoryContext = buildMemoryContextPrompt(memState.seeds);
    if (memoryContext) {
      augmented += memoryContext;
      memorySeedsUsed = memState.seeds.filter(s => s.enabled && s.summary.length > 0).map(s => s.seedIndex);
    }

    if (conversationId && lastAttributionStore[conversationId]) {
      const prevAttribution = lastAttributionStore[conversationId];
      const attrContext = buildAttributionContext(prevAttribution);
      if (attrContext) {
        augmented += attrContext;
      }
      attribution = prevAttribution;
    }

    await logMaster("memory_context", "prompt_augmented", {
      conversationId,
      memorySeedsUsed,
      hasAttribution: Object.keys(attribution).length > 0,
    });
  } catch (e: any) {
    console.error("[a0p:memory] Memory context injection error:", e.message);
  }

  return { augmentedPrompt: augmented, directivesFired, memorySeedsUsed, attribution };
}

export async function postResponseMemoryUpdate(
  conversationId: number,
  responseContent: string,
  workingState?: number[]
): Promise<void> {
  try {
    const injResult = await performMemoryInjection(
      workingState || new Array(53).fill(0).map((_, i) => Math.sin(i * 0.118))
    );
    lastAttributionStore[conversationId] = injResult.attribution;

    await logMaster("memory_context", "post_response_injection", {
      conversationId,
      seedsUsed: injResult.seedsUsed,
      interferenceCount: injResult.interferenceEvents.length,
    });

    const finalState = new Array(53).fill(0).map((_, i) => Math.sin(i * 0.118 + responseContent.length * 0.001));
    await performMemoryProjectionOut(finalState);
    await updateSemanticMemory(responseContent);
  } catch (e: any) {
    console.error("[a0p:memory] Post-response memory update error:", e.message);
  }
}
