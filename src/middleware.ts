import { NextResponse, type NextRequest } from "next/server";
import { gateMatches, gateToken } from "@/lib/gate";
import { googleConfigured } from "@/lib/google-config";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/" || pathname === "/api/plaid/webhook" || pathname.startsWith("/g/")) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/auth/google")) return NextResponse.next();
  const gateOk =
    gateMatches(request.cookies.get("shelf_gate")?.value, gateToken()) ||
    gateMatches(request.headers.get("x-shelf-gate") ?? undefined, gateToken());
  if (!googleConfigured() && !gateOk) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
