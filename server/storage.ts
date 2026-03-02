import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";
import {
  conversations, messages, automationTasks, commandHistory,
  events, heartbeatLogs, costMetrics, edcmSnapshots,
  banditArms, customTools, heartbeatTasks, edcmMetricSnapshots,
  memorySeeds, memoryProjections, memoryTensorSnapshots,
  banditCorrelations, systemToggles, discoveryDrafts,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
  type AutomationTask, type InsertAutomationTask,
  type CommandHistory, type InsertCommandHistory,
  type A0pEvent, type HeartbeatLog, type CostMetric, type EdcmSnapshot,
  type BanditArm, type InsertBanditArm,
  type CustomTool, type InsertCustomTool,
  type HeartbeatTask, type InsertHeartbeatTask,
  type EdcmMetricSnapshot, type InsertEdcmMetricSnapshot,
  type MemorySeed, type InsertMemorySeed,
  type MemoryProjection,
  type MemoryTensorSnapshot,
  type BanditCorrelation,
  type SystemToggle,
  type DiscoveryDraft, type InsertDiscoveryDraft,
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

  getBanditArms(domain?: string): Promise<BanditArm[]>;
  getBanditArm(id: number): Promise<BanditArm | undefined>;
  upsertBanditArm(data: InsertBanditArm): Promise<BanditArm>;
  updateBanditArm(id: number, updates: Partial<BanditArm>): Promise<void>;
  resetBanditDomain(domain: string): Promise<void>;

  getCustomTools(userId?: string): Promise<CustomTool[]>;
  getCustomTool(id: number): Promise<CustomTool | undefined>;
  createCustomTool(data: InsertCustomTool): Promise<CustomTool>;
  updateCustomTool(id: number, updates: Partial<CustomTool>): Promise<void>;
  deleteCustomTool(id: number): Promise<void>;

  getHeartbeatTasks(): Promise<HeartbeatTask[]>;
  getHeartbeatTask(name: string): Promise<HeartbeatTask | undefined>;
  upsertHeartbeatTask(data: InsertHeartbeatTask): Promise<HeartbeatTask>;
  updateHeartbeatTask(id: number, updates: Partial<HeartbeatTask>): Promise<void>;

  addEdcmMetricSnapshot(snap: InsertEdcmMetricSnapshot): Promise<EdcmMetricSnapshot>;
  getEdcmMetricSnapshots(limit?: number): Promise<EdcmMetricSnapshot[]>;

  getMemorySeeds(): Promise<MemorySeed[]>;
  getMemorySeed(seedIndex: number): Promise<MemorySeed | undefined>;
  upsertMemorySeed(data: InsertMemorySeed): Promise<MemorySeed>;
  updateMemorySeed(seedIndex: number, updates: Partial<MemorySeed>): Promise<void>;

  getMemoryProjection(): Promise<MemoryProjection | undefined>;
  upsertMemoryProjection(data: Omit<MemoryProjection, "id" | "createdAt">): Promise<MemoryProjection>;

  addMemoryTensorSnapshot(snap: Omit<MemoryTensorSnapshot, "id" | "createdAt">): Promise<MemoryTensorSnapshot>;
  getMemoryTensorSnapshots(limit?: number): Promise<MemoryTensorSnapshot[]>;

  addBanditCorrelation(corr: Omit<BanditCorrelation, "id" | "createdAt">): Promise<BanditCorrelation>;
  getBanditCorrelations(limit?: number): Promise<BanditCorrelation[]>;

  getSystemToggles(): Promise<SystemToggle[]>;
  getSystemToggle(subsystem: string): Promise<SystemToggle | undefined>;
  upsertSystemToggle(subsystem: string, enabled: boolean, parameters?: any): Promise<SystemToggle>;

  getDiscoveryDrafts(limit?: number): Promise<DiscoveryDraft[]>;
  createDiscoveryDraft(data: InsertDiscoveryDraft): Promise<DiscoveryDraft>;
  promoteDiscoveryDraft(id: number, conversationId: number): Promise<void>;
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

  async getBanditArms(domain?: string) {
    if (domain) {
      return db.select().from(banditArms).where(eq(banditArms.domain, domain)).orderBy(desc(banditArms.ucbScore));
    }
    return db.select().from(banditArms).orderBy(banditArms.domain, desc(banditArms.ucbScore));
  }

  async getBanditArm(id: number) {
    const [arm] = await db.select().from(banditArms).where(eq(banditArms.id, id));
    return arm;
  }

  async upsertBanditArm(data: InsertBanditArm) {
    const existing = await db.select().from(banditArms)
      .where(eq(banditArms.domain, data.domain))
      .then(rows => rows.find(r => r.armName === data.armName));
    if (existing) {
      await db.update(banditArms).set(data).where(eq(banditArms.id, existing.id));
      const [updated] = await db.select().from(banditArms).where(eq(banditArms.id, existing.id));
      return updated;
    }
    const [arm] = await db.insert(banditArms).values(data).returning();
    return arm;
  }

  async updateBanditArm(id: number, updates: Partial<BanditArm>) {
    await db.update(banditArms).set(updates).where(eq(banditArms.id, id));
  }

  async resetBanditDomain(domain: string) {
    await db.update(banditArms).set({ pulls: 0, totalReward: 0, avgReward: 0, emaReward: 0, ucbScore: 0 }).where(eq(banditArms.domain, domain));
  }

  async getCustomTools(userId?: string) {
    if (userId) {
      return db.select().from(customTools).where(eq(customTools.userId, userId)).orderBy(desc(customTools.createdAt));
    }
    return db.select().from(customTools).orderBy(desc(customTools.createdAt));
  }

  async getCustomTool(id: number) {
    const [tool] = await db.select().from(customTools).where(eq(customTools.id, id));
    return tool;
  }

  async createCustomTool(data: InsertCustomTool) {
    const [tool] = await db.insert(customTools).values(data).returning();
    return tool;
  }

  async updateCustomTool(id: number, updates: Partial<CustomTool>) {
    await db.update(customTools).set(updates).where(eq(customTools.id, id));
  }

  async deleteCustomTool(id: number) {
    await db.delete(customTools).where(eq(customTools.id, id));
  }

  async getHeartbeatTasks() {
    return db.select().from(heartbeatTasks).orderBy(heartbeatTasks.name);
  }

  async getHeartbeatTask(name: string) {
    const [task] = await db.select().from(heartbeatTasks).where(eq(heartbeatTasks.name, name));
    return task;
  }

  async upsertHeartbeatTask(data: InsertHeartbeatTask) {
    const existing = await this.getHeartbeatTask(data.name);
    if (existing) {
      await db.update(heartbeatTasks).set(data).where(eq(heartbeatTasks.id, existing.id));
      const [updated] = await db.select().from(heartbeatTasks).where(eq(heartbeatTasks.id, existing.id));
      return updated;
    }
    const [task] = await db.insert(heartbeatTasks).values(data).returning();
    return task;
  }

  async updateHeartbeatTask(id: number, updates: Partial<HeartbeatTask>) {
    await db.update(heartbeatTasks).set(updates).where(eq(heartbeatTasks.id, id));
  }

  async addEdcmMetricSnapshot(snap: InsertEdcmMetricSnapshot) {
    const [s] = await db.insert(edcmMetricSnapshots).values(snap).returning();
    return s;
  }

  async getEdcmMetricSnapshots(limit = 50) {
    return db.select().from(edcmMetricSnapshots).orderBy(desc(edcmMetricSnapshots.createdAt)).limit(limit);
  }

  async getMemorySeeds() {
    return db.select().from(memorySeeds).orderBy(memorySeeds.seedIndex);
  }

  async getMemorySeed(seedIndex: number) {
    const [seed] = await db.select().from(memorySeeds).where(eq(memorySeeds.seedIndex, seedIndex));
    return seed;
  }

  async upsertMemorySeed(data: InsertMemorySeed) {
    const existing = await this.getMemorySeed(data.seedIndex);
    if (existing) {
      await db.update(memorySeeds).set({ ...data, updatedAt: new Date() }).where(eq(memorySeeds.id, existing.id));
      const [updated] = await db.select().from(memorySeeds).where(eq(memorySeeds.id, existing.id));
      return updated;
    }
    const [seed] = await db.insert(memorySeeds).values(data).returning();
    return seed;
  }

  async updateMemorySeed(seedIndex: number, updates: Partial<MemorySeed>) {
    await db.update(memorySeeds).set({ ...updates, updatedAt: new Date() }).where(eq(memorySeeds.seedIndex, seedIndex));
  }

  async getMemoryProjection() {
    const [proj] = await db.select().from(memoryProjections).orderBy(desc(memoryProjections.id)).limit(1);
    return proj;
  }

  async upsertMemoryProjection(data: Omit<MemoryProjection, "id" | "createdAt">) {
    const existing = await this.getMemoryProjection();
    if (existing) {
      await db.update(memoryProjections).set(data).where(eq(memoryProjections.id, existing.id));
      const [updated] = await db.select().from(memoryProjections).where(eq(memoryProjections.id, existing.id));
      return updated;
    }
    const [proj] = await db.insert(memoryProjections).values(data).returning();
    return proj;
  }

  async addMemoryTensorSnapshot(snap: Omit<MemoryTensorSnapshot, "id" | "createdAt">) {
    const [s] = await db.insert(memoryTensorSnapshots).values(snap).returning();
    return s;
  }

  async getMemoryTensorSnapshots(limit = 20) {
    return db.select().from(memoryTensorSnapshots).orderBy(desc(memoryTensorSnapshots.createdAt)).limit(limit);
  }

  async addBanditCorrelation(corr: Omit<BanditCorrelation, "id" | "createdAt">) {
    const [c] = await db.insert(banditCorrelations).values(corr).returning();
    return c;
  }

  async getBanditCorrelations(limit = 50) {
    return db.select().from(banditCorrelations).orderBy(desc(banditCorrelations.jointReward)).limit(limit);
  }

  async getSystemToggles() {
    return db.select().from(systemToggles).orderBy(systemToggles.subsystem);
  }

  async getSystemToggle(subsystem: string) {
    const [toggle] = await db.select().from(systemToggles).where(eq(systemToggles.subsystem, subsystem));
    return toggle;
  }

  async upsertSystemToggle(subsystem: string, enabled: boolean, parameters?: any) {
    const existing = await this.getSystemToggle(subsystem);
    if (existing) {
      await db.update(systemToggles).set({ enabled, parameters: parameters ?? existing.parameters, updatedAt: new Date() }).where(eq(systemToggles.id, existing.id));
      const [updated] = await db.select().from(systemToggles).where(eq(systemToggles.id, existing.id));
      return updated;
    }
    const [toggle] = await db.insert(systemToggles).values({ subsystem, enabled, parameters, updatedAt: new Date() }).returning();
    return toggle;
  }

  async getDiscoveryDrafts(limit = 50) {
    return db.select().from(discoveryDrafts).orderBy(desc(discoveryDrafts.createdAt)).limit(limit);
  }

  async createDiscoveryDraft(data: InsertDiscoveryDraft) {
    const [draft] = await db.insert(discoveryDrafts).values(data).returning();
    return draft;
  }

  async promoteDiscoveryDraft(id: number, conversationId: number) {
    await db.update(discoveryDrafts).set({ promotedToConversation: true, conversationId }).where(eq(discoveryDrafts.id, id));
  }
}

export const storage = new DatabaseStorage();
