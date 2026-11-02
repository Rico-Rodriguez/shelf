import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { api } from "../../src/api";
import { isLiability, money, outflow, payoffMonths, shortDate } from "../../src/format";
import { connectBank } from "../../src/plaid";
import { Back, Button, Card, colors, Field, Hero, Loading, Note, Screen, Section, SpendMix, ToggleRow } from "../../src/ui";

type Liability = { apr: number | null; minimumCents: number | null; due: string | null };
type Item = { id: string; institutionName: string | null; status: string; errorCode: string | null };
type Holding = { id?: string; institutionValueCents: number; account: { id: string } | null; security: { name?: string; ticker?: string; type?: string | null } | null };

type Detail = {
  account: {
    id: string;
    name: string;
    type: string;
    currentBalanceCents: number;
    availableBalanceCents?: number | null;
    isHidden: boolean;
    includeInNetWorth: boolean;
    plaidItemId: string | null;
  };
  snapshots?: { date: string; balanceCents: number }[];
  transactions: { id: string; name: string; amountCents: number; date: string }[];
  liability: Liability | null;
};

const TONES = ["#14181f", "#5c6570", "#1b7a62", "#8fb9ad"];

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [scrub, setScrub] = useState<{ date: string; cents: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!id) return;
    void api<Detail>(`/api/accounts/${id}`)
      .then((next) => {
        setData(next);
        setName(next.account.name);
        setBalance((next.account.currentBalanceCents / 100).toFixed(2));
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Missing account"));
    void api<{ accounts: { id: string; plaidItemId: string | null }[]; items?: Item[] }>("/api/accounts")
      .then((res) => {
        const account = res.accounts.find((row) => row.id === id);
        setItem(account?.plaidItemId ? res.items?.find((row) => row.id === account.plaidItemId) ?? null : null);
      })
      .catch(() => undefined);
    void api<{ holdings: Holding[] }>("/api/investments")
      .then((res) => setHoldings(res.holdings.filter((row) => row.account?.id === id)))
      .catch(() => undefined);
  }

  useEffect(load, [id]);

  async function save() {
    await api(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify({ name, currentBalance: Number(balance) }) });
    load();
  }

  async function toggle(body: Record<string, boolean>) {
    await api(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    load();
  }

  async function remove() {
    await api(`/api/accounts/${id}`, { method: "DELETE" });
    router.back();
  }

  function confirmRemove() {
    Alert.alert("Remove this account?", "Its charges will be deleted too. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void remove() },
    ]);
  }

  async function disconnect() {
    if (!data?.account.plaidItemId) return;
    await api(`/api/plaid/items/${data.account.plaidItemId}`, { method: "DELETE" });
    router.back();
  }

  const account = data?.account;
  const debt = account ? isLiability(account.type) : false;
  const signed = account ? (debt ? -Math.abs(account.currentBalanceCents) : account.currentBalanceCents) : 0;
  const limit = account && account.type === "credit" && account.availableBalanceCents != null ? Math.abs(account.currentBalanceCents) + account.availableBalanceCents : null;
  const usedPct = limit && limit > 0 && account ? Math.round((Math.abs(account.currentBalanceCents) / limit) * 100) : null;
  const points = (data?.snapshots ?? []).map((row) => ({ date: row.date, cents: debt ? -Math.abs(row.balanceCents) : row.balanceCents }));
  const slices = allocation(holdings);
  const months = data?.liability?.apr != null && data.liability.minimumCents != null && account
    ? payoffMonths(account.currentBalanceCents, data.liability.apr, data.liability.minimumCents)
    : undefined;

  return (
    <Screen
      title={account?.name ?? "Account"}
      subtitle={item && item.status !== "ok" ? `${item.institutionName || "Bank"} · ${item.errorCode || "Needs attention"}` : item?.institutionName || undefined}
      refresh={<Back />}
    >
      {error ? <Note>{error}</Note> : null}
      {!data ? <Loading /> : null}
      {account && data ? (
        <>
          <Hero
            label={scrub ? shortDate(scrub.date) : "Balance"}
            cents={scrub?.cents ?? signed}
            tone={debt || signed < 0 ? "bad" : undefined}
            points={points.length > 1 ? points : undefined}
            onScrub={setScrub}
            live={scrub != null}
          >
            <View style={{ paddingHorizontal: 18, paddingBottom: 16, gap: 4 }}>
              {usedPct != null ? <Text style={{ fontSize: 13, color: usedPct >= 90 ? colors.danger : colors.muted }}>{`${usedPct}% of the limit`}</Text> : null}
              {account.availableBalanceCents != null ? <Text style={{ fontSize: 13, color: colors.muted }}>{`${money(account.availableBalanceCents)} available`}</Text> : null}
            </View>
          </Hero>
          {item && item.status !== "ok" ? <Button label="Reconnect" onPress={() => void connectBank(item.id).then(load)} /> : null}
          <Card>
            <ToggleRow label="Include in net worth" on={account.includeInNetWorth} onPress={() => void toggle({ includeInNetWorth: !account.includeInNetWorth })} />
            <ToggleRow label="Hidden" on={account.isHidden} divided onPress={() => void toggle({ isHidden: !account.isHidden })} />
            {account.plaidItemId ? (
              <Pressable onPress={() => void disconnect()} style={row}>
                <Text style={{ fontSize: 16, color: colors.danger }}>Disconnect bank</Text>
              </Pressable>
            ) : null}
          </Card>
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Balance" value={balance} onChangeText={setBalance} keyboardType="decimal-pad" />
          <Button label="Save" onPress={() => void save()} />
          <Button label="Remove account" tone="danger" onPress={confirmRemove} />
          {account.plaidItemId ? <Button label="Update bank login" tone="quiet" onPress={() => void connectBank(account.plaidItemId ?? undefined).then(load)} /> : null}
          {data.liability ? (
            <View style={{ gap: 8 }}>
              <Section title="Loan details" />
              <Card>
                <RowLine label="APR" value={data.liability.apr == null ? "—" : `${data.liability.apr}%`} />
                <RowLine label="Minimum payment" value={data.liability.minimumCents == null ? "—" : money(data.liability.minimumCents)} />
                <RowLine label="Next due" value={data.liability.due ?? "—"} />
              </Card>
              {data.liability.apr != null && data.liability.minimumCents != null ? (
                <Note>{months == null ? "The minimum does not cover interest." : `At the minimum, about ${months} months.`}</Note>
              ) : null}
            </View>
          ) : null}
          {holdings.length ? (
            <View style={{ gap: 8 }}>
              <Section title="Holdings" />
              <SpendMix rows={slices.map((slice) => ({ key: slice.name, cents: slice.cents, color: slice.color }))} />
              <Card>
                {holdings.map((holding, index) => (
                  <RowLine key={holding.id ?? index} label={holding.security?.ticker || holding.security?.name || "Holding"} value={money(holding.institutionValueCents)} />
                ))}
              </Card>
            </View>
          ) : null}
          <Section title="Recent activity" />
          <Card>
            {data.transactions.length === 0 ? <Note>No transactions yet.</Note> : null}
            {data.transactions.map((tx, index) => (
              <Pressable key={tx.id} style={{ minHeight: 52, paddingHorizontal: 16, justifyContent: "center", borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                <Text style={{ fontSize: 16, color: colors.ink }}>{tx.name}</Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>{`${tx.date} · ${outflow(tx.amountCents)}`}</Text>
              </Pressable>
            ))}
          </Card>
          <Button label="All activity" tone="quiet" onPress={() => router.push({ pathname: "/(app)/activity", params: { accountId: account.id } })} />
        </>
      ) : null}
    </Screen>
  );
}

function RowLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={row}>
      <Text style={{ flex: 1, fontSize: 16, color: colors.muted }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>{value}</Text>
    </View>
  );
}

function allocation(rows: Holding[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = row.security?.type || "Other";
    map.set(key, (map.get(key) ?? 0) + row.institutionValueCents);
  }
  return [...map.entries()].map(([name, cents], index) => ({ name, cents, color: TONES[index % TONES.length] }));
}

const row = { minHeight: 52, paddingHorizontal: 16, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 12, borderTopWidth: 1, borderTopColor: colors.line };
