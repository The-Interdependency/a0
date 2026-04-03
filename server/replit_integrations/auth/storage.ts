import { db } from "../../db";
import { users, type UpsertUser } from "@shared/models/auth";
import { eq } from "drizzle-orm";

export const authStorage = {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ?? null;
  },

  async upsertUser(data: UpsertUser) {
    const [user] = await db
      .insert(users)
      .values(data)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          profileImageUrl: data.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  },
};
