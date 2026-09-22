"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CategorySelect, type CatGroup } from "@/components/CategoryPicker";
import { ConfirmMark } from "@/components/ConfirmMark";
import { MerchantMark } from "@/components/MerchantMark";
import { MoneyText } from "@/components/MoneyText";
import { api } from "@/lib/client";
import { rankCategories } from "@/lib/category-memory";
import { dayLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
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
  frequentCategoryIds,
  faces,
  onConfirm,
  onSkip,
}: {
  rows: Tx[];
  remaining: number;
  total: number;
  groups: CatGroup[];
  frequentCategoryIds: string[];
  faces: Record<string, { monthCents: number; count: number }>;
  onConfirm: (tx: Tx, categoryId: string | null, always: boolean) => Promise<void>;
  onSkip: (tx: Tx) => void;
}) {
  const current = rows[0];
  const [visible, setVisible] = useState(current);
  const [leaving, setLeaving] = useState(false);
  const [categoryId, setCategoryId] = useState(current?.categoryId ?? "");
  const [always, setAlways] = useState(false);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(false);
  const burstLock = useRef(false);
  const [similar, setSimilar] = useState<number | null>(null);
  const [memoryReady, setMemoryReady] = useState(false);
  const visibleRef = useRef(current);
  visibleRef.current = visible;
  const currentRef = useRef(current);
  currentRef.current = current;
  const currentId = current?.id ?? null;

  const pool = useMemo(
    () =>
      groups
        .filter((group) => group.name !== "Income")
        .flatMap((group) => group.categories)
        .map((category) => category.id),
    [groups],
  );
  const byId = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const group of groups) {
      for (const category of group.categories) map.set(category.id, category);
    }
    return map;
  }, [groups]);
  const quick = (memoryReady ? rankCategories(pool, frequentCategoryIds) : pool.slice(0, 6))
    .map((id) => byId.get(id))
    .filter((category): category is { id: string; name: string } => Boolean(category));
  const quickRef = useRef(quick);
  quickRef.current = quick;

  const merchant = visible ? visible.merchantName || visible.name : "";
  const face = visible ? faces[visible.merchantName || visible.name] : undefined;
  const done = total > 0 ? Math.max(0, total - remaining) : 0;
  const progress = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;

  useEffect(() => {
    setMemoryReady(true);
  }, []);

  useEffect(() => {
    const next = currentRef.current;
    const previous = visibleRef.current;
    if (previous?.id === next?.id) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = !previous || reduce ? 0 : 170;
    if (wait) setLeaving(true);
    const timer = window.setTimeout(() => {
      setVisible(next);
      setLeaving(false);
      setBurst(false);
      burstLock.current = false;
      setCategoryId(next?.categoryId ?? "");
      setAlways(false);
      setSimilar(null);
      setBusy(false);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [currentId]);

  useEffect(() => {
    if (!always || !visible) {
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
        excludeId: visible.id,
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
  }, [always, merchant, visible]);

  const confirmRef = useRef<() => void>(() => undefined);
  confirmRef.current = () => {
    if (!visible || busy || leaving || burstLock.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = () => {
      if (!visibleRef.current) return;
      setBusy(true);
      void onConfirm(visibleRef.current, categoryId || null, always && Boolean(categoryId)).finally(() => setBusy(false));
    };
    if (reduce) {
      run();
      return;
    }
    burstLock.current = true;
    setBurst(true);
    window.setTimeout(run, 420);
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (event.key === "Enter") {
        event.preventDefault();
        confirmRef.current();
        return;
      }
      if (/^[1-6]$/.test(event.key)) {
        const chip = quickRef.current[Number(event.key) - 1];
        if (!chip) return;
        event.preventDefault();
        setCategoryId(chip.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!visible) return null;

  function confirm() {
    confirmRef.current();
  }

  return (
    <section className={`review-card shelf-panel space-y-4 p-5 ${leaving ? "is-leaving" : ""} ${burst ? "is-confirmed" : ""}`}>
      {burst ? (
        <div className="confirm-burst" role="status" aria-label="Saved">
          <ConfirmMark />
        </div>
      ) : null}
      <div className="review-meter" aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className="text-[13px] text-[var(--muted)]">
        {remaining} left
        {total > remaining ? ` · ${done} done` : ""}
        {" · "}
        {dayLabel(visible.date)}
        {visible.account?.name ? ` · ${visible.account.name}` : ""}
        {visible.pending ? " · Pending" : ""}
      </p>
      <div className="flex items-center gap-3">
        <MerchantMark name={merchant} color={visible.category?.color} />
        <div className="min-w-0">
          <div className="truncate text-[20px] font-semibold tracking-[-0.03em]">{visible.name}</div>
          <div className="truncate text-[13px] text-[var(--muted)]">
            {visible.category?.name ?? "Uncategorized"}
            {face && face.monthCents > 0 ? ` · ${formatMoney(face.monthCents)} this month` : ""}
          </div>
        </div>
      </div>
      <MoneyText hero animate cents={visible.amountCents} flow />
      <div className="flex flex-wrap gap-2">
        {quick.map((category, index) => (
          <button
            key={category.id}
            type="button"
            className={`chip ${categoryId === category.id ? "is-on" : ""}`}
            onClick={() => setCategoryId(category.id)}
          >
            <span className="text-[var(--tertiary)]">{index + 1}</span>
            {category.name}
          </button>
        ))}
      </div>
      <CategorySelect groups={groups} value={categoryId} onChange={setCategoryId} emptyLabel="Choose a category" />
      <button type="button" className="data-row w-full justify-between gap-3 rounded-[16px] text-left" aria-pressed={always} onClick={() => setAlways((value) => !value)}>
        <span className="min-w-0">
          <span className="block">Always categorize {merchant} this way</span>
          {always && similar != null && similar > 0 ? (
            <span className="mt-0.5 block text-[13px] font-normal text-[var(--muted)]">Clears {similar} more</span>
          ) : null}
        </span>
        <span className={`switch ${always ? "on" : ""}`} />
      </button>
      <div className="flex gap-2">
        <button className="shelf-btn ghost flex-1" type="button" onClick={() => visible && onSkip(visible)} disabled={busy || leaving || burst}>
          Skip
        </button>
        <button className="shelf-btn flex-1" type="button" onClick={() => void confirm()} disabled={busy || leaving || burst}>
          {busy ? "Saving…" : "Confirm"}
        </button>
      </div>
    </section>
  );
}
