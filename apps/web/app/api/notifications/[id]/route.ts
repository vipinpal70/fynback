import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createDb, eq, and } from '@fynback/db';
import { notifications } from '@fynback/db';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';

const dbUrl = process.env.DATABASE_URL!;
const db = createDb(dbUrl);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
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
          eq(notifications.id, id),
          eq(notifications.merchantId, merchantId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[API] /api/notifications/${id} PATCH error:`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  
    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }
  
    try {
      const merchantId = await getMerchantIdFromClerkUserId(userId);
      if (!merchantId) {
        return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
      }
  
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.merchantId, merchantId)
          )
        );
  
      return NextResponse.json({ success: true });
    } catch (err) {
      console.error(`[API] /api/notifications/${id} DELETE error:`, err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
