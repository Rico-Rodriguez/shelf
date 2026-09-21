import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { householdInvites, householdMembers, households, users } from "@/db/schema";
import { AuthError, getSession, requireOwner, requireUnlocked } from "@/lib/auth";
import { ensureHousehold } from "@/lib/household";

export const dynamic = "force-dynamic";

function denied(err: unknown) {
  if (!(err instanceof AuthError)) return null;
  const forbidden = err.message === "forbidden";
  return NextResponse.json({ error: forbidden ? "You have view-only access." : "locked" }, { status: forbidden ? 403 : 401 });
}

export async function GET() {
  try {
    const session = await requireUnlocked();
    const db = await getDb();
    const householdId = await ensureHousehold();
    const [home] = householdId ? await db.select().from(households).where(eq(households.id, householdId)) : [];
    const members = await db.select().from(householdMembers);
    const people = await db.select().from(users);
    const invites = await db.select().from(householdInvites);
    return NextResponse.json({
      household: home ?? null,
      role: session.role ?? "owner",
      members: members.map((member) => {
        const person = people.find((user) => user.id === member.userId);
        return {
          userId: member.userId,
          role: member.role,
          name: person?.displayName || person?.googleEmail || "Member",
          email: person?.googleEmail ?? null,
        };
      }),
      invites: invites.map((invite) => ({
        id: invite.id,
        role: invite.role,
        expiresAt: invite.expiresAt,
      })),
    });
  } catch (err) {
    const response = denied(err);
    if (response) return response;
    throw err;
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    await requireOwner();
    const body = (await request.json()) as { userId?: string; inviteId?: string };
    const db = await getDb();
    if (body.inviteId) {
      await db.delete(householdInvites).where(eq(householdInvites.id, body.inviteId));
      return NextResponse.json({ ok: true });
    }
    if (!body.userId || body.userId === session.userId) {
      return NextResponse.json({ error: "Choose another member." }, { status: 400 });
    }
    const members = await db.select().from(householdMembers);
    const target = members.find((member) => member.userId === body.userId);
    const owners = members.filter((member) => member.role === "owner");
    if (target?.role === "owner" && owners.length < 2) {
      return NextResponse.json({ error: "The household needs an owner." }, { status: 400 });
    }
    await db.delete(householdMembers).where(eq(householdMembers.userId, body.userId));
    await db.delete(users).where(eq(users.id, body.userId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const response = denied(err);
    if (response) return response;
    throw err;
  }
}
