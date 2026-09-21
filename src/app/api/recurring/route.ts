import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { recurrences } from "@/db/schema";
import { AuthError, requireUnlocked } from "@/lib/auth";
import { nid } from "@/lib/ids";
import { detectRecurring, markRecurrencePaid } from "@/lib/recurring";
import { dollarsToCents } from "@/lib/money";
import { todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUnlocked();
    const db = await getDb();
    const rows = await db.select().from(recurrences);
    return NextResponse.json({ recurrences: rows.sort((a, b) => a.nextDate.localeCompare(b.nextDate)) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json()) as {
      action?: "detect" | "paid" | "create";
      id?: string;
      merchantName?: string;
      amount?: number;
      cadence?: string;
      nextDate?: string;
      categoryId?: string;
      accountId?: string;
      isIncome?: boolean;
    };
    if (body.action === "detect") {
      return NextResponse.json(await detectRecurring());
    }
    if (body.action === "paid" && body.id) {
      await markRecurrencePaid(body.id);
      return NextResponse.json({ ok: true });
    }
    const db = await getDb();
    const id = nid();
    await db.insert(recurrences).values({
      id,
      merchantName: body.merchantName || "Untitled",
      amountCents: dollarsToCents(body.amount ?? 0),
      cadence: body.cadence || "monthly",
      nextDate: body.nextDate || todayISO(),
      categoryId: body.categoryId,
      accountId: body.accountId,
      isIncome: body.isIncome ?? false,
      source: "manual",
    });
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function PATCH(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json()) as { id: string; isActive?: boolean; nextDate?: string; amount?: number };
    const db = await getDb();
    await db
      .update(recurrences)
      .set({
        isActive: body.isActive,
        nextDate: body.nextDate,
        amountCents: body.amount == null ? undefined : dollarsToCents(body.amount),
      })
      .where(eq(recurrences.id, body.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function DELETE(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json()) as { id: string };
    const db = await getDb();
    await db.delete(recurrences).where(eq(recurrences.id, body.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
