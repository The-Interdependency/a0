const PCNA_URL = "http://localhost:8001/api/pcna";

export async function pcnaInfer(text: string): Promise<{
  coherence_score: number;
  winner: string;
  confidence: number;
  elapsed_ms: number;
}> {
  const r = await fetch(`${PCNA_URL}/infer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`PCNA infer failed: ${r.status}`);
  return r.json();
}

export async function pcnaReward(winner: string, outcome: number): Promise<void> {
  await fetch(`${PCNA_URL}/reward`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ winner, outcome }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => {});
}
