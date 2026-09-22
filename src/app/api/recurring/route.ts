import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { recurrences, transactions } from "@/db/schema";
import { AuthError, requireDek, requireWriter } from "@/lib/auth";
import { nid } from "@/lib/ids";
import { confirmRecurring, markRecurrencePaid, previewRecurring, type RecurrenceDraft } from "@/lib/recurring";
import { dollarsToCents } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { inferRecurringKind, merchantKey, priceDrift } from "@/lib/plan";
import { openRecurrence, openTx, sealedRecurrenceWrite } from "@/lib/secrets";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dek = await requireDek();
    const db = await getDb();
    const rows = (await db.select().from(recurrences)).map((row) => openRecurrence(row, dek));
    const txs = (await db.select().from(transactions)).map((row) => openTx(row, dek));
    const enriched = rows.map((row) => {
      const key = merchantKey(row.merchantName);
      const last = txs
        .filter((tx) => !tx.pending && merchantKey(tx.merchantName || tx.name) === key)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      return {
        ...row,
        kind: row.kind || "bill",
        priceDeltaCents: last ? priceDrift(row.amountCents, Math.abs(last.amountCents)) : null,
      };
    });
    return NextResponse.json({ recurrences: enriched.sort((a, b) => a.nextDate.localeCompare(b.nextDate)) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const dek = await requireWriter();
    const body = (await request.json()) as {
      action?: "detect" | "confirm" | "paid" | "create";
      id?: string;
      merchantName?: string;
      amount?: number;
      cadence?: string;
      nextDate?: string;
      categoryId?: string;
      accountId?: string;
      isIncome?: boolean;
      kind?: "bill" | "subscription";
      suggestions?: RecurrenceDraft[];
    };
    if (body.action === "detect") {
      return NextResponse.json({ suggestions: await previewRecurring(dek) });
    }
    if (body.action === "confirm") {
      return NextResponse.json(await confirmRecurring(dek, body.suggestions ?? []));
    }
    if (body.action === "paid" && body.id) {
      await markRecurrencePaid(body.id);
      return NextResponse.json({ ok: true });
    }
    const db = await getDb();
    const id = nid();
    await db.insert(recurrences).values({
      id,
      ...sealedRecurrenceWrite(
        { merchantName: body.merchantName || "Untitled", amountCents: dollarsToCents(body.amount ?? 0) },
        dek,
      ),
      cadence: body.cadence || "monthly",
      nextDate: body.nextDate || todayISO(),
      categoryId: body.categoryId,
      accountId: body.accountId,
      isIncome: body.isIncome ?? false,
      source: "manual",
      kind: body.kind ?? inferRecurringKind({ isIncome: body.isIncome ?? false, cadence: body.cadence || "monthly", amountCents: dollarsToCents(body.amount ?? 0) }),
    });
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function PATCH(request: Request) {
  try {
    const dek = await requireWriter();
    const body = (await request.json()) as {
      id: string;
      isActive?: boolean;
      nextDate?: string;
      amount?: number;
      merchantName?: string;
      cadence?: string;
      isIncome?: boolean;
      categoryId?: string | null;
      accountId?: string | null;
      kind?: "bill" | "subscription";
    };
    const db = await getDb();
    const [existing] = await db.select().from(recurrences).where(eq(recurrences.id, body.id));
    if (!existing) return NextResponse.json({ error: "missing" }, { status: 404 });
    const opened = openRecurrence(existing, dek);
    const sensitive = body.amount != null || body.merchantName != null;
    await db
      .update(recurrences)
      .set({
        ...(sensitive
          ? sealedRecurrenceWrite(
              {
                merchantName: body.merchantName ?? opened.merchantName,
                amountCents: body.amount == null ? opened.amountCents : dollarsToCents(body.amount),
              },
              dek,
            )
          : {}),
        isActive: body.isActive,
        nextDate: body.nextDate,
        cadence: body.cadence,
        isIncome: body.isIncome,
        categoryId: body.categoryId,
        accountId: body.accountId,
        ...(body.kind ? { kind: body.kind } : {}),
      })
      .where(eq(recurrences.id, body.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function DELETE(request: Request) {
  try {
    await requireWriter();
    const body = (await request.json()) as { id: string };
    const db = await getDb();
    await db.delete(recurrences).where(eq(recurrences.id, body.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}
