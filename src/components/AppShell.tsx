"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "./Icon";

const PRIMARY = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/transactions", label: "Activity", icon: "list" },
  { href: "/budget", label: "Budget", icon: "chart" },
  { href: "/accounts", label: "Accounts", icon: "wallet" },
];

const MORE = [
  { href: "/recurring", label: "Bills", icon: "calendar" },
  { href: "/cash-flow", label: "Cash flow", icon: "flow" },
  { href: "/reports", label: "Reports", icon: "chart" },
  { href: "/investments", label: "Investments", icon: "leaf" },
  { href: "/goals", label: "Goals", icon: "flag" },
  { href: "/settings", label: "Settings", icon: "gear" },
];

const ALL = [...PRIMARY, ...MORE];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some((item) => isActive(path, item.href));

  return (
    <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col md:flex-row">
      <aside className="hidden w-60 shrink-0 border-r border-[var(--line)] p-4 md:block">
        <Link href="/" className="mb-6 block px-2 pt-2">
          <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--terracotta)]">Shelf</div>
          <div className="mt-1 text-2xl font-bold tracking-tight">Money room</div>
        </Link>
        <nav className="flex flex-col gap-1">
          {ALL.map((item) => {
            const active = isActive(path, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold ${
                  active ? "bg-white text-[var(--terracotta)] shadow-[var(--shadow-xs)]" : "text-[var(--muted)]"
                }`}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 pb-6 pt-[max(12px,env(safe-area-inset-top))] md:px-8 md:pt-8">{children}</main>
        <nav className="ios-tabbar md:hidden">
          {PRIMARY.map((item) => {
            const active = isActive(path, item.href);
            return (
              <Link key={item.href} href={item.href} className={`ios-tab ${active ? "active" : ""}`}>
                <Icon name={item.icon} size={22} />
                {item.label}
              </Link>
            );
          })}
          <button type="button" className={`ios-tab ${moreActive ? "active" : ""}`} onClick={() => setMoreOpen(true)}>
            <Icon name="more" size={22} />
            More
          </button>
        </nav>
      </div>

      {moreOpen ? (
        <div className="ios-sheet-backdrop md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="ios-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ios-sheet-handle" />
            <h2 className="mb-3 text-xl font-bold tracking-tight">More</h2>
            <div className="ios-group">
              {MORE.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="ios-row justify-between text-[17px]"
                  onClick={() => setMoreOpen(false)}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-[var(--sage)]">
                      <Icon name={item.icon} size={18} />
                    </span>
                    {item.label}
                  </span>
                  <span className="text-[var(--muted)]">
                    <Icon name="chevron" size={16} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
