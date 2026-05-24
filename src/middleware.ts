import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check for the next-auth session token cookie
  const token =
    request.cookies.get('authjs.session-token')?.value ||
    request.cookies.get('__Secure-authjs.session-token')?.value;

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
