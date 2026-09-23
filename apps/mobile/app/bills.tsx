import { useEffect, useState } from "react";
import { api } from "../src/api";
import { flowMoney, inDaysPhrase, money } from "../src/format";
import { Back, Button, Card, Field, Hero, LedgerRow, Loading, Note, Screen, Section, Sheet } from "../src/ui";

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
  const [rows, setRows] = useState<Bill[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Bill | null>(null);
  const [adding, setAdding] = useState(false);
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

  const bills = rows ?? [];
  const total = bills.filter((row) => row.isActive && !row.isIncome).reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <Screen
      title="Bills"
      refresh={<Back />}
      action={
        <Button label="Add" onPress={() => setAdding(true)} />
      }
    >
      {error ? <Note>{error}</Note> : null}
      {rows === null && !error ? <Loading /> : null}
      {rows ? <Hero label="Coming up" cents={total} /> : null}
      <Button label="Find recurring charges" tone="quiet" onPress={() => void detect()} />
      {drafts.length ? (
        <>
          <Section title="Looks like a bill" />
          <Card>
            {drafts.map((draft, index) => (
              <LedgerRow
                key={draft.merchantName}
                divided={index > 0}
                name={draft.merchantName}
                meta={draft.cadence}
                amount={money(draft.amountCents)}
                onPress={() => void api("/api/recurring", { method: "POST", body: JSON.stringify({ action: "confirm", suggestions: [draft] }) }).then(() => {
                  setDrafts((current) => current.filter((row) => row.merchantName !== draft.merchantName));
                  load();
                })}
              />
            ))}
          </Card>
        </>
      ) : null}
      {bills.length ? (
        <Card>
          {bills.map((row, index) => {
            const flow = row.isIncome ? flowMoney(-Math.abs(row.amountCents)) : null;
            return (
              <LedgerRow
                key={row.id}
                divided={index > 0}
                name={row.merchantName}
                meta={[row.isActive ? inDaysPhrase(row.nextDate) : "Paused", row.cadence].join(" · ")}
                amount={flow ? flow.text : money(row.amountCents)}
                amountColor={flow?.color}
                onPress={() => setSelected(row)}
              />
            );
          })}
        </Card>
      ) : null}

      {selected ? (
        <Sheet title={selected.merchantName} onClose={() => setSelected(null)}>
          <Note>{`${money(selected.amountCents)} · ${selected.nextDate}`}</Note>
          <Button
            label="Mark paid"
            onPress={() => void api("/api/recurring", { method: "POST", body: JSON.stringify({ action: "paid", id: selected.id }) }).then(() => {
              setSelected(null);
              load();
            })}
          />
          <Button
            label={selected.isActive ? "Pause" : "Resume"}
            tone="quiet"
            onPress={() => void api("/api/recurring", { method: "PATCH", body: JSON.stringify({ id: selected.id, isActive: !selected.isActive }) }).then(() => {
              setSelected(null);
              load();
            })}
          />
          <Button
            label="Remove"
            tone="danger"
            onPress={() => void api("/api/recurring", { method: "DELETE", body: JSON.stringify({ id: selected.id }) }).then(() => {
              setSelected(null);
              load();
            })}
          />
        </Sheet>
      ) : null}

      {adding ? (
        <Sheet title="Add a bill" onClose={() => setAdding(false)}>
          <Field label="Merchant" value={merchant} onChangeText={setMerchant} />
          <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <Button
            label="Add bill"
            onPress={() =>
              void api("/api/recurring", {
                method: "POST",
                body: JSON.stringify({ merchantName: merchant, amount: Number(amount), cadence: "monthly" }),
              }).then(() => {
                setMerchant("");
                setAmount("");
                setAdding(false);
                load();
              })
            }
          />
        </Sheet>
      ) : null}
    </Screen>
  );
}
