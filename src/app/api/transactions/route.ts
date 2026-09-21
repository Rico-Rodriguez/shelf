import { NextResponse } from "next/server";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, categories, tags, transactionSplits, transactionTags, transactions } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { nid } from "@/lib/ids";
import { dollarsToCents } from "@/lib/money";
import { applyRulesToNewTx } from "@/lib/rules";
import { todayISO } from "@/lib/dates";
import { openAccount, openSplit, openTx, sealedTxWrite } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const dek = await requireDek();
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const accountId = url.searchParams.get("accountId");
    const categoryId = url.searchParams.get("categoryId");
    const reviewed = url.searchParams.get("reviewed");
    const hidden = url.searchParams.get("hidden");
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    const db = await getDb();
    const filters = [];
    if (accountId) filters.push(eq(transactions.accountId, accountId));
    if (categoryId) filters.push(eq(transactions.categoryId, categoryId));
    if (reviewed === "true") filters.push(eq(transactions.reviewed, true));
    if (reviewed === "false") filters.push(eq(transactions.reviewed, false));
    if (hidden === "true") filters.push(eq(transactions.hidden, true));
    else filters.push(eq(transactions.hidden, false));
    if (start) filters.push(gte(transactions.date, start));
    if (end) filters.push(lte(transactions.date, end));
    if (end) filters.push(lte(transactions.date, end));

    const base = db
      .select()
      .from(transactions)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(transactions.date), desc(transactions.createdAt));
    const stored = q ? await base : await base.limit(limit).offset(offset);
    let rows = stored.map((tx) => openTx(tx, dek));
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((tx) =>
        `${tx.name} ${tx.merchantName ?? ""} ${tx.originalDescription ?? ""}`.toLowerCase().includes(needle),
      );
      rows = rows.slice(offset, offset + limit);
    }

    const [acctRows, catRows, splitRows, tagRows, txTags] = await Promise.all([
      db.select().from(accounts),
      db.select().from(categories),
      db.select().from(transactionSplits),
      db.select().from(tags),
      db.select().from(transactionTags),
    ]);
    const openedAccounts = acctRows.map((row) => openAccount(row, dek));
    const openedSplits = splitRows.map((row) => openSplit(row, dek));

    const data = rows.map((tx) => ({
      ...tx,
      account: openedAccounts.find((a) => a.id === tx.accountId) ?? null,
      category: catRows.find((c) => c.id === tx.categoryId) ?? null,
      splits: openedSplits.filter((s) => s.transactionId === tx.id),
      tags: txTags
        .filter((t) => t.transactionId === tx.id)
        .map((t) => tagRows.find((tag) => tag.id === t.tagId))
        .filter(Boolean),
    }));

    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.reviewed, false));

    return NextResponse.json({ transactions: data, unreviewed: Number(n) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const dek = await requireDek();
    const body = (await request.json()) as {
      accountId: string;
      name: string;
      amount: number;
      date?: string;
      categoryId?: string;
      notes?: string;
    };
    const db = await getDb();
    const id = nid();
    const amountCents = dollarsToCents(body.amount);
    await db.insert(transactions).values({
      id,
      accountId: body.accountId,
      date: body.date ?? todayISO(),
      categoryId: body.categoryId,
      reviewed: true,
      hidden: false,
      isTransfer: body.categoryId === "cat-transfer" || body.categoryId === "cat-cc-payment",
      ...sealedTxWrite(
        {
          name: body.name,
          merchantName: body.name,
          notes: body.notes ?? null,
          amountCents,
        },
        dek,
      ),
    });
    const patch = await applyRulesToNewTx(db, id, {
      name: body.name,
      merchantName: body.name,
      amountCents,
      accountId: body.accountId,
      categoryId: body.categoryId,
    }, dek);
    if (Object.keys(patch).length) {
      await db.update(transactions).set(patch).where(eq(transactions.id, id));
    }
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
