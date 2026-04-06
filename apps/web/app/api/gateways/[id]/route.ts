/**
 * DELETE /api/gateways/[id]   — Disconnect a gateway
 * POST   /api/gateways/[id]   — Re-sync a connected gateway (body: { action: 'sync' })
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import { decrypt } from '@/lib/crypto';
import { syncGatewayHistory } from '@/lib/gateways/sync';
import { createDb, gatewayConnections, merchants, eq, and } from '@fynback/db';
import { cacheDelete } from '@/lib/cache/redis';

const db = createDb(process.env.DATABASE_URL!);

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const merchantId = await getMerchantIdFromClerkUserId(userId);
  if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

  const [conn] = await db
    .update(gatewayConnections)
    .set({ isActive: false, disconnectedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(gatewayConnections.id, id), eq(gatewayConnections.merchantId, merchantId)))
    .returning({ id: gatewayConnections.id });

  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  await cacheDelete(`gateways:${merchantId}`);
  await cacheDelete(`kpis:${merchantId}`);
  await cacheDelete(`settings:merchant:${merchantId}`);

  return NextResponse.json({ disconnected: true });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.action !== 'sync') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  const merchantId = await getMerchantIdFromClerkUserId(userId);
  if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

  const [conn] = await db
    .select()
    .from(gatewayConnections)
    .where(and(eq(gatewayConnections.id, id), eq(gatewayConnections.merchantId, merchantId)))
    .limit(1);

  if (!conn || !conn.isActive) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  if (!conn.apiKeyEncrypted || !conn.apiSecretEncrypted) {
    return NextResponse.json({ error: 'No credentials stored for this connection' }, { status: 422 });
  }

  const apiKey = decrypt(conn.apiKeyEncrypted);
  const apiSecret = decrypt(conn.apiSecretEncrypted);

  // Load merchant's current plan so the right campaign template is used
  const [merchant] = await db
    .select({ plan: merchants.plan })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);

  try {
    const result = await syncGatewayHistory(
      merchantId,
      conn.id,
      conn.gatewayName as 'razorpay',
      apiKey,
      apiSecret,
      merchant?.plan ?? 'trial',
    );
    return NextResponse.json({ synced: true, ...result });
  } catch (err) {
    console.error('[gateways/sync] error:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
