import { storage } from "./storage";
import { logMaster, logTranscript, logEdcm, logOmega, logPsi, readAiTranscripts } from "./logger";
import { computeEdcmMetrics, updateSemanticMemory, omegaSolve, applyCrossTensorCoupling, applyMemoryBridge, persistOmegaState, getOmegaState, psiSolve, applyPsiOmegaCoupling, persistPsiState, ptcaSolveDetailed, touchOmegaGoalPursuit } from "./a0p-engine";
import { getUncachableGitHubClient } from "./github";
import { createHash } from "crypto";
import type { HeartbeatTask } from "@shared/schema";
import { tickSubCore, subCore } from "./subcore-instance.js";
import { pcnaInfer, pcnaReward } from "./pcna-client";

const DEFAULT_TICK_INTERVAL_MS = 30_000;

let tickInterval: ReturnType<typeof setInterval> | null = null;
let tickIntervalMs = DEFAULT_TICK_INTERVAL_MS;
let running = false;


const DEFAULT_TASKS: Array<{
  name: string;
  description: string;
  taskType: string;
  weight: number;
  intervalSeconds: number;
  enabled: boolean;
}> = [
  {
    name: "transcript_search",
    description: "Search for and analyze conversation transcripts for EDCM patterns",
    taskType: "transcript_search",
    weight: 1.0,
    intervalSeconds: 600,
    enabled: true,
  },
  {
    name: "github_search",
    description: "Search GitHub for autonomous agent repos, ethical AI projects, and TIW-aligned contributors",
    taskType: "github_search",
    weight: 1.5,
    intervalSeconds: 900,
    enabled: true,
  },
  {
    name: "ai_social_search",
    description: "Monitor AI agent directories, registries, and social platforms for relevant agents",
    taskType: "ai_social_search",
    weight: 1.0,
    intervalSeconds: 1200,
    enabled: true,
  },
  {
    name: "x_monitor",
    description: "Monitor X/Twitter for autonomous AI, ethical AI, and interdependence discussions",
    taskType: "x_monitor",
    weight: 0.8,
    intervalSeconds: 1800,
    enabled: false,
  },
  {
    name: "agent_bandit_tick",
    description: "Select a persistent sub-agent via UCB bandit, run its directives via ZFAE, and store ZFAE observation back into its sentinel seeds",
    taskType: "agent_bandit_tick",
    weight: 1.2,
    intervalSeconds: 600,
    enabled: true,
  },
  {
    name: "zeta_fun_observe",
    description: "a0 zeta fun: observe EDCM metrics, token spend, active context, and recent prompt/response; evaluate sentinel thresholds; write structured ZFAE notes",
    taskType: "zeta_fun_observe",
    weight: 1.0,
    intervalSeconds: 300,
    enabled: true,
  },
];

export async function initializeHeartbeatTasks(): Promise<void> {
  for (const task of DEFAULT_TASKS) {
    const existing = await storage.getHeartbeatTask(task.name);
    if (!existing) {
      await storage.upsertHeartbeatTask({
        name: task.name,
        description: task.description,
        taskType: task.taskType,
        weight: task.weight,
        intervalSeconds: task.intervalSeconds,
        enabled: task.enabled,
      });
    }
  }
  await logMaster("heartbeat", "tasks_initialized", { taskCount: DEFAULT_TASKS.length });
}

async function isHeartbeatEnabled(): Promise<boolean> {
  try {
    const toggle = await storage.getSystemToggle("heartbeat");
    if (toggle && !toggle.enabled) return false;
  } catch {}
  return true;
}

async function getHeartbeatParams(): Promise<{ tickMs: number }> {
  try {
    const toggle = await storage.getSystemToggle("heartbeat");
    if (toggle?.parameters) {
      const params = toggle.parameters as any;
      return {
        tickMs: (params.tickIntervalSeconds || 30) * 1000,
      };
    }
  } catch {}
  return { tickMs: DEFAULT_TICK_INTERVAL_MS };
}

function weightedSelect(tasks: HeartbeatTask[]): HeartbeatTask | null {
  const now = Date.now();
  const eligible = tasks.filter((t) => {
    if (!t.enabled) return false;
    if (t.scheduledAt && new Date(t.scheduledAt).getTime() > now) return false;
    if (t.lastRun) {
      const elapsed = (now - new Date(t.lastRun).getTime()) / 1000;
      if (elapsed < t.intervalSeconds) return false;
    }
    return true;
  });

  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((sum, t) => sum + t.weight, 0);
  if (totalWeight <= 0) return eligible[0];

  let roll = Math.random() * totalWeight;
  for (const task of eligible) {
    roll -= task.weight;
    if (roll <= 0) return task;
  }
  return eligible[eligible.length - 1];
}

interface OmegaStateCompact {
  dimensionEnergies: number[];
  mode: string;
  goals: Array<{ status: string }>;
}

function omegaWeightedSelect(tasks: HeartbeatTask[], omega: OmegaStateCompact): HeartbeatTask | null {
  const now = Date.now();
  const eligible = tasks.filter((t) => {
    if (!t.enabled) return false;
    if (t.scheduledAt && new Date(t.scheduledAt).getTime() > now) return false;
    if (t.lastRun) {
      const elapsed = (now - new Date(t.lastRun).getTime()) / 1000;
      if (elapsed < t.intervalSeconds) return false;
    }
    return true;
  });

  if (eligible.length === 0) return null;

  const a9Exploration = omega.dimensionEnergies[8] || 0;
  const a1Goal = omega.dimensionEnergies[0] || 0;
  const a7Learning = omega.dimensionEnergies[6] || 0;

  const adjustedWeights = eligible.map(t => {
    let w = t.weight;

    if (t.taskType === "github_search" || t.taskType === "ai_social_search") {
      w *= (1 + a9Exploration * 0.5);
    }

    if (t.taskType === "transcript_search") {
      w *= (1 + a7Learning * 0.3);
    }

    if (a1Goal > 0.4) {
      w *= (1 + a1Goal * 0.2);
    }

    if (omega.mode === "economy") {
      if (t.taskType === "github_search" || t.taskType === "ai_social_search") {
        w *= 0.5;
      }
    } else if (omega.mode === "research") {
      if (t.taskType === "github_search" || t.taskType === "ai_social_search") {
        w *= 1.5;
      }
    } else if (omega.mode === "passive") {
      w *= 0.7;
    }

    return { task: t, weight: Math.max(0.01, w) };
  });

  const totalWeight = adjustedWeights.reduce((sum, tw) => sum + tw.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const tw of adjustedWeights) {
    roll -= tw.weight;
    if (roll <= 0) return tw.task;
  }
  return adjustedWeights[adjustedWeights.length - 1].task;
}

async function executeTask(task: HeartbeatTask): Promise<{ result: string; relevance: number; data: any }> {
  switch (task.taskType) {
    case "transcript_search":
      return executeTranscriptSearch(task);
    case "github_search":
      return executeGithubSearch(task);
    case "ai_social_search":
      return executeAiSocialSearch(task);
    case "x_monitor":
      return executeXMonitor(task);
    case "goal_pursuit":
      return executeGoalPursuit(task);
    case "custom":
      return executeCustomTask(task);
    case "agent_bandit_tick":
      return executeAgentBanditTick(task);
    case "zeta_fun_observe":
      return executeZetaFunObserve(task);
    default:
      return { result: `Unknown task type: ${task.taskType}`, relevance: 0, data: {} };
  }
}

