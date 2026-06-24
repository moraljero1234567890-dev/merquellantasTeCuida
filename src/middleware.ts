import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check for the next-auth session token cookie.
  // Auth.js v5 splits a large JWT into chunked cookies — `authjs.session-token.0`,
  // `.1`, … (or the `__Secure-` variants) — and in that case the un-chunked name
  // doesn't exist. Match by prefix so chunked sessions count as present; otherwise
  // those users get a false 401 here even though their session is valid. The real
  // validation still happens via auth() inside each route.
  const token = request.cookies
    .getAll()
    .find(
      (c) =>
        (c.name.startsWith('authjs.session-token') ||
          c.name.startsWith('__Secure-authjs.session-token')) &&
        Boolean(c.value),
    )?.value;

  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/users/bootstrap-upload') ||
    pathname.startsWith('/aprobar-solicitud') ||
    pathname.startsWith('/api/solicitudes/by-token') ||
    pathname.startsWith('/polla') ||
    pathname.startsWith('/api/polla')
  ) {
    return NextResponse.next();
  }

  // Protect dashboard and API routes — redirect to login if no session
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const loginUrl = new URL('/auth/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/aprobar-solicitud/:path*', '/api/((?!auth).*)'],
};
