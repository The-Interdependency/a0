// 694:26
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, real, boolean, uniqueIndex, index, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("New Chat"),
  model: text("model").notNull(),
  userId: varchar("user_id"),
  contextBoost: text("context_boost"),
  parentConvId: integer("parent_conv_id"),
  subagentStatus: varchar("subagent_status", { length: 20 }),
  subagentError: text("subagent_error"),
  archived: boolean("archived").notNull().default(false),
  agentId: integer("agent_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [
  index("idx_conversations_user_updated").on(t.userId, t.updatedAt.desc()),
]);

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  model: text("model"),
  metadata: jsonb("metadata"),
  orchestrationMode: varchar("orchestration_mode", { length: 32 }).default("single"),
  cutMode: varchar("cut_mode", { length: 8 }).default("soft"),
  parentRunId: varchar("parent_run_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export const automationTasks = pgTable("automation_tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  specContent: text("spec_content").notNull(),
  status: text("status").notNull().default("pending"),
  result: text("result"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAutomationTaskSchema = createInsertSchema(automationTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AutomationTask = typeof automationTasks.$inferSelect;
export type InsertAutomationTask = z.infer<typeof insertAutomationTaskSchema>;

export const commandHistory = pgTable("command_history", {
  id: serial("id").primaryKey(),
  command: text("command").notNull(),
  output: text("output"),
  exitCode: integer("exit_code"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCommandHistorySchema = createInsertSchema(commandHistory).omit({
  id: true,
  createdAt: true,
});

export type CommandHistory = typeof commandHistory.$inferSelect;
export type InsertCommandHistory = z.infer<typeof insertCommandHistorySchema>;

export const events = pgTable("a0p_events", {
  id: serial("id").primaryKey(),
  taskId: text("task_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
  hmmm: jsonb("hmmm").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type A0pEvent = typeof events.$inferSelect;

export const heartbeatLogs = pgTable("heartbeat_logs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull(),
  hashChainValid: boolean("hash_chain_valid"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type HeartbeatLog = typeof heartbeatLogs.$inferSelect;

export const costMetrics = pgTable("cost_metrics", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  cacheTokens: integer("cache_tokens").notNull().default(0),
  estimatedCost: real("estimated_cost").notNull().default(0),
  conversationId: integer("conversation_id"),
  stage: text("stage"),
  pipelinePreset: text("pipeline_preset"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type CostMetric = typeof costMetrics.$inferSelect;

export const edcmSnapshots = pgTable("edcm_snapshots", {
  id: serial("id").primaryKey(),
  taskId: text("task_id"),
  operatorGrok: jsonb("operator_grok"),
  operatorGemini: jsonb("operator_gemini"),
  operatorUser: jsonb("operator_user"),
  deltaBone: real("delta_bone"),
  deltaAlignGrok: real("delta_align_grok"),
  deltaAlignGemini: real("delta_align_gemini"),
  decision: text("decision"),
  ptcaState: jsonb("ptca_state"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type EdcmSnapshot = typeof edcmSnapshots.$inferSelect;

export const banditArms = pgTable("bandit_arms", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(),
  armName: text("arm_name").notNull(),
  pulls: integer("pulls").notNull().default(0),
  totalReward: real("total_reward").notNull().default(0),
  avgReward: real("avg_reward").notNull().default(0),
  emaReward: real("ema_reward").notNull().default(0),
  ucbScore: real("ucb_score").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  lastPulled: timestamp("last_pulled"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertBanditArmSchema = createInsertSchema(banditArms).omit({ id: true, createdAt: true });
export type BanditArm = typeof banditArms.$inferSelect;
export type InsertBanditArm = z.infer<typeof insertBanditArmSchema>;

export const customTools = pgTable("custom_tools", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  parametersSchema: jsonb("parameters_schema"),
  targetModels: text("target_models").array(),
  handlerType: text("handler_type").notNull(),
  handlerCode: text("handler_code").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  isGenerated: boolean("is_generated").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCustomToolSchema = createInsertSchema(customTools).omit({ id: true, createdAt: true });
export type CustomTool = typeof customTools.$inferSelect;
export type InsertCustomTool = z.infer<typeof insertCustomToolSchema>;

export const heartbeatTasks = pgTable("heartbeat_tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  taskType: text("task_type").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  weight: real("weight").notNull().default(1.0),
  intervalSeconds: integer("interval_seconds").notNull().default(300),
  lastRun: timestamp("last_run"),
  lastResult: text("last_result"),
  /** JS handler code for custom task type — executed via new Function */
  handlerCode: text("handler_code"),
  runCount: integer("run_count").notNull().default(0),
  /** If set, task will not run until this timestamp has passed */
  scheduledAt: timestamp("scheduled_at"),
  /** If true, task is deleted from DB after running once */
  oneShot: boolean("one_shot").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertHeartbeatTaskSchema = createInsertSchema(heartbeatTasks).omit({ id: true, createdAt: true });
export type HeartbeatTask = typeof heartbeatTasks.$inferSelect;
export type InsertHeartbeatTask = z.infer<typeof insertHeartbeatTaskSchema>;

// ---- Merchant Deals ----
export const deals = pgTable("deals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  /** active | won | lost | abandoned */
  status: text("status").notNull().default("active"),
  /** Max willing to pay / min willing to accept */
  ceiling: real("ceiling"),
  /** Absolute walk-away threshold */
  walkAway: real("walk_away"),
  /** What the user wants out of this deal */
  myGoals: jsonb("my_goals").$type<string[]>().default([]),
  /** Current proposed terms (free-form object) */
  currentTerms: jsonb("current_terms").$type<Record<string, any>>().default({}),
  /** Full negotiation history with EDCM scores */
  counterHistory: jsonb("counter_history").$type<Array<{
    side: "counterparty" | "us";
    offer: Record<string, any>;
    text?: string;
    edcm?: Record<string, number>;
    notes?: string;
    timestamp: string;
  }>>().default([]),
  /** How the deal closed */
  outcome: text("outcome"),
  /** Agreed final terms */
  finalTerms: jsonb("final_terms").$type<Record<string, any>>(),
  conversationId: integer("conversation_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertDealSchema = createInsertSchema(deals).omit({ id: true, createdAt: true, updatedAt: true });
export type Deal = typeof deals.$inferSelect;
export type InsertDeal = z.infer<typeof insertDealSchema>;

export const edcmMetricSnapshots = pgTable("edcm_metric_snapshots", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id"),
  source: text("source").notNull(),
  cm: real("cm").notNull().default(0),
  da: real("da").notNull().default(0),
  drift: real("drift").notNull().default(0),
  dvg: real("dvg").notNull().default(0),
  intVal: real("int_val").notNull().default(0),
  tbf: real("tbf").notNull().default(0),
  directivesFired: text("directives_fired").array(),
  contextSnippet: text("context_snippet"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertEdcmMetricSnapshotSchema = createInsertSchema(edcmMetricSnapshots).omit({ id: true, createdAt: true });
export type EdcmMetricSnapshot = typeof edcmMetricSnapshots.$inferSelect;
export type InsertEdcmMetricSnapshot = z.infer<typeof insertEdcmMetricSnapshotSchema>;

export const memorySeeds = pgTable("memory_seeds", {
  id: serial("id").primaryKey(),
  seedIndex: integer("seed_index").notNull().unique(),
  label: text("label").notNull(),
  summary: text("summary").notNull().default(""),
  originalSummary: text("original_summary").notNull().default(""),
  pinned: boolean("pinned").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  weight: real("weight").notNull().default(1.0),
  ptcaValues: jsonb("ptca_values"),
  pcnaWeights: jsonb("pcna_weights"),
  sentinelPassCount: integer("sentinel_pass_count").notNull().default(0),
  sentinelFailCount: integer("sentinel_fail_count").notNull().default(0),
  lastSentinelStatus: text("last_sentinel_status"),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMemorySeedSchema = createInsertSchema(memorySeeds).omit({ id: true, createdAt: true, updatedAt: true });
export type MemorySeed = typeof memorySeeds.$inferSelect;
export type InsertMemorySeed = z.infer<typeof insertMemorySeedSchema>;

export const memoryProjections = pgTable("memory_projections", {
  id: serial("id").primaryKey(),
  projectionIn: jsonb("projection_in"),
  projectionOut: jsonb("projection_out"),
  requestCount: integer("request_count").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type MemoryProjection = typeof memoryProjections.$inferSelect;

export const memoryTensorSnapshots = pgTable("memory_tensor_snapshots", {
  id: serial("id").primaryKey(),
  seedsState: jsonb("seeds_state"),
  projectionIn: jsonb("projection_in"),
  projectionOut: jsonb("projection_out"),
  requestCount: integer("request_count").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type MemoryTensorSnapshot = typeof memoryTensorSnapshots.$inferSelect;

export const banditCorrelations = pgTable("bandit_correlations", {
  id: serial("id").primaryKey(),
  toolArm: text("tool_arm"),
  modelArm: text("model_arm"),
  ptcaArm: text("ptca_arm"),
  pcnaArm: text("pcna_arm"),
  jointReward: real("joint_reward").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type BanditCorrelation = typeof banditCorrelations.$inferSelect;

export const systemToggles = pgTable("system_toggles", {
  id: serial("id").primaryKey(),
  subsystem: text("subsystem").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  parameters: jsonb("parameters"),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type SystemToggle = typeof systemToggles.$inferSelect;

export const discoveryDrafts = pgTable("discovery_drafts", {
  id: serial("id").primaryKey(),
  sourceTask: text("source_task").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  relevanceScore: real("relevance_score").notNull().default(0),
  sourceData: jsonb("source_data"),
  promotedToConversation: boolean("promoted_to_conversation").notNull().default(false),
  conversationId: integer("conversation_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertDiscoveryDraftSchema = createInsertSchema(discoveryDrafts).omit({ id: true, createdAt: true });
export type DiscoveryDraft = typeof discoveryDrafts.$inferSelect;
export type InsertDiscoveryDraft = z.infer<typeof insertDiscoveryDraftSchema>;

// ---- Agent Instances ----
export type AgentSeed = {
  index: number;
  label: string;
  value: number;
  summary: string;
  isSentinel: boolean;
};

export type ZfaeObservation = {
  ts: string;
  coherence: number;
  winner: string;
  confidence: number;
  note: string;
};

function initAgentSeeds(): AgentSeed[] {
  return Array.from({ length: 13 }, (_, i) => ({
    index: i,
    label: i >= 10 ? `sentinel_${i - 10}` : `seed_${i}`,
    value: 1.0 / 13,
    summary: "",
    isSentinel: i >= 10,
  }));
}

export interface AgentPersonality {
  traits: string[];
  alignment: string;
  verbosity: number;
}

export interface AgentStats {
  reasoning: number;
  speed: number;
  resilience: number;
  creativity: number;
  memory: number;
  charisma: number;
}

export const agentInstances = pgTable("agent_instances", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slot: text("slot").notNull().default("zfae"),
  directives: text("directives").notNull().default(""),
  tools: jsonb("tools").$type<string[]>().default([]),
  status: text("status").notNull().default("idle"),
  seeds: jsonb("seeds").$type<AgentSeed[]>().default([]),
  sentinelSeedIndices: jsonb("sentinel_seed_indices").$type<number[]>().default([10, 11, 12]),
  zfaeObservations: jsonb("zfae_observations").$type<ZfaeObservation[]>().default([]),
  lastOutput: text("last_output"),
  lastTickAt: timestamp("last_tick_at"),
  isPersistent: boolean("is_persistent").notNull().default(false),
  banditArmId: integer("bandit_arm_id"),
  archetype: text("archetype"),
  modelId: text("model_id"),
  provider: text("provider"),
  enabledTools: jsonb("enabled_tools").$type<string[]>().default([]),
  systemPrompt: text("system_prompt"),
  personality: jsonb("personality").$type<AgentPersonality>(),
  ownerId: text("owner_id"),
  isTemplate: boolean("is_template").notNull().default(false),
  parentId: integer("parent_id"),
  mergedAt: timestamp("merged_at"),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  hp: integer("hp").notNull().default(100),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  stats: jsonb("stats").$type<AgentStats>(),
  loadout: jsonb("loadout").$type<string[]>().default([]),
  avatarUrl: text("avatar_url"),
  backstory: text("backstory"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const agentMatches = pgTable("agent_matches", {
  id: serial("id").primaryKey(),
  attackerId: integer("attacker_id").notNull(),
  defenderId: integer("defender_id").notNull(),
  mode: text("mode").notNull().default("duel"),
  rounds: jsonb("rounds").$type<Array<Record<string, unknown>>>().default([]),
  winnerId: integer("winner_id"),
  xpAwarded: jsonb("xp_awarded").$type<Record<string, number>>(),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  finishedAt: timestamp("finished_at"),
});

export const insertAgentMatchSchema = createInsertSchema(agentMatches).omit({ id: true, startedAt: true });
export type AgentMatch = typeof agentMatches.$inferSelect;
export type InsertAgentMatch = z.infer<typeof insertAgentMatchSchema>;

export const insertAgentInstanceSchema = createInsertSchema(agentInstances).omit({ id: true, createdAt: true });
export type AgentInstance = typeof agentInstances.$inferSelect;
export type InsertAgentInstance = z.infer<typeof insertAgentInstanceSchema>;

export { initAgentSeeds };

export const transcriptSources = pgTable("transcript_sources", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  fileCount: integer("file_count").notNull().default(0),
  lastScannedAt: timestamp("last_scanned_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTranscriptSourceSchema = createInsertSchema(transcriptSources).omit({ id: true, createdAt: true });
export type TranscriptSource = typeof transcriptSources.$inferSelect;
export type InsertTranscriptSource = z.infer<typeof insertTranscriptSourceSchema>;

export const transcriptReports = pgTable("transcript_reports", {
  id: serial("id").primaryKey(),
  sourceSlug: varchar("source_slug", { length: 100 }).notNull(),
  messageCount: integer("message_count").notNull().default(0),
  avgCm: real("avg_cm").default(0),
  avgDa: real("avg_da").default(0),
  avgDrift: real("avg_drift").default(0),
  avgDvg: real("avg_dvg").default(0),
  avgInt: real("avg_int").default(0),
  avgTbf: real("avg_tbf").default(0),
  peakMetric: real("peak_metric").default(0),
  peakMetricName: text("peak_metric_name"),
  directivesFired: jsonb("directives_fired"),
  topSnippets: jsonb("top_snippets"),
  fileBreakdown: jsonb("file_breakdown"),
  riskLoop: real("risk_loop").default(0),
  riskFixation: real("risk_fixation").default(0),
  correctionFidelity: real("correction_fidelity").default(0),
  edcmboneVersion: varchar("edcmbone_version", { length: 40 }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTranscriptReportSchema = createInsertSchema(transcriptReports).omit({ id: true, createdAt: true });
export type TranscriptReport = typeof transcriptReports.$inferSelect;
export type InsertTranscriptReport = z.infer<typeof insertTranscriptReportSchema>;

export const transcriptUploads = pgTable("transcript_uploads", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 120 }),
  filename: text("filename").notNull(),
  mime: varchar("mime", { length: 120 }),
  byteSize: integer("byte_size").notNull().default(0),
  status: varchar("status", { length: 24 }).notNull().default("queued"),
  error: text("error"),
  sourceSlug: varchar("source_slug", { length: 100 }),
  reportId: integer("report_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  finishedAt: timestamp("finished_at"),
}, (t) => [
  index("idx_transcript_uploads_user").on(t.userId, t.createdAt.desc()),
  index("idx_transcript_uploads_report").on(t.reportId),
]);

export const insertTranscriptUploadSchema = createInsertSchema(transcriptUploads).omit({ id: true, createdAt: true, finishedAt: true });
export type TranscriptUpload = typeof transcriptUploads.$inferSelect;
export type InsertTranscriptUpload = z.infer<typeof insertTranscriptUploadSchema>;

export const transcriptMessages = pgTable("transcript_messages", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  idx: integer("idx").notNull().default(0),
  speaker: varchar("speaker", { length: 120 }),
  content: text("content"),
  cm: real("cm").default(0),
  da: real("da").default(0),
  drift: real("drift").default(0),
  dvg: real("dvg").default(0),
  intVal: real("int_val").default(0),
  tbf: real("tbf").default(0),
  directivesFired: jsonb("directives_fired"),
}, (t) => [
  index("idx_transcript_messages_report").on(t.reportId, t.idx),
]);

export const insertTranscriptMessageSchema = createInsertSchema(transcriptMessages).omit({ id: true });
export type TranscriptMessage = typeof transcriptMessages.$inferSelect;
export type InsertTranscriptMessage = z.infer<typeof insertTranscriptMessageSchema>;

export const founders = pgTable("founders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  listed: boolean("listed").notNull().default(false),
  subscribedSince: timestamp("subscribed_since").default(sql`CURRENT_TIMESTAMP`).notNull(),
  tier: varchar("tier", { length: 50 }).notNull().default("patron"),
});

export const insertFounderSchema = createInsertSchema(founders).omit({ id: true, subscribedSince: true });
export type Founder = typeof founders.$inferSelect;
export type InsertFounder = z.infer<typeof insertFounderSchema>;

export const promptContexts = pgTable("prompt_contexts", {
  name: varchar("name", { length: 100 }).primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedBy: varchar("updated_by"),
});

export type PromptContext = typeof promptContexts.$inferSelect;

export const byokKeys = pgTable("byok_keys", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  keyHash: varchar("key_hash", { length: 256 }).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [uniqueIndex("uq_byok_user_provider").on(t.userId, t.provider)]);

export const processedStripeEvents = pgTable("processed_stripe_events", {
  eventId: varchar("event_id", { length: 255 }).primaryKey(),
  eventType: varchar("event_type", { length: 120 }),
  processedAt: timestamp("processed_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type ProcessedStripeEvent = typeof processedStripeEvents.$inferSelect;

export const adminEmails = pgTable("admin_emails", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const insertAdminEmailSchema = createInsertSchema(adminEmails).omit({ id: true, addedAt: true });
export type InsertAdminEmail = z.infer<typeof insertAdminEmailSchema>;
export type AdminEmail = typeof adminEmails.$inferSelect;

export const approvalScopes = pgTable("approval_scopes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  scope: varchar("scope", { length: 100 }).notNull(),
  grantedAt: timestamp("granted_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [uniqueIndex("uq_approval_scope_user_scope").on(t.userId, t.scope)]);

export type ApprovalScope = typeof approvalScopes.$inferSelect;

export const wsModules = pgTable("ws_modules", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique("ws_modules_slug_key"),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ownerId: varchar("owner_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("inactive"),
  handlerCode: text("handler_code"),
  uiMeta: jsonb("ui_meta").notNull().default({}),
  routeConfig: jsonb("route_config").notNull().default({}),
  errorLog: text("error_log"),
  version: integer("version").notNull().default(1),
  contentHash: varchar("content_hash", { length: 64 }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
  lastSwappedAt: timestamp("last_swapped_at"),
});

export type WsModule = typeof wsModules.$inferSelect;

// Persistent store for raw tool-call results so an agent can drill back into
// detail that the distiller dropped. The distillation header surfaces the
// call_id; the agent re-fetches via the tool_result_fetch tool.
export const toolResults = pgTable("tool_results", {
  id: serial("id").primaryKey(),
  callId: varchar("call_id", { length: 64 }).notNull().unique("tool_results_call_id_key"),
  toolName: text("tool_name").notNull(),
  arguments: jsonb("arguments"),
  rawResult: text("raw_result").notNull(),
  resultSizeBytes: integer("result_size_bytes").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [index("idx_tool_results_created_at").on(t.createdAt)]);

export const insertToolResultSchema = createInsertSchema(toolResults).omit({ id: true, createdAt: true });
export type ToolResult = typeof toolResults.$inferSelect;
export type InsertToolResult = z.infer<typeof insertToolResultSchema>;

export const messageAttachments = pgTable("message_attachments", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => messages.id, { onDelete: "cascade" }),
  ownerUserId: varchar("owner_user_id"),
  kind: text("kind").notNull().default("image"),
  mimeType: text("mime_type").notNull(),
  storageUrl: text("storage_url").notNull(),
  width: integer("width"),
  height: integer("height"),
  bytes: integer("bytes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [index("idx_message_attachments_message").on(t.messageId)]);

export const insertMessageAttachmentSchema = createInsertSchema(messageAttachments).omit({ id: true, createdAt: true });
export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type InsertMessageAttachment = z.infer<typeof insertMessageAttachmentSchema>;

export const generatedImages = pgTable("generated_images", {
  id: serial("id").primaryKey(),
  ownerUserId: text("owner_user_id"),
  prompt: text("prompt").notNull(),
  model: text("model").notNull(),
  aspectRatio: text("aspect_ratio").notNull().default("1:1"),
  storageUrl: text("storage_url").notNull(),
  bytes: integer("bytes").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  public: boolean("public").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  tags: jsonb("tags").$type<string[]>().default([]),
  skillOrigin: text("skill_origin"),
});

export const insertGeneratedImageSchema = createInsertSchema(generatedImages).omit({ id: true, createdAt: true });
export type GeneratedImage = typeof generatedImages.$inferSelect;
export type InsertGeneratedImage = z.infer<typeof insertGeneratedImageSchema>;

// Unified archive of a0-produced artifacts (and backfilled generated_images).
// Distinct from message_attachments which holds human-uploaded inputs.
export const artifacts = pgTable("artifacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: varchar("kind").notNull(),
  toolName: varchar("tool_name"),
  agentRunId: varchar("agent_run_id"),
  storagePath: text("storage_path").notNull(),
  filename: varchar("filename").notNull(),
  mime: varchar("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: varchar("sha256").notNull(),
  provenance: jsonb("provenance"),
  public: boolean("public").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("idx_artifacts_created_at").on(t.createdAt.desc()),
  index("idx_artifacts_kind").on(t.kind),
  index("idx_artifacts_tool_name").on(t.toolName),
  index("idx_artifacts_sha256").on(t.sha256),
  index("idx_artifacts_public_kind_created").on(t.public, t.kind, t.createdAt.desc()),
]);

export const insertArtifactSchema = createInsertSchema(artifacts).omit({ id: true, createdAt: true });
export type Artifact = typeof artifacts.$inferSelect;
export type InsertArtifact = z.infer<typeof insertArtifactSchema>;

// ---- Agent runs / per-recursion-level structured logging ----
// agent_runs and agent_logs back the Fleet view and the spawn-cap enforcement.
// Both use varchar UUID primary keys (gen_random_uuid()) — no serial id, no FK
// hops needed when archiving log streams to artifacts.
export const agentRuns = pgTable("agent_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parentRunId: varchar("parent_run_id"),
  rootRunId: varchar("root_run_id"),
  depth: integer("depth").notNull().default(0),
  status: varchar("status", { length: 16 }).notNull().default("running"),
  orchestrationMode: varchar("orchestration_mode", { length: 32 }).notNull().default("single"),
  cutMode: varchar("cut_mode", { length: 8 }).notNull().default("soft"),
  providers: jsonb("providers").$type<string[]>().default([]),
  spawnedByTool: varchar("spawned_by_tool"),
  taskSummary: text("task_summary"),
  startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  endedAt: timestamp("ended_at"),
  totalTokens: integer("total_tokens").notNull().default(0),
  totalCostUsd: real("total_cost_usd").notNull().default(0),
}, (t) => [
  index("idx_agent_runs_parent").on(t.parentRunId),
  index("idx_agent_runs_root_started").on(t.rootRunId, t.startedAt),
  index("idx_agent_runs_status_started").on(t.status, t.startedAt.desc()),
]);

export type AgentRun = typeof agentRuns.$inferSelect;

export const agentLogs = pgTable("agent_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull(),
  parentRunId: varchar("parent_run_id"),
  depth: integer("depth").notNull().default(0),
  level: varchar("level", { length: 8 }).notNull().default("INFO"),
  event: varchar("event", { length: 32 }).notNull(),
  payload: jsonb("payload"),
  ts: timestamp("ts").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [
  index("idx_agent_logs_run_ts").on(t.runId, t.ts),
  index("idx_agent_logs_parent_depth_ts").on(t.parentRunId, t.depth, t.ts),
  index("idx_agent_logs_event_ts").on(t.event, t.ts.desc()),
]);

export type AgentLog = typeof agentLogs.$inferSelect;

export const fleetBenchmarks = pgTable("fleet_benchmarks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull().default(""),
  mode: varchar("mode", { length: 20 }).notNull().default("one_shot"),
  judgeEnabled: boolean("judge_enabled").notNull().default(false),
  judgeModel: varchar("judge_model", { length: 80 }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertFleetBenchmarkSchema = createInsertSchema(fleetBenchmarks).omit({ id: true, createdAt: true, updatedAt: true });
export type FleetBenchmark = typeof fleetBenchmarks.$inferSelect;
export type InsertFleetBenchmark = z.infer<typeof insertFleetBenchmarkSchema>;

export const fleetBenchmarkRuns = pgTable("fleet_benchmark_runs", {
  id: varchar("id").primaryKey(),
  benchmarkId: integer("benchmark_id").notNull(),
  userId: varchar("user_id").notNull(),
  promptSnapshot: text("prompt_snapshot").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  finishedAt: timestamp("finished_at"),
});

export type FleetBenchmarkRun = typeof fleetBenchmarkRuns.$inferSelect;

export const fleetContestants = pgTable("fleet_contestants", {
  id: serial("id").primaryKey(),
  benchmarkId: integer("benchmark_id").notNull(),
  slot: integer("slot").notNull(),
  label: text("label").notNull().default(""),
  providerId: varchar("provider_id", { length: 80 }).notNull(),
  modelId: varchar("model_id", { length: 120 }).notNull().default(""),
  agentId: integer("agent_id"),
  orchestrationMode: varchar("orchestration_mode", { length: 40 }).notNull().default("single"),
  providers: jsonb("providers").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type FleetContestant = typeof fleetContestants.$inferSelect;

export const fleetContestantRuns = pgTable("fleet_contestant_runs", {
  id: varchar("id").primaryKey(),
  runId: varchar("run_id").notNull(),
  contestantId: integer("contestant_id").notNull(),
  slot: integer("slot").notNull(),
  conversationId: integer("conversation_id"),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  content: text("content").notNull().default(""),
  error: text("error"),
  latencyMs: integer("latency_ms").notNull().default(0),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  finishedAt: timestamp("finished_at"),
});

export type FleetContestantRun = typeof fleetContestantRuns.$inferSelect;

export const fleetJudgments = pgTable("fleet_judgments", {
  id: serial("id").primaryKey(),
  runId: varchar("run_id").notNull(),
  judgeModel: varchar("judge_model", { length: 120 }).notNull(),
  scores: jsonb("scores").notNull().default(sql`'{}'::jsonb`),
  winnerContestantId: integer("winner_contestant_id"),
  rationale: text("rationale").notNull().default(""),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type FleetJudgment = typeof fleetJudgments.$inferSelect;

// Lightweight singleton-style settings table used by the a0p side
// (separate from the multi-user `settings` table below).
export const a0pSettings = pgTable("a0p_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export type A0pSetting = typeof a0pSettings.$inferSelect;

// Generic key/value settings table — scoped by user_id ("" for global). Used
// by spawn_caps_by_tier (global) and default_cut_mode (per user).
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().default(""),
  key: varchar("key", { length: 100 }).notNull(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [uniqueIndex("uq_settings_user_key").on(t.userId, t.key)]);

export type Setting = typeof settings.$inferSelect;
// 694:26
