import { useEffect, useState } from "react";
import { api } from "../src/api";
import { money } from "../src/format";
import { Back, Button, Field, Loading, Note, Row, Screen } from "../src/ui";

type Bill = {
  id: string;
  merchantName: string;
  amountCents: number;
  nextDate: string;
  cadence: string;
  isActive: boolean;
  isIncome: boolean;
};

type Draft = { merchantName: string; amountCents: number; cadence: string };

export default function BillsScreen() {
  const [rows, setRows] = useState<Bill[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");

  function load() {
    void api<{ recurrences: Bill[] }>("/api/recurring")
      .then((res) => {
        setRows(res.recurrences);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load bills"));
  }

  useEffect(load, []);

  async function detect() {
    const res = await api<{ suggestions: Draft[] }>("/api/recurring", { method: "POST", body: JSON.stringify({ action: "detect" }) });
    setDrafts(res.suggestions);
  }

  const total = rows.filter((row) => row.isActive && !row.isIncome).reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <Screen title="Bills" subtitle={`${money(total)} a month on active bills`} refresh={<Back />}>
      {error ? <Note>{error}</Note> : null}
      {!rows.length && !error ? <Loading /> : null}
      <Button label="Find recurring" tone="quiet" onPress={() => void detect()} />
      {drafts.map((draft) => (
        <Row
          key={draft.merchantName}
          title={draft.merchantName}
          detail={money(draft.amountCents)}
          onPress={() => void api("/api/recurring", { method: "POST", body: JSON.stringify({ action: "confirm", suggestions: [draft] }) }).then(load)}
        />
      ))}
      {rows.map((row) => (
        <Row
          key={row.id}
          title={`${row.merchantName}${row.isActive ? "" : " · paused"}`}
          detail={`${money(row.amountCents)} · ${row.nextDate}`}
          onPress={() => void api("/api/recurring", { method: "POST", body: JSON.stringify({ action: "paid", id: row.id }) }).then(load)}
        />
      ))}
      {rows.map((row) => (
        <Button
          key={`pause-${row.id}`}
          label={row.isActive ? `Pause ${row.merchantName}` : `Resume ${row.merchantName}`}
          tone="quiet"
          onPress={() => void api("/api/recurring", { method: "PATCH", body: JSON.stringify({ id: row.id, isActive: !row.isActive }) }).then(load)}
        />
      ))}
      {rows.map((row) => (
        <Button
          key={`del-${row.id}`}
          label={`Remove ${row.merchantName}`}
          tone="danger"
          onPress={() => void api("/api/recurring", { method: "DELETE", body: JSON.stringify({ id: row.id }) }).then(load)}
        />
      ))}
      <Field label="Merchant" value={merchant} onChangeText={setMerchant} />
      <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <Button
        label="Add bill"
        onPress={() =>
          void api("/api/recurring", {
            method: "POST",
            body: JSON.stringify({ merchantName: merchant, amount: Number(amount), cadence: "monthly" }),
          }).then(load)
        }
      />
    </Screen>
  );
}
