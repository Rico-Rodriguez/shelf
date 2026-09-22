"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CategoryPicker, CategorySelect, type CatGroup } from "@/components/CategoryPicker";
import { MerchantMark } from "@/components/MerchantMark";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { Sheet } from "@/components/Sheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, FieldStack } from "@/components/ui/Field";
import { FilterBar } from "@/components/ui/FilterBar";
import { Hint } from "@/components/ui/Hint";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segment } from "@/components/ui/Segment";
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
  account: { id?: string; name: string } | null;
  accountId?: string;
  goalId: string | null;
  transferPairId: string | null;
  category: { name: string; sprite: string; color?: string } | null;
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
  const tag = params.get("tag") ?? "";

  const [q, setQ] = useState(urlQ);
  const [search, setSearch] = useState(urlQ);
  const [rows, setRows] = useState<Tx[]>([]);
  const [unreviewed, setUnreviewed] = useState(0);
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [goals, setGoals] = useState<{ id: string; name: string }[]>([]);
  const [pairs, setPairs] = useState<{ id: string; name: string; date: string; amountCents: number; account: string | null }[]>([]);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [manual, setManual] = useState({ accountId: "", name: "", amount: "", date: "", categoryId: "" });

  useEffect(() => {
    setQ(urlQ);
    setSearch(urlQ);
  }, [urlQ]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(q), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (accountId) qs.set("accountId", accountId);
    if (categoryId) qs.set("categoryId", categoryId);
    if (reviewed) qs.set("reviewed", reviewed);
    if (start) qs.set("start", start);
    if (end) qs.set("end", end);
    if (tag) qs.set("tag", tag);
    void api<{ transactions: Tx[]; unreviewed: number }>(`/api/transactions?${qs}`).then((r) => {
      setRows(r.transactions);
      setUnreviewed(r.unreviewed);
    });
  }, [search, accountId, categoryId, reviewed, start, end, tag]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    void api<{ groups: CatGroup[] }>("/api/categories").then((r) => setGroups(r.groups));
    void api<{ accounts: { id: string; name: string }[] }>("/api/accounts").then((r) => setAccounts(r.accounts));
    void api<{ tags: { name: string }[] }>("/api/tags")
      .then((r) => setTagNames(r.tags.map((item) => item.name)))
      .catch(() => undefined);
    void api<{ goals: { id: string; name: string }[] }>("/api/goals")
      .then((r) => setGoals(r.goals))
      .catch(() => undefined);
  }, []);

  function replaceQuery(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    if (q) next.set("q", q);
    else next.delete("q");
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `/transactions?${query}` : "/transactions", { scroll: false });
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
  const inReviewMode = reviewed === "false";

  async function markDone(id: string) {
    await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ reviewed: true }) });
    load();
  }

  async function markVisibleDone() {
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
        goalId: edit.goalId,
        transferPairId: edit.transferPairId,
        tags: edit.tagText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        splits: edit.splitDrafts
          .filter((part) => part.categoryId && part.amount)
          .map((part) => ({ categoryId: part.categoryId, amount: Number(part.amount) })),
      }),
    });
    setEdit(null);
    load();
  }

  function openEdit(tx: Tx) {
    setPairs([]);
    void api<{ candidates: { id: string; name: string; date: string; amountCents: number; account: string | null }[] }>(
      `/api/transactions?pairFor=${tx.id}`,
    ).then((res) => setPairs(res.candidates));
    setEdit({
      ...tx,
      tagText: tx.tags.map((item) => item.name).join(", "),
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
    <div className="page-enter space-y-4">
      <PageHeader
        title="Activity"
        subtitle={
          unreviewed
            ? `${unreviewed} waiting for a quick look${rows.length ? ` · ${rows.length} shown` : ""}`
            : rows.length
              ? `${rows.length} shown · inbox clear`
              : "Every purchase in one list"
        }
      >
        <button className="shelf-btn" type="button" onClick={() => setShowAdd(true)}>
          Add
        </button>
      </PageHeader>

      <input
        className="shelf-input ios-search"
        placeholder="Search, or >50 for amounts"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search transactions"
      />

      <Segment
        className="w-full max-w-md"
        value={reviewed}
        onChange={(value) => replaceQuery({ reviewed: value || null })}
        options={[
          { value: "", label: "All" },
          { value: "false", label: "Needs review" },
          { value: "true", label: "Reviewed" },
        ]}
      />

      {inReviewMode ? (
        <Hint tone="action" title="What “review” means">
          Tap a purchase to rename it or fix the category. When it looks right, tap <strong>Done</strong> — or save from the detail sheet. Reviewed items stop counting against your inbox so the budget stays trustworthy.
        </Hint>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Account">
          <select className="shelf-input" value={accountId} onChange={(e) => replaceQuery({ accountId: e.target.value || null })} aria-label="Account">
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <CategorySelect groups={groups} value={categoryId} onChange={(id) => replaceQuery({ categoryId: id || null })} emptyLabel="All categories" />
        </Field>
        <Field label="Tag">
          <select className="shelf-input" value={tag} onChange={(e) => replaceQuery({ tag: e.target.value || null })} aria-label="Tag">
            <option value="">All tags</option>
            {tagNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <FilterBar className="justify-between">
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
            className="shelf-btn ghost"
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
          <button className="shelf-btn ghost" type="button" onClick={() => replaceQuery({ start: null, end: null })}>
            All months
          </button>
        ) : null}
        {visibleUnreviewed.length ? (
          <button className="shelf-btn soft" type="button" onClick={markVisibleDone}>
            Mark {visibleUnreviewed.length} done
          </button>
        ) : null}
      </FilterBar>

      {grouped.length === 0 ? (
        <EmptyState
          title={inReviewMode ? "Inbox clear" : "No matches"}
          action={
            inReviewMode ? (
              <button className="shelf-btn ghost" type="button" onClick={() => replaceQuery({ reviewed: null })}>
                Show all activity
              </button>
            ) : undefined
          }
        >
          {inReviewMode ? "You’re caught up. New purchases will land here after sync." : "Try another search or clear a filter."}
        </EmptyState>
      ) : null}

      {grouped.map(([date, items]) => (
        <section key={date}>
          <h2 className="ios-section">{dayLabel(date)}</h2>
          <div className="card">
            {items.map((tx) => (
              <div key={tx.id} className={`data-row ${tx.reviewed ? "placed" : ""}`}>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openEdit(tx)}>
                  <MerchantMark name={tx.merchantName || tx.name} color={tx.category?.color} />
                  <span className="min-w-0">
                  <div className="tx-name flex items-center gap-2 truncate font-medium">
                    <span className="truncate">{tx.name}</span>
                    {tx.pending ? <span className="chip">Pending</span> : null}
                    {!tx.reviewed && !tx.categoryId ? <span className="chip warn">Needs a category</span> : null}
                    {!tx.reviewed && tx.categoryId ? <span className="chip">New</span> : null}
                  </div>
                  <div className="truncate text-[13px] text-[var(--muted)]">
                    {tx.category?.name ?? "Uncategorized"}
                    {tx.account?.name ? ` · ${tx.account.name}` : ""}
                    {tx.splits.length ? ` · ${tx.splits.length} splits` : ""}
                    {tx.tags.length ? ` · ${tx.tags.map((item) => item.name).join(", ")}` : ""}
                  </div>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-[16px] font-medium tabular-nums">
                    <MoneyText cents={-tx.amountCents} signed />
                  </div>
                  {tx.reviewed ? null : (
                    <button
                      className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-[13px] font-semibold text-[var(--accent-ink)]"
                      type="button"
                      onClick={() => markDone(tx.id)}
                      aria-label={`Mark ${tx.name} as reviewed`}
                    >
                      Done
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {edit ? (
        <Sheet title="Review purchase" onClose={() => setEdit(null)}>
          <div>
            <p className="text-[13px] text-[var(--muted)]">
              {dayLabel(edit.date)}
              {edit.account?.name ? ` · ${edit.account.name}` : ""}
              {edit.pending ? " · Pending" : ""}
            </p>
            <div className="mt-1 text-[32px] font-semibold tracking-[-0.03em]">
              <MoneyText cents={-edit.amountCents} signed />
            </div>
            {edit.originalDescription && edit.originalDescription !== edit.name ? (
              <p className="mt-1 text-[13px] text-[var(--muted)]">{edit.originalDescription}</p>
            ) : null}
            {!edit.reviewed ? (
              <p className="mt-2 text-[13px] text-[var(--muted)]">Fix the details below, then save — that marks it reviewed.</p>
            ) : null}
          </div>

          <Field label="Name">
            <input className="shelf-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </Field>
          <Field label="Category" hint="Pick where this spending belongs in your budget.">
            <CategoryPicker groups={groups} value={edit.categoryId ?? ""} onChange={(id) => setEdit({ ...edit, categoryId: id || null })} />
          </Field>
          <Field label="Goal">
            <select className="shelf-input" value={edit.goalId ?? ""} onChange={(e) => setEdit({ ...edit, goalId: e.target.value || null })}>
              <option value="">No goal</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Linked transfer" hint="Pair the other side of a move between accounts.">
            <select
              className="shelf-input"
              value={edit.transferPairId ?? ""}
              onChange={(e) => setEdit({ ...edit, transferPairId: e.target.value || null, isTransfer: Boolean(e.target.value) || edit.isTransfer })}
            >
              <option value="">No linked transfer</option>
              {pairs.map((pair) => (
                <option key={pair.id} value={pair.id}>
                  {pair.date} · {pair.name}
                  {pair.account ? ` · ${pair.account}` : ""}
                </option>
              ))}
              {edit.transferPairId && !pairs.some((pair) => pair.id === edit.transferPairId) ? <option value={edit.transferPairId}>Linked transfer</option> : null}
            </select>
          </Field>
          <Field label="Note">
            <textarea className="shelf-input" rows={2} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          </Field>
          <Field label="Tags" hint="Comma-separated, like travel, reimbursable.">
            <input className="shelf-input" value={edit.tagText} onChange={(e) => setEdit({ ...edit, tagText: e.target.value })} />
          </Field>

          <div className="space-y-3">
            <div className="field-label">Splits</div>
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
                  className="shelf-input max-w-28"
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
                  className="shelf-btn ghost"
                  type="button"
                  onClick={() => setEdit({ ...edit, splitDrafts: edit.splitDrafts.filter((_, i) => i !== index) })}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="shelf-btn ghost"
              type="button"
              onClick={() => setEdit({ ...edit, splitDrafts: [...edit.splitDrafts, { categoryId: "", amount: "" }] })}
            >
              Add split
            </button>
          </div>

          <div className="card">
            <button
              type="button"
              className="data-row w-full justify-between"
              aria-pressed={edit.hidden}
              onClick={() => setEdit({ ...edit, hidden: !edit.hidden })}
            >
              Hide from budget
              <span className={`switch ${edit.hidden ? "on" : ""}`} />
            </button>
            <button
              type="button"
              className="data-row w-full justify-between"
              aria-pressed={edit.isTransfer}
              onClick={() => setEdit({ ...edit, isTransfer: !edit.isTransfer })}
            >
              Count as transfer
              <span className={`switch ${edit.isTransfer ? "on" : ""}`} />
            </button>
          </div>

          <button className="shelf-btn w-full" type="button" onClick={saveEdit}>
            {edit.reviewed ? "Save changes" : "Save & mark reviewed"}
          </button>
          <button className="shelf-btn ghost w-full" type="button" onClick={makeRule}>
            Automate with a rule
          </button>
        </Sheet>
      ) : null}

      {showAdd ? (
        <Sheet title="New transaction" onClose={() => setShowAdd(false)}>
          <form
            onSubmit={addManual}
            onClick={(e) => e.stopPropagation()}
          >
            <FieldStack>
              <Field label="Account">
                <select
                  className="shelf-input"
                  value={manual.accountId}
                  onChange={(e) => setManual({ ...manual, accountId: e.target.value })}
                  required
                >
                  <option value="">Choose account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Name">
                <input
                  className="shelf-input"
                  placeholder="Coffee, paycheck…"
                  value={manual.name}
                  onChange={(e) => setManual({ ...manual, name: e.target.value })}
                  required
                />
              </Field>
              <Field label="Amount" hint="Positive is money out. Negative is money in.">
                <input
                  className="shelf-input"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={manual.amount}
                  onChange={(e) => setManual({ ...manual, amount: e.target.value })}
                  required
                />
              </Field>
              <Field label="Date">
                <input className="shelf-input" type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} />
              </Field>
              <Field label="Category">
                <CategorySelect groups={groups} value={manual.categoryId} onChange={(id) => setManual({ ...manual, categoryId: id })} emptyLabel="Choose category" />
              </Field>
              <button className="shelf-btn w-full">Add transaction</button>
            </FieldStack>
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}
