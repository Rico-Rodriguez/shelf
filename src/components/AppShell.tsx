"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { CommandPalette } from "./CommandPalette";
import { Icon } from "./Icon";
import { UndoHost } from "./UndoHost";
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
      { href: "/recurring", label: "Recurring", icon: "calendar" },
      { href: "/goals", label: "Goals", icon: "flag" },
    ],
  },
  {
    label: "Insights",
    items: [{ href: "/insights", label: "Insights", icon: "flow" }],
  },
];

const PRIMARY = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/transactions", label: "Activity", icon: "list" },
  { href: "/budget", label: "Budget", icon: "chart" },
  { href: "/accounts", label: "Accounts", icon: "wallet" },
];

const MORE = GROUPS.flatMap((group) => group.items).filter((item) => !PRIMARY.some((primary) => primary.href === item.href));
MORE.push({ href: "/settings", label: "Settings", icon: "gear" });

const PREFETCH = ["/", "/transactions", "/budget", "/accounts", "/insights", "/recurring", "/goals", "/settings"];

type Note = { id: string; title: string; body: string; href: string | null; readAt: string | null };

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
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
  }, [router]);

  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === "syncing" || detail === "synced" || detail === "error") setSync(detail);
    };
    window.addEventListener("shelf-sync", onSync);
    return () => window.removeEventListener("shelf-sync", onSync);
  }, []);

  useEffect(() => {
    setMoreOpen(false);
  }, [path]);

  const syncLabel = sync === "syncing" ? "Syncing" : sync === "error" ? "Sync failed" : sync === "synced" ? "Up to date" : "";

  async function readNote(note: Note) {
    await api("/api/notifications", { method: "POST", body: JSON.stringify({ id: note.id }) });
    setNotesOpen(false);
    loadNotes();
    if (note.href) router.push(note.href);
  }

  return (
    <div className="flex min-h-dvh overflow-x-clip">
      <aside className="sticky top-0 z-10 hidden h-dvh w-[232px] shrink-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--paper)] px-3 py-5 md:flex">
        <div className="mb-6 flex items-center justify-between px-2">
          <Link href="/" prefetch>
            <div className="brand-mark text-[26px]">Shelf</div>
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
                    <Link key={item.href} href={item.href} prefetch aria-current={active ? "page" : undefined} className={`ios-nav ${active ? "active" : ""}`}>
                      <Icon name={item.icon} size={16} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <Link href="/settings" prefetch aria-current={isActive(path, "/settings") ? "page" : undefined} className={`ios-nav ${isActive(path, "/settings") ? "active" : ""}`}>
            <Icon name="gear" size={16} />
            Settings
          </Link>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface)]/92 px-4 py-2.5 backdrop-blur md:hidden">
          <span className="text-[12px] text-[var(--muted)]">{syncLabel || "\u00A0"}</span>
          <button type="button" className="relative flex size-10 items-center justify-center text-[var(--ink)]" aria-label="Notifications" onClick={() => setNotesOpen(true)}>
            <Icon name="bell" size={20} />
            {unread ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--danger)]" /> : null}
          </button>
        </div>
        <main className="app-main">{children}</main>
        <nav className="ios-tabbar md:hidden" aria-label="Primary">
          {PRIMARY.map((item) => {
            const active = isActive(path, item.href);
            return (
              <Link key={item.href} href={item.href} prefetch className={`ios-tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                <span className="ios-tab-glyph" aria-hidden>
                  <Icon name={item.icon} size={24} />
                </span>
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            className={`ios-tab ${moreActive && !PRIMARY.some((item) => isActive(path, item.href)) ? "active" : ""}`}
            onClick={() => setMoreOpen(true)}
            aria-label="More"
          >
            <span className="ios-tab-glyph" aria-hidden>
              <Icon name="more" size={22} />
            </span>
            More
          </button>
        </nav>
      </div>

      {moreOpen ? (
        <Drawer title="More" onClose={() => setMoreOpen(false)}>
          {GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)]">{group.label}</div>
              <div className="card">
                {group.items.map((item) => (
                  <Link key={item.href} href={item.href} prefetch className="data-row" onClick={() => setMoreOpen(false)}>
                    <Icon name={item.icon} size={18} />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <div className="card">
            <Link href="/settings" prefetch className="data-row" onClick={() => setMoreOpen(false)}>
              <Icon name="gear" size={18} />
              <span className="flex-1">Settings</span>
            </Link>
          </div>
        </Drawer>
      ) : null}

      <CommandPalette />
      <UndoHost />
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
