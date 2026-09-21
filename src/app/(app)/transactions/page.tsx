"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CategoryPicker, CategorySelect, type CatGroup } from "@/components/CategoryPicker";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { Sheet } from "@/components/Sheet";
import { api } from "@/lib/client";
import { dayLabel, monthRange, yearMonth } from "@/lib/dates";

type Tx = {
  id: string;
  name: string;
  merchantName: string | null;
  originalDescription: string | null;
  amountCents: number;
  date: string;
  reviewed: boolean;
  hidden: boolean;
  notes: string | null;
  categoryId: string | null;
  isTransfer: boolean;
  pending: boolean;
  account: { name: string } | null;
  category: { name: string; sprite: string } | null;
  tags: { name: string }[];
  splits: { categoryId: string | null; amountCents: number }[];
};

type SplitDraft = { categoryId: string; amount: string };

type EditState = Tx & { tagText: string; splitDrafts: SplitDraft[] };

export default function TransactionsPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading…</p>}>
      <Activity />
    </Suspense>
  );
}

function Activity() {
  const params = useSearchParams();
  const router = useRouter();
  const urlQ = params.get("q") ?? "";
  const accountId = params.get("accountId") ?? "";
  const categoryId = params.get("categoryId") ?? "";
  const reviewed = params.get("reviewed") ?? "";
  const start = params.get("start") ?? "";
  const end = params.get("end") ?? "";

  const [q, setQ] = useState(urlQ);
  const [rows, setRows] = useState<Tx[]>([]);
  const [unreviewed, setUnreviewed] = useState(0);
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [manual, setManual] = useState({ accountId: "", name: "", amount: "", date: "", categoryId: "" });

  useEffect(() => {
    setQ(urlQ);
  }, [urlQ]);

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (accountId) qs.set("accountId", accountId);
    if (categoryId) qs.set("categoryId", categoryId);
    if (reviewed) qs.set("reviewed", reviewed);
    if (start) qs.set("start", start);
    if (end) qs.set("end", end);
    void api<{ transactions: Tx[]; unreviewed: number }>(`/api/transactions?${qs}`).then((r) => {
      setRows(r.transactions);
      setUnreviewed(r.unreviewed);
    });
  }, [q, accountId, categoryId, reviewed, start, end]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    void api<{ groups: CatGroup[] }>("/api/categories").then((r) => setGroups(r.groups));
    void api<{ accounts: { id: string; name: string }[] }>("/api/accounts").then((r) => setAccounts(r.accounts));
  }, []);

  function replaceQuery(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    if (q) next.set("q", q);
    else next.delete("q");
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    const search = next.toString();
    router.replace(search ? `/transactions?${search}` : "/transactions", { scroll: false });
  }

  const month = start ? { year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) } : null;
  const grouped = useMemo(() => {
    const map = new Map<string, Tx[]>();
    for (const tx of rows) {
      const list = map.get(tx.date) ?? [];
      list.push(tx);
      map.set(tx.date, list);
    }
    return [...map.entries()];
  }, [rows]);

  const visibleUnreviewed = rows.filter((tx) => !tx.reviewed).map((tx) => tx.id);

  async function reviewOne(id: string) {
    await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ reviewed: true }) });
    load();
  }

  async function reviewVisible() {
    if (!visibleUnreviewed.length) return;
    await api("/api/transactions/review-all", { method: "POST", body: JSON.stringify({ ids: visibleUnreviewed }) });
    load();
  }

  async function saveEdit() {
    if (!edit) return;
    await api(`/api/transactions/${edit.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: edit.name,
        categoryId: edit.categoryId || null,
        reviewed: true,
        hidden: edit.hidden,
        notes: edit.notes,
        isTransfer: edit.isTransfer,
        tags: edit.tagText.split(",").map((tag) => tag.trim()).filter(Boolean),
        splits: edit.splitDrafts
          .filter((part) => part.categoryId && part.amount)
          .map((part) => ({ categoryId: part.categoryId, amount: Number(part.amount) })),
      }),
    });
    setEdit(null);
    load();
  }

  function openEdit(tx: Tx) {
    setEdit({
      ...tx,
      tagText: tx.tags.map((tag) => tag.name).join(", "),
      splitDrafts: tx.splits
        .filter((part) => part.categoryId)
        .map((part) => ({ categoryId: part.categoryId!, amount: (part.amountCents / 100).toFixed(2) })),
    });
  }

  function makeRule() {
    if (!edit) return;
    const merchant = edit.merchantName || edit.name;
    const qs = new URLSearchParams({
      merchant,
      rename: edit.name,
      name: merchant,
    });
    if (edit.categoryId) qs.set("categoryId", edit.categoryId);
    router.push(`/settings/rules?${qs}`);
  }

  async function addManual(e: FormEvent) {
    e.preventDefault();
    await api("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        accountId: manual.accountId,
        name: manual.name,
        amount: Number(manual.amount),
        date: manual.date || undefined,
        categoryId: manual.categoryId || undefined,
      }),
    });
    setManual({ accountId: "", name: "", amount: "", date: "", categoryId: "" });
    setShowAdd(false);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1>Activity</h1>
          <p>
            {unreviewed} to review
            {rows.length ? ` · ${rows.length} shown` : ""}
          </p>
        </div>
        <button className="pixel-btn" type="button" onClick={() => setShowAdd(true)}>
          Add
        </button>
      </div>

      <input
        className="pixel-input ios-search"
        placeholder="Search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search transactions"
      />

      <div className="ios-seg w-full max-w-xs">
        <button type="button" className={reviewed === "" ? "active" : ""} onClick={() => replaceQuery({ reviewed: null })}>
          All
        </button>
        <button type="button" className={reviewed === "false" ? "active" : ""} onClick={() => replaceQuery({ reviewed: "false" })}>
          Inbox
        </button>
        <button type="button" className={reviewed === "true" ? "active" : ""} onClick={() => replaceQuery({ reviewed: "true" })}>
          Reviewed
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <select className="pixel-input" value={accountId} onChange={(e) => replaceQuery({ accountId: e.target.value || null })} aria-label="Account">
          <option value="">All accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <CategorySelect groups={groups} value={categoryId} onChange={(id) => replaceQuery({ categoryId: id || null })} emptyLabel="All categories" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {month ? (
          <MonthNav
            year={month.year}
            month={month.month}
            onChange={(year, mon) => {
              const range = monthRange(year, mon);
              replaceQuery({ start: range.start, end: range.end });
            }}
          />
        ) : (
          <button
            className="pixel-btn ghost"
            type="button"
            onClick={() => {
              const now = yearMonth();
              const range = monthRange(now.year, now.month);
              replaceQuery({ start: range.start, end: range.end });
            }}
          >
            This month
          </button>
        )}
        {month ? (
          <button className="pixel-btn ghost" type="button" onClick={() => replaceQuery({ start: null, end: null })}>
            All months
          </button>
        ) : null}
        {visibleUnreviewed.length ? (
          <button className="pixel-btn secondary" type="button" onClick={reviewVisible}>
            Review all visible
          </button>
        ) : null}
      </div>

      {grouped.length === 0 ? <p className="text-[15px] text-[var(--muted)]">No transactions match.</p> : null}

      {grouped.map(([date, items]) => (
        <section key={date}>
          <h2 className="ios-section">{dayLabel(date)}</h2>
          <div className="ios-group">
            {items.map((tx) => (
              <div key={tx.id} className={`ios-row ${tx.reviewed ? "placed" : ""}`}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEdit(tx)}>
                  <div className="tx-name flex items-center gap-2 truncate text-[17px] font-medium">
                    <span className="truncate">{tx.name}</span>
                    {tx.pending ? <span className="chip">Pending</span> : null}
                  </div>
                  <div className="truncate text-[13px] text-[var(--muted)]">
                    {tx.category?.name ?? "Uncategorized"}
                    {tx.account?.name ? ` · ${tx.account.name}` : ""}
                    {tx.splits.length ? ` · ${tx.splits.length} splits` : ""}
                    {tx.tags.length ? ` · ${tx.tags.map((tag) => tag.name).join(", ")}` : ""}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-[17px] tabular-nums">
                    <MoneyText cents={-tx.amountCents} signed />
                  </div>
                  {tx.reviewed ? null : (
                    <button className="text-[15px] font-semibold text-[var(--terracotta)]" type="button" onClick={() => reviewOne(tx.id)}>
                      Review
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {edit ? (
        <Sheet title="Transaction" onClose={() => setEdit(null)}>
          <p className="text-[13px] text-[var(--muted)]">
            {dayLabel(edit.date)}
            {edit.account?.name ? ` · ${edit.account.name}` : ""}
            {edit.pending ? " · Pending" : ""}
          </p>
          <div className="text-[28px] font-bold tracking-tight">
            <MoneyText cents={-edit.amountCents} signed />
          </div>
          {edit.originalDescription && edit.originalDescription !== edit.name ? (
            <p className="text-[13px] text-[var(--muted)]">{edit.originalDescription}</p>
          ) : null}
          <input className="pixel-input" aria-label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <CategoryPicker groups={groups} value={edit.categoryId ?? ""} onChange={(id) => setEdit({ ...edit, categoryId: id || null })} />
          <textarea
            className="pixel-input"
            rows={2}
            placeholder="Note"
            value={edit.notes ?? ""}
            onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
          />
          <input
            className="pixel-input"
            placeholder="Tags, separated by commas"
            value={edit.tagText}
            onChange={(e) => setEdit({ ...edit, tagText: e.target.value })}
          />
          <div className="space-y-2">
            <div className="text-[13px] text-[var(--muted)]">Splits</div>
            {edit.splitDrafts.map((part, index) => (
              <div key={index} className="flex gap-2">
                <CategorySelect
                  groups={groups}
                  value={part.categoryId}
                  onChange={(id) => {
                    const splitDrafts = edit.splitDrafts.slice();
                    splitDrafts[index] = { ...part, categoryId: id };
                    setEdit({ ...edit, splitDrafts });
                  }}
                  emptyLabel="Category"
                />
                <input
                  className="pixel-input max-w-28"
                  inputMode="decimal"
                  aria-label="Split amount"
                  value={part.amount}
                  onChange={(e) => {
                    const splitDrafts = edit.splitDrafts.slice();
                    splitDrafts[index] = { ...part, amount: e.target.value };
                    setEdit({ ...edit, splitDrafts });
                  }}
                />
                <button
                  className="pixel-btn ghost"
                  type="button"
                  onClick={() => setEdit({ ...edit, splitDrafts: edit.splitDrafts.filter((_, i) => i !== index) })}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="pixel-btn ghost"
              type="button"
              onClick={() => setEdit({ ...edit, splitDrafts: [...edit.splitDrafts, { categoryId: "", amount: "" }] })}
            >
              Add split
            </button>
          </div>
          <div className="ios-group">
            <button type="button" className="ios-row w-full justify-between text-[17px]" aria-pressed={edit.hidden} onClick={() => setEdit({ ...edit, hidden: !edit.hidden })}>
              Hide from budget
              <span className={`switch ${edit.hidden ? "on" : ""}`} />
            </button>
            <button type="button" className="ios-row w-full justify-between text-[17px]" aria-pressed={edit.isTransfer} onClick={() => setEdit({ ...edit, isTransfer: !edit.isTransfer })}>
              Transfer
              <span className={`switch ${edit.isTransfer ? "on" : ""}`} />
            </button>
          </div>
          <button className="pixel-btn w-full" type="button" onClick={saveEdit}>
            {edit.reviewed ? "Save" : "Save and review"}
          </button>
          <button className="pixel-btn ghost w-full" type="button" onClick={makeRule}>
            Make a rule
          </button>
        </Sheet>
      ) : null}

      {showAdd ? (
        <Sheet title="New transaction" onClose={() => setShowAdd(false)}>
          <form className="space-y-3" onSubmit={addManual}>
            <select className="pixel-input" value={manual.accountId} onChange={(e) => setManual({ ...manual, accountId: e.target.value })} required aria-label="Account">
              <option value="">Account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <input className="pixel-input" placeholder="Name" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} required />
            <input
              className="pixel-input"
              inputMode="decimal"
              placeholder="Amount (+ out, − in)"
              value={manual.amount}
              onChange={(e) => setManual({ ...manual, amount: e.target.value })}
              required
            />
            <input className="pixel-input" type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} aria-label="Date" />
            <CategorySelect groups={groups} value={manual.categoryId} onChange={(id) => setManual({ ...manual, categoryId: id })} emptyLabel="Category" />
            <button className="pixel-btn w-full">Add</button>
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}
