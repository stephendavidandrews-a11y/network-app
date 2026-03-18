import { getToken } from "next-auth/jwt"
import { NextRequest, NextResponse } from "next/server"

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // NextAuth handler — must be open
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next()
  }

  // Ingest route — has its own API key auth
  if (pathname.startsWith("/api/ingest")) {
    return NextResponse.next()
  }

  // Public routes — intentionally unauthenticated
  if (pathname.startsWith("/api/public")) {
    return NextResponse.next()
  }

  // Health check — must be open for monitoring
  if (pathname.startsWith("/api/health")) {
    return NextResponse.next()
  }

  // All other API routes require JWT session
  if (pathname.startsWith("/api/")) {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
    })
    if (!token) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/api/:path*"],
}
