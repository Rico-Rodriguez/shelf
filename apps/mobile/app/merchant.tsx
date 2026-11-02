import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { api } from "../src/api";
import { Charge, ChargeGroup, ChargeSheet } from "../src/charge";
import { dayLabel, flowMoney, merchantMatchKey, sameMerchant, shortDate } from "../src/format";
import { Back, Button, Card, Hero, LedgerRow, Loading, Note, Screen } from "../src/ui";

type MerchantCharge = Omit<Charge, "category"> & {
  category: { id: string; name: string; color?: string | null } | null;
};
type Rule = { id: string; matchMerchant: string | null; actionCategoryId: string | null; name: string };

function whenLabel(iso: string) {
  const when = dayLabel(iso);
  return when === "Today" || when === "Yesterday" ? when : shortDate(iso);
}

export default function MerchantScreen() {
  const params = useLocalSearchParams<{ name?: string }>();
  const name = params.name ?? "";
  const [rows, setRows] = useState<MerchantCharge[] | null>(null);
  const [groups, setGroups] = useState<ChargeGroup[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<MerchantCharge | null>(null);
  const [rule, setRule] = useState<Rule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!name) return;
    void api<{ transactions: MerchantCharge[] }>(`/api/transactions?merchant=${encodeURIComponent(name)}`)
      .then((res) => setRows(res.transactions))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load this merchant"));
    void api<{ groups: ChargeGroup[] }>("/api/categories")
      .then((res) => {
        setGroups(res.groups);
        setCategories(res.groups.flatMap((group) => group.categories));
      })
      .catch(() => undefined);
    void api<{ rules: Rule[] }>("/api/rules")
      .then((res) => {
        const match = res.rules.find((item) => item.matchMerchant && sameMerchant(name, item.matchMerchant));
        setRule(match ?? null);
      })
      .catch(() => undefined);
  }

  useEffect(load, [name]);

  const summary = useMemo(() => {
    const list = (rows ?? []).filter((tx) => !tx.pending && tx.amountCents > 0);
    const byMonth = new Map<string, number>();
    for (const tx of list) {
      const key = tx.date.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + tx.amountCents);
    }
    const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
    const usual = months.length ? Math.round(months.reduce((sum, [, cents]) => sum + cents, 0) / months.length) : null;
    const counts = new Map<string, { name: string; n: number }>();
    for (const tx of list) {
      if (!tx.category) continue;
      const current = counts.get(tx.category.id) ?? { name: tx.category.name, n: 0 };
      current.n += 1;
      counts.set(tx.category.id, current);
    }
    const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    return { usual, category: top?.[1].name ?? null, categoryId: top?.[0] ?? null, series: months.map(([date, cents]) => ({ date: `${date}-01`, cents })) };
  }, [rows]);

  const categoryName = rule?.actionCategoryId ? categories.find((category) => category.id === rule.actionCategoryId)?.name ?? null : null;

  async function alwaysFile() {
    if (!summary.categoryId || !summary.category) return;
    setBusy(true);
    try {
      const created = await api<{ id: string }>("/api/rules", {
        method: "POST",
        body: JSON.stringify({
          name,
          matchMerchant: merchantMatchKey(name),
          actionCategoryId: summary.categoryId,
          applyUnreviewed: true,
        }),
      });
      setRule({ id: created.id, matchMerchant: merchantMatchKey(name), actionCategoryId: summary.categoryId, name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the rule");
    } finally {
      setBusy(false);
    }
  }

  if (!name) {
    return (
      <Screen title="Merchant" refresh={<Back />}>
        <Note>Open a merchant from Insights.</Note>
      </Screen>
    );
  }

  return (
    <Screen title={name} refresh={<Back />}>
      {error ? <Note>{error}</Note> : null}
      {rows === null && !error ? <Loading /> : null}
      {rows ? (
        <Hero label="Usual month" cents={summary.usual ?? 0} points={summary.series.length > 1 ? summary.series : undefined}>
          <Note>
            {summary.usual == null
              ? "Not enough history"
              : summary.category
                ? summary.category
                : rule
                  ? categoryName
                    ? `Files as ${categoryName}`
                    : "A rule matches this merchant"
                  : "No rule yet"}
          </Note>
        </Hero>
      ) : null}
      {!rule && summary.category ? <Button label={`Always file as ${summary.category}`} onPress={() => void alwaysFile()} busy={busy} /> : null}
      {rule ? <Note>{categoryName ? `Files as ${categoryName}` : "A rule matches this merchant"}</Note> : null}
      {rows && rows.length === 0 ? <Note>No transactions for this merchant.</Note> : null}
      {rows && rows.length ? (
        <Card>
          {rows.map((tx, index) => {
            const flow = flowMoney(tx.amountCents);
            return (
              <LedgerRow
                key={tx.id}
                divided={index > 0}
                name={tx.merchantName || tx.name}
                color={tx.category?.color}
                meta={[whenLabel(tx.date), tx.category?.name, tx.pending ? "Pending" : ""].filter(Boolean).join(" · ")}
                amount={flow.text}
                amountColor={flow.color}
                onPress={() => setSelected(tx)}
              />
            );
          })}
        </Card>
      ) : null}
      {selected ? (
        <ChargeSheet
          tx={selected}
          groups={groups}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            load();
          }}
        />
      ) : null}
    </Screen>
  );
}
