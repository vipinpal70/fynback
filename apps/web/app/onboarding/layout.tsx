/**
 * app/onboarding/layout.tsx
 *
 * Server-side guard for the /onboarding route.
 *
 * WHY THIS EXISTS (and why proxy.ts alone is not enough):
 * proxy.ts checks two signals to decide whether onboarding is complete:
 *   1. sessionClaims.metadata.onboardingComplete — only present if the Clerk
 *      Dashboard session token template is configured to include publicMetadata,
 *      AND the JWT has been rotated since the metadata was written.
 *   2. rcvrx_ob cookie — only present in the same browser where the user
 *      originally completed onboarding.
 *
 * Either signal can be missing (different device, cleared cookies, session
 * template not configured). When both are absent, proxy.ts cannot distinguish
 * a genuinely new user from a returning user whose session state was lost —
 * so it sends them to /onboarding.
 *
 * This layout is the authoritative guard: if the user already has a merchant
 * record in the database, they have completed onboarding. Full stop. We
 * redirect them to /dashboard regardless of JWT or cookie state.
 *
 * getMerchantIdFromClerkUserId uses Redis (30-min TTL), so this check is
 * fast (<1ms on cache hit) and does not add a DB query to every render.
 */

import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getMerchantIdFromClerkUserId } from '@/lib/merchant'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()

  // Middleware already redirects unauthenticated users to sign-in.
  // This guard handles the edge case where auth() returns no userId inside
  // the layout before middleware runs (e.g. during static generation passes).
  if (!userId) {
    redirect('/sign-in')
  }

  // DB is the source of truth. If this user has a merchant record they have
  // already completed onboarding — send them straight to the dashboard.
  const merchantId = await getMerchantIdFromClerkUserId(userId)
  if (merchantId) {
    redirect('/dashboard')
  }

  return <>{children}</>
}
