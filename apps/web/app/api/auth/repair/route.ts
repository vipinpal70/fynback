/**
 * GET /api/auth/repair
 *
 * Breaks the infinite redirect loop that occurs when a returning user has
 * completed onboarding (merchant record exists in DB) but has lost both
 * onboarding signals the proxy uses:
 *   - sessionClaims.metadata.onboardingComplete (JWT not yet rotated, or
 *     Clerk session template not configured)
 *   - rcvrx_ob cookie (different browser, cleared cookies, etc.)
 *
 * The proxy redirects here instead of directly to /onboarding whenever a
 * protected non-onboarding route is accessed without those signals. This
 * handler is the single place that can hit the DB and set the cookie:
 *
 *   - merchant record found  → set rcvrx_ob cookie, redirect /dashboard
 *   - no merchant record     → redirect /onboarding (genuinely new user)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getMerchantIdFromClerkUserId } from '@/lib/merchant'

export async function GET(req: NextRequest) {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }

  const merchantId = await getMerchantIdFromClerkUserId(userId)

  if (merchantId) {
    // Onboarding was completed — repair the missing cookie so the proxy
    // won't redirect them again, then send them to the dashboard.
    const res = NextResponse.redirect(new URL('/dashboard', req.url))
    res.cookies.set('rcvrx_ob', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    return res
  }

  // Genuinely new user — send to onboarding.
  return NextResponse.redirect(new URL('/onboarding', req.url))
}
