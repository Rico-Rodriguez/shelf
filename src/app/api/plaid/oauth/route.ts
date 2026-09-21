import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = new URL("/accounts", url.origin);
  url.searchParams.forEach((value, key) => next.searchParams.set(key, value));
  return NextResponse.redirect(next);
}
