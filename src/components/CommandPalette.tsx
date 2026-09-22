"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

const PAGES = [
  { href: "/", label: "Home" },
  { href: "/transactions", label: "Activity" },
  { href: "/budget", label: "Plan" },
  { href: "/accounts", label: "Accounts" },
  { href: "/recurring", label: "Bills" },
  { href: "/goals", label: "Goals" },
  { href: "/insights", label: "Insights" },
  { href: "/settings", label: "Settings" },
  { href: "/settings/rules", label: "Rules" },
];

type Hit = { href: string; label: string; hint?: string };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [extra, setExtra] = useState<Hit[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (query.length < 2) {
      setExtra([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void Promise.all([
        api<{ transactions: { id: string; name: string; date: string }[] }>(`/api/transactions?q=${encodeURIComponent(query)}`).catch(() => ({ transactions: [] })),
        api<{ accounts: { id: string; name: string }[] }>("/api/accounts").catch(() => ({ accounts: [] })),
        api<{ groups: { name: string; categories: { id: string; name: string }[] }[] }>("/api/categories").catch(() => ({ groups: [] })),
      ]).then(([txs, accounts, categories]) => {
        const needle = query.toLowerCase();
        const hits: Hit[] = [];
        for (const tx of txs.transactions.slice(0, 6)) {
          hits.push({ href: `/transactions?q=${encodeURIComponent(tx.name)}`, label: tx.name, hint: tx.date });
          hits.push({ href: `/merchant?name=${encodeURIComponent(tx.name)}`, label: tx.name, hint: "Merchant" });
        }
        for (const account of accounts.accounts) {
          if (account.name.toLowerCase().includes(needle)) hits.push({ href: `/accounts/${account.id}`, label: account.name, hint: "Account" });
        }
        for (const group of categories.groups) {
          for (const category of group.categories) {
            if (category.name.toLowerCase().includes(needle)) {
              hits.push({ href: `/transactions?categoryId=${category.id}`, label: category.name, hint: group.name });
            }
          }
        }
        setExtra(hits.slice(0, 12));
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [open, q]);

  const pages = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return PAGES.filter((page) => !needle || page.label.toLowerCase().includes(needle));
  }, [q]);

  if (!open) return null;

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  return (
    <div className="command-backdrop" onClick={() => setOpen(false)}>
      <div className="command-panel" role="dialog" aria-label="Search" onClick={(event) => event.stopPropagation()}>
        <input
          className="shelf-input"
          autoFocus
          placeholder="Search pages, merchants, categories"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          aria-label="Search Shelf"
        />
        <div className="command-list">
          {pages.map((page) => (
            <button key={page.href} type="button" className="command-hit" onClick={() => go(page.href)}>
              <span>{page.label}</span>
              <span className="text-[var(--muted)]">Page</span>
            </button>
          ))}
          {extra.map((hit) => (
            <button key={hit.href + hit.label} type="button" className="command-hit" onClick={() => go(hit.href)}>
              <span className="truncate">{hit.label}</span>
              <span className="text-[var(--muted)]">{hit.hint}</span>
            </button>
          ))}
          {pages.length === 0 && extra.length === 0 ? <p className="px-3 py-4 text-[14px] text-[var(--muted)]">Nothing matches.</p> : null}
        </div>
      </div>
    </div>
  );
}