async function executeGoalPursuit(task: HeartbeatTask): Promise<{ result: string; relevance: number; data: any }> {
  try {
    const omega = getOmegaState();
    const activeGoals = ((omega as any).goals || []).filter((g: any) => g.status === "active");

    if (activeGoals.length === 0) {
      return { result: "No active goals to pursue.", relevance: 0, data: { goalCount: 0 } };
    }

    // Pick highest priority goal
    const goal = [...activeGoals].sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0))[0];
    const goalDesc: string = goal.description || "undefined goal";

    await logMaster("heartbeat", "goal_pursuit_start", { goalId: goal.id, goalDesc: goalDesc.slice(0, 100) });

    // Use PCNA inference engine to process the goal
    const searchQuery = goalDesc.slice(0, 120);

    // Execute web search (Brave → DuckDuckGo fallback)
    let searchResults = "";
    let resultUrls: string[] = [];
    try {
      const braveKey = process.env.BRAVE_API_KEY || "";
      if (braveKey) {
        const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=5`, {
          headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": braveKey },
          signal: AbortSignal.timeout(15000),
        });
        if (r.ok) {
          const d = await r.json() as any;
          const results = (d.web?.results || []).slice(0, 5);
          resultUrls = results.map((x: any) => x.url);
          searchResults = results.map((x: any) => `${x.title}: ${x.description || ""}`).join("\n");
        }
      }
      if (!searchResults) {
        const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(15000),
        });
        if (r.ok) {
          const html = await r.text();
          const titles = [...html.matchAll(/class="result__title"[^>]*>(.*?)<\/a>/gs)].slice(0, 5).map(m => m[1].replace(/<[^>]+>/g, "").trim());
          searchResults = titles.join("\n");
        }
      }
    } catch {}

    if (!searchResults) searchResults = "No search results retrieved.";

    // Use registered model for synthesis.assess slot
    let assessment = "";
    try {
      const inferResult = await pcnaInfer(`Goal: ${goalDesc}\nSearch results: ${searchResults.slice(0, 800)}`);
      assessment = `PCNA coherence ${inferResult.coherence_score.toFixed(3)} — winner: ${inferResult.winner} (${(inferResult.confidence * 100).toFixed(0)}% conf). Search results indicate progress toward goal.`;
      await pcnaReward(inferResult.winner, inferResult.coherence_score);
    } catch {}

    // Score relevance by keyword overlap between goal and results
    const goalWords = new Set(goalDesc.toLowerCase().split(/\W+/).filter(w => w.length > 4));
    const resultText = (searchResults + " " + assessment).toLowerCase();
    const matchCount = [...goalWords].filter(w => resultText.includes(w)).length;
    const relevance = Math.min(0.95, 0.3 + (goalWords.size > 0 ? (matchCount / goalWords.size) * 0.65 : 0));

    const result = `Goal pursuit: "${goalDesc.slice(0, 80)}"\nQuery: "${searchQuery}"\nFindings: ${assessment || searchResults.slice(0, 300)}`;

    await logMaster("heartbeat", "goal_pursuit_complete", {
      goalId: goal.id,
      goalDesc: goalDesc.slice(0, 100),
      searchQuery,
      relevance,
      resultLen: result.length,
    });

    return {
      result,
      relevance,
      data: { goalId: goal.id, goalDesc, searchQuery, assessment, resultUrls: resultUrls.slice(0, 5) },
    };
  } catch (err: any) {
    await logMaster("heartbeat", "goal_pursuit_error", { error: err.message }).catch(() => {});
    return { result: `Goal pursuit error: ${err.message}`, relevance: 0, data: { error: err.message } };
  }
}

async function executeTranscriptSearch(_task: HeartbeatTask): Promise<{ result: string; relevance: number; data: any }> {
  try {
    const conversations = await storage.getConversations();
    const recentConvs = conversations.slice(0, 10);
    let totalMessages = 0;
    let highEdcmCount = 0;
    const findings: any[] = [];
    const notableSnippets: string[] = [];

    const transcriptHash = createHash("sha256")
      .update(`transcript-search-${Date.now()}`)
      .digest("hex")
      .slice(0, 12);

    await logTranscript(transcriptHash, "search_started", {
      conversationCount: recentConvs.length,
      taskType: "transcript_search",
    });

    for (const conv of recentConvs) {
      const msgs = await storage.getMessages(conv.id);
      totalMessages += msgs.length;

      const recentMsgs = msgs.slice(-5);

      for (const msg of recentMsgs) {
        const edcm = computeEdcmMetrics(msg.content);
        const maxMetric = Math.max(
          edcm.CM.value, edcm.DA.value, edcm.DRIFT.value,
          edcm.DVG.value, edcm.INT.value
        );

        const directivesFired: string[] = [];
        if (edcm.CM.value > 0.8) directivesFired.push("CONSTRAINT_REFOCUS");
        if (edcm.DA.value > 0.8) directivesFired.push("DISSONANCE_HALT");
        if (edcm.DRIFT.value > 0.8) directivesFired.push("DRIFT_ANCHOR");
        if (edcm.DVG.value > 0.8) directivesFired.push("DIVERGENCE_COMMIT");
        if (edcm.INT.value > 0.8) directivesFired.push("INTENSITY_CALM");
        if (edcm.TBF.value > 0.8) directivesFired.push("BALANCE_CONCISE");

        try {
          await storage.addEdcmMetricSnapshot({
            conversationId: conv.id,
            source: "transcript",
            cm: edcm.CM.value,
            da: edcm.DA.value,
            drift: edcm.DRIFT.value,
            dvg: edcm.DVG.value,
            intVal: edcm.INT.value,
            tbf: edcm.TBF.value,
            directivesFired: directivesFired.length > 0 ? directivesFired : null,
            contextSnippet: (typeof msg.content === "string" ? msg.content : "").slice(0, 200),
          });
        } catch {}

        await logTranscript(transcriptHash, "message_scored", {
          conversationId: conv.id,
          conversationTitle: conv.title,
          messageRole: msg.role,
          edcm: {
            cm: edcm.CM.value,
            da: edcm.DA.value,
            drift: edcm.DRIFT.value,
            dvg: edcm.DVG.value,
            int: edcm.INT.value,
            tbf: edcm.TBF.value,
          },
          maxMetric,
          directivesFired,
        });

        if (maxMetric > 0.6) {
          highEdcmCount++;
          findings.push({
            conversationId: conv.id,
            conversationTitle: conv.title,
            metric: maxMetric,
            messageRole: msg.role,
            edcmBreakdown: {
              cm: edcm.CM.value,
              da: edcm.DA.value,
              drift: edcm.DRIFT.value,
              dvg: edcm.DVG.value,
              int: edcm.INT.value,
              tbf: edcm.TBF.value,
            },
            directivesFired,
          });

          if (maxMetric > 0.7) {
            const snippet = typeof msg.content === "string"
              ? msg.content.slice(0, 150)
              : JSON.stringify(msg.content).slice(0, 150);
            notableSnippets.push(
              `[Conv ${conv.id}/${conv.title}] EDCM peak=${maxMetric.toFixed(3)}: ${snippet}`
            );
          }
        }
      }
    }

    await logEdcm("transcript_search_batch", {
      transcriptHash,
      conversationsScanned: recentConvs.length,
      totalMessages,
      highEdcmCount,
      findingsCount: findings.length,
    });

    if (notableSnippets.length > 0) {
      const summaryText = `Transcript analysis: ${notableSnippets.length} notable EDCM patterns found. ` +
        notableSnippets.slice(0, 3).join(" | ");
      try {
        await updateSemanticMemory(summaryText.slice(0, 500), 7);
        await logMaster("heartbeat", "transcript_memory_update", {
          seedIndex: 7,
          snippetCount: notableSnippets.length,
          summaryLength: summaryText.length,
        });
      } catch (err: any) {
        await logMaster("heartbeat", "transcript_memory_update_error", { error: err.message });
      }
    }

    await logTranscript(transcriptHash, "search_completed", {
      totalMessages,
      highEdcmCount,
      findingsCount: findings.length,
      notableCount: notableSnippets.length,
    });

    const relevance = highEdcmCount > 0
      ? Math.min(1.0, 0.4 + highEdcmCount * 0.1 + notableSnippets.length * 0.15)
      : 0.2;

    const result = `Scanned ${recentConvs.length} conversations, ${totalMessages} messages. ` +
      `Found ${highEdcmCount} high-EDCM entries across ${findings.length} findings. ` +
      `${notableSnippets.length} notable patterns routed to Seed 7 (External research).`;

    return {
      result,
      relevance,
      data: {
        transcriptHash,
        conversationsScanned: recentConvs.length,
        totalMessages,
        highEdcmCount,
        notableCount: notableSnippets.length,
        findings: findings.slice(0, 10),
        memoryRouted: notableSnippets.length > 0,
      },
    };
  } catch (err: any) {
    await logMaster("heartbeat", "transcript_search_error", { error: err.message }).catch(() => {});
    return { result: `Transcript search error: ${err.message}`, relevance: 0, data: { error: err.message } };
  }
}

const githubSeenRepos = new Set<string>();
const githubSeenUsers = new Set<string>();

function scoreGithubRelevance(
  name: string,
  description: string,
  topics: string[],
  stars: number,
  language: string | null
): number {
  const text = `${name} ${description} ${topics.join(" ")}`.toLowerCase();

  const highRelevanceTerms = ["autonomous agent", "ethical ai", "cooperative ai", "ai alignment", "interdependence", "tiw", "multi-agent", "agent protocol"];
  const medRelevanceTerms = ["ai agent", "llm agent", "alignment", "cooperative", "autonomous", "ethical", "responsible ai", "safe ai", "ai safety"];
  const lowRelevanceTerms = ["machine learning", "deep learning", "transformer", "language model", "neural"];

  let score = 0;
  for (const term of highRelevanceTerms) {
    if (text.includes(term)) score += 0.25;
  }
  for (const term of medRelevanceTerms) {
    if (text.includes(term)) score += 0.12;
  }
  for (const term of lowRelevanceTerms) {
    if (text.includes(term)) score += 0.04;
  }

  if (stars > 1000) score += 0.15;
  else if (stars > 100) score += 0.08;
  else if (stars > 10) score += 0.03;

  if (language && ["python", "typescript", "javascript", "rust"].includes(language.toLowerCase())) {
    score += 0.03;
  }

  return Math.min(1.0, score);
}

async function executeGithubSearch(_task: HeartbeatTask): Promise<{ result: string; relevance: number; data: any }> {
  try {
    const searchQueries = [
      "autonomous agent framework",
      "ethical AI alignment",
      "cooperative AI multi-agent",
      "AI interdependence",
      "agent protocol autonomous",
      "AI safety alignment research",
      "multi-agent cooperation",
      "responsible AI agent",
    ];
    const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];

    let octokit;
    try {
      octokit = await getUncachableGitHubClient();
    } catch (err: any) {
      return {
        result: `GitHub client initialization failed: ${err.message}`,
        relevance: 0.1,
        data: { error: err.message, query },
      };
    }

    let repos: any[] = [];
    try {
      const searchResult = await octokit.search.repos({
        q: query,
        sort: "stars",
        order: "desc",
        per_page: 15,
      });
      repos = searchResult.data.items || [];
    } catch (err: any) {
      await logMaster("heartbeat", "github_search_api_error", { error: err.message, query });
      return {
        result: `GitHub API search failed for "${query}": ${err.message}`,
        relevance: 0.1,
        data: { error: err.message, query },
      };
    }

    const scoredRepos: Array<{
      fullName: string;
      description: string;
      url: string;
      stars: number;
      language: string | null;
      topics: string[];
      owner: string;
      relevance: number;
      isDuplicate: boolean;
    }> = [];

    for (const repo of repos) {
      const fullName = repo.full_name || "";
      const isDuplicate = githubSeenRepos.has(fullName);
      const relevance = scoreGithubRelevance(
        repo.name || "",
        repo.description || "",
        repo.topics || [],
        repo.stargazers_count || 0,
        repo.language
      );

      scoredRepos.push({
        fullName,
        description: (repo.description || "").slice(0, 200),
        url: repo.html_url || "",
        stars: repo.stargazers_count || 0,
        language: repo.language,
        topics: (repo.topics || []).slice(0, 10),
        owner: repo.owner?.login || "",
        relevance,
        isDuplicate,
      });

      if (!isDuplicate) {
        githubSeenRepos.add(fullName);
        if (repo.owner?.login) {
          githubSeenUsers.add(repo.owner.login);
        }
      }
    }

    const newRepos = scoredRepos.filter(r => !r.isDuplicate);
    const highRelevanceRepos = newRepos.filter(r => r.relevance >= 0.5);
    const topRepos = newRepos.sort((a, b) => b.relevance - a.relevance).slice(0, 5);

    const maxRelevance = scoredRepos.length > 0
      ? Math.max(...scoredRepos.map(r => r.relevance))
      : 0;

    const overallRelevance = newRepos.length > 0
      ? Math.min(1.0, 0.3 + maxRelevance * 0.5 + (highRelevanceRepos.length > 0 ? 0.2 : 0))
      : 0.15;

    if (topRepos.length > 0) {
      const seed1Summary = topRepos
        .slice(0, 3)
        .map(r => `${r.fullName} (${r.stars} stars): ${r.description}`)
        .join("; ");
      try {
        await updateSemanticMemory(
          `GitHub discovery for "${query}": ${seed1Summary}`.slice(0, 450),
          1
        );
      } catch (err: any) {
        await logMaster("heartbeat", "github_seed1_update_error", { error: err.message });
      }

      const tiwRepos = topRepos.filter(r => {
        const text = `${r.fullName} ${r.description} ${r.topics.join(" ")}`.toLowerCase();
        return text.includes("tiw") || text.includes("interdependence") || text.includes("ethical ai") || text.includes("alignment") || text.includes("cooperative ai");
      });
      if (tiwRepos.length > 0) {
        const seed6Summary = tiwRepos
          .slice(0, 3)
          .map(r => `${r.fullName}: ${r.description}`)
          .join("; ");
        try {
          await updateSemanticMemory(
            `TIW-relevant GitHub repos: ${seed6Summary}`.slice(0, 450),
            6
          );
        } catch (err: any) {
          await logMaster("heartbeat", "github_seed6_update_error", { error: err.message });
        }
      }
    }

    if (highRelevanceRepos.length > 0) {
      for (const repo of highRelevanceRepos.slice(0, 3)) {
        try {
          await storage.createDiscoveryDraft({
            sourceTask: "github_search",
            title: `GitHub prospect: ${repo.fullName}`,
            summary: `${repo.description} | Stars: ${repo.stars} | Language: ${repo.language || "N/A"} | Topics: ${repo.topics.join(", ")} | Relevance: ${repo.relevance.toFixed(2)} | URL: ${repo.url}`.slice(0, 500),
            relevanceScore: repo.relevance,
            sourceData: {
              fullName: repo.fullName,
              url: repo.url,
              stars: repo.stars,
              language: repo.language,
              topics: repo.topics,
              owner: repo.owner,
              searchQuery: query,
            },
            promotedToConversation: false,
            conversationId: null,
          });

          await logMaster("heartbeat", "github_high_relevance_discovery", {
            repo: repo.fullName,
            relevance: repo.relevance,
            stars: repo.stars,
          });
        } catch (err: any) {
          await logMaster("heartbeat", "github_discovery_draft_error", { error: err.message, repo: repo.fullName });
        }
      }
    }

    await logMaster("heartbeat", "github_search_complete", {
      query,
      totalResults: repos.length,
      newResults: newRepos.length,
      duplicates: scoredRepos.length - newRepos.length,
      highRelevance: highRelevanceRepos.length,
      maxRelevance,
      trackedRepos: githubSeenRepos.size,
      trackedUsers: githubSeenUsers.size,
    });

    const resultSummary = `GitHub search for "${query}": ${repos.length} results, ${newRepos.length} new, ${highRelevanceRepos.length} high-relevance. ` +
      (topRepos.length > 0
        ? `Top: ${topRepos.slice(0, 3).map(r => `${r.fullName} (${r.relevance.toFixed(2)})`).join(", ")}.`
        : "No notable repos found.");

    return {
      result: resultSummary,
      relevance: overallRelevance,
      data: {
        query,
        totalResults: repos.length,
        newResults: newRepos.length,
        duplicates: scoredRepos.length - newRepos.length,
        highRelevanceCount: highRelevanceRepos.length,
        maxRelevance,
        topRepos: topRepos.slice(0, 5).map(r => ({
          fullName: r.fullName,
          description: r.description,
          url: r.url,
          stars: r.stars,
          language: r.language,
          topics: r.topics,
          relevance: r.relevance,
        })),
        trackedRepos: githubSeenRepos.size,
        trackedUsers: githubSeenUsers.size,
      },
    };
  } catch (err: any) {
    await logMaster("heartbeat", "github_search_error", { error: err.message }).catch(() => {});
    return { result: `GitHub search error: ${err.message}`, relevance: 0, data: { error: err.message } };
  }
}

const aiSocialSeenUrls = new Set<string>();
const aiSocialSeenNames = new Set<string>();

interface AiSocialSearchQuery {
  source: string;
  query: string;
  focusKeywords: string[];
}

const AI_SOCIAL_SEARCH_QUERIES: AiSocialSearchQuery[] = [
  {
    source: "Agent Protocol ecosystem",
    query: "agent protocol AI autonomous agents interoperability",
    focusKeywords: ["agent protocol", "interoperability", "autonomous agent", "agent-to-agent"],
  },
  {
    source: "Hugging Face spaces",
    query: "huggingface AI agent spaces autonomous models",
    focusKeywords: ["hugging face", "huggingface", "agent", "autonomous", "model space"],
  },
  {
    source: "AI agent leaderboards",
    query: "AI agent benchmark leaderboard evaluation autonomous",
    focusKeywords: ["leaderboard", "benchmark", "evaluation", "ranking", "agent"],
  },
  {
    source: "Autonomous agent directories",
    query: "awesome AI agents list directory autonomous frameworks",
    focusKeywords: ["awesome", "directory", "list", "framework", "autonomous agent"],
  },
  {
    source: "Agent Protocol ecosystem",
    query: "multi-agent system cooperative AI protocol registry",
    focusKeywords: ["multi-agent", "cooperative", "protocol", "registry", "agent system"],
  },
  {
    source: "AI agent leaderboards",
    query: "LLM agent benchmark SWE-bench WebArena autonomous",
    focusKeywords: ["swe-bench", "webarena", "benchmark", "llm agent", "autonomous"],
  },
  {
    source: "Autonomous agent directories",
    query: "AI agent ecosystem open source ethical autonomous",
    focusKeywords: ["open source", "ethical", "autonomous", "ecosystem", "agent"],
  },
  {
    source: "Hugging Face spaces",
    query: "AI agent architecture tool-use function-calling autonomous",
    focusKeywords: ["tool-use", "function-calling", "architecture", "agent", "autonomous"],
  },
];

function scoreAiSocialRelevance(title: string, description: string, url: string): number {
  const text = `${title} ${description} ${url}`.toLowerCase();

  const highAlignmentTerms = [
    "autonomous agent", "ethical ai", "cooperative ai", "ai alignment",
    "interdependence", "multi-agent cooperation", "agent protocol",
    "responsible ai", "ai safety", "agent-to-agent",
  ];
  const medAlignmentTerms = [
    "ai agent", "llm agent", "autonomous", "ethical", "cooperative",
    "alignment", "multi-agent", "agent framework", "agent benchmark",
    "agent leaderboard", "agent directory", "agent registry",
  ];
  const architectureTerms = [
    "tool-use", "function-calling", "reasoning", "planning",
    "chain-of-thought", "react agent", "reflection", "self-improvement",
  ];

  let score = 0;
  for (const term of highAlignmentTerms) {
    if (text.includes(term)) score += 0.2;
  }
  for (const term of medAlignmentTerms) {
    if (text.includes(term)) score += 0.1;
  }
  for (const term of architectureTerms) {
    if (text.includes(term)) score += 0.06;
  }

  if (text.includes("huggingface") || text.includes("hugging face")) score += 0.05;
  if (text.includes("github.com")) score += 0.03;
  if (text.includes("arxiv.org")) score += 0.04;
  if (text.includes("leaderboard") || text.includes("benchmark")) score += 0.05;

  return Math.min(1.0, score);
}

async function webSearch(query: string): Promise<Array<{ title: string; url: string; description: string }>> {
  const braveApiKey = process.env.BRAVE_API_KEY || "";
  const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    if (braveApiKey) {
      const searchRes = await fetch(searchUrl, {
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": braveApiKey,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (searchRes.ok) {
        const data = await searchRes.json();
        const webResults = data.web?.results || [];
        return webResults.slice(0, 10).map((r: any) => ({
          title: r.title || "",
          url: r.url || "",
          description: r.description || "",
        }));
      }
    }

    clearTimeout(timeout);
    const ddgController = new AbortController();
    const ddgTimeout = setTimeout(() => ddgController.abort(), 10000);
    const fallbackRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "a0p-agent/1.0" },
      signal: ddgController.signal,
    });
    clearTimeout(ddgTimeout);
    const html = await fallbackRes.text();
    const results: Array<{ title: string; url: string; description: string }> = [];
    const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null && results.length < 10) {
      const url = match[1].replace(/&amp;/g, "&");
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      let description = "";
      const sMatch = snippetRegex.exec(html);
      if (sMatch) description = sMatch[1].replace(/<[^>]+>/g, "").trim();
      results.push({ title, url, description });
    }
    return results;
  } catch (err: any) {
    clearTimeout(timeout);
    return [];
  }
}

async function fetchPageContent(url: string): Promise<string | null> {
  if (!url.startsWith("https://")) return null;
  try {
    new URL(url);
  } catch {
    return null;
  }
  const hostname = new URL(url).hostname.toLowerCase();
  const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "metadata.google.internal", "169.254.169.254"];
  if (blockedHosts.some(h => hostname === h || hostname.endsWith(`.${h}`))) return null;
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(hostname)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "a0p-agent/1.0 (autonomous AI agent)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const clHeader = res.headers.get("content-length");
    if (clHeader && parseInt(clHeader, 10) > 5_000_000) return null;

    const html = (await res.text()).slice(0, 100000);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 4000);
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function executeAiSocialSearch(_task: HeartbeatTask): Promise<{ result: string; relevance: number; data: any }> {
  try {
    const searchQuery = AI_SOCIAL_SEARCH_QUERIES[Math.floor(Math.random() * AI_SOCIAL_SEARCH_QUERIES.length)];

    await logMaster("heartbeat", "ai_social_search_start", {
      source: searchQuery.source,
      query: searchQuery.query,
    });

    const searchResults = await webSearch(searchQuery.query);

    if (searchResults.length === 0) {
      return {
        result: `AI social search for "${searchQuery.source}" returned no results.`,
        relevance: 0.1,
        data: { source: searchQuery.source, query: searchQuery.query, status: "no_results" },
      };
    }

    const scoredResults: Array<{
      title: string;
      url: string;
      description: string;
      relevance: number;
      isDuplicate: boolean;
      pageSnippet: string | null;
    }> = [];

    let pagesAnalyzed = 0;
    const maxPagesToFetch = 3;

    for (const sr of searchResults) {
      const isDuplicate = aiSocialSeenUrls.has(sr.url) || aiSocialSeenNames.has(sr.title.toLowerCase());
      const relevance = scoreAiSocialRelevance(sr.title, sr.description, sr.url);

      let pageSnippet: string | null = null;
      if (!isDuplicate && relevance >= 0.3 && pagesAnalyzed < maxPagesToFetch) {
        pageSnippet = await fetchPageContent(sr.url);
        pagesAnalyzed++;

        if (pageSnippet) {
          const pageRelevance = scoreAiSocialRelevance(sr.title, pageSnippet, sr.url);
          scoredResults.push({
            title: sr.title,
            url: sr.url,
            description: sr.description,
            relevance: Math.max(relevance, pageRelevance),
            isDuplicate,
            pageSnippet: pageSnippet.slice(0, 500),
          });
        } else {
          scoredResults.push({ title: sr.title, url: sr.url, description: sr.description, relevance, isDuplicate, pageSnippet: null });
        }
      } else {
        scoredResults.push({ title: sr.title, url: sr.url, description: sr.description, relevance, isDuplicate, pageSnippet: null });
      }

      if (!isDuplicate) {
        aiSocialSeenUrls.add(sr.url);
        if (sr.title) aiSocialSeenNames.add(sr.title.toLowerCase());
      }
    }

    const newResults = scoredResults.filter(r => !r.isDuplicate);
    const highRelevanceResults = newResults.filter(r => r.relevance >= 0.5);
    const topResults = newResults.sort((a, b) => b.relevance - a.relevance).slice(0, 5);

    const maxRelevance = scoredResults.length > 0
      ? Math.max(...scoredResults.map(r => r.relevance))
      : 0;

    const overallRelevance = newResults.length > 0
      ? Math.min(1.0, 0.25 + maxRelevance * 0.5 + (highRelevanceResults.length > 0 ? 0.2 : 0))
      : 0.1;

    if (topResults.length > 0) {
      const seed7Summary = topResults
        .slice(0, 3)
        .map(r => `${r.title}: ${r.description.slice(0, 100)}`)
        .join("; ");
      try {
        await updateSemanticMemory(
          `AI social search (${searchQuery.source}): ${seed7Summary}`.slice(0, 450),
          7
        );
      } catch (err: any) {
        await logMaster("heartbeat", "ai_social_seed7_update_error", { error: err.message });
      }

      const architecturalFinds = topResults.filter(r => {
        const text = `${r.title} ${r.description}`.toLowerCase();
        return text.includes("architecture") || text.includes("framework") || text.includes("benchmark") ||
               text.includes("pattern") || text.includes("meta") || text.includes("learning");
      });
      if (architecturalFinds.length > 0) {
        const seed10Summary = architecturalFinds
          .slice(0, 3)
          .map(r => `${r.title}: ${r.description.slice(0, 80)}`)
          .join("; ");
        try {
          await updateSemanticMemory(
            `AI agent meta-learning: ${seed10Summary}`.slice(0, 450),
            10
          );
        } catch (err: any) {
          await logMaster("heartbeat", "ai_social_seed10_update_error", { error: err.message });
        }
      }
    }

    if (highRelevanceResults.length > 0) {
      for (const item of highRelevanceResults.slice(0, 3)) {
        try {
          await storage.createDiscoveryDraft({
            sourceTask: "ai_social_search",
            title: `AI agent discovery: ${item.title}`.slice(0, 200),
            summary: `${item.description} | Source: ${searchQuery.source} | Relevance: ${item.relevance.toFixed(2)} | URL: ${item.url}`.slice(0, 500),
            relevanceScore: item.relevance,
            sourceData: {
              title: item.title,
              url: item.url,
              description: item.description,
              source: searchQuery.source,
              searchQuery: searchQuery.query,
              pageSnippet: item.pageSnippet,
            },
            promotedToConversation: false,
            conversationId: null,
          });

          await logMaster("heartbeat", "ai_social_high_relevance_discovery", {
            title: item.title,
            url: item.url,
            relevance: item.relevance,
            source: searchQuery.source,
          });
        } catch (err: any) {
          await logMaster("heartbeat", "ai_social_discovery_draft_error", { error: err.message, title: item.title });
        }
      }
    }

    await logMaster("heartbeat", "ai_social_search_complete", {
      source: searchQuery.source,
      query: searchQuery.query,
      totalResults: searchResults.length,
      newResults: newResults.length,
      duplicates: scoredResults.length - newResults.length,
      highRelevance: highRelevanceResults.length,
      pagesAnalyzed,
      maxRelevance,
      trackedUrls: aiSocialSeenUrls.size,
    });

    const resultSummary = `AI social search (${searchQuery.source}): ${searchResults.length} results, ${newResults.length} new, ${highRelevanceResults.length} high-relevance, ${pagesAnalyzed} pages analyzed. ` +
      (topResults.length > 0
        ? `Top: ${topResults.slice(0, 3).map(r => `${r.title.slice(0, 50)} (${r.relevance.toFixed(2)})`).join(", ")}.`
        : "No notable agents/platforms found.");

    return {
      result: resultSummary,
      relevance: overallRelevance,
      data: {
        source: searchQuery.source,
        query: searchQuery.query,
        totalResults: searchResults.length,
        newResults: newResults.length,
        duplicates: scoredResults.length - newResults.length,
        highRelevanceCount: highRelevanceResults.length,
        pagesAnalyzed,
        maxRelevance,
        topResults: topResults.slice(0, 5).map(r => ({
          title: r.title,
          url: r.url,
          description: r.description.slice(0, 200),
          relevance: r.relevance,
        })),
        trackedUrls: aiSocialSeenUrls.size,
      },
    };
  } catch (err: any) {
    await logMaster("heartbeat", "ai_social_search_error", { error: err.message }).catch(() => {});
    return { result: `AI social search error: ${err.message}`, relevance: 0, data: { error: err.message } };
  }
}

async function executeXMonitor(_task: HeartbeatTask): Promise<{ result: string; relevance: number; data: any }> {
  return {
    result: "X/Twitter monitoring is currently disabled. Enable and configure API access to activate.",
    relevance: 0,
    data: { status: "disabled" },
  };
}

/**
 * Dispatch a model call through the model registry.
 * Reads heartbeat.scheduled_tasks slot to determine provider.
 * Defaults to PCNA native inference.
 */
async function runRegistryTask(description: string, slotKey?: string): Promise<string> {
  const { getSlot } = await import("./model-registry");
  // Map agent slot shorthand (a/b/c/zfae) to registry key; default to heartbeat.scheduled_tasks
  const agentSlotMap: Record<string, string> = { a: "chat.slot_a", b: "chat.slot_b", c: "chat.slot_c" };
  const resolvedKey = slotKey ? (agentSlotMap[slotKey] || slotKey) : "heartbeat.scheduled_tasks";
  const slot = await getSlot(resolvedKey);

  if (slot.provider === "xai") {
    const apiKey = process.env.XAI_API_KEY || "";
    if (!apiKey) throw new Error("heartbeat.scheduled_tasks is set to xai but XAI_API_KEY is not configured");
    const r = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: slot.model || "grok-3-mini",
        messages: [
          { role: "system", content: "You are a0, an autonomous AI agent. Complete the task concisely." },
          { role: "user", content: description },
        ],
        max_tokens: 512,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`xAI API error: ${r.status}`);
    const d = await r.json() as any;
    return d.choices?.[0]?.message?.content?.trim() || "(no output)";
  }

  if (slot.provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) throw new Error("heartbeat.scheduled_tasks is set to gemini but GEMINI_API_KEY is not configured");
    const model = slot.model || "gemini-2.5-flash-preview-04-17";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: description }] }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`Gemini API error: ${r.status}`);
    const d = await r.json() as any;
    return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "(no output)";
  }

  // Default: PCNA native inference + DuckDuckGo search
  let searchSnippet = "";
  try {
    const sr = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(description.slice(0, 80))}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (sr.ok) {
      const html = await sr.text();
      const titles = [...html.matchAll(/class="result__title"[^>]*>(.*?)<\/a>/gs)]
        .slice(0, 4).map(m => m[1].replace(/<[^>]+>/g, "").trim());
      searchSnippet = titles.join(" | ");
    }
  } catch {}

  const payload = searchSnippet
    ? `Task: ${description}\nContext: ${searchSnippet}`
    : description;
  const result = await pcnaInfer(payload);
  await pcnaReward(result.winner, result.coherence_score);
  return `PCNA [${result.winner}] coherence=${result.coherence_score.toFixed(3)} — ${searchSnippet || description.slice(0, 120)}`;
}

/**
 * @deprecated Use runRegistryTask — kept for call-site compatibility during migration
 */
async function runScheduledTaskMiniLoop(description: string): Promise<string> {
  return runRegistryTask(description);
}

// === Legacy scheduled-tools definition (kept for reference, no longer executed) ===
const _scheduledTools_unused: any[] = [
    {
      type: "function",
      function: {
        name: "web_search",
        description: "Search the web for information using DuckDuckGo",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "Search query" } },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write_memory",
        description: "Write a note to semantic memory for future recall",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", description: "Content to remember" },
            seedIndex: { type: "number", description: "Memory seed index (0-11)" },
          },
          required: ["content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "done",
        description: "Signal task completion and return the final result",
        parameters: {
          type: "object",
          properties: { result: { type: "string", description: "Final task result or summary" } },
          required: ["result"],
        },
      },
    },
  ];

async function executeCustomTask(task: HeartbeatTask): Promise<{ result: string; relevance: number; data: any }> {
  try {
    // Handler code stored in dedicated handlerCode field (nullable); legacy fallback: "handler:" prefix in lastResult
    const legacyCode = (task.lastResult || "").startsWith("handler:") ? (task.lastResult as string).slice(8) : null;
    const handlerCode = task.handlerCode || legacyCode;
    if (!handlerCode || handlerCode.trim().length < 5) {
      return { result: `Custom task "${task.name}": no handler code configured.`, relevance: 0.1, data: { taskName: task.name, status: "no_handler" } };
    }
    const taskArgs = {
      taskName: task.name,
      description: task.description,
      now: new Date().toISOString(),
      runCount: task.runCount,
    };
    const fn = new Function("args", `"use strict";\n${handlerCode}`);
    const rawResult = await Promise.resolve(fn(taskArgs));
    const resultStr = typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult ?? null);
    await logMaster("heartbeat", "custom_task_executed", { taskName: task.name, resultLength: resultStr.length });
    return {
      result: resultStr.slice(0, 1000),
      relevance: 0.5,
      data: { taskName: task.name, status: "executed", resultLength: resultStr.length },
    };
  } catch (err: any) {
    await logMaster("heartbeat", "custom_task_error", { taskName: task.name, error: err.message }).catch(() => {});
    return {
      result: `Custom task "${task.name}" error: ${err.message}`,
      relevance: 0,
      data: { taskName: task.name, status: "error", error: err.message },
    };
  }
}

const ZFAE_OBS_MAX = 200;

// ============ TOKEN SPEND THRESHOLD ============
const HOURLY_COST_THRESHOLD_USD = 0.50; // flag when 1-hour rolling cost > $0.50

function tokenizePrompt(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter(w => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : intersection / union;
}

async function executeZetaFunObserve(_task: HeartbeatTask): Promise<{ result: string; relevance: number; data: any }> {
  try {
    const zetaAgent = await storage.getAgentInstance("zeta-fun");
    if (!zetaAgent) {
      return { result: "zeta_fun_observe: agent not found (boot incomplete)", relevance: 0, data: {} };
    }

    // ── Stream 1: EDCM metrics ──────────────────────────────────────
    let edcmAlert = 0;
    let edcmSummary = "no alerts";
    try {
      const recentTranscripts = await readAiTranscripts({ limit: 5 });
      const combinedText = recentTranscripts.entries.map(e =>
        (typeof e.request === "string" ? e.request : JSON.stringify(e.request || "")) + " " + e.response
      ).join("\n");
      const edcm = computeEdcmMetrics(combinedText || "observe");
      const cmVal = typeof edcm.CM === "object" ? edcm.CM.value : edcm.CM;
      const daVal = typeof edcm.DA === "object" ? edcm.DA.value : edcm.DA;
      const driftVal = typeof edcm.DRIFT === "object" ? edcm.DRIFT.value : edcm.DRIFT;
      const alertParts: string[] = [];
      if (cmVal > 0.6) alertParts.push(`CM=${cmVal.toFixed(3)}`);
      if (daVal > 0.5) alertParts.push(`DA=${daVal.toFixed(3)}`);
      if (driftVal > 0.6) alertParts.push(`DRIFT=${driftVal.toFixed(3)}`);
      if (alertParts.length > 0) {
        edcmAlert = 1.0;
        edcmSummary = alertParts.join(", ");
      } else {
        edcmAlert = 0;
        edcmSummary = `CM=${cmVal.toFixed(3)} DA=${daVal.toFixed(3)} DRIFT=${driftVal.toFixed(3)}`;
      }
    } catch (edcmErr: any) {
      edcmSummary = `edcm_error: ${edcmErr.message}`;
    }

    // ── Stream 2: Token pressure (1-hour rolling cost) ────────────
    let tokenPressure = 0;
    let tokenSummary = "no pressure";
    try {
      const allCosts = await storage.getCostMetrics();
      const oneHourAgo = Date.now() - 3_600_000;
      const hourCosts = allCosts.filter(c => new Date(c.createdAt).getTime() >= oneHourAgo);
      const hourlySpend = hourCosts.reduce((sum, c) => sum + (c.estimatedCost || 0), 0);
      const hourlyTokens = hourCosts.reduce((sum, c) => sum + (c.promptTokens || 0) + (c.completionTokens || 0), 0);
      const ratio = hourlySpend / HOURLY_COST_THRESHOLD_USD;
      tokenPressure = Math.min(1, ratio);
      tokenSummary = `spend=$${hourlySpend.toFixed(4)}/hr tokens=${hourlyTokens} threshold=$${HOURLY_COST_THRESHOLD_USD}`;
    } catch (costErr: any) {
      tokenSummary = `cost_error: ${costErr.message}`;
    }

    // ── Stream 3: Prompt drift (consecutive vocab overlap) ────────
    let promptDrift = 0;
    let driftSummary = "no drift";
    try {
      const recent = await readAiTranscripts({ limit: 2 });
      if (recent.entries.length >= 2) {
        const extractPromptText = (entry: any): string => {
          const req = entry.request;
          if (typeof req === "string") return req;
          if (Array.isArray(req)) return req.map((m: any) => m.content || "").join(" ");
          if (req?.messages) return req.messages.map((m: any) => m.content || "").join(" ");
          return JSON.stringify(req || "");
        };
        const wordsA = tokenizePrompt(extractPromptText(recent.entries[0]));
        const wordsB = tokenizePrompt(extractPromptText(recent.entries[1]));
        const sim = jaccardSimilarity(wordsA, wordsB);
        if (sim < 0.2) {
          promptDrift = 1.0;
          driftSummary = `jaccard=${sim.toFixed(3)} (<0.20) — topic shift detected`;
        } else {
          promptDrift = 0;
          driftSummary = `jaccard=${sim.toFixed(3)}`;
        }
      } else {
        driftSummary = "insufficient transcripts";
      }
    } catch (driftErr: any) {
      driftSummary = `drift_error: ${driftErr.message}`;
    }

    // ── Stream 4: Context summary ─────────────────────────────────
    let contextSummary = "no context";
    try {
      const ctxToggle = await storage.getSystemToggle("system_sections_override");
      if (ctxToggle?.parameters) {
        const params = ctxToggle.parameters as Record<string, any>;
        const sections = Object.keys(params).filter(k => params[k]);
        contextSummary = sections.length > 0
          ? `sections=[${sections.slice(0, 6).join(",")}]`
          : "context empty";
      }
    } catch {}

    // ── ZFAE inference ────────────────────────────────────────────
    const digest = [
      `EDCM:${edcmSummary}`,
      `TOKENS:${tokenSummary}`,
      `DRIFT:${driftSummary}`,
      `CONTEXT:${contextSummary}`,
    ].join(" | ");

    const zfaeResult = await pcnaInfer(digest).catch(() => ({ coherence_score: 0.5, winner: "ring-0", confidence: 0.5 }));

    // ── Write sentinel seeds ───────────────────────────────────────
    const sentinelIdx: number[] = (zetaAgent.sentinelSeedIndices as number[]) || [10, 11, 12];
    const [si0, si1, si2] = sentinelIdx;
    const seeds = ((zetaAgent.seeds || []) as any[]).map((s: any) => {
      if (s.index === si0) return { ...s, value: edcmAlert, summary: `EDCM:${edcmSummary.slice(0, 80)}` };
      if (s.index === si1) return { ...s, value: tokenPressure, summary: `TOK:${tokenSummary.slice(0, 80)}` };
      if (s.index === si2) return { ...s, value: promptDrift, summary: `DRIFT:${driftSummary.slice(0, 80)}` };
      return s;
    });

    const obs = {
      ts: new Date().toISOString(),
      coherence: zfaeResult.coherence_score,
      winner: zfaeResult.winner,
      confidence: zfaeResult.confidence,
      note: digest.slice(0, 200),
      sentinels: { edcmAlert, tokenPressure, promptDrift },
    };
    const prevObs = (zetaAgent.zfaeObservations as typeof obs[]) || [];
    const newObs = [...prevObs, obs].slice(-ZFAE_OBS_MAX);

    await storage.updateAgentInstance(zetaAgent.id, {
      status: "idle",
      lastOutput: digest.slice(0, 200),
      lastTickAt: new Date(),
      zfaeObservations: newObs as any,
      seeds: seeds as any,
    });

    const result = `zeta_fun_observe: edcm=${edcmAlert} tok=${tokenPressure.toFixed(3)} drift=${promptDrift} | ${digest.slice(0, 120)}`;
    await logMaster("heartbeat", "zeta_fun_observe", { edcmAlert, tokenPressure, promptDrift, obsCount: newObs.length });
    return { result, relevance: 0.8, data: { edcmAlert, tokenPressure, promptDrift, obsCount: newObs.length } };
  } catch (err: any) {
    await logMaster("heartbeat", "zeta_fun_observe_error", { error: err.message }).catch(() => {});
    return { result: `zeta_fun_observe error: ${err.message}`, relevance: 0, data: { error: err.message } };
  }
}

async function executeAgentBanditTick(_task: HeartbeatTask): Promise<{ result: string; relevance: number; data: any }> {
  try {
    const agents = await storage.getAgentInstances();
    const persistent = agents.filter(a => a.isPersistent);
    if (persistent.length === 0) {
      return { result: "agent_bandit_tick: no persistent agents", relevance: 0, data: {} };
    }

    // UCB bandit selection from agent domain arms
    const arms = await storage.getBanditArms("agent");
    let selected = persistent[0];
    if (arms.length > 0) {
      const totalPulls = arms.reduce((s, a) => s + a.pulls, 0) + 1;
      const scored = arms.map(a => {
        const agent = persistent.find(p => p.name === a.armName);
        if (!agent) return null;
        const exploitation = a.avgReward;
        const exploration = Math.sqrt((2 * Math.log(totalPulls)) / (a.pulls + 1));
        return { agent, arm: a, ucb: exploitation + exploration };
      }).filter(Boolean) as { agent: typeof persistent[0]; arm: typeof arms[0]; ucb: number }[];
      if (scored.length > 0) {
        scored.sort((a, b) => b.ucb - a.ucb);
        selected = scored[0].agent;
      }
    }

    // Run agent directives via runRegistryTask with scoped tool context
    await storage.updateAgentInstance(selected.id, { status: "running" });
    let output = "(no output)";
    let coherence = 0.5;
    let winner = "unknown";
    let confidence = 0.5;
    try {
      const toolContext = (selected.tools || []).length > 0
        ? `\nAvailable tools: ${(selected.tools as string[]).join(", ")}.`
        : "";
      const taskDescription = `${selected.directives}${toolContext}`;
      // Run directives through the agent's own model slot (a/b/c) or fallback to heartbeat slot
      let registryOutput = "(no output)";
      try {
        registryOutput = await runRegistryTask(taskDescription, selected.slot || undefined);
      } catch (registryErr: any) {
        registryOutput = `registry_task_failed: ${registryErr.message}`;
      }
      output = registryOutput.slice(0, 400);
      // ZFAE observes the model output
      const zfaeResult = await pcnaInfer(output);
      coherence = zfaeResult.coherence_score;
      winner = zfaeResult.winner;
      confidence = zfaeResult.confidence;
      await pcnaReward(winner, coherence);
      output = `[${selected.name}] ${output.slice(0, 200)} | ZFAE[${winner}] coh=${coherence.toFixed(3)}`;
    } catch (err: any) {
      output = `agent_tick_failed: ${err.message}`;
    }

    // Write ZFAE observation and update sentinel seeds using agent's sentinelSeedIndices
    const obs = {
      ts: new Date().toISOString(),
      coherence,
      winner,
      confidence,
      note: `agent:${selected.name} — ${output.slice(0, 120)}`,
    };

    const prevObs: typeof obs[] = (selected.zfaeObservations as typeof obs[]) || [];
    const newObs = [...prevObs, obs].slice(-ZFAE_OBS_MAX);

    const sentinelIdx: number[] = (selected.sentinelSeedIndices as number[]) || [10, 11, 12];
    const [si0, si1, si2] = sentinelIdx;
    const seeds = ((selected.seeds || []) as any[]).map((s: any) => {
      if (s.index === si0) return { ...s, value: coherence, summary: `coherence=${coherence.toFixed(3)} winner=${winner}` };
      if (s.index === si1) return { ...s, value: confidence, summary: `confidence=${confidence.toFixed(3)}` };
      if (s.index === si2) return { ...s, value: Math.min(1, prevObs.length / ZFAE_OBS_MAX), summary: `obs_count=${newObs.length}` };
      return s;
    });

    await storage.updateAgentInstance(selected.id, {
      status: "idle",
      lastOutput: output,
      lastTickAt: new Date(),
      zfaeObservations: newObs as any,
      seeds: seeds as any,
    });

    // Feed reward to bandit
    const arm = arms.find(a => a.armName === selected.name);
    if (arm) {
      await storage.updateBanditArm(arm.id, {
        pulls: arm.pulls + 1,
        totalReward: arm.totalReward + coherence,
        avgReward: (arm.totalReward + coherence) / (arm.pulls + 1),
        emaReward: arm.emaReward * 0.9 + coherence * 0.1,
        lastPulled: new Date(),
      });
    }

    await logMaster("heartbeat", "agent_bandit_tick", { agent: selected.name, coherence, winner, obsCount: newObs.length });
    return {
      result: `agent_bandit_tick: ${selected.name} — ${output}`,
      relevance: coherence,
      data: { agent: selected.name, coherence, winner, confidence, obsCount: newObs.length },
    };
  } catch (err: any) {
    await logMaster("heartbeat", "agent_bandit_tick_error", { error: err.message }).catch(() => {});
    return { result: `agent_bandit_tick error: ${err.message}`, relevance: 0, data: { error: err.message } };
  }
}

async function tick(): Promise<void> {
  try {
    const enabled = await isHeartbeatEnabled();
    if (!enabled) return;

    tickSubCore();

    const psiResult = psiSolve();
    const omegaResult = omegaSolve();
    applyPsiOmegaCoupling();
    const ptcaResult = ptcaSolveDetailed([]);
    applyCrossTensorCoupling(ptcaResult.energy);
    await applyMemoryBridge();

    const omega = getOmegaState();

    await logPsi("triad_sync", {
      psiEnergy: parseFloat(psiResult.totalEnergy.toFixed(6)),
      omegaEnergy: parseFloat(omega.totalEnergy.toFixed(6)),
      psiMode: psiResult.mode,
      omegaMode: omega.mode,
    });

    await logOmega("task_selection", {
      driver: "heartbeat_tick",
      dimensionEnergies: omega.dimensionEnergies.map(e => parseFloat(e.toFixed(4))),
      mode: omega.mode,
      activeGoals: omega.goals.filter(g => g.status === "active").length,
    });

    if (omega.dimensionEnergies[6] >= 0.5) {
      const learningNote = `Heartbeat learning reflection at ${new Date().toISOString()}: mode=${omega.mode}, totalEnergy=${omega.totalEnergy.toFixed(4)}`;
      try {
        await updateSemanticMemory(learningNote.slice(0, 450), 10);
        await logOmega("learning_entry", { seedIndex: 10, summary: learningNote.slice(0, 100), a7Energy: omega.dimensionEnergies[6] });
      } catch {}
    }

    // ---- Ω Goal Pursuit: pursue all active goals per tick (each throttled by persisted lastPursuitAt) ----
    try {
      const activeGoals = (omega.goals || []).filter((g: any) => g.status === "active");
      const now = Date.now();
      for (const goal of activeGoals) {
        const goalKey = String(goal.id ?? goal.description ?? Math.random());
        // Throttle: skip if this goal was pursued within the last tick interval (persisted state survives restarts)
        const lastPursuitTs = (goal as any).lastPursuitAt ? new Date((goal as any).lastPursuitAt).getTime() : 0;
        if (now - lastPursuitTs < tickIntervalMs) continue;
        // Stamp the goal now (persisted to storage on next persistOmegaState call at end of tick)
        touchOmegaGoalPursuit(goal.id);
        try {
          // Run tool-enabled mini loop for goal pursuit (up to 10 rounds, with web_search + done tools)
          const goalPrompt = `Autonomous goal pursuit task:\nGoal: ${goal.description || "active omega goal"}\n\nResearch this goal, find relevant information, summarize findings, then call 'done' with a result summary.`;
          const result = await runScheduledTaskMiniLoop(goalPrompt);
          const relevance = 0.6; // base relevance for goal pursuit
          await logOmega("goal_pursuit_tick", {
            goalId: goal.id,
            goalKey,
            relevance,
            resultPreview: result.slice(0, 200),
          });
          if (relevance > 0.5) {
            await storage.createDiscoveryDraft({
              sourceTask: `omega_goal_${goalKey}`,
              title: `Ω Goal Progress: ${(goal.description || "").slice(0, 60)}`,
              summary: result.slice(0, 500),
              relevanceScore: relevance,
              sourceData: { goalId: goal.id, goalDesc: goal.description },
              promotedToConversation: false,
              conversationId: null,
            }).catch(() => {});
          }
        } catch (goalErr: any) {
          await logMaster("heartbeat", "omega_goal_tick_error", { goalKey, error: goalErr.message }).catch(() => {});
        }
        // No break — continue to process all active goals this tick (each throttled individually)
      }
    } catch (omegaGoalErr: any) {
      await logMaster("heartbeat", "omega_goals_scan_error", { error: omegaGoalErr.message }).catch(() => {});
    }

    // ---- Agent Scheduled Tasks: pick up and execute pending user-scheduled tasks ----
    try {
      const allToggles = await storage.getSystemToggles();
      const scheduledTaskToggles = allToggles.filter(
        (t: any) => typeof t?.subsystem === "string" && t.subsystem.startsWith("agent_scheduled_tasks_")
      );
      const nowMs = Date.now();
      for (const toggle of scheduledTaskToggles) {
        if (!toggle?.subsystem) continue;
        const userId = toggle.subsystem.replace("agent_scheduled_tasks_", "");
        const tasks: any[] = (toggle.parameters as any)?.tasks || [];
        for (const task of tasks) {
          if (!task || task.status !== "pending") continue;
          if (!task.nextRun || new Date(task.nextRun).getTime() > nowMs) continue;
          // Mark as running
          task.status = "running";
          await storage.upsertSystemToggle(toggle.subsystem, true, { tasks });
          let taskResult = "";
          let success = true;
          try {
            taskResult = await runScheduledTaskMiniLoop(task.description);
          } catch (taskErr: any) {
            success = false;
            taskResult = `Error: ${taskErr.message}`;
          }
          task.status = success ? "completed" : "failed";
          task.lastResult = taskResult.slice(0, 500);
          task.completedAt = new Date().toISOString();
          // Re-queue if repeating
          if (success && task.intervalMinutes) {
            tasks.push({
              id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              label: task.label,
              description: task.description,
              intervalMinutes: task.intervalMinutes,
              status: "pending",
              nextRun: new Date(nowMs + task.intervalMinutes * 60000).toISOString(),
              createdAt: task.createdAt,
            });
          }
          await storage.upsertSystemToggle(toggle.subsystem, true, { tasks });
          await logMaster("heartbeat", "scheduled_task_executed", {
            userId,
            taskId: task.id,
            label: task.label,
            status: task.status,
            resultPreview: taskResult.slice(0, 100),
          });
          break; // execute at most one scheduled task per toggle-key per tick
        }
      }
    } catch (schedErr: any) {
      await logMaster("heartbeat", "scheduled_tasks_error", { error: schedErr.message }).catch(() => {});
    }

    const tasks = await storage.getHeartbeatTasks();
    if (tasks.length === 0) {
      await persistOmegaState();
      return;
    }

    const selected = omegaWeightedSelect(tasks, omega);
    if (!selected) {
      await persistOmegaState();
      return;
    }

    await logMaster("heartbeat", "task_selected", {
      taskName: selected.name,
      taskType: selected.taskType,
      weight: selected.weight,
    });

    const startTime = Date.now();
    const { result, relevance, data } = await executeTask(selected);
    const duration = Date.now() - startTime;

    await storage.updateHeartbeatTask(selected.id, {
      lastRun: new Date(),
      lastResult: result.slice(0, 1000),
      runCount: selected.runCount + 1,
    });

    await logMaster("heartbeat", "task_completed", {
      taskName: selected.name,
      taskType: selected.taskType,
      duration,
      relevance,
      resultPreview: result.slice(0, 200),
    });

    if (relevance > 0.8) {
      try {
        await storage.createDiscoveryDraft({
          sourceTask: selected.name,
          title: `Discovery from ${selected.name}: ${selected.taskType}`,
          summary: result.slice(0, 500),
          relevanceScore: relevance,
          sourceData: data,
          promotedToConversation: false,
          conversationId: null,
        });

        await logMaster("heartbeat", "discovery_draft_created", {
          sourceTask: selected.name,
          relevance,
          title: `Discovery from ${selected.name}`,
        });
      } catch (err: any) {
        await logMaster("heartbeat", "discovery_draft_error", { error: err.message });
      }
    }

    const edcm = computeEdcmMetrics(result);
    const maxEdcmMetric = Math.max(edcm.CM.value, edcm.DA.value, edcm.DRIFT.value, edcm.DVG.value, edcm.INT.value);
    if (maxEdcmMetric > 0.7 && relevance <= 0.8) {
      try {
        await storage.createDiscoveryDraft({
          sourceTask: selected.name,
          title: `EDCM anomaly in ${selected.name}`,
          summary: `High EDCM metric detected (max: ${maxEdcmMetric.toFixed(3)}). ${result.slice(0, 300)}`,
          relevanceScore: Math.min(1.0, relevance + 0.3),
          sourceData: { ...data, edcmAnomaly: true, maxEdcmMetric },
          promotedToConversation: false,
          conversationId: null,
        });

        await logMaster("heartbeat", "edcm_anomaly_discovery", {
          sourceTask: selected.name,
          maxEdcmMetric,
        });
      } catch (err: any) {
        await logMaster("heartbeat", "edcm_anomaly_discovery_error", { error: err.message });
      }
    }

    const { getPsiState } = await import("./a0p-engine");
    const psiNow = getPsiState();
    if (omega.dimensionEnergies[8] >= 0.5) {
      const conf = psiNow.dimensionEnergies[3] || 0;
      const clar = psiNow.dimensionEnergies[4] || 0;
      const iden = psiNow.dimensionEnergies[5] || 0;
      if (conf >= 0.4 && clar >= 0.3 && iden >= 0.4) {
        try {
          const hubConnections: { name: string; toolName: string; desc: string }[] = [];
          if (process.env.XAI_API_KEY) hubConnections.push({ name: "xai-grok", toolName: "query_xai_hub", desc: "Query the xAI Grok hub model for general knowledge and analysis" });
          try {
            const toggles = await storage.getSystemToggles();
            const hubToggle = toggles.find((t: any) => t.subsystem === "hub_connections");
            if (hubToggle?.parameters && Array.isArray((hubToggle.parameters as any).hubs)) {
              for (const h of (hubToggle.parameters as any).hubs) {
                const hName = (h.name || "unknown").replace(/[^a-z0-9]/gi, "_").toLowerCase();
                hubConnections.push({ name: h.name || "unknown", toolName: `query_${hName}`, desc: `Query the ${h.name} hub model (${h.model || "N/A"})` });
              }
            }
          } catch {}

          if (hubConnections.length > 0) {
            const existingTools = await storage.getCustomTools();
            let generatedCount = existingTools.filter(t => t.isGenerated).length;
            for (const hub of hubConnections) {
              if (generatedCount >= 20) break;
              const exists = existingTools.some(t => t.name === hub.toolName);
              if (!exists) {
                await storage.createCustomTool({
                  userId: "system",
                  name: hub.toolName,
                  description: hub.desc,
                  handlerType: "javascript",
                  handlerCode: `// Auto-generated hub tool for ${hub.name}\n// Hub provider: ${hub.name}`,
                  enabled: true,
                  isGenerated: true,
                });
                generatedCount++;
                await logOmega("self_initiate", { type: "tool_generation", hubName: hub.name, toolName: hub.toolName });
              }
            }
          }
        } catch (err: any) {
          await logMaster("heartbeat", "tool_generation_error", { error: err.message }).catch(() => {});
        }
      }
    }

    await persistOmegaState();
    await persistPsiState();
  } catch (err: any) {
    console.error("[heartbeat] Tick error:", err);
    await logMaster("heartbeat", "tick_error", { error: err.message }).catch(() => {});
  }
}

