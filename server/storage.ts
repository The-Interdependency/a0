import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";
import {
  conversations, messages, automationTasks, commandHistory,
  events, heartbeatLogs, costMetrics, edcmSnapshots,
  banditArms, customTools, heartbeatTasks, edcmMetricSnapshots,
  memorySeeds, memoryProjections, memoryTensorSnapshots,
  banditCorrelations, systemToggles, discoveryDrafts,
  transcriptSources, transcriptReports, deals,
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
  type TranscriptSource, type InsertTranscriptSource,
  type TranscriptReport, type InsertTranscriptReport,
  type Deal, type InsertDeal,
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
  getCostSummary(): Promise<{
    totalCost: number; totalPromptTokens: number; totalCompletionTokens: number; totalCacheTokens: number;
    costThisMonth: number; costToday: number;
    byModel: Record<string, { cost: number; promptTokens: number; completionTokens: number; cacheTokens: number; calls: number }>;
    byStage: Record<string, { cost: number; promptTokens: number; completionTokens: number; calls: number }>;
    byConversation: { conversationId: number; cost: number; tokens: number; calls: number }[];
    dailyUsage: { date: string; promptTokens: number; completionTokens: number; cost: number }[];
  }>;

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
  createHeartbeatTask(data: InsertHeartbeatTask): Promise<HeartbeatTask>;
  upsertHeartbeatTask(data: InsertHeartbeatTask): Promise<HeartbeatTask>;
  updateHeartbeatTask(id: number, updates: Partial<HeartbeatTask>): Promise<void>;
  deleteHeartbeatTask(id: number): Promise<void>;

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
  deleteSystemToggle(subsystem: string): Promise<void>;

  getDiscoveryDrafts(limit?: number): Promise<DiscoveryDraft[]>;
  createDiscoveryDraft(data: InsertDiscoveryDraft): Promise<DiscoveryDraft>;
  promoteDiscoveryDraft(id: number, conversationId: number): Promise<void>;

  listDeals(userId: string, status?: string): Promise<Deal[]>;
  getDeal(id: number): Promise<Deal | undefined>;
  createDeal(data: InsertDeal): Promise<Deal>;
  updateDeal(id: number, updates: Partial<Deal>): Promise<Deal>;

  getActivityStats(): Promise<{
    heartbeatRuns: number;
    transcripts: number;
    conversations: number;
    events: number;
    drafts: number;
    promotions: number;
    edcmSnapshots: number;
    memorySnapshots: number;
  }>;

  getUserCredentials(userId: string): Promise<any[]>;
  addUserCredential(userId: string, credential: any): Promise<any>;
  deleteUserCredential(userId: string, credentialId: string): Promise<void>;
  getUserCredentialFieldValue(userId: string, serviceId: string, fieldKey: string): Promise<string | undefined>;

  getUserSecrets(userId: string): Promise<any[]>;
  addUserSecret(userId: string, secret: any): Promise<any>;
  deleteUserSecret(userId: string, secretKey: string): Promise<void>;
  getUserSecretValue(userId: string, key: string): Promise<string | undefined>;

  getTranscriptSources(): Promise<TranscriptSource[]>;
  getTranscriptSource(slug: string): Promise<TranscriptSource | undefined>;
  createTranscriptSource(data: InsertTranscriptSource): Promise<TranscriptSource>;
  updateTranscriptSource(slug: string, updates: Partial<TranscriptSource>): Promise<void>;
  deleteTranscriptSource(slug: string): Promise<void>;

  addTranscriptReport(data: InsertTranscriptReport): Promise<TranscriptReport>;
  getLatestTranscriptReport(sourceSlug: string): Promise<TranscriptReport | undefined>;
  getTranscriptReports(sourceSlug: string, limit?: number): Promise<TranscriptReport[]>;
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
    const byModel: Record<string, { cost: number; promptTokens: number; completionTokens: number; cacheTokens: number; calls: number }> = {};
    const byStage: Record<string, { cost: number; promptTokens: number; completionTokens: number; calls: number }> = {};
    const convMap: Record<number, { cost: number; tokens: number; calls: number }> = {};
    const dailyMap: Record<string, { promptTokens: number; completionTokens: number; cost: number }> = {};
    let totalCost = 0, totalPromptTokens = 0, totalCompletionTokens = 0, totalCacheTokens = 0;
    let costThisMonth = 0, costToday = 0;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStr = now.toISOString().slice(0, 10);

    for (const m of all) {
      totalCost += m.estimatedCost;
      totalPromptTokens += m.promptTokens;
      totalCompletionTokens += m.completionTokens;
      totalCacheTokens += m.cacheTokens || 0;

      const createdAt = new Date(m.createdAt);
      if (createdAt >= monthStart) costThisMonth += m.estimatedCost;
      const dayStr = createdAt.toISOString().slice(0, 10);
      if (dayStr === todayStr) costToday += m.estimatedCost;

      if (!byModel[m.model]) byModel[m.model] = { cost: 0, promptTokens: 0, completionTokens: 0, cacheTokens: 0, calls: 0 };
      byModel[m.model].cost += m.estimatedCost;
      byModel[m.model].promptTokens += m.promptTokens;
      byModel[m.model].completionTokens += m.completionTokens;
      byModel[m.model].cacheTokens += m.cacheTokens || 0;
      byModel[m.model].calls += 1;

      const stage = m.stage || "unknown";
      if (!byStage[stage]) byStage[stage] = { cost: 0, promptTokens: 0, completionTokens: 0, calls: 0 };
      byStage[stage].cost += m.estimatedCost;
      byStage[stage].promptTokens += m.promptTokens;
      byStage[stage].completionTokens += m.completionTokens;
      byStage[stage].calls += 1;

      if (m.conversationId) {
        if (!convMap[m.conversationId]) convMap[m.conversationId] = { cost: 0, tokens: 0, calls: 0 };
        convMap[m.conversationId].cost += m.estimatedCost;
        convMap[m.conversationId].tokens += m.promptTokens + m.completionTokens;
        convMap[m.conversationId].calls += 1;
      }

      if (!dailyMap[dayStr]) dailyMap[dayStr] = { promptTokens: 0, completionTokens: 0, cost: 0 };
      dailyMap[dayStr].promptTokens += m.promptTokens;
      dailyMap[dayStr].completionTokens += m.completionTokens;
      dailyMap[dayStr].cost += m.estimatedCost;
    }

    const byConversation = Object.entries(convMap)
      .map(([id, data]) => ({ conversationId: parseInt(id), ...data }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 50);

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dailyUsage = Object.entries(dailyMap)
      .filter(([date]) => date >= thirtyDaysAgo)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { totalCost, totalPromptTokens, totalCompletionTokens, totalCacheTokens, costThisMonth, costToday, byModel, byStage, byConversation, dailyUsage };
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

  async createHeartbeatTask(data: InsertHeartbeatTask) {
    const [task] = await db.insert(heartbeatTasks).values(data).returning();
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

  async deleteHeartbeatTask(id: number) {
    await db.delete(heartbeatTasks).where(eq(heartbeatTasks.id, id));
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

  async deleteSystemToggle(subsystem: string) {
    await db.delete(systemToggles).where(eq(systemToggles.subsystem, subsystem));
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

  async listDeals(userId: string, status?: string): Promise<Deal[]> {
    const rows = await db.select().from(deals).where(eq(deals.userId, userId)).orderBy(desc(deals.createdAt));
    return status ? rows.filter(d => d.status === status) : rows;
  }

  async getDeal(id: number): Promise<Deal | undefined> {
    const [row] = await db.select().from(deals).where(eq(deals.id, id));
    return row;
  }

  async createDeal(data: InsertDeal): Promise<Deal> {
    const [row] = await db.insert(deals).values(data).returning();
    return row;
  }

  async updateDeal(id: number, updates: Partial<Deal>): Promise<Deal> {
    const [row] = await db.update(deals).set({ ...updates, updatedAt: new Date() }).where(eq(deals.id, id)).returning();
    return row;
  }

  async getActivityStats() {
    const [hbResult] = await db.select({ count: sql<number>`count(*)::int` }).from(heartbeatLogs);
    const [convResult] = await db.select({ count: sql<number>`count(*)::int` }).from(conversations);
    const [evResult] = await db.select({ count: sql<number>`count(*)::int` }).from(events);
    const [draftResult] = await db.select({ count: sql<number>`count(*)::int` }).from(discoveryDrafts);
    const [promoResult] = await db.select({ count: sql<number>`count(*)::int` }).from(discoveryDrafts).where(eq(discoveryDrafts.promotedToConversation, true));
    const [edcmResult] = await db.select({ count: sql<number>`count(*)::int` }).from(edcmMetricSnapshots);
    const [memResult] = await db.select({ count: sql<number>`count(*)::int` }).from(memoryTensorSnapshots);
    const [msgResult] = await db.select({ count: sql<number>`count(*)::int` }).from(messages);
    return {
      heartbeatRuns: hbResult.count,
      transcripts: msgResult.count,
      conversations: convResult.count,
      events: evResult.count,
      drafts: draftResult.count,
      promotions: promoResult.count,
      edcmSnapshots: edcmResult.count,
      memorySnapshots: memResult.count,
    };
  }

  async getUserCredentials(userId: string): Promise<any[]> {
    const toggle = await this.getSystemToggle(`user_credentials_${userId}`);
    return (toggle?.parameters as any[]) || [];
  }

  async addUserCredential(userId: string, credential: any): Promise<any> {
    const existing = await this.getUserCredentials(userId);
    const updated = [...existing, credential];
    await this.upsertSystemToggle(`user_credentials_${userId}`, true, updated);
    return credential;
  }

  async deleteUserCredential(userId: string, credentialId: string): Promise<void> {
    const existing = await this.getUserCredentials(userId);
    const filtered = existing.filter((c: any) => c.id !== credentialId);
    await this.upsertSystemToggle(`user_credentials_${userId}`, true, filtered);
  }

  async getUserCredentialFieldValue(userId: string, serviceId: string, fieldKey: string): Promise<string | undefined> {
    const creds = await this.getUserCredentials(userId);
    const service = creds.find((c: any) => c.id === serviceId);
    if (!service) return undefined;
    const field = service.fields?.find((f: any) => f.key === fieldKey);
    return field?.value;
  }

  async getUserSecrets(userId: string): Promise<any[]> {
    const toggle = await this.getSystemToggle(`user_secrets_${userId}`);
    return (toggle?.parameters as any[]) || [];
  }

  async addUserSecret(userId: string, secret: any): Promise<any> {
    const existing = await this.getUserSecrets(userId);
    const idx = existing.findIndex((s: any) => s.key === secret.key);
    let updated: any[];
    if (idx >= 0) {
      updated = [...existing];
      updated[idx] = secret;
    } else {
      updated = [...existing, secret];
    }
    await this.upsertSystemToggle(`user_secrets_${userId}`, true, updated);
    return secret;
  }

  async deleteUserSecret(userId: string, secretKey: string): Promise<void> {
    const existing = await this.getUserSecrets(userId);
    const filtered = existing.filter((s: any) => s.key !== secretKey);
    await this.upsertSystemToggle(`user_secrets_${userId}`, true, filtered);
  }

  async getUserSecretValue(userId: string, key: string): Promise<string | undefined> {
    const secrets = await this.getUserSecrets(userId);
    const secret = secrets.find((s: any) => s.key === key);
    return secret?.value;
  }

  async getTranscriptSources(): Promise<TranscriptSource[]> {
    return db.select().from(transcriptSources).orderBy(transcriptSources.createdAt);
  }

  async getTranscriptSource(slug: string): Promise<TranscriptSource | undefined> {
    const [s] = await db.select().from(transcriptSources).where(eq(transcriptSources.slug, slug));
    return s;
  }

  async createTranscriptSource(data: InsertTranscriptSource): Promise<TranscriptSource> {
    const [s] = await db.insert(transcriptSources).values(data).returning();
    return s;
  }

  async updateTranscriptSource(slug: string, updates: Partial<TranscriptSource>): Promise<void> {
    await db.update(transcriptSources).set(updates).where(eq(transcriptSources.slug, slug));
  }

  async deleteTranscriptSource(slug: string): Promise<void> {
    await db.delete(transcriptSources).where(eq(transcriptSources.slug, slug));
    await db.delete(transcriptReports).where(eq(transcriptReports.sourceSlug, slug));
  }

  async addTranscriptReport(data: InsertTranscriptReport): Promise<TranscriptReport> {
    const [r] = await db.insert(transcriptReports).values(data).returning();
    return r;
  }

  async getLatestTranscriptReport(sourceSlug: string): Promise<TranscriptReport | undefined> {
    const [r] = await db.select().from(transcriptReports)
      .where(eq(transcriptReports.sourceSlug, sourceSlug))
      .orderBy(desc(transcriptReports.createdAt))
      .limit(1);
    return r;
  }

  async getTranscriptReports(sourceSlug: string, limit = 10): Promise<TranscriptReport[]> {
    return db.select().from(transcriptReports)
      .where(eq(transcriptReports.sourceSlug, sourceSlug))
      .orderBy(desc(transcriptReports.createdAt))
      .limit(limit);
  }
}

export const storage = new DatabaseStorage();
