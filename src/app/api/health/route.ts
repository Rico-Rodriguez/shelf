import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { plaidConfigured, plaidEnv } from "@/lib/plaid";

export const dynamic = "force-dynamic";

export async function GET() {
  await getDb();
  return NextResponse.json({
    ok: true,
    plaid: plaidConfigured(),
    plaidEnv: plaidConfigured() ? plaidEnv() : null,
  });
}
