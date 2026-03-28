import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)', '/invite/(.*)'])
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/onboarding(.*)'])
const isOnboardingRoute = createRouteMatcher(['/onboarding'])

/**
 * Reconstructs the public-facing URL from nginx's X-Forwarded-* headers.
 * Next.js runs on localhost:3000 behind nginx, so req.url is the internal
 * address. Without this, redirectToSignIn() produces a redirect_url that
 * points at localhost:3000, which Clerk rejects and confuses the merchant.
 */
function getPublicUrl(req: NextRequest): string {
    const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https'
    const forwardedHost = req.headers.get('x-forwarded-host') ?? req.headers.get('host')

    if (forwardedHost) {
        const proto = forwardedProto.split(',')[0].trim()
        return `${proto}://${forwardedHost}${req.nextUrl.pathname}${req.nextUrl.search}`
    }

    // Fallback: use NEXT_PUBLIC_APP_URL + path (safe for production)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fynback.com'
    return `${appUrl.replace(/\/$/, '')}${req.nextUrl.pathname}${req.nextUrl.search}`
}

export default clerkMiddleware(async (auth, req: NextRequest) => {
    const { userId, sessionClaims, redirectToSignIn } = await auth()

    // 1. Handle Unauthenticated users — use public URL so redirect_url is correct
    if (!userId && isProtectedRoute(req)) {
        return redirectToSignIn({ returnBackUrl: getPublicUrl(req) })
    }

    // 2. Determine onboarding status from JWT (Session Claims) OR cookie fallback.
    // The JWT is cached and may not reflect publicMetadata immediately after completeOnboarding runs.
    // The server action sets rcvrx_ob=1 cookie synchronously, so we use it as the source of truth
    // until the JWT refreshes on the next session rotation.
    // IMPORTANT: Ensure "publicMetadata" is added to your Session Tokens in Clerk Dashboard
    const onboardingComplete =
        (sessionClaims as any)?.metadata?.onboardingComplete === true ||
        req.cookies.get('rcvrx_ob')?.value === '1'

    // 3. Logic for Authenticated users
    if (userId) {
        // If they are on onboarding but already finished, send to dashboard
        if (isOnboardingRoute(req) && onboardingComplete) {
            return NextResponse.redirect(new URL('/dashboard', req.url))
        }

        // If they are on a protected route but haven't finished onboarding, route through
        // /api/auth/repair first. That handler does a DB check: if the user already has a
        // merchant record (returning user who lost their cookie/JWT claim) it sets the
        // rcvrx_ob cookie and sends them to /dashboard; otherwise it sends them to /onboarding.
        // This breaks the infinite loop that occurred when proxy→/onboarding and
        // onboarding/layout→/dashboard kept bouncing a returning user with a stale session.
        if (isProtectedRoute(req) && !onboardingComplete && !isOnboardingRoute(req)) {
            return NextResponse.redirect(new URL('/api/auth/repair', req.url))
        }
    }

    const res = NextResponse.next()

    // Add merchant ID to headers if it exists in metadata
    const merchantId = (sessionClaims as any)?.metadata?.merchantId
    if (userId && merchantId) {
        res.headers.set('x-merchant-id', merchantId)
    }

    return res
}, {
    // Tell the server-side Clerk SDK to route auth requests through your proxy.
    // Must match NEXT_PUBLIC_CLERK_PROXY_URL in .env
    proxyUrl: process.env.NEXT_PUBLIC_CLERK_PROXY_URL,
})

export const config = {
    matcher: [
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        '/(api|trpc)(.*)',
    ],
}