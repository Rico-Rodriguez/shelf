import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text } from "react-native";
import { api } from "../src/api";
import { Back, Card, colors, Loading, Note, Screen, SearchField } from "../src/ui";

const PAGES = [
  ["/(app)", "Home"],
  ["/(app)/activity", "Activity"],
  ["/(app)/budget", "Budget"],
  ["/accounts", "Accounts"],
  ["/bills", "Bills"],
  ["/goals", "Goals"],
  ["/insights", "Insights"],
  ["/settings", "Settings"],
  ["/rules", "Rules"],
] as const;

type Hit = { href: string; label: string; hint?: string; params?: Record<string, string> };

export default function SearchScreen() {
  const [q, setQ] = useState("");
  const [extra, setExtra] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setExtra([]);
      return;
    }
    const timer = setTimeout(() => {
      setBusy(true);
      void Promise.all([
        api<{ transactions: { name: string; date: string }[] }>(`/api/transactions?q=${encodeURIComponent(query)}`).catch(() => ({ transactions: [] })),
        api<{ accounts: { id: string; name: string }[] }>("/api/accounts").catch(() => ({ accounts: [] })),
        api<{ groups: { name: string; categories: { id: string; name: string }[] }[] }>("/api/categories").catch(() => ({ groups: [] })),
      ]).then(([txs, accounts, categories]) => {
        const needle = query.toLowerCase();
        const hits: Hit[] = [];
        for (const tx of txs.transactions.slice(0, 6)) {
          hits.push({ href: "/(app)/activity", label: tx.name, hint: tx.date, params: { q: tx.name } });
          hits.push({ href: "/merchant", label: tx.name, hint: "Merchant", params: { name: tx.name } });
        }
        for (const account of accounts.accounts) {
          if (account.name.toLowerCase().includes(needle)) hits.push({ href: "/account/[id]", label: account.name, hint: "Account", params: { id: account.id } });
        }
        for (const group of categories.groups) {
          for (const category of group.categories) {
            if (category.name.toLowerCase().includes(needle)) {
              hits.push({ href: "/(app)/activity", label: category.name, hint: group.name, params: { categoryId: category.id } });
            }
          }
        }
        setExtra(hits.slice(0, 12));
        setBusy(false);
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  const pages = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return PAGES.filter((page) => !needle || page[1].toLowerCase().includes(needle));
  }, [q]);

  function go(hit: Hit | { href: string }) {
    if ("params" in hit && hit.params) router.push({ pathname: hit.href as never, params: hit.params });
    else router.push(hit.href as never);
  }

  return (
    <Screen title="Search" refresh={<Back />}>
      <SearchField value={q} onChangeText={setQ} placeholder="Search pages, merchants, categories" />
      {busy ? <Loading label="Searching" /> : null}
      <Card>
        {pages.map(([href, label], index) => (
          <Pressable key={href} onPress={() => router.push(href as never)} style={{ minHeight: 48, paddingHorizontal: 16, justifyContent: "center", borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
            <Text style={{ fontSize: 16, color: colors.ink }}>{label}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>Page</Text>
          </Pressable>
        ))}
        {extra.map((hit, index) => (
          <Pressable key={`${hit.href}${hit.label}${index}`} onPress={() => go(hit)} style={{ minHeight: 48, paddingHorizontal: 16, justifyContent: "center", borderTopWidth: 1, borderTopColor: colors.line }}>
            <Text style={{ fontSize: 16, color: colors.ink }} numberOfLines={1}>{hit.label}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{hit.hint}</Text>
          </Pressable>
        ))}
      </Card>
      {pages.length === 0 && extra.length === 0 && q.trim().length >= 2 && !busy ? <Note>Nothing matches.</Note> : null}
    </Screen>
  );
}
