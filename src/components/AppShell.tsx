"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { yearMonth } from "@/lib/dates";
import { warmQuery } from "@/lib/use-query";
import { CommandPalette } from "./CommandPalette";
import { Icon } from "./Icon";
import { UndoHost } from "./UndoHost";
import { Drawer } from "./ui/Drawer";

const PRIMARY = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/transactions", label: "Activity", icon: "list" },
  { href: "/budget", label: "Budget", icon: "chart" },
  { href: "/accounts", label: "Accounts", icon: "wallet" },
];

const MORE = [
  { href: "/insights", label: "Insights", icon: "spark" },
  { href: "/recurring", label: "Bills", icon: "calendar" },
  { href: "/goals", label: "Goals", icon: "flag" },
];

const PREFETCH = ["/", "/transactions", "/budget", "/accounts", "/insights", "/recurring", "/goals", "/settings"];

type Note = { id: string; title: string; body: string; href: string | null; readAt: string | null };

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [notesOpen, setNotesOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [sync, setSync] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [reviewCount, setReviewCount] = useState(0);
  const scrollerRef = useRef<HTMLElement>(null);

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
    void api<{ unreviewed: number }>("/api/transactions?countOnly=1")
      .then((res) => setReviewCount(res.unreviewed))
      .catch(() => undefined);
  }, [path]);

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const unreadNotes = notes.filter((note) => !note.readAt);
    if (!unreadNotes.length || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready.then((registration) => {
      for (const note of unreadNotes) {
        const key = `shelf-note-${note.id}`;
        if (sessionStorage.getItem(key)) continue;
        sessionStorage.setItem(key, "1");
        void registration.showNotification(note.title, { body: note.body, tag: note.id, data: { href: note.href || "/" } });
      }
    });
  }, [notes]);

  useEffect(() => {
    for (const href of PREFETCH) router.prefetch(href);
    const now = yearMonth();
    warmQuery("dashboard", "/api/dashboard");
    warmQuery("accounts", "/api/accounts");
    warmQuery("budget:current", "/api/budget");
    warmQuery("activity:", "/api/transactions");
    warmQuery(`insights:${now.year}-${now.month}`, `/api/reports?year=${now.year}&month=${now.month}`);
    warmQuery("bills", "/api/recurring");
    warmQuery("goals", "/api/goals");
  }, [router]);

  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === "syncing" || detail === "synced" || detail === "error") setSync(detail);
    };
    window.addEventListener("shelf-sync", onSync);
    return () => window.removeEventListener("shelf-sync", onSync);
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    if (!desktop) scroller?.scrollTo(0, 0);
  }, [path]);

  const syncLabel = sync === "syncing" ? "Syncing" : sync === "error" ? "Sync failed" : sync === "synced" ? "Up to date" : "";
  const moreOn = MORE.some((item) => isActive(path, item.href));

  async function readNote(note: Note) {
    await api("/api/notifications", { method: "POST", body: JSON.stringify({ id: note.id }) });
    setNotesOpen(false);
    loadNotes();
    if (note.href) router.push(note.href);
  }

  return (
    <div className="flex h-dvh overflow-hidden md:h-auto md:min-h-dvh md:overflow-x-clip md:overflow-y-visible">
      <aside className="sticky top-0 z-10 hidden h-dvh w-[232px] shrink-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--paper)] px-3 py-5 md:flex">
        <div className="mb-6 flex items-center justify-between px-2">
          <Link href="/" prefetch>
            <div className="brand-mark text-[26px]">Shelf</div>
            {syncLabel ? <div className="text-[12px] text-[var(--muted)]">{syncLabel}</div> : null}
          </Link>
          <button type="button" className="relative text-[var(--muted)]" aria-label="Notifications" onClick={() => setNotesOpen(true)}>
            <Icon name="bell" size={18} />
            {unread ? <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[var(--danger)]" /> : null}
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {PRIMARY.map((item) => {
            const active = isActive(path, item.href);
            return (
              <Link key={item.href} href={item.href} prefetch aria-current={active ? "page" : undefined} className={`ios-nav ${active ? "active" : ""}`}>
                <Icon name={item.icon} size={16} filled={active} />
                <span className="flex-1">{item.label}</span>
                {item.href === "/transactions" && reviewCount > 0 ? <span className="nav-count">{reviewCount > 99 ? "99+" : reviewCount}</span> : null}
              </Link>
            );
          })}
          <div className="mt-5 flex flex-col gap-0.5">
            {MORE.map((item) => {
              const active = isActive(path, item.href);
              return (
                <Link key={item.href} href={item.href} prefetch aria-current={active ? "page" : undefined} className={`ios-nav ${active ? "active" : ""}`}>
                  <Icon name={item.icon} size={16} />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
          <Link href="/settings" prefetch aria-current={isActive(path, "/settings") ? "page" : undefined} className={`ios-nav mt-auto ${isActive(path, "/settings") ? "active" : ""}`}>
            <Icon name="gear" size={16} filled={isActive(path, "/settings")} />
            Settings
          </Link>
        </nav>
      </aside>

      <div className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:h-auto md:min-h-dvh md:overflow-visible">
        <div className="mobile-bar md:hidden">
          <span className={`mobile-sync ${sync === "error" ? "is-error" : ""}`}>{syncLabel}</span>
          <Link href="/" prefetch className="brand-mark mobile-brand">
            Shelf
          </Link>
          <span className="mobile-actions">
            <Link href="/settings" prefetch className="flex size-10 items-center justify-center text-[var(--ink)]" aria-label="Settings">
              <Icon name="gear" size={20} />
            </Link>
            <button type="button" className="relative flex size-10 items-center justify-center text-[var(--ink)]" aria-label="Notifications" onClick={() => setNotesOpen(true)}>
              <Icon name="bell" size={20} />
              {unread ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--danger)]" /> : null}
            </button>
          </span>
        </div>
        <main ref={scrollerRef} className="app-main">
          <div className="route-fade">{children}</div>
        </main>
        <nav className="ios-tabbar md:hidden" aria-label="Primary">
          {PRIMARY.map((item) => {
            const active = isActive(path, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className={`ios-tab ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
                aria-label={item.href === "/transactions" && reviewCount > 0 ? `${item.label}, ${reviewCount} to review` : item.label}
              >
                <span className="ios-tab-glyph" aria-hidden>
                  <Icon name={item.icon} size={24} filled={active} />
                  {item.href === "/transactions" && reviewCount > 0 ? <span className="tab-count">{reviewCount > 99 ? "99+" : reviewCount}</span> : null}
                </span>
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            className={`ios-tab ${moreOpen || moreOn ? "active" : ""}`}
            aria-expanded={moreOpen}
            aria-label="More"
            onClick={() => setMoreOpen(true)}
          >
            <span className="ios-tab-glyph" aria-hidden>
              <Icon name="more" size={22} filled={moreOpen || moreOn} />
            </span>
            More
          </button>
        </nav>
      </div>

      <CommandPalette />
      <UndoHost />
      {moreOpen ? (
        <Drawer title="More" onClose={() => setMoreOpen(false)}>
          <div className="card">
            {MORE.map((item) => {
              const active = isActive(path, item.href);
              return (
                <Link key={item.href} href={item.href} prefetch className="data-row" aria-current={active ? "page" : undefined} onClick={() => setMoreOpen(false)}>
                  <span className={`more-glyph ${active ? "is-on" : ""}`}>
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span className={`min-w-0 flex-1 font-medium ${active ? "text-[var(--accent-ink)]" : ""}`}>{item.label}</span>
                  <span className="text-[var(--tertiary)]">
                    <Icon name="chevron" size={16} />
                  </span>
                </Link>
              );
            })}
          </div>
        </Drawer>
      ) : null}
      {notesOpen ? (
        <Drawer
          title="Notifications"
          onClose={() => setNotesOpen(false)}
          action={
            unread ? (
              <button
                className="text-[13px] font-medium text-[var(--positive)]"
                type="button"
                onClick={() => api("/api/notifications", { method: "POST", body: JSON.stringify({ all: true }) }).then(loadNotes)}
              >
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
