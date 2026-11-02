import { cachePaths, peek, retainWrites, writeCache } from "./api";
import { heldUnreviewedCount } from "./review-outbox";

type CountBody = { unreviewed: number };
type DashLike = {
  transactions: { id: string; name: string; amountCents: number; date: string }[];
  budget: { plannedCents: number; spentCents: number; remainingCents: number };
  cashFlow: { incomeCents: number; spendingCents: number; savedCents: number };
  spending?: { id: string; name: string; cents: number; color: string }[];
  unreviewed: { count: number };
};

export type QuickLog = {
  tempId: string;
  name: string;
  amountCents: number;
  date: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountId: string;
  accountName: string;
  amount: string;
  merchant: string;
  isIncome: boolean;
};

type AccountPatch = Record<string, boolean>;
type AccountsBody = { accounts: ({ id: string } & Record<string, unknown>)[] };

const accountOverlays = new Map<string, AccountPatch>();
let unreviewedPin: number | null = null;
let localWrite = false;
let quickLogs: QuickLog[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeLive(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function sameCharge(row: { name: string; amountCents: number; date: string }, log: QuickLog) {
  return row.name === log.name && row.amountCents === log.amountCents && row.date === log.date;
}

function asCharge(log: QuickLog) {
  return {
    id: log.tempId,
    name: log.name,
    merchantName: log.name,
    amountCents: log.amountCents,
    date: log.date,
    pending: false,
    reviewed: true,
    hidden: false,
    categoryId: log.categoryId,
    category: log.categoryName ? { name: log.categoryName, color: log.categoryColor } : null,
    account: { name: log.accountName },
    notes: null,
    goalId: null,
    isTransfer: false,
    transferPairId: null,
    originalDescription: null,
    tags: [] as { name: string }[],
    splits: [] as { categoryId: string | null; amountCents: number }[],
  };
}

export function stageQuickLog(log: QuickLog) {
  quickLogs = [log, ...quickLogs.filter((row) => row.tempId !== log.tempId)];
  emit();
}

export function dropQuickLog(tempId: string) {
  quickLogs = quickLogs.filter((row) => row.tempId !== tempId);
  emit();
}

export function settleQuickLog(log: QuickLog) {
  const seen = cachePaths().some((path) => {
    if (path.startsWith("/api/dashboard")) {
      const dash = peek<DashLike>(path);
      return Boolean(dash?.transactions?.some((row) => sameCharge(row, log)));
    }
    if (path.startsWith("/api/transactions") && !path.includes("countOnly")) {
      const body = peek<{ transactions?: { name: string; amountCents: number; date: string }[] }>(path);
      return Boolean(body?.transactions?.some((row) => sameCharge(row, log)));
    }
    return false;
  });
  if (seen) dropQuickLog(log.tempId);
}

export function mergeDashboard<T extends DashLike>(dash: T): T {
  let transactions = dash.transactions;
  let spent = dash.budget.spentCents;
  let income = dash.cashFlow.incomeCents;
  let spending = dash.cashFlow.spendingCents;
  const slices = dash.spending ? dash.spending.map((row) => ({ ...row })) : undefined;
  for (const log of quickLogs) {
    if (transactions.some((row) => row.id === log.tempId || sameCharge(row, log))) continue;
    transactions = [asCharge(log) as T["transactions"][number], ...transactions];
    if (log.amountCents > 0) {
      spent += log.amountCents;
      spending += log.amountCents;
      if (slices && log.categoryId) {
        const found = slices.find((row) => row.id === log.categoryId);
        if (found) found.cents += log.amountCents;
        else slices.push({ id: log.categoryId, name: log.categoryName ?? "Other", cents: log.amountCents, color: log.categoryColor ?? "#8B939E" });
      }
    } else {
      income += Math.abs(log.amountCents);
    }
  }
  const count = unreviewedPin ?? dash.unreviewed.count;
  return {
    ...dash,
    transactions,
    budget: { ...dash.budget, spentCents: spent, remainingCents: dash.budget.plannedCents - spent },
    cashFlow: { incomeCents: income, spendingCents: spending, savedCents: income - spending },
    spending: slices ?? dash.spending,
    unreviewed: { count },
  };
}

export function mergeActivityRows<T extends { id: string; name: string; amountCents: number; date: string; reviewed: boolean; categoryId?: string | null }>(
  rows: T[] | null,
  filter: { unreviewedOnly: boolean; search: string; categoryId: string; accountId: string; tag: string; range: { start: string; end: string } | null },
): T[] | null {
  if (!rows) return rows;
  if (filter.unreviewedOnly || filter.tag.trim()) return rows;
  const extras = quickLogs.filter((log) => {
    if (rows.some((row) => row.id === log.tempId || sameCharge(row, log))) return false;
    if (filter.categoryId && log.categoryId !== filter.categoryId) return false;
    if (filter.accountId && log.accountId !== filter.accountId) return false;
    if (filter.range && (log.date < filter.range.start || log.date > filter.range.end)) return false;
    const q = filter.search.trim().toLowerCase();
    if (q && !log.name.toLowerCase().includes(q)) return false;
    return true;
  });
  if (!extras.length) return rows;
  return [...extras.map((log) => asCharge(log) as unknown as T), ...rows];
}

function withLocalWrite(write: () => void) {
  localWrite = true;
  try {
    write();
  } finally {
    localWrite = false;
  }
}

export function pinUnreviewed(count: number) {
  unreviewedPin = count;
  withLocalWrite(() => {
    const counted = peek<CountBody>("/api/transactions?countOnly=1");
    writeCache("/api/transactions?countOnly=1", { ...(counted ?? {}), unreviewed: count });
    for (const path of cachePaths()) {
      if (!path.startsWith("/api/dashboard")) continue;
      const dash = peek<DashLike>(path);
      if (dash?.unreviewed) writeCache(path, { ...dash, unreviewed: { count } });
    }
  });
}

export function overlayAccount(id: string, patch: AccountPatch) {
  accountOverlays.set(id, { ...accountOverlays.get(id), ...patch });
  const cached = peek<AccountsBody>("/api/accounts");
  if (cached) withLocalWrite(() => writeCache("/api/accounts", cached));
}

export function clearAccountOverlay(id: string, snapshot?: { accounts: { id: string }[] }) {
  accountOverlays.delete(id);
  if (snapshot) withLocalWrite(() => writeCache("/api/accounts", snapshot));
}

retainWrites((path, data) => {
  if (!data || typeof data !== "object") return data;
  if (path === "/api/transactions?countOnly=1") {
    const body = data as CountBody;
    if (unreviewedPin != null) {
      if (body.unreviewed === unreviewedPin && heldUnreviewedCount() === 0 && !localWrite) unreviewedPin = null;
      else if (body.unreviewed !== unreviewedPin) return { ...body, unreviewed: unreviewedPin };
    }
    if (unreviewedPin == null) {
      const unreviewed = Math.max(0, body.unreviewed - heldUnreviewedCount());
      if (unreviewed !== body.unreviewed) return { ...body, unreviewed };
    }
  }
  if (path.startsWith("/api/dashboard") && "unreviewed" in data) {
    const dash = data as DashLike;
    if (unreviewedPin != null && dash.unreviewed && dash.unreviewed.count !== unreviewedPin) {
      return { ...dash, unreviewed: { count: unreviewedPin } };
    }
    if (unreviewedPin == null && dash.unreviewed) {
      const count = Math.max(0, dash.unreviewed.count - heldUnreviewedCount());
      if (count !== dash.unreviewed.count) return { ...dash, unreviewed: { count } };
    }
  }
  if (path === "/api/accounts" && accountOverlays.size && "accounts" in data) {
    const body = data as AccountsBody;
    return {
      ...body,
      accounts: body.accounts.map((account) => {
        const extra = accountOverlays.get(account.id);
        if (!extra) return account;
        const caughtUp = Object.entries(extra).every(([key, value]) => account[key] === value);
        if (caughtUp && !localWrite) accountOverlays.delete(account.id);
        return caughtUp ? account : { ...account, ...extra };
      }),
    };
  }
  return data;
});

export function mergeBudget<T extends { expenseSpentCents: number; rows: { category: { id: string }; spentCents: number; remainingCents: number }[] }>(budget: T): T {
  let expenseSpentCents = budget.expenseSpentCents;
  let rows = budget.rows;
  for (const log of quickLogs) {
    if (log.amountCents <= 0) continue;
    if (alreadyLogged(log)) continue;
    expenseSpentCents += log.amountCents;
    if (!log.categoryId) continue;
    rows = rows.map((row) =>
      row.category.id === log.categoryId
        ? { ...row, spentCents: row.spentCents + log.amountCents, remainingCents: row.remainingCents - log.amountCents }
        : row,
    );
  }
  if (expenseSpentCents === budget.expenseSpentCents) return budget;
  return { ...budget, expenseSpentCents, rows };
}

function alreadyLogged(log: QuickLog) {
  return cachePaths().some((path) => {
    if (!path.startsWith("/api/transactions") || path.includes("countOnly")) return false;
    const body = peek<{ transactions?: { name: string; amountCents: number; date: string }[] }>(path);
    return Boolean(body?.transactions?.some((row) => sameCharge(row, log)));
  });
}
