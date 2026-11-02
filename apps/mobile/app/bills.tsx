import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../src/api";
import { CategoryPicker, ChargeGroup, getCategoryColor } from "../src/charge";
import { advanceDueDate, annualizedCents, inDaysPhrase, money, monthRange, occurrencesInMonth, todayISO } from "../src/format";
import { Back, Button, Card, colors, Facts, Field, Hero, LedgerRow, LoadError, Loading, Note, Screen, Section, Sheet, Switch } from "../src/ui";

type Bill = {
  id: string;
  merchantName: string;
  amountCents: number;
  cadence: string;
  nextDate: string;
  isIncome: boolean;
  isActive: boolean;
  categoryId: string | null;
  accountId: string | null;
  kind?: "bill" | "subscription";
  priceDeltaCents?: number | null;
};

type Draft = {
  merchantName: string;
  amountCents: number;
  cadence: string;
  nextDate: string;
  categoryId: string | null;
  accountId: string | null;
  isIncome: boolean;
};

type Form = {
  merchantName: string;
  amount: string;
  cadence: string;
  nextDate: string;
  categoryId: string;
  accountId: string;
  kind: "bill" | "subscription";
};

const CADENCES = [
  ["weekly", "Weekly"],
  ["biweekly", "Biweekly"],
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["yearly", "Yearly"],
] as const;

const CADENCE_LABEL: Record<string, string> = Object.fromEntries(CADENCES);
const emptyForm = (): Form => ({ merchantName: "", amount: "", cadence: "monthly", nextDate: todayISO(), categoryId: "", accountId: "", kind: "bill" });

