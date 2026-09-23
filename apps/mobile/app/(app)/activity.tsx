import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { api } from "../../src/api";
import { outflow } from "../../src/format";
import { Button, Field, Loading, Note, Row, Screen } from "../../src/ui";

type Tx = {
  id: string;
  name: string;
  amountCents: number;
  date: string;
  pending: boolean;
  reviewed: boolean;
  categoryId: string | null;
  category: { name: string } | null;
  account: { name: string } | null;
};

type Group = { name: string; categories: { id: string; name: string }[] };

export default function ActivityScreen() {
  const [query, setQuery] = useState("");
  const [unreviewedOnly, setUnreviewedOnly] = useState(false);
  const [rows, setRows] = useState<Tx[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Tx | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (unreviewedOnly) params.set("reviewed", "false");
    void Promise.all([
      api<{ transactions: Tx[] }>(`/api/transactions?${params.toString()}`),
      api<{ groups: Group[] }>("/api/categories"),
      api<{ accounts: { id: string; name: string }[] }>("/api/accounts"),
    ])
      .then(([tx, cats, accts]) => {
        setRows(tx.transactions);
        setGroups(cats.groups);
        setAccounts(accts.accounts);
        setAccountId((current) => current || accts.accounts[0]?.id || "");
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load activity"));
  }, [query, unreviewedOnly]);

  useFocusEffect(load);

  async function patch(id: string, body: Record<string, unknown>) {
    await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    setSelected(null);
    load();
  }

  async function add() {
    setBusy(true);
    try {
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify({ accountId, name, amount: Number(amount) }),
      });
      setName("");
      setAmount("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Activity" subtitle={unreviewedOnly ? "Needs review" : "Charges and income"}>
      <Field label="Search" value={query} onChangeText={setQuery} placeholder="Merchant or > 50" />
      <Button label={unreviewedOnly ? "Show everything" : "Show unreviewed"} tone="quiet" onPress={() => setUnreviewedOnly((value) => !value)} />
      <Button
        label="Review all visible"
        tone="quiet"
        onPress={() =>
          void api("/api/transactions/review-all", {
            method: "POST",
            body: JSON.stringify({ ids: rows.filter((tx) => !tx.reviewed).map((tx) => tx.id) }),
          }).then(load)
        }
      />
      <Button label="Search" tone="quiet" onPress={load} />
      {error ? <Note>{error}</Note> : null}
      {!rows.length && !error ? <Loading /> : null}
      {rows.map((tx) => (
        <Row
          key={tx.id}
          title={`${tx.name}${tx.pending ? " · pending" : ""}`}
          detail={`${outflow(tx.amountCents)} · ${tx.category?.name ?? "Uncategorized"}`}
          onPress={() => setSelected(tx)}
        />
      ))}
      {selected ? (
        <>
          <Note>{`${selected.name} · ${selected.account?.name ?? ""} · ${selected.date}`}</Note>
          <Button label="Mark reviewed" onPress={() => void patch(selected.id, { reviewed: true })} />
          <Button label="Hide" tone="quiet" onPress={() => void patch(selected.id, { hidden: true })} />
          {groups.flatMap((group) => group.categories).slice(0, 24).map((category) => (
            <Row key={category.id} title={category.name} onPress={() => void patch(selected.id, { categoryId: category.id, reviewed: true })} />
          ))}
        </>
      ) : null}
      <Note>Add a transaction</Note>
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      {accounts.map((account) => (
        <Row key={account.id} title={accountId === account.id ? `Using ${account.name}` : account.name} onPress={() => setAccountId(account.id)} />
      ))}
      <Button label="Add" onPress={() => void add()} busy={busy} />
    </Screen>
  );
}
