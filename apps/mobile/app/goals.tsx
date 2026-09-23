import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../src/api";
import { money, shortDate } from "../src/format";
import { Back, Button, Card, colors, Field, Loading, Note, Progress, Screen, Sheet } from "../src/ui";

type Goal = {
  id: string;
  name: string;
  kind: "save_up" | "pay_down";
  targetCents: number;
  targetDate: string | null;
  categoryId: string | null;
  progressCents: number;
  remainingCents: number;
  monthlyCents?: number | null;
  accounts: { id: string; name: string }[];
};

type Form = {
  name: string;
  kind: "save_up" | "pay_down";
  target: string;
  targetDate: string;
  accountIds: string[];
  categoryId: string;
};

const empty: Form = { name: "", kind: "save_up", target: "", targetDate: "", accountIds: [], categoryId: "" };

export default function GoalsScreen() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<Form>(empty);
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void api<{ goals: Goal[]; accounts: { id: string; name: string }[] }>("/api/goals")
      .then((res) => {
        setGoals(res.goals);
        setAccounts(res.accounts);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load goals"));
    void api<{ groups: { categories: { id: string; name: string }[] }[] }>("/api/categories")
      .then((res) => setCategories(res.groups.flatMap((group) => group.categories)))
      .catch(() => undefined);
  }

  useEffect(load, []);

  function openNew() {
    setForm(empty);
    setConfirmDelete(false);
    setEditing("new");
  }

  function openEdit(goal: Goal) {
    setForm({
      name: goal.name,
      kind: goal.kind,
      target: (goal.targetCents / 100).toFixed(0),
      targetDate: goal.targetDate ?? "",
      accountIds: goal.accounts.map((account) => account.id),
      categoryId: goal.categoryId ?? "",
    });
    setConfirmDelete(false);
    setEditing(goal);
  }

  function toggleAccount(id: string) {
    setForm((current) => ({
      ...current,
      accountIds: current.accountIds.includes(id) ? current.accountIds.filter((item) => item !== id) : [...current.accountIds, id],
    }));
  }

  async function save() {
    const body = {
      name: form.name,
      kind: form.kind,
      target: Number(form.target || 0),
      targetDate: form.targetDate || null,
      accountIds: form.accountIds,
      categoryId: form.categoryId || null,
    };
    if (editing && editing !== "new") {
      await api("/api/goals", { method: "PATCH", body: JSON.stringify({ id: editing.id, ...body }) });
    } else {
      await api("/api/goals", { method: "POST", body: JSON.stringify(body) });
    }
    setEditing(null);
    load();
  }

  async function remove(goal: Goal) {
    await api("/api/goals", { method: "DELETE", body: JSON.stringify({ id: goal.id }) });
    setEditing(null);
    load();
  }

  return (
    <Screen title="Goals" refresh={<Back />} action={<Button label="Add" onPress={openNew} />}>
      {error ? <Note>{error}</Note> : null}
      {goals === null && !error ? <Loading /> : null}
      {goals && goals.length === 0 ? <Note>No goals yet.</Note> : null}
      {goals && goals.length ? (
        <Card>
          {goals.map((goal, index) => {
            const done = goal.remainingCents <= 0 && goal.targetCents > 0;
            const when = [
              goal.targetDate ? `By ${shortDate(goal.targetDate)}` : "",
              goal.accounts.map((account) => account.name).join(", "),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <Pressable
                key={goal.id}
                onPress={() => openEdit(goal)}
                style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: "500", color: colors.ink }}>{goal.name}</Text>
                  <Text style={{ fontWeight: "600", color: colors.ink }}>
                    {done ? `${money(goal.targetCents)} ${goal.kind === "pay_down" ? "paid" : "saved"}` : `${money(goal.remainingCents)} left`}
                  </Text>
                </View>
                <Progress
                  value={goal.kind === "pay_down" ? goal.progressCents : goal.progressCents}
                  max={goal.kind === "pay_down" ? goal.progressCents + goal.remainingCents || 1 : goal.targetCents || 1}
                  color={goal.kind === "save_up" ? colors.positive : colors.danger}
                />
                {when || goal.monthlyCents ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                    <Text style={{ flex: 1, fontSize: 13, color: colors.muted }}>{when}</Text>
                    {goal.monthlyCents ? <Text style={{ fontSize: 13, color: colors.muted }}>{money(goal.monthlyCents)} / month</Text> : null}
                  </View>
                ) : (
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    {money(goal.progressCents)} of {money(goal.targetCents)}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      {editing ? (
        <Sheet title={editing === "new" ? "New goal" : "Edit goal"} onClose={() => setEditing(null)}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Save up" tone={form.kind === "save_up" ? "primary" : "quiet"} onPress={() => setForm({ ...form, kind: "save_up" })} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Pay down" tone={form.kind === "pay_down" ? "primary" : "quiet"} onPress={() => setForm({ ...form, kind: "pay_down" })} />
            </View>
          </View>
          <Field label="Target" value={form.target} onChangeText={(target) => setForm({ ...form, target })} keyboardType="decimal-pad" />
          <Field label="Name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
          <Field label="Target date" value={form.targetDate} onChangeText={(targetDate) => setForm({ ...form, targetDate })} placeholder="YYYY-MM-DD" />
          <Note>Progress comes from the linked balances.</Note>
          <Card>
            {accounts.length === 0 ? <Note>Add an account first.</Note> : null}
            {accounts.map((account, index) => {
              const on = form.accountIds.includes(account.id);
              return (
                <Pressable
                  key={account.id}
                  onPress={() => toggleAccount(account.id)}
                  style={{ minHeight: 48, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}
                >
                  <Text style={{ fontSize: 16, color: colors.ink }}>{account.name}</Text>
                  <Text style={{ fontWeight: "600", color: on ? colors.accentInk : colors.muted }}>{on ? "On" : "Off"}</Text>
                </Pressable>
              );
            })}
          </Card>
          <Note>Category is optional.</Note>
          <Card>
            <Pressable onPress={() => setForm({ ...form, categoryId: "" })} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16 }}>
              <Text style={{ color: form.categoryId ? colors.ink : colors.accentInk }}>No category</Text>
            </Pressable>
            {categories.map((category) => (
              <Pressable
                key={category.id}
                onPress={() => setForm({ ...form, categoryId: category.id })}
                style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.line }}
              >
                <Text style={{ color: form.categoryId === category.id ? colors.accentInk : colors.ink }}>{category.name}</Text>
              </Pressable>
            ))}
          </Card>
          <Button label="Save" onPress={() => void save()} />
          {editing !== "new" ? (
            <Button
              label={confirmDelete ? "Delete this goal?" : "Delete"}
              tone={confirmDelete ? "danger" : "quiet"}
              onPress={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                void remove(editing);
              }}
            />
          ) : null}
        </Sheet>
      ) : null}
    </Screen>
  );
}
