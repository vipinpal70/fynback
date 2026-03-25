import { clerkMiddleware, createRouteMatcher, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const isOnboardingRoute = createRouteMatcher(['/onboarding'])

// All routes that are public — no login required
const isPublicRoute = createRouteMatcher([
    '/',                     // landing page
    '/sign-in(.*)',          // Clerk sign-in
    '/sign-up(.*)',          // Clerk sign-up
    '/invite/(.*)',         // Invite acceptance
])

// Routes that require authentication
const isProtectedRoute = createRouteMatcher([
    '/dashboard(.*)',
    '/onboarding(.*)',
])

export default clerkMiddleware(async (auth, req: NextRequest) => {
    const { userId, isAuthenticated, sessionClaims, redirectToSignIn } = await auth()

    // 'rcvrx_ob' cookie is set by completeOnboarding() server action or this middleware.
    let onboardingComplete =
        req.cookies.get('rcvrx_ob')?.value === '1' ||
        (sessionClaims as any)?.metadata?.onboardingComplete === true

    // Authenticated users visiting /onboarding — let them through; the
    // onboarding layout handles the "already complete" redirect internally
    if (isAuthenticated && isOnboardingRoute(req)) {
        return NextResponse.next()
    }

    // Unauthenticated users on a protected route → send to sign-in
    if (!isAuthenticated && isProtectedRoute(req)) {
        return redirectToSignIn({ returnBackUrl: req.url })
    }

    // Authenticated users on a protected route who haven't finished onboarding
    if (isAuthenticated && isProtectedRoute(req) && !onboardingComplete) {
        // Fallback: Check Clerk API directly
        const client = await clerkClient();
        const user = await client.users.getUser(userId!);

        if (user.publicMetadata.onboardingComplete === true) {
            // Set the cookie in the response
            const res = NextResponse.next();
            res.cookies.set('rcvrx_ob', '1', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: 60 * 60 * 24 * 365,
            });
            return res;
        }

        const onboardingUrl = new URL('/onboarding', req.url)
        return NextResponse.redirect(onboardingUrl)
    }

    // [New] Add session headers for merchantId if available
    const res = NextResponse.next()
    const metadata = (sessionClaims as any)?.metadata
    if (userId && metadata?.merchantId) {
        res.headers.set('x-merchant-id', metadata.merchantId)
    }

    return res
})

export const config = {
    matcher: [
        // Skip Next.js internals and static files
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
}