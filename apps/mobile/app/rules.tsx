import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api, load as read, peek } from "../src/api";
import { Back, Button, Card, colors, EmptyState, Field, GlassButton, Loading, Note, Screen, Sheet, Switch } from "../src/ui";

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchMerchant: string | null;
  matchDescription: string | null;
  matchAmountMin: number | null;
  matchAmountMax: number | null;
  matchAccountId: string | null;
  matchCategoryId: string | null;
  actionRename: string | null;
  actionCategoryId: string | null;
  actionHide: boolean | null;
  actionTagNames: string | null;
  actionGoalId: string | null;
  actionSplitJson: string | null;
};

type FormState = {
  name: string;
  matchMerchant: string;
  matchDescription: string;
  matchAmountMin: string;
  matchAmountMax: string;
  matchAccountId: string;
  matchCategoryId: string;
  actionRename: string;
  actionCategoryId: string;
  actionHide: boolean;
  actionTagNames: string;
  actionGoalId: string;
  splitCategoryId: string;
  splitAmount: string;
  applyExisting: boolean;
};

const empty: FormState = {
  name: "",
  matchMerchant: "",
  matchDescription: "",
  matchAmountMin: "",
  matchAmountMax: "",
  matchAccountId: "",
  matchCategoryId: "",
  actionRename: "",
  actionCategoryId: "",
  actionHide: false,
  actionTagNames: "",
  actionGoalId: "",
  splitCategoryId: "",
  splitAmount: "",
  applyExisting: true,
};

