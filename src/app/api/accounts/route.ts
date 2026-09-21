import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts, plaidItems } from "@/db/schema";
import { AuthError, requireUnlocked } from "@/lib/auth";
import { nid } from "@/lib/ids";
import { dollarsToCents } from "@/lib/money";
import { classifyAccount, snapshotNetWorth } from "@/lib/networth";
import { plaidConfigured, TRIAL_ITEM_LIMIT } from "@/lib/plaid";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUnlocked();
    const db = await getDb();
    const rows = await db.select().from(accounts);
    const items = await db.select().from(plaidItems);
    return NextResponse.json({
      accounts: rows,
      items,
      itemCount: items.length,
      trialLimit: TRIAL_ITEM_LIMIT,
      plaidConfigured: plaidConfigured(),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json()) as {
      name: string;
      type: string;
      subtype?: string;
      mask?: string;
      currentBalance?: number;
      includeInNetWorth?: boolean;
      manualKind?: string;
    };
    if (!body.name || !body.type) {
      return NextResponse.json({ error: "Name and type are required." }, { status: 400 });
    }
    const db = await getDb();
    const id = nid();
    await db.insert(accounts).values({
      id,
      name: body.name,
      type: body.type,
      subtype: body.subtype,
      mask: body.mask,
      currentBalanceCents: dollarsToCents(body.currentBalance ?? 0),
      includeInNetWorth: body.includeInNetWorth ?? true,
      isManual: true,
      manualKind: body.manualKind,
    });
    await snapshotNetWorth();
    return NextResponse.json({ id, kind: classifyAccount(body.type) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
