import { NextResponse } from "next/server";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await getDb();
  return NextResponse.json({ ok: true });
}