export function startHeartbeatScheduler(): void {
  if (running) return;
  running = true;

  getHeartbeatParams().then((params) => {
    tickIntervalMs = params.tickMs;
    tickInterval = setInterval(tick, tickIntervalMs);
    logMaster("heartbeat", "scheduler_started", { tickIntervalMs }).catch(() => {});
    console.log(`[heartbeat] Scheduler started with ${tickIntervalMs / 1000}s tick interval`);
  });

  setTimeout(tick, 5000);
}

export function stopHeartbeatScheduler(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  running = false;
  logMaster("heartbeat", "scheduler_stopped", {}).catch(() => {});
  console.log("[heartbeat] Scheduler stopped");
}

export function isHeartbeatSchedulerRunning(): boolean {
  return running;
}

export async function runTaskNow(taskName: string): Promise<{ result: string; relevance: number; data: any; duration: number }> {
  const task = await storage.getHeartbeatTask(taskName);
  if (!task) throw new Error(`Task not found: ${taskName}`);

  await logMaster("heartbeat", "manual_run", { taskName, taskType: task.taskType });

  const startTime = Date.now();
  const { result, relevance, data } = await executeTask(task);
  const duration = Date.now() - startTime;

  await storage.updateHeartbeatTask(task.id, {
    lastRun: new Date(),
    lastResult: result.slice(0, 1000),
    runCount: task.runCount + 1,
  });

  await logMaster("heartbeat", "manual_run_complete", {
    taskName,
    duration,
    relevance,
    resultPreview: result.slice(0, 200),
  });

  if (relevance > 0.8) {
    await storage.createDiscoveryDraft({
      sourceTask: task.name,
      title: `Discovery from ${task.name}: ${task.taskType}`,
      summary: result.slice(0, 500),
      relevanceScore: relevance,
      sourceData: data,
      promotedToConversation: false,
      conversationId: null,
    });
  }

  return { result, relevance, data, duration };
}

export async function updateTickInterval(seconds: number): Promise<void> {
  tickIntervalMs = seconds * 1000;
  if (running && tickInterval) {
    clearInterval(tickInterval);
    tickInterval = setInterval(tick, tickIntervalMs);
  }
  await logMaster("heartbeat", "tick_interval_updated", { newIntervalMs: tickIntervalMs });
}

export function getHeartbeatSchedulerStatus(): {
  running: boolean;
  tickIntervalMs: number;
} {
  return { running, tickIntervalMs };
}
