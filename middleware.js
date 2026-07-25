import { NextResponse } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

// Routes that are reachable without a session. Everything else redirects to /login.
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/update-password',
  '/auth/callback',
  '/community',
  '/resource-hub',
  // Certificate verification (P9.5): whoever is checking a certificate is an
  // employer or admissions office, not a learner — requiring them to sign up
  // would defeat the point of the thing being verifiable.
  '/verify',
  '/sitemap.xml',
  '/manifest.json',
  '/robots.txt',
]

function isPublicPath(pathname) {
  if (PUBLIC_PATHS.includes(pathname)) return true
  // Public share pages: /u/<username>/...
  if (pathname.startsWith('/u/')) return true
  if (pathname.startsWith('/resource-hub/')) return true
  if (pathname.startsWith('/verify/')) return true
  if (pathname.startsWith('/auth/')) return true
  if (pathname.startsWith('/icons/')) return true
  return false
}

export async function middleware(request) {
  const { response, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Skip static assets and API routes (API routes do their own auth checks
    // and must return JSON 401s, not HTML redirects).
    '/((?!_next/static|_next/image|api/|favicon.ico|sw\\.js|workbox-.*\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
