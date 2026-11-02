import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { api, peek } from "../../src/api";
import { Charge, ChargeGroup, ChargeSheet } from "../../src/charge";
import { accountIdentity, dayLabel, isLiability, money, payoffMonthLabel, payoffMonths, shortDate } from "../../src/format";
import { HoldingRow, type HoldingRowData } from "../../src/holding";
import { clearAccountOverlay, overlayAccount } from "../../src/live-edits";
import { connectBank } from "../../src/plaid";
import { Back, Button, Card, colors, Field, Hero, LedgerRow, LoadError, Loading, Note, Screen, Section, SpendMix, ToggleRow } from "../../src/ui";

type Liability = { apr: number | null; minimumCents: number | null; due: string | null };
type Item = { id: string; institutionName: string | null; status: string; errorCode: string | null };
type Holding = HoldingRowData & { id?: string; account: { id: string } | null; security: { name?: string; ticker?: string; type?: string | null } | null };

type Detail = {
  account: {
    id: string;
    name: string;
    type: string;
    subtype?: string | null;
    mask?: string | null;
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
  const [charges, setCharges] = useState<Charge[]>([]);
  const [groups, setGroups] = useState<ChargeGroup[]>([]);
  const [selected, setSelected] = useState<Charge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ message: string; retry: () => void } | null>(null);

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
    void api<{ transactions: Charge[] }>(`/api/transactions?accountId=${id}&limit=500`)
      .then((res) => setCharges(res.transactions))
      .catch(() => undefined);
    void api<{ groups: ChargeGroup[] }>("/api/categories")
      .then((res) => setGroups(res.groups))
      .catch(() => undefined);
  }

  useEffect(load, [id]);

  async function save() {
    await api(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify({ name, currentBalance: Number(balance) }) });
    load();
  }

  function toggle(body: Record<string, boolean>) {
    if (!data || !id) return;
    const previous = data;
    const cached = peek<{ accounts: { id: string }[] }>("/api/accounts");
    setData({ ...data, account: { ...data.account, ...body } });
    overlayAccount(id, body);
    setActionError(null);
    void api(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify(body) }).catch(() => {
      setData(previous);
      clearAccountOverlay(id, cached);
      setActionError({ message: "Could not update that account.", retry: () => toggle(body) });
    });
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
  const identity = account ? accountIdentity(account) : "";
  const visibleCharges = scrub ? charges.filter((tx) => tx.date === scrub.date) : charges.slice(0, 12);
  const due = data?.liability?.due?.slice(0, 10);
  const dueLabel = due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? shortDate(due) : data?.liability?.due || "—";

  return (
    <Screen
      title={account?.name ?? "Account"}
      subtitle={identity || (item && item.status !== "ok" ? `${item.institutionName || "Bank"} · ${item.errorCode || "Needs attention"}` : item?.institutionName || undefined)}
      refresh={<Back />}
    >
      {error ? <LoadError message={error} onRetry={load} /> : null}
      {actionError ? <LoadError message={actionError.message} onRetry={actionError.retry} /> : null}
      {!data && !error ? <Loading /> : null}
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
            <ToggleRow label="Include in net worth" on={account.includeInNetWorth} onPress={() => toggle({ includeInNetWorth: !account.includeInNetWorth })} />
            <ToggleRow label="Hidden" on={account.isHidden} divided onPress={() => toggle({ isHidden: !account.isHidden })} />
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
                <RowLine label="Next due" value={dueLabel} />
              </Card>
              {data.liability.apr != null && data.liability.minimumCents != null ? (
                <Note>{months == null ? "The minimum does not cover interest." : `Paid off ${payoffMonthLabel(months)}`}</Note>
              ) : null}
            </View>
          ) : null}
          {holdings.length ? (
            <View style={{ gap: 8 }}>
              <Section title="Holdings" />
              <SpendMix rows={slices.map((slice) => ({ key: slice.name, cents: slice.cents, color: slice.color }))} />
              <Card>
                {holdings.map((holding, index) => (
                  <HoldingRow key={holding.id ?? index} holding={holding} divided={index > 0} />
                ))}
              </Card>
            </View>
          ) : null}
          <Section title={scrub ? dayLabel(scrub.date) : "Recent activity"} />
          <Card>
            {visibleCharges.length === 0 ? <Note>{scrub ? "No charges that day." : "No transactions yet."}</Note> : null}
            {visibleCharges.map((tx, index) => {
              const when = dayLabel(tx.date);
              const whenShort = when === "Today" || when === "Yesterday" ? when : shortDate(tx.date);
              const flow = tx.amountCents < 0 ? `+${money(Math.abs(tx.amountCents))}` : money(tx.amountCents);
              return (
                <LedgerRow
                  key={tx.id}
                  divided={index > 0}
                  name={tx.merchantName || tx.name}
                  color={tx.category?.color}
                  meta={[whenShort, tx.category?.name].filter(Boolean).join(" · ")}
                  amount={flow}
                  amountColor={tx.amountCents < 0 ? colors.positive : colors.ink}
                  onPress={() => setSelected(tx)}
                />
              );
            })}
          </Card>
          <Button label="All activity" tone="quiet" onPress={() => router.push({ pathname: "/(app)/activity", params: { accountId: account.id } })} />
        </>
      ) : null}
      {selected ? (
        <ChargeSheet
          tx={selected}
          groups={groups}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            load();
          }}
        />
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
