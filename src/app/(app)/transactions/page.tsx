"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CategoryPicker, CategorySelect, type CatGroup } from "@/components/CategoryPicker";
import { ConfirmMark } from "@/components/ConfirmMark";
import { useConfirmFlash } from "@/components/ConfirmFlash";
import { Icon } from "@/components/Icon";
import { ReviewDeck } from "@/components/ReviewDeck";
import { offerUndo } from "@/components/UndoHost";
import { MerchantMark } from "@/components/MerchantMark";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { Sheet } from "@/components/Sheet";
import { SwipeRow } from "@/components/SwipeRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, FieldStack } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageError, PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { api } from "@/lib/client";
import { useQuery } from "@/lib/use-query";
import { dayLabel, monthRange, yearMonth } from "@/lib/dates";
import { rememberCategory } from "@/lib/category-memory";
import { merchantMatchKey } from "@/lib/plan";

type RuleApply = {
  id: string;
  applied: number;
  ids: string[];
  previous: { id: string; categoryId: string | null }[];
};

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

type TxPayload = {
  transactions: Tx[];
  unreviewed: number;
  faces?: Record<string, { monthCents: number; count: number }>;
  frequentCategoryIds?: string[];
};

export default function TransactionsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="activity" />}>
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
  const [manual, setManual] = useState({ accountId: "", name: "", amount: "", date: "", categoryId: "", income: false });
  const [faces, setFaces] = useState<Record<string, { monthCents: number; count: number }>>({});
  const [frequentCategoryIds, setFrequentCategoryIds] = useState<string[]>([]);
  const [reviewBaseline, setReviewBaseline] = useState<number | null>(null);
  const requestId = useRef(0);
  const cleared = useRef(new Set<string>());
  const [doneId, setDoneId] = useState<string | null>(null);
  const { flash, run } = useConfirmFlash();

  useEffect(() => {
    setQ(urlQ);
    setSearch(urlQ);
  }, [urlQ]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(q), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (accountId) qs.set("accountId", accountId);
    if (categoryId) qs.set("categoryId", categoryId);
    if (reviewed) qs.set("reviewed", reviewed);
    if (start) qs.set("start", start);
    if (end) qs.set("end", end);
    if (tag) qs.set("tag", tag);
    return qs.toString();
  }, [search, accountId, categoryId, reviewed, start, end, tag]);

  const { data: payload, loading, refreshing, error, reload } = useQuery<TxPayload>(
    `activity:${queryString}`,
    queryString ? `/api/transactions?${queryString}` : "/api/transactions",
    { keepPrevious: true },
  );
  const { data: dash } = useQuery<{ cashFlow: { spendingCents: number } }>("dashboard", "/api/dashboard");
  const load = reload;
  const [payloadSeen, setPayloadSeen] = useState<TxPayload | null>(null);
  if (payload && payload !== payloadSeen) {
    setPayloadSeen(payload);
    const returned = new Set(payload.transactions.map((tx) => tx.id));
    for (const tx of payload.transactions) {
      if (tx.reviewed) cleared.current.delete(tx.id);
    }
    for (const clearedId of [...cleared.current]) {
      if (!returned.has(clearedId)) cleared.current.delete(clearedId);
    }
    const ghosts = payload.transactions.filter((tx) => cleared.current.has(tx.id) && !tx.reviewed).length;
    setRows(payload.transactions.filter((tx) => !(cleared.current.has(tx.id) && !tx.reviewed)));
    setUnreviewed(Math.max(0, payload.unreviewed - ghosts));
    setFaces(payload.faces ?? {});
    setFrequentCategoryIds(payload.frequentCategoryIds ?? []);
  }

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

  useEffect(() => {
    if (!(focus && inReviewMode)) {
      setReviewBaseline(null);
      return;
    }
    setReviewBaseline((current) => (current == null && unreviewed > 0 ? unreviewed : current));
  }, [focus, inReviewMode, unreviewed]);

  function dropFromQueue(ids: string[]) {
    if (!ids.length) return;
    for (const id of ids) cleared.current.add(id);
    const gone = new Set(ids);
    setRows((current) => {
      if (reviewed === "false") return current.filter((row) => !gone.has(row.id));
      return current.map((row) => (gone.has(row.id) ? { ...row, reviewed: true } : row));
    });
    setUnreviewed((count) => Math.max(0, count - ids.length));
  }

  function restoreCleared(ids: string[]) {
    for (const id of ids) cleared.current.delete(id);
  }

  async function createMerchantRule(name: string, categoryId: string, rename?: string) {
    return api<RuleApply>("/api/rules", {
      method: "POST",
      body: JSON.stringify({
        name,
        matchMerchant: merchantMatchKey(name),
        actionCategoryId: categoryId,
        actionRename: rename,
        applyUnreviewed: true,
      }),
    });
  }

  async function hideTx(id: string) {
    await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ hidden: true }) });
    offerUndo("Hidden", async () => {
      await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ hidden: false }) });
      load();
    });
    setRows((current) => current.filter((row) => row.id !== id));
    load();
  }

  async function markDone(id: string) {
    const previous = rows.find((tx) => tx.id === id);
    if (!previous || doneId) return;
    setDoneId(id);
    const started = Date.now();
    try {
      await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ reviewed: true }) });
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const wait = reduce ? 0 : Math.max(0, 420 - (Date.now() - started));
      if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
      dropFromQueue([id]);
      offerUndo("Marked reviewed", async () => {
        restoreCleared([id]);
        await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ reviewed: false, categoryId: previous.categoryId, hidden: previous.hidden }) });
        load();
      });
    } finally {
      setDoneId((current) => (current === id ? null : current));
      load();
    }
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
    if (edit.categoryId) rememberCategory(edit.categoryId);
    if (!edit.reviewed) dropFromQueue([edit.id]);
    let applied: RuleApply | null = null;
    if (always && edit.categoryId) {
      const original = rows.find((row) => row.id === edit.id);
      applied = await createMerchantRule(edit.merchantName || edit.name, edit.categoryId, original && edit.name !== original.name ? edit.name : undefined);
      dropFromQueue(applied.ids.filter((id) => id !== edit.id));
    }
    const saved = edit;
    const others = applied?.applied ?? 0;
    await run(async () => undefined);
    offerUndo(others > 0 ? `Categorized ${others + (saved.reviewed ? 0 : 1)}` : "Saved", async () => {
      restoreCleared([saved.id, ...(applied?.ids ?? [])]);
      await api(`/api/transactions/${saved.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: saved.name,
          categoryId: saved.categoryId,
          reviewed: saved.reviewed,
          hidden: saved.hidden,
        }),
      });
      if (applied?.previous.length) {
        await api("/api/transactions/review-all", {
          method: "POST",
          body: JSON.stringify({ restore: applied.previous }),
        });
      }
      if (applied?.id) await api(`/api/rules/${applied.id}`, { method: "DELETE" });
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
        amount: manual.income ? -Math.abs(Number(manual.amount)) : Math.abs(Number(manual.amount)),
        date: manual.date || undefined,
        categoryId: manual.categoryId || undefined,
      }),
    });
    setManual({ accountId: "", name: "", amount: "", date: "", categoryId: "", income: false });
    setShowAdd(false);
    load();
  }

  const accountName = accounts.find((account) => account.id === accountId)?.name;
  const categoryName = groups.flatMap((group) => group.categories).find((category) => category.id === categoryId)?.name;

  if (!payload && loading) return <PageSkeleton variant="activity" />;
  if (!payload) return <PageError title="Activity" message={error} onRetry={() => void reload()} />;

  const filtered = Boolean(q || accountId || categoryId || tag || start || end || reviewed);

  return (
    <PageShell refreshing={refreshing}>
    <div className="space-y-4">
      {flash}
      <PageHeader title="Activity">
        <button className="text-btn" type="button" onClick={() => setShowAdd(true)}>
          Add
        </button>
      </PageHeader>

      {!filtered && dash ? (
        <Link href="/insights" className="spent-strip">
          <span>
            <span className="safe-kicker">Spent this month</span>
            <MoneyText className="spent-strip-amount" cents={dash.cashFlow.spendingCents} />
          </span>
          <Icon name="chevron" size={18} />
        </Link>
      ) : null}

      <div className="search-field">
        <Icon name="search" size={16} />
        <input
          className="shelf-input ios-search"
          placeholder="Search merchants or notes"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search transactions"
        />
      </div>

      <div className="activity-tools">
        {unreviewed > 0 ? (
          <button
            className={focus && inReviewMode ? "shelf-btn secondary" : "shelf-btn"}
            type="button"
            onClick={() => replaceQuery(focus && inReviewMode ? { reviewed: null, focus: null } : { reviewed: "false", focus: "1" })}
          >
            {focus && inReviewMode ? "Close review" : `Review ${unreviewed}`}
          </button>
        ) : null}
        <div className="activity-tools-side">
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
          <button className="text-btn" type="button" onClick={() => setFiltersOpen(true)}>
            Filter
          </button>
          <button className="text-btn" type="button" onClick={() => { setSelecting((value) => !value); setSelected([]); }}>
            {selecting ? "Cancel" : "Select"}
          </button>
          {canAcceptAll ? (
            <button className="text-btn" type="button" onClick={markVisibleDone}>
              Accept {unreviewedRows.length}
            </button>
          ) : null}
        </div>
      </div>

      {focus && inReviewMode ? (
        <ReviewDeck
          rows={unreviewedRows}
          remaining={unreviewed}
          total={reviewBaseline ?? unreviewed}
          groups={groups}
          frequentCategoryIds={frequentCategoryIds}
          faces={faces}
          onSkip={(tx) => {
            setRows((current) => {
              const index = current.findIndex((row) => row.id === tx.id);
              if (index < 0 || current.length < 2) return current;
              const next = current.slice();
              const [skipped] = next.splice(index, 1);
              next.push(skipped);
              return next;
            });
          }}
          onConfirm={async (tx, nextCategoryId, makeRule) => {
            if (nextCategoryId) rememberCategory(nextCategoryId);
            const id = ++requestId.current;
            dropFromQueue([tx.id]);
            let applied: RuleApply | null = null;
            try {
              await api(`/api/transactions/${tx.id}`, {
                method: "PATCH",
                body: JSON.stringify({ categoryId: nextCategoryId, reviewed: true }),
              });
              if (makeRule && nextCategoryId) {
                applied = await createMerchantRule(tx.merchantName || tx.name, nextCategoryId);
                dropFromQueue(applied.ids.filter((rowId) => rowId !== tx.id));
              }
              const extra = applied?.applied ?? 0;
              offerUndo(extra > 0 ? `Categorized ${extra + 1}` : "Reviewed", async () => {
                restoreCleared([tx.id, ...(applied?.ids ?? [])]);
                await api("/api/transactions/review-all", {
                  method: "POST",
                  body: JSON.stringify({
                    restore: [{ id: tx.id, categoryId: tx.categoryId }, ...(applied?.previous ?? [])],
                  }),
                });
                if (applied?.id) await api(`/api/rules/${applied.id}`, { method: "DELETE" });
                load();
              });
            } finally {
              if (id === requestId.current) load();
            }
          }}
        />
      ) : null}
      {focus && inReviewMode && !unreviewedRows.length && unreviewed > 0 ? (
        <p className="text-[13px] text-[var(--muted)]">Loading the next purchases…</p>
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
          <button
            className="shelf-btn secondary w-full"
            type="button"
            onClick={() => {
              setSelecting(true);
              setSelected([]);
              setFiltersOpen(false);
            }}
          >
            Select transactions
          </button>
        </Sheet>
      ) : null}

      {grouped.length === 0 && inReviewMode && unreviewed === 0 ? (
        <div className="empty-state caught-up">
          <ConfirmMark />
          <p className="empty-title">You’re caught up</p>
          <div className="empty-action">
            <button className="text-btn" type="button" onClick={() => replaceQuery({ reviewed: null, focus: null })}>
              Show all activity
            </button>
          </div>
        </div>
      ) : null}
      {grouped.length === 0 && !inReviewMode ? (
        <EmptyState title="No matches">Try another search or clear a filter.</EmptyState>
      ) : null}

      {grouped.map(([date, items]) => (
        <section key={date}>
          <h2 className="ios-section day-head">{dayLabel(date)}</h2>
          <div className="card">
            {items.map((tx) => {
              const row = (
                <div className={`data-row ${tx.reviewed ? "placed" : "is-open"} ${tx.pending ? "is-pending" : ""}`}>
                  {doneId === tx.id ? (
                    <span className="row-confirm" role="status" aria-label="Reviewed">
                      <ConfirmMark />
                    </span>
                  ) : null}
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
                      <div className="tx-name truncate font-medium">{tx.name}</div>
                      <div className="truncate text-[13px] text-[var(--muted)]">
                        {[tx.category?.name, tx.account?.name, tx.pending ? "Pending" : ""].filter(Boolean).join(" · ") || "Uncategorized"}
                      </div>
                    </span>
                  </button>
                  <div className="shrink-0 text-[16px] font-medium tabular-nums">
                    <MoneyText cents={tx.amountCents} flow />
                  </div>
                </div>
              );
              if (selecting) return <div key={tx.id} className="border-t border-[var(--line)] first:border-t-0">{row}</div>;
              return (
                <SwipeRow
                  key={tx.id}
                  peek={!tx.reviewed}
                  actions={[
                    { label: "Hide", tone: "danger", onClick: () => void hideTx(tx.id) },
                    tx.reviewed
                      ? { label: "Edit", tone: "ink", onClick: () => openEdit(tx) }
                      : { label: "Done", tone: "accent", onClick: () => void markDone(tx.id) },
                  ]}
                >
                  {row}
                </SwipeRow>
              );
            })}
          </div>
        </section>
      ))}

      {edit ? (
        <Sheet title={edit.merchantName || edit.name} onClose={() => setEdit(null)}>
          <div>
            <p className="text-[13px] text-[var(--muted)]">
              {dayLabel(edit.date)}
              {edit.account?.name ? ` · ${edit.account.name}` : ""}
              {edit.pending ? " · Pending" : ""}
            </p>
            <div className="mt-1 text-[32px] font-semibold tracking-[-0.03em]">
              <MoneyText cents={edit.amountCents} flow />
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
          <Field label="Linked transfer">
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
          <Field label="Tags">
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
          <button type="button" className="data-row w-full justify-between gap-3 text-left" aria-pressed={always} onClick={() => setAlways((value) => !value)}>
            <span>Always categorize this merchant this way</span>
            <span className={`switch ${always ? "on" : ""}`} />
          </button>
          <button className="shelf-btn w-full" type="button" onClick={saveEdit}>
            Save
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
              <Field label="Amount">
                <input
                  className="shelf-input"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={manual.amount}
                  onChange={(e) => setManual({ ...manual, amount: e.target.value })}
                  required
                />
              </Field>
              <button
                type="button"
                className="data-row w-full justify-between rounded-[16px]"
                aria-pressed={manual.income}
                onClick={() => setManual({ ...manual, income: !manual.income })}
              >
                Income
                <span className={`switch ${manual.income ? "on" : ""}`} />
              </button>
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
    </PageShell>
  );
}
