import { eq, and } from 'drizzle-orm';
import { users, merchants, memberships, merchantBrandSettings, invites } from '../schema/merchants';

export const onboardingQueries = {
  getPendingInvite: async (tx: any, token: string) => {
    return tx.select().from(invites).where(and(eq(invites.token, token), eq(invites.status, 'pending'))).limit(1);
  },
  
  upsertUser: async (tx: any, data: { clerkUserId: string; email: string; fullName: string }) => {
    return tx.insert(users).values(data).onConflictDoUpdate({
      target: users.clerkUserId,
      set: { ...data, updatedAt: new Date() }
    }).returning();
  },

  createMerchantWithOwner: async (tx: any, merchantData: any, userData: any) => {
      const [user] = await tx.insert(users).values(userData).onConflictDoUpdate({
          target: users.clerkUserId,
          set: { ...userData, updatedAt: new Date() }
      }).returning();

      const [merchant] = await tx.insert(merchants).values(merchantData).returning();

      await tx.insert(memberships).values({
          userId: user.id,
          merchantId: merchant.id,
          role: 'owner',
          joinedAt: new Date(),
      });

      return { user, merchant };
  }
};
