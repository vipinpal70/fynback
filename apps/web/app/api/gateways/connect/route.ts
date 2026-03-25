/**
 * POST /api/gateways/connect
 *
 * Validates gateway credentials, saves encrypted keys to gateway_connections,
 * then runs a historical sync for the current month's failed payments.
 *
 * Body: { gateway: 'razorpay', apiKey: string, apiSecret: string }
 *
 * Returns: { connectionId, gatewayName, testMode, webhookUrl, webhookSecret, sync }
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import { encrypt } from '@/lib/crypto';
import { validateCredentials, isTestKey } from '@/lib/gateways/razorpay';
import { syncGatewayHistory } from '@/lib/gateways/sync';
import { createDb, gatewayConnections, eq, and } from '@fynback/db';

const db = createDb(process.env.DATABASE_URL!);

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://app.fynback.com' : 'http://localhost:3000');

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { gateway, apiKey, apiSecret } = body as {
    gateway?: string;
    apiKey?: string;
    apiSecret?: string;
  };

  if (!gateway || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'gateway, apiKey, and apiSecret are required' },
      { status: 400 }
    );
  }

  if (!['razorpay', 'stripe', 'cashfree', 'payu'].includes(gateway)) {
    return NextResponse.json({ error: 'Unsupported gateway' }, { status: 400 });
  }

  const merchantId = await getMerchantIdFromClerkUserId(userId);
  if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

  // ── 1. Validate credentials ──────────────────────────────────────────────────
  if (gateway === 'razorpay') {
    const { valid, error } = await validateCredentials(apiKey, apiSecret);
    if (!valid) {
      return NextResponse.json({ error: error ?? 'Invalid credentials' }, { status: 422 });
    }
  }

  const testMode = isTestKey(apiKey);
  const webhookSecret = crypto.randomBytes(24).toString('hex');
  const webhookUrl = `${APP_URL}/api/webhooks/${gateway}`;

  // ── 2. Upsert gateway_connections ────────────────────────────────────────────
  // Drizzle requires raw SQL for ON CONFLICT on a unique index (not a constraint).
  // We use a manual upsert: try insert, catch conflict, then update.
  let conn: { id: string; webhookUrl: string | null } | null = null;

  try {
    const [inserted] = await db
      .insert(gatewayConnections)
      .values({
        merchantId,
        gatewayName: gateway as any,
        apiKeyEncrypted: encrypt(apiKey),
        apiSecretEncrypted: encrypt(apiSecret),
        webhookSecretEncrypted: encrypt(webhookSecret),
        webhookUrl,
        isActive: true,
        testMode,
        connectedAt: new Date(),
        disconnectedAt: null,
      })
      .returning({ id: gatewayConnections.id, webhookUrl: gatewayConnections.webhookUrl });
    conn = inserted;
  } catch (err: any) {
    // Unique violation (23505) — record exists, update it
    if (err?.code === '23505') {
      const [updated] = await db
        .update(gatewayConnections)
        .set({
          apiKeyEncrypted: encrypt(apiKey),
          apiSecretEncrypted: encrypt(apiSecret),
          webhookSecretEncrypted: encrypt(webhookSecret),
          webhookUrl,
          isActive: true,
          testMode,
          connectedAt: new Date(),
          disconnectedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(gatewayConnections.merchantId, merchantId),
            eq(gatewayConnections.gatewayName, gateway as any)
          )
        )
        .returning({ id: gatewayConnections.id, webhookUrl: gatewayConnections.webhookUrl });
      conn = updated;
    } else {
      throw err;
    }
  }

  if (!conn) throw new Error('Failed to save gateway connection');

  // ── 3. Sync current-month failed payments ────────────────────────────────────
  let syncResult = null;
  if (gateway === 'razorpay') {
    try {
      syncResult = await syncGatewayHistory(merchantId, conn.id, 'razorpay', apiKey, apiSecret);
    } catch (err) {
      console.error('[gateways/connect] sync error:', err);
      // Don't fail the connection — sync can be retried
    }
  }

  return NextResponse.json({
    connectionId: conn.id,
    gatewayName: gateway,
    testMode,
    webhookUrl,
    webhookSecret, // shown once — user copies into their gateway dashboard
    sync: syncResult,
  });
}
