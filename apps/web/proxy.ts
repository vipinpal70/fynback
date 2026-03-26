import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)', '/invite/(.*)'])
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/onboarding(.*)'])
const isOnboardingRoute = createRouteMatcher(['/onboarding'])

export default clerkMiddleware(async (auth, req: NextRequest) => {
    const { userId, sessionClaims, redirectToSignIn } = await auth()

    // 1. Handle Unauthenticated users
    if (!userId && isProtectedRoute(req)) {
        return redirectToSignIn({ returnBackUrl: req.url })
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

        // If they are on a protected route but haven't finished onboarding, send to onboarding
        if (isProtectedRoute(req) && !onboardingComplete && !isOnboardingRoute(req)) {
            return NextResponse.redirect(new URL('/onboarding', req.url))
        }
    }

    const res = NextResponse.next()

    // Add merchant ID to headers if it exists in metadata
    const merchantId = (sessionClaims as any)?.metadata?.merchantId
    if (userId && merchantId) {
        res.headers.set('x-merchant-id', merchantId)
    }

    return res
})

export const config = {
    matcher: [
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        '/(api|trpc)(.*)',
    ],
}