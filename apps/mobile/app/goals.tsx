import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../src/api";
import { CategoryPicker, ChargeGroup, getCategoryColor } from "../src/charge";
import { goalPace, mediumDate, money } from "../src/format";
import { celebrate } from "../src/toast";
import { Back, Button, Card, colors, Field, LoadError, Loading, Note, Progress, Screen, Segment, Sheet, Switch } from "../src/ui";

type Goal = {
  id: string;
  name: string;
  kind: "save_up" | "pay_down";
  targetCents: number;
  targetDate: string | null;
  categoryId: string | null;
  progressCents: number;
  remainingCents: number;
  createdAt?: string | null;
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
  const [groups, setGroups] = useState<ChargeGroup[]>([]);
  const [pickingCategory, setPickingCategory] = useState(false);
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
    void api<{ groups: ChargeGroup[] }>("/api/categories")
      .then((res) => {
        setGroups(res.groups);
        setCategories(res.groups.flatMap((group) => group.categories));
      })
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
    celebrate("Saved");
    load();
  }

  async function remove(goal: Goal) {
    await api("/api/goals", { method: "DELETE", body: JSON.stringify({ id: goal.id }) });
    setEditing(null);
    load();
  }

  return (
    <Screen title="Goals" refresh={<Back />} onRefresh={load} action={<Button label="Add" onPress={openNew} />}>
      {error ? <LoadError message={error} onRetry={load} /> : null}
      {goals === null && !error ? <Loading /> : null}
      {goals && goals.length === 0 ? <Note>No goals yet.</Note> : null}
      {goals && goals.length ? (
        <Card>
          {goals.map((goal, index) => {
            const done = goal.remainingCents <= 0 && goal.targetCents > 0;
            const pace = goalPace(goal);
            const when = [
              pace.label,
              goal.targetDate ? `By ${mediumDate(goal.targetDate)}` : "",
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
                  color={pace.tone === "behind" ? colors.danger : pace.tone === "muted" ? colors.tertiary : colors.positive}
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
          <Segment
            value={form.kind}
            onChange={(kind) => setForm({ ...form, kind: kind as "save_up" | "pay_down" })}
            options={[{ value: "save_up", label: "Save up" }, { value: "pay_down", label: "Pay down" }]}
          />
          <Field label="Target" value={form.target} onChangeText={(target) => setForm({ ...form, target })} keyboardType="decimal-pad" />
          <Field label="Name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
          <Field label="Target date" value={form.targetDate} onChangeText={(targetDate) => setForm({ ...form, targetDate })} placeholder="YYYY-MM-DD" />
          <Note>
            {form.kind === "pay_down"
              ? "Until you link an account, what's left is the target. Linking a card or loan uses that balance."
              : "Progress is what you've added toward this goal, not the whole account. Tag a charge with this goal to count it."}
          </Note>
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
                  <Switch on={on} />
                </Pressable>
              );
            })}
          </Card>
          <Note>Category is optional.</Note>
          <Pressable
            onPress={() => setPickingCategory(true)}
            style={{
              minHeight: 52,
              paddingHorizontal: 16,
              borderRadius: 16,
              backgroundColor: colors.card,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              {form.categoryId ? (
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: getCategoryColor(categories.find((c) => c.id === form.categoryId)),
                  }}
                />
              ) : null}
              <Text style={{ fontSize: 16, color: colors.ink }}>
                {categories.find((c) => c.id === form.categoryId)?.name ?? "No category"}
              </Text>
            </View>
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>Change ›</Text>
          </Pressable>
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

      {pickingCategory ? (
        <Sheet title="Select Category" onClose={() => setPickingCategory(false)}>
          <Pressable
            onPress={() => {
              setForm({ ...form, categoryId: "" });
              setPickingCategory(false);
            }}
            style={{
              minHeight: 48,
              borderRadius: 14,
              backgroundColor: colors.card,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: form.categoryId ? colors.ink : colors.accentInk }}>
              No Category
            </Text>
          </Pressable>
          <CategoryPicker
            groups={groups}
            selected={form.categoryId}
            onSelect={(id) => {
              setForm({ ...form, categoryId: id });
              setPickingCategory(false);
            }}
            onClose={() => setPickingCategory(false)}
          />
        </Sheet>
      ) : null}
    </Screen>
  );
}
