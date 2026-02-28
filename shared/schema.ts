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
  estimatedCost: real("estimated_cost").notNull().default(0),
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
