/**
 * GET  /api/gateways/[id]/webhook-secret — reveal the current webhook secret
 * POST /api/gateways/[id]/webhook-secret — rotate (generate a new one)
 *
 * WHY NOT return the secret in the main gateways list API:
 * The secret is a credential. It should only be fetched explicitly when the
 * merchant needs to configure their gateway dashboard — not on every page load.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import { encrypt, decrypt } from '@/lib/crypto';
import { createDb, gatewayConnections, eq, and } from '@fynback/db';

const db = createDb(process.env.DATABASE_URL!);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const merchantId = await getMerchantIdFromClerkUserId(userId);
  if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

  const [conn] = await db
    .select({ webhookSecretEncrypted: gatewayConnections.webhookSecretEncrypted })
    .from(gatewayConnections)
    .where(and(eq(gatewayConnections.id, id), eq(gatewayConnections.merchantId, merchantId)))
    .limit(1);

  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  if (!conn.webhookSecretEncrypted) {
    return NextResponse.json({ error: 'No webhook secret set — reconnect to generate one' }, { status: 404 });
  }

  const webhookSecret = decrypt(conn.webhookSecretEncrypted);
  return NextResponse.json({ webhookSecret });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const merchantId = await getMerchantIdFromClerkUserId(userId);
  if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

  const newSecret = crypto.randomBytes(24).toString('hex');

  const [conn] = await db
    .update(gatewayConnections)
    .set({ webhookSecretEncrypted: encrypt(newSecret), updatedAt: new Date() })
    .where(and(eq(gatewayConnections.id, id), eq(gatewayConnections.merchantId, merchantId)))
    .returning({ id: gatewayConnections.id });

  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  return NextResponse.json({ webhookSecret: newSecret });
}
