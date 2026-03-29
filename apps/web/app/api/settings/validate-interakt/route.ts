/**
 * POST /api/settings/validate-interakt
 *
 * Body: { apiKey: string }
 *
 * Validates an Interakt API key by making a lightweight authenticated request
 * to Interakt's track/users endpoint. We don't send real data — just an empty
 * object. Interakt will:
 *   - Return 401/403  → key is invalid / not authorised
 *   - Return anything else (400, 422, 200) → key is valid (bad body, but authenticated)
 *
 * We deliberately do NOT proxy env keys — the key is sent directly from the
 * server-side so it is never exposed to the browser network tab.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ valid: false, message: 'Unauthorised' }, { status: 401 });
  }

  let apiKey: string;
  try {
    const body = await req.json();
    apiKey = (body.apiKey ?? '').trim();
  } catch {
    return NextResponse.json({ valid: false, message: 'Invalid request body' }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ valid: false, message: 'No API key provided' }, { status: 400 });
  }

  // Interakt uses HTTP Basic auth: base64(apiKey) — no username:password colon
  const basicToken = Buffer.from(apiKey).toString('base64');

  try {
    const res = await fetch('https://api.interakt.ai/v1/public/track/users/', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicToken}`,
        'Content-Type': 'application/json',
      },
      // Minimal dummy payload — we just need Interakt to verify auth
      body: JSON.stringify({ phoneNumber: '+911234567890', traits: {} }),
      // Don't wait forever — 8s is plenty
      signal: AbortSignal.timeout(8000),
    });

    // 401 or 403 = bad key
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({
        valid: false,
        message: 'Invalid API key. Please double-check your Interakt secret key.',
      });
    }

    // Any other status (200, 400, 422, 404, 500) means the key authenticated correctly
    return NextResponse.json({
      valid: true,
      message: 'API key verified successfully.',
    });
  } catch (err: any) {
    // Network error / timeout — don't block the user, let them save anyway
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return NextResponse.json({
        valid: true,
        message: 'Interakt is slow to respond — saving key anyway.',
        timedOut: true,
      });
    }
    console.error('[validate-interakt]', err);
    return NextResponse.json({
      valid: false,
      message: 'Could not reach Interakt. Please check your internet connection.',
    }, { status: 503 });
  }
}
