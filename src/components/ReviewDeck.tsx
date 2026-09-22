"use client";

import { useState } from "react";
import { CategorySelect, type CatGroup } from "@/components/CategoryPicker";
import { MerchantMark } from "@/components/MerchantMark";
import { MoneyText } from "@/components/MoneyText";
import { dayLabel } from "@/lib/dates";

type Tx = {
  id: string;
  name: string;
  merchantName: string | null;
  amountCents: number;
  date: string;
  categoryId: string | null;
  pending: boolean;
  account: { name: string } | null;
  category: { name: string; color?: string } | null;
};

export function ReviewDeck({
  rows,
  groups,
  onConfirm,
  onSkip,
}: {
  rows: Tx[];
  groups: CatGroup[];
  onConfirm: (tx: Tx, categoryId: string | null, always: boolean) => Promise<void>;
  onSkip: (tx: Tx) => void;
}) {
  const current = rows[0];
  const [categoryId, setCategoryId] = useState(current?.categoryId ?? "");
  const [always, setAlways] = useState(false);
  const [busy, setBusy] = useState(false);
  const quick = groups
    .filter((group) => group.name !== "Income")
    .flatMap((group) => group.categories)
    .slice(0, 6);

  if (!current) return null;

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(current, categoryId || null, always && Boolean(categoryId));
      setAlways(false);
      setCategoryId("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="shelf-panel space-y-4 p-5">
      <p className="text-[13px] text-[var(--muted)]">
        {rows.length} left · {dayLabel(current.date)}
        {current.account?.name ? ` · ${current.account.name}` : ""}
        {current.pending ? " · Pending" : ""}
      </p>
      <div className="flex items-center gap-3">
        <MerchantMark name={current.merchantName || current.name} color={current.category?.color} />
        <div className="min-w-0">
          <div className="truncate text-[20px] font-semibold tracking-[-0.03em]">{current.name}</div>
          <div className="text-[13px] text-[var(--muted)]">{current.category?.name ?? "Uncategorized"}</div>
        </div>
      </div>
      <MoneyText hero cents={-current.amountCents} signed />
      <div className="flex flex-wrap gap-2">
        {quick.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`chip ${categoryId === category.id ? "is-on" : ""}`}
            onClick={() => setCategoryId(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>
      <CategorySelect groups={groups} value={categoryId} onChange={setCategoryId} emptyLabel="Choose a category" />
      <button type="button" className="data-row w-full justify-between rounded-[16px]" aria-pressed={always} onClick={() => setAlways((value) => !value)}>
        Always categorize {current.merchantName || current.name} this way
        <span className={`switch ${always ? "on" : ""}`} />
      </button>
      <div className="flex gap-2">
        <button className="shelf-btn ghost flex-1" type="button" onClick={() => onSkip(current)} disabled={busy}>
          Skip
        </button>
        <button className="shelf-btn flex-1" type="button" onClick={() => void confirm()} disabled={busy}>
          {busy ? "Saving…" : "Confirm"}
        </button>
      </div>
    </section>
  );
}
