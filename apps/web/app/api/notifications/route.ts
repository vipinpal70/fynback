import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createDb, eq, desc, and } from '@fynback/db';
import { notifications } from '@fynback/db';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';

const dbUrl = process.env.DATABASE_URL!;
const db = createDb(dbUrl);

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    const unreadOnly = false; // Could be a query param

    let conditions = eq(notifications.merchantId, merchantId);
    
    // In the future, if notifications are strictly mapped to users:
    // conditions = and(eq(notifications.merchantId, merchantId), eq(notifications.userId, ...))

    const recentNotifications = await db
      .select()
      .from(notifications)
      .where(conditions)
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    return NextResponse.json(recentNotifications);
  } catch (err) {
    console.error('[API] /api/notifications GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.merchantId, merchantId),
          eq(notifications.isRead, false)
        )
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API] /api/notifications PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