export default function RulesScreen() {
  const params = useLocalSearchParams<{ merchant?: string; categoryId?: string; name?: string; rename?: string }>();
  const [rules, setRules] = useState<Rule[] | null>(() => peek<{ rules: Rule[] }>("/api/rules")?.rules ?? null);
  const [groups, setGroups] = useState<{ categories: { id: string; name: string }[] }[]>(() => peek<{ groups: { categories: { id: string; name: string }[] }[] }>("/api/categories")?.groups ?? []);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>(() => peek<{ accounts: { id: string; name: string }[] }>("/api/accounts")?.accounts ?? []);
  const [goals, setGoals] = useState<{ id: string; name: string }[]>(() => peek<{ goals: { id: string; name: string }[] }>("/api/goals")?.goals ?? []);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<"matchCategory" | "account" | "actionCategory" | "goal" | "split" | null>(null);

  const categories = groups.flatMap((group) => group.categories);

  function load() {
    void read<{ rules: Rule[] }>("/api/rules")
      .then((res) => setRules(res.rules))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load rules"));
  }

  useEffect(() => {
    load();
    void read<{ groups: { categories: { id: string; name: string }[] }[] }>("/api/categories").then((res) => setGroups(res.groups)).catch(() => undefined);
    void read<{ accounts: { id: string; name: string }[] }>("/api/accounts").then((res) => setAccounts(res.accounts)).catch(() => undefined);
    void read<{ goals: { id: string; name: string }[] }>("/api/goals").then((res) => setGoals(res.goals)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const merchant = typeof params.merchant === "string" ? params.merchant : "";
    const categoryId = typeof params.categoryId === "string" ? params.categoryId : "";
    if (!merchant && !categoryId) return;
    setEditingId(null);
    setForm({
      ...empty,
      name: (typeof params.name === "string" && params.name) || merchant || "New rule",
      matchMerchant: merchant,
      actionRename: typeof params.rename === "string" ? params.rename : "",
      actionCategoryId: categoryId,
    });
    setOpen(true);
  }, [params.merchant, params.categoryId, params.name, params.rename]);

  function payload() {
    const split =
      form.splitCategoryId && form.splitAmount
        ? JSON.stringify([{ categoryId: form.splitCategoryId, amountCents: Math.round(Number(form.splitAmount) * 100) }])
        : null;
    return {
      name: form.name,
      matchMerchant: form.matchMerchant || null,
      matchDescription: form.matchDescription || null,
      matchAmountMin: form.matchAmountMin ? Math.round(Number(form.matchAmountMin) * 100) : null,
      matchAmountMax: form.matchAmountMax ? Math.round(Number(form.matchAmountMax) * 100) : null,
      matchAccountId: form.matchAccountId || null,
      matchCategoryId: form.matchCategoryId || null,
      actionRename: form.actionRename || null,
      actionCategoryId: form.actionCategoryId || null,
      actionHide: form.actionHide,
      actionTagNames: form.actionTagNames || null,
      actionGoalId: form.actionGoalId || null,
      actionSplitJson: split,
    };
  }

  async function save() {
    const body = payload();
    if (editingId) {
      const res = await api<{ applied?: number }>(`/api/rules/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...body, applyExisting: form.applyExisting }),
      });
      setPreview(form.applyExisting ? `Updated. Applied to ${res.applied ?? 0} transactions.` : "Updated.");
    } else {
      const created = await api<{ id: string }>("/api/rules", { method: "POST", body: JSON.stringify(body) });
      if (form.applyExisting) {
        const res = await api<{ applied?: number }>(`/api/rules/${created.id}`, { method: "PATCH", body: JSON.stringify({ applyExisting: true }) });
        setPreview(`Saved. Applied to ${res.applied ?? 0} existing transactions.`);
      }
    }
    setForm(empty);
    setEditingId(null);
    setOpen(false);
    load();
  }

  async function dryRun() {
    const res = await api<{ count: number }>("/api/rules/preview", { method: "POST", body: JSON.stringify(payload()) });
    setPreview(`Would match ${res.count} existing transaction${res.count === 1 ? "" : "s"}.`);
  }

  function openEdit(rule: Rule) {
    let splitCategoryId = "";
    let splitAmount = "";
    if (rule.actionSplitJson) {
      try {
        const parts = JSON.parse(rule.actionSplitJson) as { categoryId?: string; amountCents?: number }[];
        splitCategoryId = parts[0]?.categoryId ?? "";
        splitAmount = parts[0]?.amountCents != null ? (parts[0].amountCents / 100).toFixed(2) : "";
      } catch {
        splitCategoryId = "";
      }
    }
    setEditingId(rule.id);
    setPreview(null);
    setPicking(null);
    setForm({
      name: rule.name,
      matchMerchant: rule.matchMerchant ?? "",
      matchDescription: rule.matchDescription ?? "",
      matchAmountMin: rule.matchAmountMin != null ? (rule.matchAmountMin / 100).toFixed(2) : "",
      matchAmountMax: rule.matchAmountMax != null ? (rule.matchAmountMax / 100).toFixed(2) : "",
      matchAccountId: rule.matchAccountId ?? "",
      matchCategoryId: rule.matchCategoryId ?? "",
      actionRename: rule.actionRename ?? "",
      actionCategoryId: rule.actionCategoryId ?? "",
      actionHide: Boolean(rule.actionHide),
      actionTagNames: rule.actionTagNames ?? "",
      actionGoalId: rule.actionGoalId ?? "",
      splitCategoryId,
      splitAmount,
      applyExisting: false,
    });
    setOpen(true);
  }

  async function move(index: number, dir: -1 | 1) {
    if (!rules) return;
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= rules.length) return;
    const next = rules.slice();
    const [row] = next.splice(index, 1);
    next.splice(nextIndex, 0, row);
    setRules(next);
    await Promise.all(next.map((rule, order) => api(`/api/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ priority: order }) })));
    load();
  }

  function describe(rule: Rule) {
    const parts = [];
    if (rule.matchMerchant) parts.push(`merchant contains “${rule.matchMerchant}”`);
    if (rule.matchDescription) parts.push(`description contains “${rule.matchDescription}”`);
    if (rule.matchCategoryId) parts.push("category matches");
    if (rule.matchAmountMin != null || rule.matchAmountMax != null) parts.push("amount range");
    const actions = [];
    if (rule.actionRename) actions.push(`rename to ${rule.actionRename}`);
    if (rule.actionCategoryId) actions.push("set category");
    if (rule.actionHide) actions.push("hide");
    if (rule.actionTagNames) actions.push(`tag ${rule.actionTagNames}`);
    if (rule.actionGoalId) actions.push("link a goal");
    if (rule.actionSplitJson) actions.push("split");
    return `${parts.join(", ") || "Any transaction"}${actions.length ? ` → ${actions.join(", ")}` : ""}`;
  }

  function nameOf(id: string, rows: { id: string; name: string }[], fallback: string) {
    return rows.find((row) => row.id === id)?.name ?? fallback;
  }

  return (
    <Screen
      title="Rules"
      refresh={<Back />}
      action={<GlassButton label="Add" icon="plus" compact onPress={() => { setForm(empty); setEditingId(null); setPreview(null); setPicking(null); setOpen(true); }} />}
    >
      {error ? <Note>{error}</Note> : null}
      {rules === null && !error ? <Loading /> : null}
      {rules && rules.length === 0 ? (
        <EmptyState
          icon="list"
          title="No rules yet"
          body="Rules file new purchases for you, like always putting a store in Groceries."
          action="Add a rule"
          onAction={() => setOpen(true)}
        />
      ) : null}
      {rules && rules.length > 0 ? <Card>
      {rules.map((rule, index) => (
        <View key={rule.id} style={{ borderTopWidth: index ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.line, paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
          <Pressable onPress={() => openEdit(rule)} style={{ gap: 4 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: rule.enabled ? colors.ink : colors.muted }}>{rule.name}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{describe(rule)}</Text>
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable accessibilityLabel={rule.enabled ? "Disable rule" : "Enable rule"} onPress={() => void api(`/api/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !rule.enabled }) }).then(load)}>
              <Switch on={rule.enabled} />
            </Pressable>
            <Pressable disabled={index === 0} onPress={() => void move(index, -1)}>
              <Text style={{ fontSize: 13, fontWeight: "500", color: index === 0 ? colors.tertiary : colors.ink }}>Earlier</Text>
            </Pressable>
            <Pressable disabled={index === (rules?.length ?? 0) - 1} onPress={() => void move(index, 1)}>
              <Text style={{ fontSize: 13, fontWeight: "500", color: index === (rules?.length ?? 0) - 1 ? colors.tertiary : colors.ink }}>Later</Text>
            </Pressable>
            <Pressable onPress={() => void api(`/api/rules/${rule.id}`, { method: "DELETE" }).then(load)}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.danger }}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ))}
      </Card> : null}

      {open ? (
        <Sheet title={editingId ? "Edit rule" : "New rule"} onClose={() => setOpen(false)}>
          <Field label="Rule name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
          <Field label="Merchant contains" value={form.matchMerchant} onChangeText={(matchMerchant) => setForm({ ...form, matchMerchant })} placeholder="e.g. Starbucks" />
          <Field label="Description contains" value={form.matchDescription} onChangeText={(matchDescription) => setForm({ ...form, matchDescription })} />
          <Pressable onPress={() => setPicking(picking === "matchCategory" ? null : "matchCategory")} style={toggle}>
            <Text style={{ fontSize: 16 }}>{`Current category · ${nameOf(form.matchCategoryId, categories, "Any category")}`}</Text>
          </Pressable>
          {picking === "matchCategory" ? <Pick options={[{ id: "", name: "Any category" }, ...categories]} value={form.matchCategoryId} onChange={(matchCategoryId) => { setForm({ ...form, matchCategoryId }); setPicking(null); }} /> : null}
          <Field label="Min amount" value={form.matchAmountMin} onChangeText={(matchAmountMin) => setForm({ ...form, matchAmountMin })} keyboardType="decimal-pad" />
          <Field label="Max amount" value={form.matchAmountMax} onChangeText={(matchAmountMax) => setForm({ ...form, matchAmountMax })} keyboardType="decimal-pad" />
          <Pressable onPress={() => setPicking(picking === "account" ? null : "account")} style={toggle}>
            <Text style={{ fontSize: 16 }}>{`Account · ${nameOf(form.matchAccountId, accounts, "Any account")}`}</Text>
          </Pressable>
          {picking === "account" ? <Pick options={[{ id: "", name: "Any account" }, ...accounts]} value={form.matchAccountId} onChange={(matchAccountId) => { setForm({ ...form, matchAccountId }); setPicking(null); }} /> : null}
          <Field label="Rename to" value={form.actionRename} onChangeText={(actionRename) => setForm({ ...form, actionRename })} />
          <Pressable onPress={() => setPicking(picking === "actionCategory" ? null : "actionCategory")} style={toggle}>
            <Text style={{ fontSize: 16 }}>{`Set category · ${nameOf(form.actionCategoryId, categories, "Keep category")}`}</Text>
          </Pressable>
          {picking === "actionCategory" ? <Pick options={[{ id: "", name: "Keep category" }, ...categories]} value={form.actionCategoryId} onChange={(actionCategoryId) => { setForm({ ...form, actionCategoryId }); setPicking(null); }} /> : null}
          <Field label="Tags" value={form.actionTagNames} onChangeText={(actionTagNames) => setForm({ ...form, actionTagNames })} placeholder="Comma-separated" />
          <Pressable onPress={() => setPicking(picking === "goal" ? null : "goal")} style={toggle}>
            <Text style={{ fontSize: 16 }}>{`Link goal · ${nameOf(form.actionGoalId, goals, "No goal")}`}</Text>
          </Pressable>
          {picking === "goal" ? <Pick options={[{ id: "", name: "No goal" }, ...goals]} value={form.actionGoalId} onChange={(actionGoalId) => { setForm({ ...form, actionGoalId }); setPicking(null); }} /> : null}
          <Pressable onPress={() => setPicking(picking === "split" ? null : "split")} style={toggle}>
            <Text style={{ fontSize: 16 }}>{`Split into · ${nameOf(form.splitCategoryId, categories, "No split")}`}</Text>
          </Pressable>
          {picking === "split" ? <Pick options={[{ id: "", name: "No split" }, ...categories]} value={form.splitCategoryId} onChange={(splitCategoryId) => { setForm({ ...form, splitCategoryId }); setPicking(null); }} /> : null}
          <Field label="Split amount" value={form.splitAmount} onChangeText={(splitAmount) => setForm({ ...form, splitAmount })} keyboardType="decimal-pad" />
          <Card>
            <Pressable onPress={() => setForm({ ...form, actionHide: !form.actionHide })} style={toggle}>
              <Text style={{ flex: 1, fontSize: 16, color: colors.ink }}>Hide matching purchases</Text>
              <Switch on={form.actionHide} />
            </Pressable>
            <Pressable onPress={() => setForm({ ...form, applyExisting: !form.applyExisting })} style={[toggle, { borderTopWidth: 1, borderTopColor: colors.line, borderRadius: 0 }]}>
              <Text style={{ flex: 1, fontSize: 16, color: colors.ink }}>Apply to existing transactions</Text>
              <Switch on={form.applyExisting} />
            </Pressable>
          </Card>
          {preview ? <Note>{preview}</Note> : null}
          <Button label="Preview matches" tone="quiet" block onPress={() => void dryRun()} />
          <Button label="Save rule" block onPress={() => void save()} />
        </Sheet>
      ) : null}
    </Screen>
  );
}

function Pick({ options, value, onChange }: { options: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <Card>
      {options.map((option) => (
        <Pressable key={option.id || "none"} onPress={() => onChange(option.id)} style={choice}>
          <Text style={{ color: value === option.id ? colors.accentInk : colors.ink }}>{option.name}</Text>
        </Pressable>
      ))}
    </Card>
  );
}

const toggle = { minHeight: 52, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.card, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const };
const choice = { minHeight: 44, justifyContent: "center" as const, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.line };
