import { router } from "expo-router";
import { useEffect, useState } from "react";
import { api } from "../src/api";
import { Back, Button, Loading, Note, Row, Screen } from "../src/ui";

type NoteRow = { id: string; title: string; body: string; href: string | null; readAt: string | null };

function openNote(href: string | null) {
  if (!href) return;
  if (href.startsWith("/transactions")) router.push("/(app)/activity");
  else if (href.startsWith("/recurring")) router.push("/bills");
  else if (href.startsWith("/budget")) router.push("/(app)/budget");
  else if (href.startsWith("/accounts")) router.push("/(app)/accounts");
}

export default function NotificationsScreen() {
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void api<{ notifications: NoteRow[] }>("/api/notifications")
      .then((res) => setRows(res.notifications))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load notifications"));
  }

  useEffect(load, []);

  return (
    <Screen title="Notifications" refresh={<Back />}>
      {error ? <Note>{error}</Note> : null}
      <Button label="Mark all read" tone="quiet" onPress={() => void api("/api/notifications", { method: "POST", body: JSON.stringify({ all: true }) }).then(load)} />
      {!rows.length && !error ? <Loading /> : null}
      {rows.map((row) => (
        <Row
          key={row.id}
          title={row.readAt ? row.title : `• ${row.title}`}
          detail={row.body}
          onPress={() => {
            openNote(row.href);
            void api("/api/notifications", { method: "POST", body: JSON.stringify({ id: row.id }) }).then(load);
          }}
        />
      ))}
    </Screen>
  );
}
