// 214:21 30:2 30:3
import { db, pool } from "../db";
import { users, challengeResponses, guestTokenUsage } from "@shared/models/auth";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { verifyPassphrase } from "./password";

const MAX_RECOVERY_ATTEMPTS = 5;
const RECOVERY_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

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

  async getUserByUsername(username: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username.toLowerCase().trim()));
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
        subscriptionTier: data.role === "admin" ? "admin" : "free",
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

  /**
   * Returns true if the account is currently locked out of recovery attempts.
   */
  async isRecoveryLocked(userId: string): Promise<boolean> {
    const result = await pool.query<{ locked_until: Date | null }>(
      "SELECT locked_until FROM recovery_attempts WHERE user_id = $1",
      [userId]
    );
    const row = result.rows[0];
    if (!row || !row.locked_until) return false;
    return new Date() < row.locked_until;
  },

  /**
   * Records a failed recovery attempt for the account.
   * On reaching MAX_RECOVERY_ATTEMPTS the account is locked for RECOVERY_LOCKOUT_MS.
   * Returns locked=true when the lockout threshold was just crossed.
   */
  async recordRecoveryFailure(userId: string): Promise<{ locked: boolean }> {
    const lockedUntilExpr = `CASE
      WHEN fail_count + 1 >= ${MAX_RECOVERY_ATTEMPTS}
      THEN NOW() + INTERVAL '${RECOVERY_LOCKOUT_MS} milliseconds'
      ELSE NULL
    END`;
    const result = await pool.query<{ fail_count: number; locked_until: Date | null }>(
      `INSERT INTO recovery_attempts (user_id, fail_count, locked_until, updated_at)
       VALUES ($1, 1, ${MAX_RECOVERY_ATTEMPTS <= 1 ? `NOW() + INTERVAL '${RECOVERY_LOCKOUT_MS} milliseconds'` : "NULL"}, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET fail_count   = recovery_attempts.fail_count + 1,
             locked_until = ${lockedUntilExpr},
             updated_at   = NOW()
       RETURNING fail_count, locked_until`,
      [userId]
    );
    const row = result.rows[0];
    return { locked: !!(row?.locked_until && new Date() < row.locked_until) };
  },

  /**
   * Clears the recovery attempt record for an account after a successful recovery.
   */
  async clearRecoveryAttempts(userId: string): Promise<void> {
    await pool.query(
      "DELETE FROM recovery_attempts WHERE user_id = $1",
      [userId]
    );
  },

  /**
   * Logs a security probe event to the intelligence table.
   * Fire-and-forget safe — callers should not await this for latency-sensitive paths.
   *
   * @param probeType  - categorises the event (e.g. 'recovery_probe', 'honeypot_trigger', 'honeypot_passphrase')
   * @param ipHash     - sha256 of the source IP (never raw IP)
   * @param accountHash - sha256 of the targeted userId or email
   * @param detail     - arbitrary structured intelligence payload
   */
  async logSecurityProbe(
    probeType: string,
    ipHash: string | null,
    accountHash: string | null,
    detail: Record<string, unknown>
  ): Promise<void> {
    await pool.query(
      `INSERT INTO security_probes (probe_type, ip_hash, account_hash, detail)
       VALUES ($1, $2, $3, $4)`,
      [probeType, ipHash, accountHash, JSON.stringify(detail)]
    );
  },
};

export function currentHourStart(): Date {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now;
}

export async function getOrCreateGuestWindow(ipHash: string): Promise<{ id: number; tokensUsed: number }> {
  const windowStart = currentHourStart();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`guest:${ipHash}:${windowStart.toISOString()}`]);
    let result = await client.query(
      'SELECT id, tokens_used AS "tokensUsed" FROM guest_token_usage WHERE ip_hash = $1 AND window_start = $2 ORDER BY id LIMIT 1',
      [ipHash, windowStart],
    );
    if (!result.rows.length) result = await client.query(
      'INSERT INTO guest_token_usage (ip_hash, tokens_used, window_start) VALUES ($1, 0, $2) RETURNING id, tokens_used AS "tokensUsed"',
      [ipHash, windowStart],
    );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function incrementGuestTokensAtomic(
  id: number,
  tokensToAdd: number,
  limit: number
): Promise<{ accepted: boolean; tokensUsed: number }> {
  const [updated] = await db
    .update(guestTokenUsage)
    .set({ tokensUsed: sql`${guestTokenUsage.tokensUsed} + ${tokensToAdd}` })
    .where(
      and(
        eq(guestTokenUsage.id, id),
        sql`${guestTokenUsage.tokensUsed} + ${tokensToAdd} <= ${limit}`
      )
    )
    .returning();
  if (!updated) {
    const [current] = await db
      .select({ tokensUsed: guestTokenUsage.tokensUsed })
      .from(guestTokenUsage)
      .where(eq(guestTokenUsage.id, id));
    return { accepted: false, tokensUsed: current?.tokensUsed ?? limit };
  }
  return { accepted: true, tokensUsed: updated.tokensUsed };
}
/** Settle one accepted reservation once; zero actual tokens releases a failure. */
export async function settleGuestTokensAtomic(id: number, reserved: number, actual: number): Promise<number> {
  if (![reserved, actual].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("Invalid guest token settlement");
  }
  const result = await pool.query(
    `UPDATE guest_token_usage SET tokens_used = tokens_used + $3 - $2
     WHERE id = $1 RETURNING tokens_used`, [id, reserved, actual],
  );
  if (!result.rows.length) throw new Error("Guest reservation window missing");
  return result.rows[0].tokens_used;
}
// 214:21 30:2 30:3
