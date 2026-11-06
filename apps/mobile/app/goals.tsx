import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, peek } from "../src/api";
import { CategoryPicker, ChargeGroup, getCategoryColor } from "../src/charge";
import { goalPace, mediumDate, money, monthlyNeedCents } from "../src/format";
import { goalPreview, useFlightClock, useFlightHidden, useMeasuredAnchor } from "../src/flight";
import { celebrate } from "../src/toast";
import { Back, Button, Card, colors, Field, GlassButton, LoadError, Loading, Note, Progress, Screen, Segment, Sheet, Switch } from "../src/ui";

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
  accounts: { id: string; name: string; currentBalanceCents?: number }[];
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
  useFlightClock();
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; name: string; currentBalanceCents?: number }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<ChargeGroup[]>([]);
  const [pickingCategory, setPickingCategory] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ message: string; retry: () => void } | null>(null);

  function load() {
    void api<{ goals: Goal[]; accounts: { id: string; name: string; currentBalanceCents?: number }[] }>("/api/goals")
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

  function save() {
    const snapshot = goals;
    const existing = editing && editing !== "new" ? editing : undefined;
    const targetCents = Math.round(Number(form.target || 0) * 100);
    const cached = peek<{ accounts: { id: string; name: string; currentBalanceCents?: number }[] }>("/api/accounts");
    const linked = form.accountIds.map((id) => {
      const known = accounts.find((account) => account.id === id) ?? cached?.accounts.find((account) => account.id === id);
      return { id, name: known?.name ?? "Account", currentBalanceCents: known?.currentBalanceCents ?? 0 };
    });
    let progressCents = existing?.progressCents ?? 0;
    let remainingCents = Math.max(0, targetCents - progressCents);
    if (form.kind === "pay_down") {
      if (!linked.length) {
        progressCents = 0;
        remainingCents = targetCents;
      } else {
        const owed = linked.reduce((sum, account) => sum + Math.abs(account.currentBalanceCents), 0);
        progressCents = targetCents > 0 ? Math.max(0, targetCents - owed) : progressCents;
        remainingCents = owed;
      }
    }
    const id = existing?.id ?? `tmp-${Date.now()}`;
    const nextGoal: Goal = {
      id,
      name: form.name,
      kind: form.kind,
      targetCents,
      targetDate: form.targetDate || null,
      categoryId: form.categoryId || null,
      progressCents,
      remainingCents,
      createdAt: existing?.createdAt,
      monthlyCents: monthlyNeedCents(remainingCents, form.targetDate || null),
      accounts: linked,
    };
    setGoals((current) => {
      const list = current ?? [];
      return existing ? list.map((goal) => (goal.id === id ? nextGoal : goal)) : [nextGoal, ...list];
    });
    setEditing(null);
    setActionError(null);
    celebrate("Saved");
    const body = {
      name: form.name,
      kind: form.kind,
      target: Number(form.target || 0),
      targetDate: form.targetDate || null,
      accountIds: form.accountIds,
      categoryId: form.categoryId || null,
    };
    const request = existing
      ? api("/api/goals", { method: "PATCH", body: JSON.stringify({ id: existing.id, ...body }) })
      : api<{ id: string }>("/api/goals", { method: "POST", body: JSON.stringify(body) }).then((created) => {
          setGoals((current) => (current ?? []).map((goal) => (goal.id === id ? { ...goal, id: created.id } : goal)));
        });
    void request
      .then(() => load())
      .catch(() => {
      setGoals(snapshot);
      setActionError({
        message: "Could not save that goal.",
        retry: () => {
          setForm(form);
          setEditing(existing ?? "new");
          save();
        },
      });
    });
  }

  async function remove(goal: Goal) {
    await api("/api/goals", { method: "DELETE", body: JSON.stringify({ id: goal.id }) });
    setEditing(null);
    load();
  }

  return (
    <Screen title="Goals" refresh={<Back />} onRefresh={load} action={<GlassButton label="Add" icon="plus" onPress={openNew} compact />}>
      {error ? <LoadError message={error} onRetry={load} /> : null}
      {actionError ? <LoadError message={actionError.message} onRetry={actionError.retry} /> : null}
      {goals === null && !error ? <Loading /> : null}
      {goals && goals.length === 0 ? <Note>No goals yet.</Note> : null}
      {goals && goals.length ? (
        <Card>
          {goals.map((goal, index) => {
            const preview = goalPreview();
            const remainingCents = preview?.id === goal.id ? Math.min(goal.remainingCents, Math.max(0, preview.remainingCents - preview.addedCents)) : goal.remainingCents;
            const progressCents = goal.progressCents + Math.max(0, goal.remainingCents - remainingCents);
            const shown = { ...goal, remainingCents, progressCents };
            const done = shown.remainingCents <= 0 && shown.targetCents > 0;
            const pace = goalPace(shown);
            const when = [
              pace.label,
              shown.targetDate ? `By ${mediumDate(shown.targetDate)}` : "",
              shown.accounts.map((account) => account.name).join(", "),
            ]
              .filter(Boolean)
              .join(" · ");
            const remainingText = done ? `${money(shown.targetCents)} ${shown.kind === "pay_down" ? "paid" : "saved"}` : `${money(shown.remainingCents)} left`;
            return (
              <Pressable
                key={goal.id}
                onPress={() => openEdit(goal)}
                style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: "500", color: colors.ink }}>{shown.name}</Text>
                  <GoalRemaining id={goal.id} text={remainingText} />
                </View>
                <GoalBar
                  id={goal.id}
                  value={shown.progressCents}
                  max={shown.kind === "pay_down" ? shown.progressCents + shown.remainingCents || 1 : shown.targetCents || 1}
                  color={pace.tone === "behind" ? colors.danger : pace.tone === "muted" ? colors.tertiary : colors.positive}
                />
                {when || goal.monthlyCents ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                    <Text style={{ flex: 1, fontSize: 13, color: colors.muted }}>{when}</Text>
                    {goal.monthlyCents ? <Text style={{ fontSize: 13, color: colors.muted }}>{money(goal.monthlyCents)} / month</Text> : null}
                  </View>
                ) : (
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    {money(shown.progressCents)} of {money(goal.targetCents)}
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
          <Button label="Save" onPress={save} />
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

function GoalRemaining({ id, text }: { id: string; text: string }) {
  const measure = useMeasuredAnchor(`goal.remaining.${id}`, { text, color: colors.ink, fontSize: 16 });
  const opacity = useFlightHidden(`goal.remaining.${id}`);
  return (
    <View {...measure} style={{ opacity }}>
      <Text style={{ fontWeight: "600", color: colors.ink }}>{text}</Text>
    </View>
  );
}

function GoalBar({ id, value, max, color }: { id: string; value: number; max: number; color: string }) {
  const measure = useMeasuredAnchor(`goal.bar.${id}`);
  return (
    <View {...measure}>
      <Progress value={value} max={max} color={color} />
    </View>
  );
}
