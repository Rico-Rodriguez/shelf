import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [
  "/login",
  "/setup",
  "/api/auth/session",
  "/api/auth/login",
  "/api/auth/setup",
  "/api/health",
  "/api/plaid/webhook",
  "/api/plaid/oauth",
  "/manifest.webmanifest",
  "/sw.js",
  "/icon.svg",
  "/apple-touch-icon.png",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    PUBLIC.some((p) => pathname === p || pathname.startsWith("/_next") || pathname.startsWith("/icon"))
  ) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/auth")) return NextResponse.next();
  const cookie = request.cookies.get("shelf_lock");
  if (!cookie && !pathname.startsWith("/api/")) {
    const login = new URL("/login", request.url);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
