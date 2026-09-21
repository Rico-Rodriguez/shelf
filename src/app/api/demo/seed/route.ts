import { NextResponse } from "next/server";
import { AuthError, requireDek, requireWriter } from "@/lib/auth";
import { seedDemoHouse } from "@/lib/demo";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const dek = await requireWriter();
    return NextResponse.json(await seedDemoHouse(dek));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
