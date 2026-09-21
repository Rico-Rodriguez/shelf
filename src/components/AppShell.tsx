"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Icon } from "./Icon";
import { Drawer } from "./ui/Drawer";

const GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Home", icon: "home" },
      { href: "/accounts", label: "Accounts", icon: "wallet" },
      { href: "/transactions", label: "Transactions", icon: "list" },
    ],
  },
  {
    label: "Plan",
    items: [
      { href: "/budget", label: "Budget", icon: "chart" },
      { href: "/cash-flow", label: "Cash flow", icon: "flow" },
      { href: "/recurring", label: "Recurring", icon: "calendar" },
      { href: "/goals", label: "Goals", icon: "flag" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: "chart" },
      { href: "/investments", label: "Investments", icon: "leaf" },
    ],
  },
];

const PRIMARY = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/transactions", label: "Transactions", icon: "list" },
  { href: "/budget", label: "Budget", icon: "chart" },
  { href: "/accounts", label: "Accounts", icon: "wallet" },
];

const MORE = GROUPS.flatMap((group) => group.items).filter((item) => !PRIMARY.some((primary) => primary.href === item.href));
MORE.push({ href: "/settings", label: "Settings", icon: "gear" });

type Note = { id: string; title: string; body: string; href: string | null; readAt: string | null };

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [sync, setSync] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const moreActive = MORE.some((item) => isActive(path, item.href));

  const loadNotes = useCallback(() => {
    void api<{ notifications: Note[]; unread: number }>("/api/notifications")
      .then((res) => {
        setNotes(res.notifications);
        setUnread(res.unread);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes, path]);

  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === "syncing" || detail === "synced" || detail === "error") setSync(detail);
    };
    window.addEventListener("shelf-sync", onSync);
    return () => window.removeEventListener("shelf-sync", onSync);
  }, []);

  const syncLabel = sync === "syncing" ? "Syncing" : sync === "error" ? "Sync failed" : sync === "synced" ? "Up to date" : "";

  async function readNote(note: Note) {
    await api("/api/notifications", { method: "POST", body: JSON.stringify({ id: note.id }) });
    setNotesOpen(false);
    loadNotes();
    if (note.href) window.location.href = note.href;
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 z-10 hidden h-dvh w-[232px] shrink-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--linen)] px-3 py-5 md:flex">
        <div className="mb-6 flex items-center justify-between px-2">
          <Link href="/">
            <div className="text-[22px] font-semibold tracking-[-0.04em]">Shelf</div>
            <div className="text-[12px] text-[var(--muted)]">{syncLabel || "Your money, clearly"}</div>
          </Link>
          <button type="button" className="relative text-[var(--muted)]" aria-label="Notifications" onClick={() => setNotesOpen(true)}>
            <Icon name="bell" size={18} />
            {unread ? <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[var(--danger)]" /> : null}
          </button>
        </div>
        <nav className="flex flex-col gap-5">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)]">{group.label}</div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = isActive(path, item.href);
                  return (
                    <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`ios-nav ${active ? "active" : ""}`}>
                      <Icon name={item.icon} size={16} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <Link href="/settings" aria-current={isActive(path, "/settings") ? "page" : undefined} className={`ios-nav ${isActive(path, "/settings") ? "active" : ""}`}>
            <Icon name="gear" size={16} />
            Settings
          </Link>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--line)] bg-[var(--parchment)]/90 px-4 py-2 backdrop-blur md:hidden">
          <span className="text-[12px] text-[var(--muted)]">{syncLabel}</span>
          <button type="button" className="relative text-[var(--espresso)]" aria-label="Notifications" onClick={() => setNotesOpen(true)}>
            <Icon name="bell" size={20} />
            {unread ? <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[var(--danger)]" /> : null}
          </button>
        </div>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-8 pt-4 md:px-8 md:pb-12 md:pt-8">{children}</main>
        <nav className="ios-tabbar md:hidden">
          {PRIMARY.map((item) => {
            const active = isActive(path, item.href);
            return (
              <Link key={item.href} href={item.href} className={`ios-tab ${active ? "active" : ""}`}>
                <span className="ios-tab-glyph">
                  <Icon name={item.icon} size={22} />
                </span>
                {item.label}
              </Link>
            );
          })}
          <button type="button" className={`ios-tab ${moreActive ? "active" : ""}`} onClick={() => setMoreOpen(true)}>
            <span className="ios-tab-glyph">
              <Icon name="more" size={22} />
            </span>
            More
          </button>
        </nav>
      </div>

      {moreOpen ? (
        <div className="ios-sheet-backdrop md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="ios-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ios-sheet-handle" />
            <h2 className="mb-3 text-[18px] font-semibold">More</h2>
            {GROUPS.map((group) => (
              <div key={group.label} className="mb-4">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)]">{group.label}</div>
                <div className="card">
                  {group.items.map((item) => (
                    <Link key={item.href} href={item.href} className="data-row" onClick={() => setMoreOpen(false)}>
                      <Icon name={item.icon} size={16} />
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <Link href="/settings" className="data-row card" onClick={() => setMoreOpen(false)}>
              <Icon name="gear" size={16} />
              Settings
            </Link>
          </div>
        </div>
      ) : null}

      {notesOpen ? (
        <Drawer
          title="Notifications"
          onClose={() => setNotesOpen(false)}
          action={
            unread ? (
              <button className="text-[13px] font-medium text-[var(--terracotta)]" type="button" onClick={() => api("/api/notifications", { method: "POST", body: JSON.stringify({ all: true }) }).then(loadNotes)}>
                Mark all read
              </button>
            ) : null
          }
        >
          {notes.length === 0 ? <p className="text-[var(--muted)]">Nothing new.</p> : null}
          <div className="card">
            {notes.map((note) => (
              <button key={note.id} type="button" className="data-row w-full items-start text-left" onClick={() => readNote(note)}>
                <span className="min-w-0">
                  <span className={`block font-medium ${note.readAt ? "text-[var(--muted)]" : ""}`}>{note.title}</span>
                  <span className="block text-[13px] text-[var(--muted)]">{note.body}</span>
                </span>
              </button>
            ))}
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}
