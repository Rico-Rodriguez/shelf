import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, transactions } from "@/db/schema";
import { AuthError, requireWriter } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { nid } from "@/lib/ids";
import { dollarsToCents } from "@/lib/money";
import { applyManualAmount } from "@/lib/manual-balance";
import { snapshotNetWorth } from "@/lib/networth";
import { applyRulesToNewTx } from "@/lib/rules";
import { sealedTxWrite } from "@/lib/secrets";

export const dynamic = "force-dynamic";

function cells(line: string) {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out;
}

export async function POST(request: Request) {
  try {
    const dek = await requireWriter();
    const body = (await request.json()) as { accountId?: string; csv?: string };
    if (!body.accountId || !body.csv?.trim()) {
      return NextResponse.json({ error: "Choose an account and a CSV file." }, { status: 400 });
    }
    const lines = body.csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return NextResponse.json({ error: "The file needs a header and at least one row." }, { status: 400 });
    const header = cells(lines[0]).map((cell) => cell.toLowerCase());
    const dateIdx = header.findIndex((cell) => cell === "date");
    const nameIdx = header.findIndex((cell) => cell === "name" || cell === "description" || cell === "merchant");
    const amountIdx = header.findIndex((cell) => cell === "amount");
    const categoryIdx = header.findIndex((cell) => cell === "category");
    if (dateIdx < 0 || nameIdx < 0 || amountIdx < 0) {
      return NextResponse.json({ error: "CSV needs date, name, and amount columns." }, { status: 400 });
    }
    const db = await getDb();
    const cats = await db.select().from(categories);
    let created = 0;
    for (const line of lines.slice(1, 501)) {
      const row = cells(line);
      const name = row[nameIdx];
      const date = row[dateIdx] || todayISO();
      const amount = Number(String(row[amountIdx] ?? "").replace(/[$,]/g, ""));
      if (!name || !Number.isFinite(amount)) continue;
      const categoryName = categoryIdx >= 0 ? row[categoryIdx] : "";
      const category = cats.find((cat) => cat.name.toLowerCase() === categoryName.toLowerCase());
      const id = nid();
      const amountCents = dollarsToCents(amount);
      await db.insert(transactions).values({
        id,
        accountId: body.accountId,
        date,
        categoryId: category?.id,
        reviewed: false,
        hidden: false,
        isTransfer: category?.id === "cat-transfer" || category?.id === "cat-cc-payment",
        ...sealedTxWrite({ name, merchantName: name, notes: null, amountCents }, dek),
      });
      const patch = await applyRulesToNewTx(
        db,
        id,
        { name, merchantName: name, amountCents, accountId: body.accountId, categoryId: category?.id },
        dek,
      );
      if (Object.keys(patch).length) await db.update(transactions).set(patch).where(eq(transactions.id, id));
      await applyManualAmount(body.accountId, amountCents, dek, { snapshot: false });
      created += 1;
    }
    if (created) await snapshotNetWorth(dek);
    return NextResponse.json({ created });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
