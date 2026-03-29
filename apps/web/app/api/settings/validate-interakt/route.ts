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

  // The Interakt "Secret Key" from Settings → Developer Setting is already the
  // complete base64-encoded Basic Auth token. Just prepend "Basic ".
  // Do NOT re-encode it — that would double-encode and produce garbage auth.

  try {
    const res = await fetch('https://api.interakt.ai/v1/public/track/users/', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // Minimal dummy payload — just need Interakt to authenticate the request.
      // userId is required; phoneNumber + countryCode are optional.
      body: JSON.stringify({ userId: 'fynback_validation_probe', traits: {} }),
      signal: AbortSignal.timeout(8000),
    });

    // 401 = key is genuinely wrong / doesn't exist
    if (res.status === 401) {
      return NextResponse.json({
        valid: false,
        message: 'Invalid API key — it was not recognised by Interakt. Please copy the Secret Key from Interakt → Settings → Developer Setting.',
      });
    }

    // 403 often means the plan doesn't allow API access (e.g. Starter / free trial).
    // We can't prove the key is wrong — save it with a warning.
    if (res.status === 403) {
      return NextResponse.json({
        valid: true,
        warning: true,
        message: 'Key accepted — note that Interakt Public APIs require the Growth plan or above. WhatsApp sending will work once your Interakt account is on a paid plan.',
      });
    }

    // Any other response (200, 400, 422, 429, 5xx) = key authenticated.
    // 400 = key valid but body was invalid — expected with our dummy payload.
    // 429 = rate limited but authenticated.
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
