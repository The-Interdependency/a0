// 57:0
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, boolean, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique("users_username_key"),
  email: varchar("email").unique("users_email_unique"),
  passphraseHash: varchar("passphrase_hash"),
  displayName: varchar("display_name"),
  role: varchar("role").notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  loginCount: integer("login_count").notNull().default(0),
  lastLoginAt: timestamp("last_login_at"),
  subscriptionTier: varchar("subscription_tier").notNull().default("free"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionStatus: varchar("subscription_status").notNull().default("active"),
  byokEnabled: boolean("byok_enabled").notNull().default(false),
  transcriptsUnlocked: boolean("transcripts_unlocked").notNull().default(false),
  founderSlot: integer("founder_slot"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  loginCount: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const challengeResponses = pgTable("challenge_responses", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answerHash: varchar("answer_hash").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type ChallengeResponse = typeof challengeResponses.$inferSelect;

export const guestTokenUsage = pgTable("guest_token_usage", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ipHash: varchar("ip_hash").notNull(),
  tokensUsed: integer("tokens_used").notNull().default(0),
  windowStart: timestamp("window_start").notNull(),
});

export type GuestTokenUsage = typeof guestTokenUsage.$inferSelect;
// 57:0
