import { storage } from "./storage";
import { logMaster, logTranscript, logEdcm, logOmega, logPsi } from "./logger";
import { computeEdcmMetrics, updateSemanticMemory, omegaSolve, applyCrossTensorCoupling, applyMemoryBridge, persistOmegaState, getOmegaState, psiSolve, applyPsiOmegaCoupling, persistPsiState, ptcaSolveDetailed } from "./a0p-engine";
import { getUncachableGitHubClient } from "./github";
import { createHash } from "crypto";
import type { HeartbeatTask } from "@shared/schema";

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
  const eligible = tasks.filter((t) => {
    if (!t.enabled) return false;
    if (t.lastRun) {
      const elapsed = (Date.now() - new Date(t.lastRun).getTime()) / 1000;
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
  const eligible = tasks.filter((t) => {
    if (!t.enabled) return false;
    if (t.lastRun) {
      const elapsed = (Date.now() - new Date(t.lastRun).getTime()) / 1000;
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
    case "custom":
      return executeCustomTask(task);
    default:
      return { result: `Unknown task type: ${task.taskType}`, relevance: 0, data: {} };
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

async function executeCustomTask(task: HeartbeatTask): Promise<{ result: string; relevance: number; data: any }> {
  return {
    result: `Custom task "${task.name}" executed (no handler configured).`,
    relevance: 0.1,
    data: { taskName: task.name, status: "no_handler" },
  };
}

async function tick(): Promise<void> {
  try {
    const enabled = await isHeartbeatEnabled();
    if (!enabled) return;

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
            const hubToggle = toggles.find((t: any) => t.key === "hub_connections");
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
