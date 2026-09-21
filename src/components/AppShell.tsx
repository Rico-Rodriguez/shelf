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
    <div className="flex min-h-dvh bg-[var(--parchment)]">
      <aside className="sticky top-0 hidden h-dvh w-[250px] shrink-0 flex-col border-r-[0.5px] border-[var(--line-strong)] px-3 py-5 md:flex">
        <Link href="/" className="mb-4 block px-2.5">
          <div className="text-[22px] font-bold leading-7 tracking-[-0.26px]">Shelf</div>
          <div className="text-[13px] leading-[18px] text-[var(--muted)]">Money room</div>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {ALL.map((item) => {
            const active = isActive(path, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-2.5 rounded-[10px] px-2.5 text-[17px] tracking-[-0.41px] ${
                  active ? "bg-[rgba(120,120,128,0.16)] font-semibold" : "font-normal"
                }`}
              >
                <span className={active ? "text-[var(--terracotta)]" : "text-[var(--muted)]"}>
                  <Icon name={item.icon} size={20} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-8 pt-[max(8px,env(safe-area-inset-top))] md:px-8 md:pb-12 md:pt-7">
          {children}
        </main>
        <nav className="ios-tabbar md:hidden">
          {PRIMARY.map((item) => {
            const active = isActive(path, item.href);
            return (
              <Link key={item.href} href={item.href} className={`ios-tab ${active ? "active" : ""}`}>
                <Icon name={item.icon} size={24} />
                {item.label}
              </Link>
            );
          })}
          <button type="button" className={`ios-tab ${moreActive ? "active" : ""}`} onClick={() => setMoreOpen(true)}>
            <Icon name="more" size={24} />
            More
          </button>
        </nav>
      </div>

      {moreOpen ? (
        <div className="ios-sheet-backdrop md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="ios-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ios-sheet-handle" />
            <h2 className="mb-3 px-4 text-[22px] font-bold tracking-[-0.26px]">More</h2>
            <div className="ios-group">
              {MORE.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="ios-row justify-between"
                  onClick={() => setMoreOpen(false)}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-[var(--terracotta)]">
                      <Icon name={item.icon} size={20} />
                    </span>
                    {item.label}
                  </span>
                  <span className="text-[var(--tertiary)]">
                    <Icon name="chevron" size={14} />
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
