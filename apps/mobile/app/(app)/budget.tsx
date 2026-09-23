import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { api } from "../../src/api";
import { money, monthLabel, shiftMonth } from "../../src/format";
import { Button, Field, Loading, Note, Row, Screen } from "../../src/ui";

type BudgetRow = {
  category: { id: string; name: string };
  plannedCents: number;
  spentCents: number;
  remainingCents: number;
};

type Budget = {
  year: number;
  month: number;
  plannedIncomeCents: number;
  expensePlannedCents: number;
  expenseSpentCents: number;
  leftoverCents: number;
  rows: BudgetRow[];
};

export default function BudgetScreen() {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [data, setData] = useState<Budget | null>(null);
  const [income, setIncome] = useState("");
  const [editing, setEditing] = useState<BudgetRow | null>(null);
  const [planned, setPlanned] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void api<Budget>(`/api/budget?year=${cursor.year}&month=${cursor.month}`)
      .then((next) => {
        setData(next);
        setIncome((Number(next.plannedIncomeCents) / 100).toFixed(2));
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the plan"));
  }, [cursor]);

  useFocusEffect(load);

  async function saveIncome() {
    if (!data) return;
    await api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({ year: data.year, month: data.month, plannedIncomeCents: Math.round(Number(income) * 100) }),
    });
    load();
  }

  async function savePlanned() {
    if (!data || !editing) return;
    await api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({
        year: data.year,
        month: data.month,
        items: [{ categoryId: editing.category.id, plannedCents: Math.round(Number(planned) * 100) }],
      }),
    });
    setEditing(null);
    load();
  }

  return (
    <Screen title="Budget" subtitle={monthLabel(cursor.year, cursor.month)}>
      <Button label="Previous month" tone="quiet" onPress={() => setCursor(shiftMonth(cursor.year, cursor.month, -1))} />
      <Button label="Next month" tone="quiet" onPress={() => setCursor(shiftMonth(cursor.year, cursor.month, 1))} />
      {error ? <Note>{error}</Note> : null}
      {!data ? <Loading /> : null}
      {data ? (
        <>
          <Row title="Planned" detail={money(data.expensePlannedCents)} />
          <Row title="Spent" detail={money(data.expenseSpentCents)} />
          <Row title="Left to assign" detail={money(data.leftoverCents)} />
          <Field label="Planned income (dollars)" value={income} onChangeText={setIncome} keyboardType="numeric" />
          <Button label="Save income" onPress={() => void saveIncome()} />
          {data.rows.filter((row) => row.plannedCents || row.spentCents).map((row) => (
            <Row
              key={row.category.id}
              title={row.category.name}
              detail={`${money(row.remainingCents)} left`}
              onPress={() => {
                setEditing(row);
                setPlanned((row.plannedCents / 100).toFixed(2));
              }}
            />
          ))}
          {editing ? (
            <>
              <Field label={`Plan for ${editing.category.name}`} value={planned} onChangeText={setPlanned} keyboardType="numeric" />
              <Button label="Save category" onPress={() => void savePlanned()} />
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
