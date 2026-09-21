import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { householdMembers, households, users } from "@/db/schema";
import type { MemberRole } from "./auth";

export async function ensureHousehold() {
  const db = await getDb();
  const members = await db.select().from(householdMembers);
  if (members.length) return members[0].householdId;
  const people = await db.select().from(users);
  if (!people.length) return null;
  const id = "hh-default";
  await db.insert(households).values({ id, name: "Household" }).onConflictDoNothing();
  for (let i = 0; i < people.length; i += 1) {
    await db
      .insert(householdMembers)
      .values({ householdId: id, userId: people[i].id, role: i === 0 ? "owner" : "member" })
      .onConflictDoNothing();
  }
  return id;
}

export async function roleForUser(userId: string): Promise<MemberRole> {
  const db = await getDb();
  await ensureHousehold();
  const [member] = await db.select().from(householdMembers).where(eq(householdMembers.userId, userId));
  if (member?.role === "advisor" || member?.role === "member" || member?.role === "owner") return member.role;
  return "owner";
}
