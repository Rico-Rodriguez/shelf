"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CategoryPicker, CategorySelect, type CatGroup } from "@/components/CategoryPicker";
import { ReviewDeck } from "@/components/ReviewDeck";
import { offerUndo } from "@/components/UndoHost";
import { MerchantMark } from "@/components/MerchantMark";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { Sheet } from "@/components/Sheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, FieldStack } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
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
  const [goals, setGoals] = useState<{ id: string; name: string }[]>([]);
  const [pairs, setPairs] = useState<{ id: string; name: string; date: string; amountCents: number; account: string | null }[]>([]);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState("");
  const [always, setAlways] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
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
  const focus = params.get("focus") === "1";
  const unreviewedRows = rows.filter((tx) => !tx.reviewed);
  const canAcceptAll = unreviewedRows.length > 0 && unreviewedRows.every((tx) => tx.categoryId);

  async function markDone(id: string) {
    const previous = rows.find((tx) => tx.id === id);
    await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ reviewed: true }) });
    if (previous) {
      offerUndo("Marked reviewed", async () => {
        await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ reviewed: false, categoryId: previous.categoryId, hidden: previous.hidden }) });
        load();
      });
    }
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
    if (always && edit.categoryId) {
      await api("/api/rules", {
        method: "POST",
        body: JSON.stringify({
          name: edit.merchantName || edit.name,
          matchMerchant: edit.merchantName || edit.name,
          actionCategoryId: edit.categoryId,
          actionRename: edit.name,
        }),
      });
    }
    offerUndo("Saved", async () => {
      await api(`/api/transactions/${edit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: edit.name,
          categoryId: edit.categoryId,
          reviewed: edit.reviewed,
          hidden: edit.hidden,
        }),
      });
      load();
    });
    setAlways(false);
    setEdit(null);
    load();
  }

  function openEdit(tx: Tx) {
    setShowMore(false);
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

  const accountName = accounts.find((account) => account.id === accountId)?.name;
  const categoryName = groups.flatMap((group) => group.categories).find((category) => category.id === categoryId)?.name;
  const pendingCount = rows.filter((tx) => tx.pending).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Activity" subtitle={unreviewed ? `${unreviewed} to review` : undefined}>
        <button className="text-btn" type="button" onClick={() => setShowAdd(true)}>
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

      {pendingCount > 0 ? <p className="text-[13px] text-[var(--tertiary)]">Pending stays out of spending.</p> : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button className="text-btn" type="button" onClick={() => setFiltersOpen(true)}>
          Filter
        </button>
        {unreviewed > 0 && reviewed !== "false" ? (
          <button className="text-btn" type="button" onClick={() => replaceQuery({ reviewed: "false", focus: "1" })}>
            Needs review
          </button>
        ) : null}
        {reviewed === "false" ? (
          <button className="chip accent" type="button" onClick={() => replaceQuery({ reviewed: null, focus: null })}>
            Needs review
          </button>
        ) : null}
        {accountName ? (
          <button className="chip" type="button" onClick={() => replaceQuery({ accountId: null })}>
            {accountName}
          </button>
        ) : null}
        {categoryId ? (
          <button className="chip" type="button" onClick={() => replaceQuery({ categoryId: null })}>
            {categoryName || "Category"}
          </button>
        ) : null}
        {tag ? (
          <button className="chip" type="button" onClick={() => replaceQuery({ tag: null })}>
            {tag}
          </button>
        ) : null}
        {month ? (
          <button className="chip" type="button" onClick={() => replaceQuery({ start: null, end: null })}>
            Dates
          </button>
        ) : null}
        <button className="text-btn" type="button" onClick={() => { setSelecting((value) => !value); setSelected([]); }}>
          {selecting ? "Cancel" : "Select"}
        </button>
        {canAcceptAll ? (
          <button className="text-btn" type="button" onClick={markVisibleDone}>
            Accept {unreviewedRows.length}
          </button>
        ) : null}
      </div>

      {focus && inReviewMode ? (
        <ReviewDeck
          key={unreviewedRows[0]?.id ?? "clear"}
          rows={unreviewedRows}
          groups={groups}
          onSkip={(tx) => {
            setRows((current) => current.filter((row) => row.id !== tx.id));
          }}
          onConfirm={async (tx, categoryId, makeRule) => {
            await api(`/api/transactions/${tx.id}`, {
              method: "PATCH",
              body: JSON.stringify({ categoryId, reviewed: true }),
            });
            if (makeRule && categoryId) {
              await api("/api/rules", {
                method: "POST",
                body: JSON.stringify({
                  name: tx.merchantName || tx.name,
                  matchMerchant: tx.merchantName || tx.name,
                  actionCategoryId: categoryId,
                }),
              });
            }
            offerUndo("Reviewed", async () => {
              await api(`/api/transactions/${tx.id}`, { method: "PATCH", body: JSON.stringify({ reviewed: false, categoryId: tx.categoryId }) });
              load();
            });
            load();
          }}
        />
      ) : null}

      {filtersOpen ? (
        <Sheet title="Filter" onClose={() => setFiltersOpen(false)}>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
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
                className="text-btn"
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
              <button className="text-btn" type="button" onClick={() => replaceQuery({ start: null, end: null })}>
                All months
              </button>
            ) : null}
          </div>
        </Sheet>
      ) : null}

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

      {focus && unreviewedRows.length ? null : grouped.map(([date, items]) => (
        <section key={date}>
          <h2 className="ios-section">{dayLabel(date)}</h2>
          <div className="card">
            {items.map((tx) => (
              <div
                key={tx.id}
                className={`data-row ${tx.reviewed ? "placed" : ""} ${tx.pending ? "is-pending" : ""}`}
                onTouchStart={(event) => {
                  const startX = event.changedTouches[0]?.clientX ?? 0;
                  (event.currentTarget as HTMLElement).dataset.x = String(startX);
                }}
                onTouchEnd={(event) => {
                  const startX = Number((event.currentTarget as HTMLElement).dataset.x || 0);
                  const dx = (event.changedTouches[0]?.clientX ?? 0) - startX;
                  if (dx > 80 && !tx.reviewed) void markDone(tx.id);
                  if (dx < -80) {
                    void api(`/api/transactions/${tx.id}`, { method: "PATCH", body: JSON.stringify({ hidden: true }) }).then(() => {
                      offerUndo("Hidden", async () => {
                        await api(`/api/transactions/${tx.id}`, { method: "PATCH", body: JSON.stringify({ hidden: false }) });
                        load();
                      });
                      load();
                    });
                  }
                }}
              >
                {selecting ? (
                  <input
                    type="checkbox"
                    aria-label={`Select ${tx.name}`}
                    checked={selected.includes(tx.id)}
                    onChange={(event) =>
                      setSelected((current) => (event.target.checked ? [...current, tx.id] : current.filter((id) => id !== tx.id)))
                    }
                  />
                ) : null}
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openEdit(tx)}>
                  <MerchantMark name={tx.merchantName || tx.name} color={tx.category?.color} />
                  <span className="min-w-0">
                  <div className="tx-name flex items-center gap-2 truncate font-medium">
                    <span className="truncate">{tx.name}</span>
                    {!tx.reviewed && !tx.categoryId ? <span className="chip warn">Needs a category</span> : null}
                  </div>
                  <div className="truncate text-[13px] text-[var(--muted)]">
                    {tx.category?.name ?? "Uncategorized"}
                    {tx.account?.name ? ` · ${tx.account.name}` : ""}
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
            <Link href={`/merchant?name=${encodeURIComponent(edit.merchantName || edit.name)}`} className="text-btn">
              History
            </Link>
          </div>

          <Field label="Name">
            <input className="shelf-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </Field>
          <Field label="Category">
            <CategoryPicker groups={groups} value={edit.categoryId ?? ""} onChange={(id) => setEdit({ ...edit, categoryId: id || null })} />
          </Field>
          <button type="button" className="text-btn" onClick={() => setShowMore((value) => !value)}>
            {showMore ? "Less" : "More"}
          </button>
          {showMore ? (
            <>
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

            </>
          ) : null}
          <button type="button" className="data-row w-full justify-between" aria-pressed={always} onClick={() => setAlways((value) => !value)}>
            Always categorize this merchant this way
            <span className={`switch ${always ? "on" : ""}`} />
          </button>
          <button className="shelf-btn w-full" type="button" onClick={saveEdit}>
            {edit.reviewed ? "Save" : "Save"}
          </button>
        </Sheet>
      ) : null}

      {selecting && selected.length ? (
        <div className="undo-bar">
          <CategorySelect groups={groups} value={bulkCategory} onChange={setBulkCategory} emptyLabel="Category" />
          <button
            type="button"
            onClick={() => {
              void Promise.all(
                selected.map((id) =>
                  api(`/api/transactions/${id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ categoryId: bulkCategory || undefined, reviewed: true }),
                  }),
                ),
              ).then(() => {
                setSelected([]);
                setSelecting(false);
                load();
              });
            }}
          >
            Apply
          </button>
        </div>
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
