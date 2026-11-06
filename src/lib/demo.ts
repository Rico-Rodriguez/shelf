import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  budgetItems,
  budgetMonths,
  goals,
  goalAccounts,
  holdings,
  netWorthSnapshots,
  recurrences,
  securities,
  settings,
  tags,
  transactionTags,
  transactions,
} from "@/db/schema";
import { getOrCreateBudgetMonth } from "./budget";
import { nid } from "./ids";
import { addDays, addMonths, todayISO, yearMonth } from "./dates";
import { snapshotNetWorth } from "./networth";
import { openBudgetMonth, prepareVault, sealedBudgetItemWrite, sealedBudgetMonthWrite, sealedSettingsIncome } from "./secrets";

export async function seedDemoHouse(dek: Buffer) {
  const db = await getDb();

  const checking = nid();
  const savings = nid();
  const card = nid();
  const brokerage = nid();
  const house = nid();
  const car = nid();

  await db.insert(accounts).values([
    { id: checking, name: "Everyday checking", type: "depository", subtype: "checking", mask: "2144", currentBalanceCents: 428_550, availableBalanceCents: 412_200, isManual: true, officialName: "Sample checking", isSample: true },
    { id: savings, name: "Rainy day savings", type: "depository", subtype: "savings", mask: "8831", currentBalanceCents: 1_250_000, isManual: true, isSample: true },
    { id: card, name: "Kitchen table card", type: "credit", subtype: "credit card", mask: "4412", currentBalanceCents: 186_440, isManual: true, isSample: true },
    { id: brokerage, name: "Brokerage", type: "investment", subtype: "brokerage", mask: "1022", currentBalanceCents: 4_812_300, isManual: true, isSample: true },
    { id: house, name: "The cottage", type: "other", subtype: "property", currentBalanceCents: 42_000_000, isManual: true, manualKind: "property", isSample: true },
    { id: car, name: "Blue hatchback", type: "other", subtype: "vehicle", currentBalanceCents: 1_100_000, isManual: true, manualKind: "vehicle", isSample: true },
  ]);

  const { year, month } = yearMonth();

  const samples: { days: number; name: string; amount: number; categoryId: string; accountId: string; reviewed?: boolean }[] = [
    { days: 2, name: "Neighborhood grocer", amount: 6421, categoryId: "cat-groceries", accountId: checking },
    { days: 5, name: "Neighborhood grocer", amount: 5890, categoryId: "cat-groceries", accountId: checking },
    { days: 9, name: "Corner cafe", amount: 612, categoryId: "cat-coffee", accountId: card },
    { days: 11, name: "Noodle house", amount: 2840, categoryId: "cat-restaurants", accountId: card },
    { days: 1, name: "Paycheck", amount: -320000, categoryId: "cat-paycheck", accountId: checking, reviewed: true },
    { days: 32, name: "Paycheck", amount: -320000, categoryId: "cat-paycheck", accountId: checking, reviewed: true },
    { days: 63, name: "Paycheck", amount: -320000, categoryId: "cat-paycheck", accountId: checking, reviewed: true },
    { days: 3, name: "Landlord", amount: 185000, categoryId: "cat-rent", accountId: checking, reviewed: true },
    { days: 34, name: "Landlord", amount: 185000, categoryId: "cat-rent", accountId: checking, reviewed: true },
    { days: 65, name: "Landlord", amount: 185000, categoryId: "cat-rent", accountId: checking, reviewed: true },
    { days: 6, name: "City Power", amount: 9820, categoryId: "cat-utilities", accountId: checking, reviewed: true },
    { days: 37, name: "City Power", amount: 10110, categoryId: "cat-utilities", accountId: checking, reviewed: true },
    { days: 68, name: "City Power", amount: 9440, categoryId: "cat-utilities", accountId: checking, reviewed: true },
    { days: 4, name: "Stream", amount: 1599, categoryId: "cat-streaming", accountId: card, reviewed: true },
    { days: 35, name: "Stream", amount: 1599, categoryId: "cat-streaming", accountId: card, reviewed: true },
    { days: 66, name: "Stream", amount: 1599, categoryId: "cat-streaming", accountId: card, reviewed: true },
    { days: 8, name: "Fill-up", amount: 4210, categoryId: "cat-gas", accountId: card },
    { days: 14, name: "Book nook", amount: 1899, categoryId: "cat-shopping", accountId: card },
    { days: 16, name: "Pharmacy", amount: 1240, categoryId: "cat-medical", accountId: card },
    { days: 18, name: "Thrift sweater", amount: 3200, categoryId: "cat-clothing", accountId: card },
    { days: 7, name: "Phone co", amount: 5400, categoryId: "cat-phone", accountId: checking, reviewed: true },
    { days: 38, name: "Phone co", amount: 5400, categoryId: "cat-phone", accountId: checking, reviewed: true },
    { days: 69, name: "Phone co", amount: 5400, categoryId: "cat-phone", accountId: checking, reviewed: true },
    { days: 10, name: "Interest", amount: -420, categoryId: "cat-interest", accountId: savings, reviewed: true },
    { days: 12, name: "Card payment", amount: 15000, categoryId: "cat-cc-payment", accountId: checking, reviewed: true },
    { days: 20, name: "Arcade night", amount: 3600, categoryId: "cat-entertainment", accountId: card },
    { days: 22, name: "Pet biscuits", amount: 2100, categoryId: "cat-pets", accountId: card },
  ];

  for (const s of samples) {
    await db.insert(transactions).values({
      id: nid(),
      accountId: s.accountId,
      amountCents: s.amount,
      date: addDays(todayISO(), -s.days),
      name: s.name,
      merchantName: s.name,
      originalDescription: s.name.toUpperCase(),
      categoryId: s.categoryId,
      reviewed: s.reviewed ?? false,
      hidden: false,
      isTransfer: s.categoryId === "cat-cc-payment",
      pending: false,
      isSample: true,
    });
  }

  const vacation = nid();
  const debt = nid();
  await db.insert(goals).values([
    { id: vacation, name: "Cabin week", kind: "save_up", targetCents: 1_800_000, targetDate: addDays(todayISO(), 180), isSample: true },
    { id: debt, name: "Clear the card", kind: "pay_down", targetCents: 0, isSample: true },
  ]);
  await db.insert(goalAccounts).values([
    { goalId: vacation, accountId: savings },
    { goalId: debt, accountId: card },
  ]);

  const vti = nid();
  const bond = nid();
  await db.insert(securities).values([
    { id: vti, name: "Total market", ticker: "VTI", type: "etf", closePriceCents: 26500, isSample: true },
    { id: bond, name: "Quiet bonds", ticker: "BND", type: "etf", closePriceCents: 7200, isSample: true },
  ]);
  await db.insert(holdings).values([
    { id: nid(), accountId: brokerage, securityId: vti, quantity: "142.5", costBasisCents: 3_200_000, institutionValueCents: 3_776_250, institutionPriceCents: 26500, isSample: true },
    { id: nid(), accountId: brokerage, securityId: bond, quantity: "144", costBasisCents: 980_000, institutionValueCents: 1_036_800, institutionPriceCents: 7200, isSample: true },
  ]);

  await db.insert(recurrences).values([
    { id: nid(), merchantName: "Landlord", categoryId: "cat-rent", accountId: checking, amountCents: 185000, cadence: "monthly", nextDate: addDays(todayISO(), 12), isIncome: false, source: "detected", lastPaidDate: addDays(todayISO(), -18), isSample: true },
    { id: nid(), merchantName: "Stream", categoryId: "cat-streaming", accountId: card, amountCents: 1599, cadence: "monthly", nextDate: addDays(todayISO(), 8), isIncome: false, source: "detected", isSample: true },
    { id: nid(), merchantName: "Paycheck", categoryId: "cat-paycheck", accountId: checking, amountCents: 320000, cadence: "monthly", nextDate: addDays(todayISO(), 14), isIncome: true, source: "detected", isSample: true },
  ]);

  const cozy = nid();
  await db.insert(tags).values({ id: cozy, name: "cozy", color: "#D4847C", isSample: true });
  const groceryTx = await db.select().from(transactions);
  const firstGroc = groceryTx.find((t) => t.categoryId === "cat-groceries");
  if (firstGroc) {
    await db.insert(transactionTags).values({ transactionId: firstGroc.id, tagId: cozy });
  }

  const openedMonth = await getOrCreateBudgetMonth(year, month, dek);
  const plans: Record<string, number> = {
    "cat-rent": 185_000,
    "cat-utilities": 11_000,
    "cat-groceries": 18_000,
    "cat-restaurants": 4_000,
    "cat-coffee": 1_500,
    "cat-gas": 6_000,
    "cat-shopping": 3_000,
    "cat-clothing": 4_000,
    "cat-medical": 2_000,
    "cat-pets": 2_500,
    "cat-entertainment": 3_000,
    "cat-streaming": 1_600,
    "cat-phone": 5_400,
  };
  const plannedItems = await db.select().from(budgetItems).where(eq(budgetItems.budgetMonthId, openedMonth.id));
  for (const item of plannedItems) {
    const planned = plans[item.categoryId];
    if (!planned) continue;
    await db.update(budgetItems).set({ ...sealedBudgetItemWrite(planned, 0, dek), isSample: true }).where(eq(budgetItems.id, item.id));
  }

  await db
    .update(budgetMonths)
    .set({ ...sealedBudgetMonthWrite(320_000, dek, openedMonth.flexPoolCents ?? 0), isSample: true })
    .where(eq(budgetMonths.id, openedMonth.id));

  await snapshotNetWorth(dek);
  await db.update(netWorthSnapshots).set({ isSample: true }).where(eq(netWorthSnapshots.date, todayISO()));
  const prev = addMonths(year, month, -1);
  await db.insert(netWorthSnapshots).values({
    id: nid(),
    date: `${prev.year}-${String(prev.month).padStart(2, "0")}-15`,
    assetsCents: 48_900_000,
    liabilitiesCents: 210_000,
    netWorthCents: 48_690_000,
    isSample: true,
  }).onConflictDoNothing();

  await db.update(settings).set({ demoLoaded: true, plannedIncomeCents: 320000 }).where(eq(settings.id, "default"));
  await prepareVault(dek);
  return { ok: true, already: false };
}

