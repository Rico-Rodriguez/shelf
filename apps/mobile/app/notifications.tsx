import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";
import { api } from "../src/api";
import { Back, Card, colors, EmptyState, Loading, Note, Screen } from "../src/ui";

type NoteRow = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  kind?: string;
  dedupeKey?: string | null;
  readAt: string | null;
};

function idAfter(key: string, prefix: string): string {
  if (!key.startsWith(prefix)) return "";
  const rest = key.slice(prefix.length);
  const split = rest.lastIndexOf(":");
  return split >= 0 ? rest.slice(0, split) : rest;
}

function openNote(row: NoteRow) {
  const href = row.href ?? "";
  const key = row.dedupeKey ?? "";
  if (row.kind === "review" || href.includes("reviewed=false")) {
    router.push({ pathname: "/(app)/activity", params: { reviewed: "false", focus: "1" } });
    return;
  }
  if (row.kind === "bill" || row.kind === "price" || href.startsWith("/recurring")) {
    const id = idAfter(key, row.kind === "price" ? "price:" : "bill:");
    router.push(id ? { pathname: "/bills", params: { id } } : "/bills");
    return;
  }
  if (row.kind === "budget" || href.startsWith("/budget")) {
    router.push("/(app)/trends");
    return;
  }
  if (row.kind === "large") {
    if (row.title) router.push({ pathname: "/merchant", params: { name: row.title } });
    else router.push("/(app)/activity");
    return;
  }
  if (href.startsWith("/transactions")) router.push("/(app)/activity");
  else if (href.startsWith("/accounts")) router.push("/accounts");
}

export default function NotificationsScreen() {
  const [rows, setRows] = useState<NoteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void api<{ notifications: NoteRow[] }>("/api/notifications")
      .then((res) => setRows(res.notifications))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load notifications"));
  }

  useEffect(load, []);

  return (
    <Screen
      title="Notifications"
      refresh={<Back />}
      action={
        rows?.some((row) => !row.readAt) ? (
          <Pressable onPress={() => void api("/api/notifications", { method: "POST", body: JSON.stringify({ all: true }) }).then(load)}>
            <Text style={{ color: colors.accentInk, fontWeight: "600", fontSize: 15 }}>Mark all read</Text>
          </Pressable>
        ) : null
      }
    >
      {error ? <Note>{error}</Note> : null}
      {rows === null && !error ? <Loading /> : null}
      {rows && rows.length === 0 ? <EmptyState icon="bell" title="You’re all caught up" body="Bills, big charges and goal milestones show up here." /> : null}
      {rows && rows.length ? (
        <Card>
          {rows.map((row, index) => (
            <Pressable
              key={row.id}
              onPress={() => {
                openNote(row);
                void api("/api/notifications", { method: "POST", body: JSON.stringify({ id: row.id }) }).then(load);
              }}
              style={{ minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, gap: 2, justifyContent: "center", borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, opacity: row.readAt ? 0.55 : 1 }}
            >
              <Text style={{ fontSize: 16, fontWeight: "500", color: colors.ink }}>{row.title}</Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>{row.body}</Text>
            </Pressable>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
