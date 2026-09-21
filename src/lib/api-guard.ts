import { NextResponse } from "next/server";
import { AuthError, requireUnlocked } from "./auth";

export async function withAuth<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    await requireUnlocked();
    const data = await fn();
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: "locked" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Server error";
    console.error(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
