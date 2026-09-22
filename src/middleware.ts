import { NextResponse, type NextRequest } from "next/server";
import { gateMatches, gateToken, publicOrigin } from "@/lib/gate";
import { googleConfigured } from "@/lib/google-config";

const INSIGHT_REDIRECTS: Record<string, string> = {
  "/cash-flow": "flow",
  "/reports": "month",
  "/investments": "holdings",
};

const PUBLIC = [
  "/login",
  "/join",
  "/setup",
  "/api/auth/session",
  "/api/auth/login",
  "/api/auth/setup",
  "/api/auth/totp",
  "/api/auth/google",
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
  if (pathname === "/api/plaid/webhook" || pathname.startsWith("/g/")) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/auth/google")) return NextResponse.next();
  if (!googleConfigured() && !gateMatches(request.cookies.get("shelf_gate")?.value, gateToken())) {
    return new NextResponse(null, { status: 404 });
  }
  if (
    PUBLIC.some((p) => pathname === p || pathname.startsWith("/_next") || pathname.startsWith("/icon")) ||
    pathname.startsWith("/setup/two-factor") ||
    pathname.startsWith("/api/auth/totp/")
  ) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/auth")) return NextResponse.next();
  const cookie = request.cookies.get("shelf_lock");
  if (!cookie && !pathname.startsWith("/api/")) {
    const login = new URL("/login", publicOrigin(request));
    return NextResponse.redirect(login);
  }
  const insightHash = INSIGHT_REDIRECTS[pathname];
  if (cookie && insightHash) {
    const dest = request.nextUrl.clone();
    dest.pathname = "/insights";
    dest.search = "";
    dest.hash = insightHash;
    return NextResponse.redirect(dest);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
