import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { AuthError, requireWriter } from "@/lib/auth";
import { seedDemoHouse } from "@/lib/demo";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const dek = await requireWriter();
    const db = await getDb();
    const [account] = await db.select({ id: accounts.id }).from(accounts).limit(1);
    const [tx] = await db.select({ id: transactions.id }).from(transactions).limit(1);
    if (account || tx) {
      return NextResponse.json({ error: "Sample data only loads on an empty shelf." }, { status: 400 });
    }
    return NextResponse.json(await seedDemoHouse(dek));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
