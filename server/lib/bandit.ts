import { banditSelect, banditReward } from "../a0p-engine";
import { logMaster } from "../logger";
import { computeEdcmMetrics } from "../a0p-engine";

export async function banditSelectWithFallback(domain: string, fallback: string): Promise<{ armName: string; armId: number } | null> {
  try {
    const result = await banditSelect(domain);
    return result;
  } catch (e: any) {
    console.error(`[a0p:bandit] Select error for ${domain}:`, e.message);
    return null;
  }
}

export async function rewardAndLogBandit(armId: number | null, reward: number, domain: string, armName: string): Promise<void> {
  if (armId == null) return;
  try {
    await banditReward(armId, reward);
    await logMaster("bandit", "reward_applied", { domain, armName, armId, reward });
  } catch (e: any) {
    console.error(`[a0p:bandit] Reward error for ${domain}:`, e.message);
  }
}

export function computeResponseReward(responseContent: string, latencyMs: number): number {
  const lengthScore = Math.min(1.0, responseContent.length / 2000);
  const latencyPenalty = Math.max(0, 1.0 - latencyMs / 30000);
  const edcm = computeEdcmMetrics(responseContent);
  const qualityScore = 1.0 - (edcm.DA.value * 0.3 + edcm.DRIFT.value * 0.2 + edcm.INT.value * 0.1);
  const reward = 0.3 * lengthScore + 0.3 * latencyPenalty + 0.4 * qualityScore;
  return Math.max(0, Math.min(1, reward));
}
