import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createDb } from '@fynback/db';
import { notifications } from '@fynback/db';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';

const dbUrl = process.env.DATABASE_URL!;
const db = createDb(dbUrl);

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    const demoTypes = ['info', 'success', 'warning', 'error'] as const;
    const randomType = demoTypes[Math.floor(Math.random() * demoTypes.length)];

    const messages = {
        'info': 'Your weekly digest is ready to view.',
        'success': 'Payment of ₹2,500 was successfully recovered from priya@startup.in',
        'warning': 'Campaign "7-day aggressive" has low open rates currently.',
        'error': 'Stripe webhook failed to deliver after 3 attempts.'
    };
    
    const titles = {
        'info': 'Weekly Digest',
        'success': 'Payment Recovered',
        'warning': 'Campaign Alert',
        'error': 'Gateway Issue'
    };

    const newNotification = await db
      .insert(notifications)
      .values({
        merchantId,
        title: titles[randomType],
        message: messages[randomType],
        type: randomType,
        isRead: false,
      })
      .returning();

    return NextResponse.json({ success: true, notification: newNotification[0] });
  } catch (err) {
    console.error('[API] /api/notifications/demo POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
