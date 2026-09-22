"use client";

import { useEffect, useRef, useState } from "react";
import { CategorySelect, type CatGroup } from "@/components/CategoryPicker";
import { MerchantMark } from "@/components/MerchantMark";
import { MoneyText } from "@/components/MoneyText";
import { api } from "@/lib/client";
import { dayLabel } from "@/lib/dates";
import { merchantMatchKey } from "@/lib/plan";

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
  remaining,
  total,
  groups,
  onConfirm,
  onSkip,
}: {
  rows: Tx[];
  remaining: number;
  total: number;
  groups: CatGroup[];
  onConfirm: (tx: Tx, categoryId: string | null, always: boolean) => Promise<void>;
  onSkip: (tx: Tx) => void;
}) {
  const current = rows[0];
  const [categoryId, setCategoryId] = useState(current?.categoryId ?? "");
  const [always, setAlways] = useState(false);
  const [busy, setBusy] = useState(false);
  const [similar, setSimilar] = useState<number | null>(null);
  const quick = groups
    .filter((group) => group.name !== "Income")
    .flatMap((group) => group.categories)
    .slice(0, 6);
  const merchant = current ? current.merchantName || current.name : "";
  const done = total > 0 ? Math.max(0, total - remaining) : 0;
  const progress = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;

  useEffect(() => {
    if (!always || !current) {
      setSimilar(null);
      return;
    }
    let active = true;
    setSimilar(null);
    void api<{ count: number }>("/api/rules/preview", {
      method: "POST",
      body: JSON.stringify({
        matchMerchant: merchantMatchKey(merchant),
        unreviewedOnly: true,
        excludeId: current.id,
      }),
    })
      .then((res) => {
        if (active) setSimilar(res.count);
      })
      .catch(() => {
        if (active) setSimilar(null);
      });
    return () => {
      active = false;
    };
  }, [always, current, merchant]);

  const confirmRef = useRef<() => void>(() => undefined);
  confirmRef.current = () => {
    if (!current || busy) return;
    setBusy(true);
    void onConfirm(current, categoryId || null, always && Boolean(categoryId))
      .then(() => {
        setAlways(false);
        setCategoryId("");
      })
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (event.key !== "Enter") return;
      event.preventDefault();
      confirmRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!current) return null;

  function confirm() {
    confirmRef.current();
  }

  return (
    <section className="shelf-panel space-y-4 p-5">
      <div className="review-meter" aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className="text-[13px] text-[var(--muted)]">
        {remaining} left
        {total > remaining ? ` · ${done} done` : ""}
        {" · "}
        {dayLabel(current.date)}
        {current.account?.name ? ` · ${current.account.name}` : ""}
        {current.pending ? " · Pending" : ""}
      </p>
      <div className="flex items-center gap-3">
        <MerchantMark name={merchant} color={current.category?.color} />
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
      <button type="button" className="data-row w-full items-start justify-between gap-3 rounded-[16px] text-left" aria-pressed={always} onClick={() => setAlways((value) => !value)}>
        <span>
          <span className="block">Always categorize {merchant} this way</span>
          {always ? (
            <span className="mt-1 block text-[13px] font-normal text-[var(--muted)]">
              {similar == null
                ? "Checking other purchases…"
                : similar === 0
                  ? "Future purchases from this merchant."
                  : `Also clears ${similar} other purchase${similar === 1 ? "" : "s"} waiting for review.`}
            </span>
          ) : (
            <span className="mt-1 block text-[13px] font-normal text-[var(--muted)]">Applies to every matching purchase still waiting.</span>
          )}
        </span>
        <span className={`switch mt-1 ${always ? "on" : ""}`} />
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
