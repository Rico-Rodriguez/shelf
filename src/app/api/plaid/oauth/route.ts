import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/gate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = new URL("/accounts", publicOrigin(request));
  url.searchParams.forEach((value, key) => next.searchParams.set(key, value));
  return NextResponse.redirect(next);
}
