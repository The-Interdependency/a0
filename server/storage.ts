import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import {
  users, conversations, messages, automationTasks, commandHistory,
  type User, type InsertUser,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
  type AutomationTask, type InsertAutomationTask,
  type CommandHistory, type InsertCommandHistory,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

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
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(data: InsertUser) {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

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
    await db.update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, id));
  }

  async deleteConversation(id: number) {
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async getMessages(conversationId: number) {
    return db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
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
    await db.update(automationTasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(automationTasks.id, id));
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
}

export const storage = new DatabaseStorage();
