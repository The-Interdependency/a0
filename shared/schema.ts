import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("New Chat"),
  model: text("model").notNull().default("gemini"),
  userId: varchar("user_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

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
  runCount: integer("run_count").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertHeartbeatTaskSchema = createInsertSchema(heartbeatTasks).omit({ id: true, createdAt: true });
export type HeartbeatTask = typeof heartbeatTasks.$inferSelect;
export type InsertHeartbeatTask = z.infer<typeof insertHeartbeatTaskSchema>;

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
