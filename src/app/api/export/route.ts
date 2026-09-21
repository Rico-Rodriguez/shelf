import { NextResponse } from "next/server";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { openAccount, openGoal, openRecurrence, openTx } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const dek = await requireDek();
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    const db = await getDb();
    const [accountRows, transactionRows, categories, goalRows, recurrenceRows] = await Promise.all([
      db.select().from(schema.accounts),
      db.select().from(schema.transactions),
      db.select().from(schema.categories),
      db.select().from(schema.goals),
      db.select().from(schema.recurrences),
    ]);
    const accounts = accountRows.map((row) => openAccount(row, dek));
    const transactions = transactionRows.map((row) => openTx(row, dek));
    const goals = goalRows.map((row) => openGoal(row, dek));
    const recurrences = recurrenceRows.map((row) => openRecurrence(row, dek));

    if (format === "csv") {
      const header = ["date", "name", "merchant", "amount", "category", "account", "reviewed", "hidden"];
      const lines = [header.join(",")];
      for (const tx of transactions) {
        const cat = categories.find((c) => c.id === tx.categoryId)?.name ?? "";
        const acct = accounts.find((a) => a.id === tx.accountId)?.name ?? "";
        const cells = [
          tx.date,
          csv(tx.name),
          csv(tx.merchantName ?? ""),
          (tx.amountCents / 100).toFixed(2),
          csv(cat),
          csv(acct),
          String(tx.reviewed),
          String(tx.hidden),
        ];
        lines.push(cells.join(","));
      }
      return new NextResponse(lines.join("\n"), {
        headers: {
          "content-type": "text/csv",
          "content-disposition": "attachment; filename=shelf-transactions.csv",
        },
      });
    }

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      accounts,
      transactions,
      categories,
      goals,
      recurrences,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

function csv(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
