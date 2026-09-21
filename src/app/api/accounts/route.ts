import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts, plaidItems } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { nid } from "@/lib/ids";
import { dollarsToCents } from "@/lib/money";
import { classifyAccount, snapshotNetWorth } from "@/lib/networth";
import { plaidConfigured, TRIAL_ITEM_LIMIT } from "@/lib/plaid";
import { openAccount, openInstitutionName, sealedAccountWrite } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dek = await requireDek();
    const db = await getDb();
    const rows = (await db.select().from(accounts)).map((row) => openAccount(row, dek));
    const items = (await db.select().from(plaidItems)).map((item) => ({
      id: item.id,
      institutionId: item.institutionId,
      institutionName: openInstitutionName(item.institutionName, dek),
      status: item.status,
      errorCode: item.errorCode,
      createdAt: item.createdAt,
    }));
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
    const dek = await requireDek();
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
    const balance = dollarsToCents(body.currentBalance ?? 0);
    await db.insert(accounts).values({
      id,
      type: body.type,
      subtype: body.subtype,
      includeInNetWorth: body.includeInNetWorth ?? true,
      isManual: true,
      manualKind: body.manualKind,
      ...sealedAccountWrite(
        {
          name: body.name,
          mask: body.mask ?? null,
          currentBalanceCents: balance,
          availableBalanceCents: null,
        },
        dek,
      ),
    });
    await snapshotNetWorth(dek);
    return NextResponse.json({ id, kind: classifyAccount(body.type) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
