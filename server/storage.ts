import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";
import {
  conversations, messages, automationTasks, commandHistory,
  events, heartbeatLogs, costMetrics, edcmSnapshots,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
  type AutomationTask, type InsertAutomationTask,
  type CommandHistory, type InsertCommandHistory,
  type A0pEvent, type HeartbeatLog, type CostMetric, type EdcmSnapshot,
} from "@shared/schema";

export interface IStorage {
  getConversations(): Promise<Conversation[]>;
  getConversation(id: number): Promise<Conversation | undefined>;
  createConversation(data: InsertConversation): Promise<Conversation>;
  updateConversationTitle(id: number, title: string): Promise<void>;
  deleteConversation(id: number): Promise<void>;

  getMessages(conversationId: number): Promise<Message[]>;
  createMessage(data: InsertMessage): Promise<Message>;

  getAutomationTasks(): Promise<AutomationTask[]>;
  getAutomationTask(id: number): Promise<AutomationTask | undefined>;
  createAutomationTask(data: InsertAutomationTask): Promise<AutomationTask>;
  updateAutomationTask(id: number, updates: Partial<AutomationTask>): Promise<void>;
  deleteAutomationTask(id: number): Promise<void>;

  getCommandHistory(): Promise<CommandHistory[]>;
  addCommandHistory(data: InsertCommandHistory): Promise<CommandHistory>;
  clearCommandHistory(): Promise<void>;

  appendEvent(event: Omit<A0pEvent, "id" | "createdAt">): Promise<A0pEvent>;
  getEvents(taskId?: string): Promise<A0pEvent[]>;
  getLastEvent(): Promise<A0pEvent | undefined>;

  addHeartbeat(log: Omit<HeartbeatLog, "id" | "createdAt">): Promise<HeartbeatLog>;
  getHeartbeats(limit?: number): Promise<HeartbeatLog[]>;

  addCostMetric(metric: Omit<CostMetric, "id" | "createdAt">): Promise<CostMetric>;
  getCostMetrics(userId?: string): Promise<CostMetric[]>;
  getCostSummary(): Promise<{ totalCost: number; totalPromptTokens: number; totalCompletionTokens: number; byModel: Record<string, { cost: number; promptTokens: number; completionTokens: number }> }>;

  addEdcmSnapshot(snap: Omit<EdcmSnapshot, "id" | "createdAt">): Promise<EdcmSnapshot>;
  getEdcmSnapshots(limit?: number): Promise<EdcmSnapshot[]>;
}

export class DatabaseStorage implements IStorage {
  async getConversations() {
    return db.select().from(conversations).orderBy(desc(conversations.updatedAt));
  }

  async getConversation(id: number) {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conv;
  }

  async createConversation(data: InsertConversation) {
    const [conv] = await db.insert(conversations).values(data).returning();
    return conv;
  }

  async updateConversationTitle(id: number, title: string) {
    await db.update(conversations).set({ title, updatedAt: new Date() }).where(eq(conversations.id, id));
  }

  async deleteConversation(id: number) {
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async getMessages(conversationId: number) {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  }

  async createMessage(data: InsertMessage) {
    const [msg] = await db.insert(messages).values(data).returning();
    return msg;
  }

  async getAutomationTasks() {
    return db.select().from(automationTasks).orderBy(desc(automationTasks.createdAt));
  }

  async getAutomationTask(id: number) {
    const [task] = await db.select().from(automationTasks).where(eq(automationTasks.id, id));
    return task;
  }

  async createAutomationTask(data: InsertAutomationTask) {
    const [task] = await db.insert(automationTasks).values(data).returning();
    return task;
  }

  async updateAutomationTask(id: number, updates: Partial<AutomationTask>) {
    await db.update(automationTasks).set({ ...updates, updatedAt: new Date() }).where(eq(automationTasks.id, id));
  }

  async deleteAutomationTask(id: number) {
    await db.delete(automationTasks).where(eq(automationTasks.id, id));
  }

  async getCommandHistory() {
    return db.select().from(commandHistory).orderBy(desc(commandHistory.createdAt)).limit(100);
  }

  async addCommandHistory(data: InsertCommandHistory) {
    const [entry] = await db.insert(commandHistory).values(data).returning();
    return entry;
  }

  async clearCommandHistory() {
    await db.delete(commandHistory);
  }

  async appendEvent(event: Omit<A0pEvent, "id" | "createdAt">) {
    const [e] = await db.insert(events).values(event).returning();
    return e;
  }

  async getEvents(taskId?: string) {
    if (taskId) {
      return db.select().from(events).where(eq(events.taskId, taskId)).orderBy(events.createdAt);
    }
    return db.select().from(events).orderBy(events.createdAt);
  }

  async getRecentEvents(limit = 100) {
    return db.select().from(events).orderBy(desc(events.createdAt)).limit(limit);
  }

  async getLastEvent() {
    const [e] = await db.select().from(events).orderBy(desc(events.id)).limit(1);
    return e;
  }

  async addHeartbeat(log: Omit<HeartbeatLog, "id" | "createdAt">) {
    const [h] = await db.insert(heartbeatLogs).values(log).returning();
    return h;
  }

  async getHeartbeats(limit = 24) {
    return db.select().from(heartbeatLogs).orderBy(desc(heartbeatLogs.createdAt)).limit(limit);
  }

  async addCostMetric(metric: Omit<CostMetric, "id" | "createdAt">) {
    const [c] = await db.insert(costMetrics).values(metric).returning();
    return c;
  }

  async getCostMetrics(userId?: string) {
    if (userId) {
      return db.select().from(costMetrics).where(eq(costMetrics.userId, userId)).orderBy(desc(costMetrics.createdAt)).limit(200);
    }
    return db.select().from(costMetrics).orderBy(desc(costMetrics.createdAt)).limit(200);
  }

  async getCostSummary() {
    const all = await db.select().from(costMetrics);
    const byModel: Record<string, { cost: number; promptTokens: number; completionTokens: number }> = {};
    let totalCost = 0, totalPromptTokens = 0, totalCompletionTokens = 0;
    for (const m of all) {
      totalCost += m.estimatedCost;
      totalPromptTokens += m.promptTokens;
      totalCompletionTokens += m.completionTokens;
      if (!byModel[m.model]) byModel[m.model] = { cost: 0, promptTokens: 0, completionTokens: 0 };
      byModel[m.model].cost += m.estimatedCost;
      byModel[m.model].promptTokens += m.promptTokens;
      byModel[m.model].completionTokens += m.completionTokens;
    }
    return { totalCost, totalPromptTokens, totalCompletionTokens, byModel };
  }

  async addEdcmSnapshot(snap: Omit<EdcmSnapshot, "id" | "createdAt">) {
    const [s] = await db.insert(edcmSnapshots).values(snap).returning();
    return s;
  }

  async getEdcmSnapshots(limit = 50) {
    return db.select().from(edcmSnapshots).orderBy(desc(edcmSnapshots.createdAt)).limit(limit);
  }
}

export const storage = new DatabaseStorage();
