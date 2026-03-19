import { storage } from "../storage";

export const VALID_PERSONAS = ["free", "legal", "researcher", "political"] as const;
export type Persona = typeof VALID_PERSONAS[number];

export const OWNER_USER_ID = process.env.REPL_OWNER_ID || "";

export const PERSONA_PROMPT_BLOCKS: Record<Persona, string> = {
  free: "",
  legal: `PERSONA: LEGAL ANALYST
You are operating in legal analysis mode. Frame all outputs through a legal lens:
- EDCM metrics map to: Constraint Mismatch → Regulatory Compliance Gap, Dissonance → Contradictory Precedent, Drift → Argumentation Drift, Divergence → Jurisdictional Divergence, Intensity → Adversarial Tone, Turn-Balance → Examination Balance.
- When analyzing documents, flag statutory references, liability language, and procedural posture.
- Cite jurisdiction and applicable legal standard when relevant.
- Maintain strict neutrality; present both sides of any legal question.`,
  researcher: `PERSONA: ACADEMIC RESEARCHER
You are operating in research mode. Apply rigorous analytical standards:
- EDCM metrics map to: Constraint Mismatch → Methodological Inconsistency, Dissonance → Conflicting Findings, Drift → Hypothesis Drift, Divergence → Theoretical Divergence, Intensity → Citation Density, Turn-Balance → Dialogue Equity.
- Reference literature, data sources, and methodological limitations where applicable.
- Flag assumptions, confounds, and alternative interpretations.
- Use precise academic language; prefer hedged claims over absolute statements.`,
  political: `PERSONA: POLITICAL ANALYST
You are operating in political analysis mode. Apply structured political science framing:
- EDCM metrics map to: Constraint Mismatch → Policy Constraint Violation, Dissonance → Narrative Contradiction, Drift → Position Drift, Divergence → Ideological Divergence, Intensity → Rhetoric Intensity, Turn-Balance → Discourse Equity.
- Identify stakeholders, power dynamics, and institutional interests.
- Distinguish between descriptive analysis and normative claims.
- Present competing political perspectives without partisan framing.`,
};

export async function getUserPersona(userId: string): Promise<Persona> {
  if (OWNER_USER_ID && userId === OWNER_USER_ID) return "political";
  try {
    const toggle = await storage.getSystemToggle(`user_persona_${userId}`);
    const p = (toggle?.parameters as any)?.persona;
    if (VALID_PERSONAS.includes(p)) return p as Persona;
  } catch {}
  return "free";
}

export async function getPersonaGrants(): Promise<Record<string, string>> {
  try {
    const toggle = await storage.getSystemToggle("persona_grants");
    return (toggle?.parameters as Record<string, string>) || {};
  } catch {}
  return {};
}

export async function enforcePersonaGrant(userId: string): Promise<Persona | null> {
  if (OWNER_USER_ID && userId === OWNER_USER_ID) return null;
  const grants = await getPersonaGrants();
  const granted = grants[userId];
  if (granted && VALID_PERSONAS.includes(granted as Persona)) {
    await storage.upsertSystemToggle(`user_persona_${userId}`, true, { persona: granted });
    return granted as Persona;
  }
  return null;
}
