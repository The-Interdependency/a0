import { db } from "../db";
import { users, challengeResponses, guestTokenUsage } from "@shared/models/auth";
import { eq, and, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { verifyPassphrase } from "./password";

export const authStorage = {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ?? null;
  },

  async getUserByEmail(email: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()));
    return user ?? null;
  },

  async createUser(data: {
    username: string;
    email: string;
    passphraseHash: string;
    displayName?: string;
    role?: string;
  }) {
    const [user] = await db
      .insert(users)
      .values({
        username: data.username.toLowerCase().trim(),
        email: data.email.toLowerCase().trim(),
        passphraseHash: data.passphraseHash,
        displayName: data.displayName ?? data.username,
        role: data.role ?? "user",
      })
      .returning();
    return user;
  },

  async updateLastLogin(id: string) {
    await db
      .update(users)
      .set({
        lastLoginAt: new Date(),
        loginCount: sql`${users.loginCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
    const [updated] = await db.select().from(users).where(eq(users.id, id));
    return updated ?? null;
  },

  async updatePassphrase(id: string, newPassphraseHash: string) {
    await db
      .update(users)
      .set({ passphraseHash: newPassphraseHash, updatedAt: new Date() })
      .where(eq(users.id, id));
  },

  async addChallengeResponse(
    userId: string,
    question: string,
    answerHash: string,
    sortOrder: number
  ) {
    const [row] = await db
      .insert(challengeResponses)
      .values({ userId, question, answerHash, sortOrder })
      .returning();
    return row;
  },

  async getChallengeQuestions(userId: string) {
    return db
      .select({
        id: challengeResponses.id,
        question: challengeResponses.question,
        sortOrder: challengeResponses.sortOrder,
      })
      .from(challengeResponses)
      .where(eq(challengeResponses.userId, userId))
      .orderBy(challengeResponses.sortOrder);
  },

  async verifyChallengeAnswer(
    userId: string,
    challengeId: number,
    answer: string
  ): Promise<boolean> {
    const [row] = await db
      .select()
      .from(challengeResponses)
      .where(
        and(
          eq(challengeResponses.id, challengeId),
          eq(challengeResponses.userId, userId)
        )
      );
    if (!row) return false;
    return verifyPassphrase(answer.trim().toLowerCase(), row.answerHash);
  },
};

export function currentHourStart(): Date {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now;
}

export async function getOrCreateGuestWindow(ipHash: string): Promise<{ id: number; tokensUsed: number }> {
  const windowStart = currentHourStart();
  const [existing] = await db
    .select()
    .from(guestTokenUsage)
    .where(
      and(
        eq(guestTokenUsage.ipHash, ipHash),
        gte(guestTokenUsage.windowStart, windowStart)
      )
    );
  if (existing) return existing;
  const [created] = await db
    .insert(guestTokenUsage)
    .values({ ipHash, tokensUsed: 0, windowStart })
    .returning();
  return created;
}

export async function incrementGuestTokens(id: number, tokensToAdd: number): Promise<number> {
  const [updated] = await db
    .update(guestTokenUsage)
    .set({ tokensUsed: sql`${guestTokenUsage.tokensUsed} + ${tokensToAdd}` })
    .where(eq(guestTokenUsage.id, id))
    .returning();
  return updated?.tokensUsed ?? tokensToAdd;
}
