import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../src/api";
import { money } from "../src/format";
import { Back, Button, Card, colors, Field, Loading, Note, Progress, Screen, Sheet } from "../src/ui";

type Goal = { id: string; name: string; kind: string; targetCents: number; progressCents: number; remainingCents: number };

export default function GoalsScreen() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState<"save_up" | "pay_down">("save_up");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Goal | null>(null);

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
    setAdding(false);
    load();
  }

  return (
    <Screen
      title="Goals"
      refresh={<Back />}
      action={<Button label="Add" onPress={() => setAdding(true)} />}
    >
      {error ? <Note>{error}</Note> : null}
      {goals === null && !error ? <Loading /> : null}
      {goals && goals.length === 0 ? <Note>No goals yet.</Note> : null}
      {goals && goals.length ? (
        <Card>
          {goals.map((goal, index) => (
            <Pressable
              key={goal.id}
              onPress={() => setSelected(goal)}
              style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: "500", color: colors.ink }}>{goal.name}</Text>
                <Text style={{ fontWeight: "600", color: colors.ink }}>{money(goal.remainingCents)} left</Text>
              </View>
              <Progress value={goal.progressCents} max={goal.targetCents || 1} />
              <Text style={{ fontSize: 13, color: colors.muted }}>
                {money(goal.progressCents)} of {money(goal.targetCents)}
              </Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {selected ? (
        <Sheet title={selected.name} onClose={() => setSelected(null)}>
          <Note>{`${money(selected.progressCents)} of ${money(selected.targetCents)}`}</Note>
          <Button
            label="Remove goal"
            tone="danger"
            onPress={() => void api("/api/goals", { method: "DELETE", body: JSON.stringify({ id: selected.id }) }).then(() => {
              setSelected(null);
              load();
            })}
          />
        </Sheet>
      ) : null}

      {adding ? (
        <Sheet title="New goal" onClose={() => setAdding(false)}>
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Target" value={target} onChangeText={setTarget} keyboardType="decimal-pad" />
          <Button label={kind === "save_up" ? "Saving up" : "Paying down"} tone="quiet" onPress={() => setKind(kind === "save_up" ? "pay_down" : "save_up")} />
          <Button label="Add goal" onPress={() => void add()} />
        </Sheet>
      ) : null}
    </Screen>
  );
}
