import { useEffect, useState } from "react";
import { api } from "../src/api";
import { money } from "../src/format";
import { Back, Button, Field, Loading, Note, Row, Screen } from "../src/ui";

type Goal = { id: string; name: string; kind: string; targetCents: number; progressCents: number; remainingCents: number };

export default function GoalsScreen() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState<"save_up" | "pay_down">("save_up");
  const [error, setError] = useState<string | null>(null);

  function load() {
    void api<{ goals: Goal[] }>("/api/goals")
      .then((res) => {
        setGoals(res.goals);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load goals"));
  }

  useEffect(load, []);

  async function add() {
    await api("/api/goals", { method: "POST", body: JSON.stringify({ name, kind, target: Number(target) }) });
    setName("");
    setTarget("");
    load();
  }

  return (
    <Screen title="Goals" refresh={<Back />}>
      {error ? <Note>{error}</Note> : null}
      {!goals.length && !error ? <Loading /> : null}
      {goals.map((goal) => (
        <Row
          key={goal.id}
          title={goal.name}
          detail={`${money(goal.progressCents)} of ${money(goal.targetCents)}`}
          onPress={() => void api("/api/goals", { method: "DELETE", body: JSON.stringify({ id: goal.id }) }).then(load)}
        />
      ))}
      <Note>Tap a goal to remove it.</Note>
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Target" value={target} onChangeText={setTarget} keyboardType="numeric" />
      <Button label={kind === "save_up" ? "Saving up" : "Paying down"} tone="quiet" onPress={() => setKind(kind === "save_up" ? "pay_down" : "save_up")} />
      <Button label="Add goal" onPress={() => void add()} />
    </Screen>
  );
}
