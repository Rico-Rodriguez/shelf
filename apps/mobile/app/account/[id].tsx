import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { api } from "../../src/api";
import { money, outflow } from "../../src/format";
import { connectBank } from "../../src/plaid";
import { Back, Button, Field, Loading, Note, Row, Screen } from "../../src/ui";

type Detail = {
  account: {
    id: string;
    name: string;
    type: string;
    currentBalanceCents: number;
    isHidden: boolean;
    includeInNetWorth: boolean;
    plaidItemId: string | null;
  };
  transactions: { id: string; name: string; amountCents: number; date: string }[];
  liability: { name?: string } | null;
};

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [holdings, setHoldings] = useState<{ security: { name?: string } | null; institutionValueCents: number }[]>([]);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
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
    void api<{ holdings: { account: { id: string } | null; security: { name?: string } | null; institutionValueCents: number }[] }>("/api/investments")
      .then((res) => setHoldings(res.holdings.filter((row) => row.account?.id === id)))
      .catch(() => undefined);
  }

  useEffect(load, [id]);

  async function save() {
    await api(`/api/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, currentBalance: Number(balance) }),
    });
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

  async function disconnect() {
    if (!data?.account.plaidItemId) return;
    await api(`/api/plaid/items/${data.account.plaidItemId}`, { method: "DELETE" });
    router.back();
  }

  return (
    <Screen title={data?.account.name ?? "Account"} refresh={<Back />}>
      {error ? <Note>{error}</Note> : null}
      {!data ? <Loading /> : null}
      {data ? (
        <>
          <Row title="Balance" detail={money(data.account.currentBalanceCents)} />
          {data.liability ? <Note>Liability details are on file.</Note> : null}
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Balance" value={balance} onChangeText={setBalance} keyboardType="numeric" />
          <Button label="Save" onPress={() => void save()} />
          <Button label={data.account.isHidden ? "Show" : "Hide"} tone="quiet" onPress={() => void toggle({ isHidden: !data.account.isHidden })} />
          <Button
            label={data.account.includeInNetWorth ? "Exclude from net worth" : "Include in net worth"}
            tone="quiet"
            onPress={() => void toggle({ includeInNetWorth: !data.account.includeInNetWorth })}
          />
          {data.account.plaidItemId ? <Button label="Update bank login" tone="quiet" onPress={() => void connectBank(data.account.plaidItemId ?? undefined).then(load)} /> : null}
          {data.account.plaidItemId ? <Button label="Remove bank connection" tone="danger" onPress={() => void disconnect()} /> : null}
          <Button label="Delete account" tone="danger" onPress={() => void remove()} />
          {data.transactions.map((tx) => (
            <Row key={tx.id} title={tx.name} detail={`${outflow(tx.amountCents)} · ${tx.date}`} onPress={() => router.push(`/merchant?name=${encodeURIComponent(tx.name)}`)} />
          ))}
          {holdings.map((row, index) => (
            <Row key={index} title={row.security?.name ?? "Holding"} detail={money(row.institutionValueCents)} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