/** Delete rows the sample seed marked, and leave anything the person added. */
export async function clearDemoHouse(dek: Buffer) {
  const db = await getDb();
  await db.delete(transactions).where(eq(transactions.isSample, true));
  await db.delete(recurrences).where(eq(recurrences.isSample, true));
  await db.delete(goals).where(eq(goals.isSample, true));
  await db.delete(holdings).where(eq(holdings.isSample, true));

  const held = new Set((await db.select({ id: holdings.securityId }).from(holdings)).map((row) => row.id));
  const sampleSecs = await db.select({ id: securities.id }).from(securities).where(eq(securities.isSample, true));
  for (const row of sampleSecs) {
    if (!held.has(row.id)) await db.delete(securities).where(eq(securities.id, row.id));
  }

  await db.delete(tags).where(eq(tags.isSample, true));
  await db.delete(netWorthSnapshots).where(eq(netWorthSnapshots.isSample, true));

  const liveTx = new Set((await db.select({ id: transactions.accountId }).from(transactions)).map((row) => row.id));
  const liveHold = new Set((await db.select({ id: holdings.accountId }).from(holdings)).map((row) => row.id));
  const liveBills = new Set(
    (await db.select({ id: recurrences.accountId }).from(recurrences))
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id)),
  );
  const sampleAccounts = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.isSample, true));
  for (const row of sampleAccounts) {
    if (liveTx.has(row.id) || liveHold.has(row.id) || liveBills.has(row.id)) continue;
    await db.delete(accounts).where(eq(accounts.id, row.id));
  }

  const months = await db.select().from(budgetMonths);
  // Keep the saved income only when a month the person planned themselves has one.
  const keptIncome = months.some((month) => !month.isSample && openBudgetMonth(month, dek).plannedIncomeCents > 0);
  for (const month of months) {
    if (!month.isSample) continue;
    const opened = openBudgetMonth(month, dek);
    await db
      .update(budgetMonths)
      .set({ ...sealedBudgetMonthWrite(0, dek, opened.flexPoolCents ?? 0), isSample: false })
      .where(eq(budgetMonths.id, month.id));
  }
  const sampleItems = await db.select().from(budgetItems).where(eq(budgetItems.isSample, true));
  for (const item of sampleItems) {
    // Rollover on a sample item came from sample spending against a sample plan.
    await db
      .update(budgetItems)
      .set({ ...sealedBudgetItemWrite(0, 0, dek), isSample: false })
      .where(eq(budgetItems.id, item.id));
  }

  await db
    .update(settings)
    .set(keptIncome ? { demoLoaded: false } : { demoLoaded: false, ...sealedSettingsIncome(0, dek) })
    .where(eq(settings.id, "default"));
  return { ok: true };
}
