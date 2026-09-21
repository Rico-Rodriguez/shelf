import { NextResponse } from "next/server";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { AuthError, requireUnlocked } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireUnlocked();
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    const db = await getDb();
    const [accounts, transactions, categories, goals, recurrences] = await Promise.all([
      db.select().from(schema.accounts),
      db.select().from(schema.transactions),
      db.select().from(schema.categories),
      db.select().from(schema.goals),
      db.select().from(schema.recurrences),
    ]);

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
