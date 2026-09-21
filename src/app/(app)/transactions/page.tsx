"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MoneyText } from "@/components/MoneyText";
import { api } from "@/lib/client";

type Tx = {
  id: string;
  name: string;
  merchantName: string | null;
  amountCents: number;
  date: string;
  reviewed: boolean;
  hidden: boolean;
  notes: string | null;
  categoryId: string | null;
  isTransfer: boolean;
  account: { name: string } | null;
  category: { name: string; sprite: string } | null;
  tags: { name: string }[];
  splits: { categoryId: string; amountCents: number }[];
};

type CatGroup = { id: string; name: string; categories: { id: string; name: string }[] };

export default function TransactionsPage() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [q, setQ] = useState("");
  const [reviewed, setReviewed] = useState("");
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [edit, setEdit] = useState<Tx | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [manual, setManual] = useState({ accountId: "", name: "", amount: "", date: "", categoryId: "" });

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (reviewed) qs.set("reviewed", reviewed);
    void api<{ transactions: Tx[] }>(`/api/transactions?${qs}`).then((r) => setRows(r.transactions));
  }, [q, reviewed]);

  useEffect(() => {
    load();
    void api<{ groups: CatGroup[] }>("/api/categories").then((r) => setGroups(r.groups));
    void api<{ accounts: { id: string; name: string }[] }>("/api/accounts").then((r) => setAccounts(r.accounts));
  }, [load]);

  const cats = useMemo(() => groups.flatMap((g) => g.categories), [groups]);

  async function saveEdit() {
    if (!edit) return;
    await api(`/api/transactions/${edit.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: edit.name,
        categoryId: edit.categoryId,
        reviewed: true,
        hidden: edit.hidden,
        notes: edit.notes,
        isTransfer: edit.isTransfer,
        tags: edit.tags.map((t) => t.name),
      }),
    });
    setEdit(null);
    load();
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
          <h1 className="text-[34px] font-bold tracking-tight">Activity</h1>
          <p className="text-[15px] text-[var(--muted)]">Tap a row to categorize and mark reviewed.</p>
        </div>
        <button className="pixel-btn" type="button" onClick={() => setShowAdd(true)}>
          Add
        </button>
      </div>

      <input className="pixel-input ios-search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="ios-seg w-full max-w-xs">
        <button type="button" className={reviewed === "" ? "active" : ""} onClick={() => setReviewed("")}>
          All
        </button>
        <button type="button" className={reviewed === "false" ? "active" : ""} onClick={() => setReviewed("false")}>
          Inbox
        </button>
        <button type="button" className={reviewed === "true" ? "active" : ""} onClick={() => setReviewed("true")}>
          Reviewed
        </button>
      </div>

      <div className="ios-group">
        {rows.map((tx) => (
          <button
            key={tx.id}
            type="button"
            className={`ios-row w-full text-left ${tx.reviewed ? "placed" : ""}`}
            onClick={() => setEdit(tx)}
          >
            <div className="min-w-0 flex-1">
              <div className="tx-name truncate text-[17px] font-medium">{tx.name}</div>
              <div className="truncate text-[13px] text-[var(--muted)]">
                {tx.date} · {tx.category?.name ?? "Uncategorized"} · {tx.account?.name}
              </div>
            </div>
            <div className="shrink-0 text-[17px] tabular-nums">
              <MoneyText cents={-tx.amountCents} signed />
            </div>
          </button>
        ))}
        {rows.length === 0 ? <div className="ios-row text-[var(--muted)]">No transactions.</div> : null}
      </div>

      {edit ? (
        <div className="ios-sheet-backdrop" onClick={() => setEdit(null)}>
          <div className="ios-sheet space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="ios-sheet-handle" />
            <h2 className="text-xl font-bold tracking-tight">Edit</h2>
            <input className="pixel-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <select className="pixel-input" value={edit.categoryId ?? ""} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <textarea className="pixel-input" rows={2} placeholder="Note" value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            <div className="ios-group">
              <label className="ios-row justify-between text-[17px]">
                Hide from budget
                <button type="button" className={`switch ${edit.hidden ? "on" : ""}`} onClick={() => setEdit({ ...edit, hidden: !edit.hidden })} />
              </label>
              <label className="ios-row justify-between text-[17px]">
                Transfer
                <button type="button" className={`switch ${edit.isTransfer ? "on" : ""}`} onClick={() => setEdit({ ...edit, isTransfer: !edit.isTransfer })} />
              </label>
            </div>
            <button className="pixel-btn w-full" type="button" onClick={saveEdit}>
              Save & review
            </button>
            <button className="pixel-btn ghost w-full" type="button" onClick={() => setEdit(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {showAdd ? (
        <div className="ios-sheet-backdrop" onClick={() => setShowAdd(false)}>
          <form className="ios-sheet space-y-3" onClick={(e) => e.stopPropagation()} onSubmit={addManual}>
            <div className="ios-sheet-handle" />
            <h2 className="text-xl font-bold tracking-tight">New transaction</h2>
            <select className="pixel-input" value={manual.accountId} onChange={(e) => setManual({ ...manual, accountId: e.target.value })} required>
              <option value="">Account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <input className="pixel-input" placeholder="Name" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} required />
            <input className="pixel-input" inputMode="decimal" placeholder="Amount (+ out, − in)" value={manual.amount} onChange={(e) => setManual({ ...manual, amount: e.target.value })} required />
            <input className="pixel-input" type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} />
            <select className="pixel-input" value={manual.categoryId} onChange={(e) => setManual({ ...manual, categoryId: e.target.value })}>
              <option value="">Category</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button className="pixel-btn w-full">Add</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
