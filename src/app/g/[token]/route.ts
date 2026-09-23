import { NextResponse } from "next/server";
import { gateMatches, gateToken, publicOrigin } from "@/lib/gate";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!gateMatches(token, gateToken())) return new NextResponse(null, { status: 404 });
  const res = NextResponse.redirect(new URL("/", publicOrigin(request)));
  res.cookies.set("shelf_gate", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  return res;
}