export default function BillsScreen() {
  const now = new Date();
  const [rows, setRows] = useState<Bill[] | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [finding, setFinding] = useState(false);
  const [suggestions, setSuggestions] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Bill | "new" | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [groups, setGroups] = useState<ChargeGroup[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [picking, setPicking] = useState<"cadence" | "category" | "account" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ message: string; retry: () => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const listEpoch = useRef(0);

  function load() {
    const started = listEpoch.current;
    void api<{ recurrences: Bill[] }>("/api/recurring")
      .then((res) => {
        if (started !== listEpoch.current) return;
        setRows(res.recurrences);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load bills"));
  }

  useEffect(() => {
    load();
    void api<{ groups: ChargeGroup[] }>("/api/categories").then((res) => setGroups(res.groups)).catch(() => undefined);
    void api<{ accounts: { id: string; name: string }[] }>("/api/accounts").then((res) => setAccounts(res.accounts)).catch(() => undefined);
  }, []);

  const bills = (rows ?? [])
    .filter((row) => !row.isIncome)
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.nextDate.localeCompare(b.nextDate);
    });
  const focus = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const projected = useMemo(
    () =>
      bills
        .filter((row) => row.isActive)
        .flatMap((row) => occurrencesInMonth(row.nextDate, row.cadence, focus.year, focus.month).map((date) => ({ ...row, date }))),
    [bills, focus.year, focus.month],
  );
  const monthlyBills = bills.filter((row) => row.isActive).reduce((sum, row) => sum + Math.round(annualizedCents(row.amountCents, row.cadence) / 12), 0);
  const outflow = projected.reduce((sum, row) => sum + row.amountCents, 0);
  const found = suggestions.filter((draft) => !draft.isIncome);
  const categories = groups.flatMap((group) => group.categories);
  const range = monthRange(focus.year, focus.month);
  const today = todayISO();
  const byDate = new Map<string, number>();
  for (const row of projected) byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.amountCents);
  let run = 0;
  const curve = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cents]) => {
      run += cents;
      return { date, cents: run };
    });
  const points = curve.length ? [{ date: range.start, cents: 0 }, ...curve] : [];
  const next = [...projected].filter((row) => row.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];

  async function detect() {
    setFindOpen(true);
    setFinding(true);
    try {
      const res = await api<{ suggestions: Draft[] }>("/api/recurring", { method: "POST", body: JSON.stringify({ action: "detect" }) });
      setSuggestions(res.suggestions.filter((draft) => !draft.isIncome));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not look for bills");
    } finally {
      setFinding(false);
    }
  }

  async function confirm(drafts: Draft[]) {
    const outgoing = drafts.filter((draft) => !draft.isIncome);
    if (!outgoing.length) {
      setSuggestions([]);
      return;
    }
    await api("/api/recurring", { method: "POST", body: JSON.stringify({ action: "confirm", suggestions: outgoing }) });
    setSuggestions([]);
    setFindOpen(false);
    load();
  }

  async function skip(draft: Draft) {
    await api("/api/recurring", { method: "POST", body: JSON.stringify({ action: "dismiss", merchantName: draft.merchantName }) });
    setSuggestions((current) => current.filter((row) => row.merchantName !== draft.merchantName));
  }

  function openNew() {
    setConfirmDelete(false);
    setPicking(null);
    setForm(emptyForm());
    setEditing("new");
  }

  function openEdit(row: Bill) {
    setConfirmDelete(false);
    setPicking(null);
    setForm({
      merchantName: row.merchantName,
      amount: (row.amountCents / 100).toFixed(2),
      cadence: row.cadence,
      nextDate: row.nextDate,
      categoryId: row.categoryId ?? "",
      accountId: row.accountId ?? "",
      kind: row.kind ?? "bill",
    });
    setEditing(row);
  }

  function markPaid(row: Bill) {
    const snapshot = rows;
    const nextDate = advanceDueDate(row.nextDate || todayISO(), row.cadence);
    listEpoch.current += 1;
    setRows((current) => (current ?? []).map((item) => (item.id === row.id ? { ...item, nextDate } : item)));
    setEditing(null);
    setActionError(null);
    void api("/api/recurring", { method: "POST", body: JSON.stringify({ action: "paid", id: row.id }) })
      .then(() => load())
      .catch(() => {
        listEpoch.current += 1;
        setRows(snapshot);
        setActionError({ message: "Could not mark that bill paid.", retry: () => markPaid(row) });
      });
  }

  async function save() {
    setBusy(true);
    try {
      if (editing === "new") {
        await api("/api/recurring", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount), kind: form.kind }) });
      } else if (editing) {
        await api("/api/recurring", {
          method: "PATCH",
          body: JSON.stringify({
            id: editing.id,
            merchantName: form.merchantName,
            amount: Number(form.amount),
            cadence: form.cadence,
            nextDate: form.nextDate,
            isIncome: false,
            categoryId: form.categoryId || null,
            accountId: form.accountId || null,
            kind: form.kind,
          }),
        });
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the bill");
    } finally {
      setBusy(false);
    }
  }

  async function pause(row: Bill) {
    await api("/api/recurring", { method: "PATCH", body: JSON.stringify({ id: row.id, isActive: !row.isActive }) });
    setEditing(null);
    load();
  }

  async function remove(row: Bill) {
    await api("/api/recurring", { method: "DELETE", body: JSON.stringify({ id: row.id }) });
    setEditing(null);
    load();
  }

  function detail(row: Bill) {
    const bits = [CADENCE_LABEL[row.cadence] ?? row.cadence];
    if ((row.kind ?? "bill") === "subscription") bits.push("Subscription");
    bits.push(row.isActive ? `Due ${inDaysPhrase(row.nextDate)}` : "Paused");
    if (row.priceDeltaCents && row.priceDeltaCents > 0) bits.push("Above typical");
    return bits.join(" · ");
  }

  return (
    <Screen
      title="Bills"
      refresh={<Back />}
      onRefresh={load}
      action={
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Button label="Find bills" tone="quiet" onPress={() => void detect()} />
          <Button label="Add" onPress={openNew} />
        </View>
      }
    >
      {error ? <LoadError message={error} onRetry={load} /> : null}
      {actionError ? <LoadError message={actionError.message} onRetry={actionError.retry} /> : null}
      {rows === null && !error ? <Loading /> : null}
      {rows ? (
        <Hero label="Due this month" cents={outflow} points={points.length > 1 ? points : undefined}>
          <Facts
            items={[
              { kicker: "Typical Monthly", value: money(monthlyBills) },
              ...(next ? [{ kicker: "Next Due", value: `${next.merchantName} (${inDaysPhrase(next.date)})` }] : []),
            ]}
          />
        </Hero>
      ) : null}

      {bills.length === 0 && rows ? (
        <View style={{ gap: 12, alignItems: "center" }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.ink }}>No bills yet</Text>
          <Button label="Find bills" onPress={() => void detect()} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Section title="Coming up" />
          <Card>
            {bills.map((row, index) => (
              <LedgerRow key={row.id} divided={index > 0} name={row.merchantName} meta={detail(row)} amount={money(row.amountCents)} onPress={() => openEdit(row)} />
            ))}
          </Card>
        </View>
      )}

      {findOpen ? (
        <Sheet title="Find bills" onClose={() => setFindOpen(false)}>
          {finding ? <Note>Looking through activity…</Note> : null}
          {!finding && found.length === 0 ? <Note>Nothing repeating showed up.</Note> : null}
          {found.map((draft) => (
            <View key={draft.merchantName} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: colors.ink }}>{draft.merchantName}</Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>{`${CADENCE_LABEL[draft.cadence] ?? draft.cadence} · next ${draft.nextDate}`}</Text>
              </View>
              <Text style={{ fontWeight: "600" }}>{money(draft.amountCents)}</Text>
              <Button label="Skip" tone="quiet" onPress={() => void skip(draft)} />
            </View>
          ))}
          {found.length ? <Button label="Keep these" onPress={() => void confirm(found)} /> : null}
        </Sheet>
      ) : null}

      {editing ? (
        <Sheet title={editing === "new" ? "New bill" : form.merchantName || "Bill"} onClose={() => setEditing(null)}>
          <Field label="Name" value={form.merchantName} onChangeText={(merchantName) => setForm({ ...form, merchantName })} />
          <Field label="Amount" value={form.amount} onChangeText={(amount) => setForm({ ...form, amount })} keyboardType="decimal-pad" />
          <Pressable onPress={() => setPicking(picking === "cadence" ? null : "cadence")} style={toggle}>
            <Text style={{ fontSize: 16, color: colors.ink }}>{`How often · ${CADENCE_LABEL[form.cadence] ?? form.cadence}`}</Text>
          </Pressable>
          {picking === "cadence" ? (
            <Card>
              {CADENCES.map(([value, label]) => (
                <Pressable key={value} onPress={() => { setForm({ ...form, cadence: value }); setPicking(null); }} style={choice}>
                  <Text style={{ color: form.cadence === value ? colors.accentInk : colors.ink }}>{label}</Text>
                </Pressable>
              ))}
            </Card>
          ) : null}
          <Field label="Next date" value={form.nextDate} onChangeText={(nextDate) => setForm({ ...form, nextDate })} placeholder="YYYY-MM-DD" />
          <Pressable onPress={() => setPicking("category")} style={toggle}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: getCategoryColor(categories.find((c) => c.id === form.categoryId)) }} />
              <Text style={{ fontSize: 16, color: colors.ink }}>
                {categories.find((row) => row.id === form.categoryId)?.name ?? "Select Category"}
              </Text>
            </View>
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>Change ›</Text>
          </Pressable>
          <Pressable onPress={() => setPicking(picking === "account" ? null : "account")} style={toggle}>
            <Text style={{ fontSize: 16, color: colors.ink }}>{accounts.find((row) => row.id === form.accountId)?.name ?? "Any account"}</Text>
          </Pressable>
          {picking === "account" ? (
            <Card>
              <Pressable onPress={() => { setForm({ ...form, accountId: "" }); setPicking(null); }} style={choice}>
                <Text>Any account</Text>
              </Pressable>
              {accounts.map((account) => (
                <Pressable key={account.id} onPress={() => { setForm({ ...form, accountId: account.id }); setPicking(null); }} style={choice}>
                  <Text style={{ color: form.accountId === account.id ? colors.accentInk : colors.ink }}>{account.name}</Text>
                </Pressable>
              ))}
            </Card>
          ) : null}
          <Pressable onPress={() => setForm({ ...form, kind: form.kind === "subscription" ? "bill" : "subscription" })} style={toggle}>
            <Text style={{ flex: 1, fontSize: 16, color: colors.ink }}>Subscription</Text>
            <Switch on={form.kind === "subscription"} />
          </Pressable>
          <Button label="Save" onPress={() => void save()} busy={busy} />
          {editing !== "new" ? (
            <>
              <Button
                label="Skip this cycle"
                tone="quiet"
                onPress={() => markPaid(editing)}
              />
              <Button label={editing.isActive ? "Pause" : "Resume"} tone="quiet" onPress={() => void pause(editing)} />
              <Button label={confirmDelete ? "Delete this bill?" : "Delete"} tone="danger" onPress={() => { if (!confirmDelete) { setConfirmDelete(true); return; } void remove(editing); }} />
            </>
          ) : null}
        </Sheet>
      ) : null}

      {picking === "category" ? (
        <Sheet title="Select Category" onClose={() => setPicking(null)}>
          <CategoryPicker
            groups={groups}
            selected={form.categoryId}
            onSelect={(id) => {
              setForm({ ...form, categoryId: id });
              setPicking(null);
            }}
            onClose={() => setPicking(null)}
          />
        </Sheet>
      ) : null}
    </Screen>
  );
}

const toggle = { minHeight: 52, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.card, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 12 };
const choice = { minHeight: 44, justifyContent: "center" as const, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.line };
