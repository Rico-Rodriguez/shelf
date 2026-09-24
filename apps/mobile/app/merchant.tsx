import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { api } from "../src/api";
import { merchantMatchKey, outflow } from "../src/format";
import { Back, Button, Hero, Loading, Note, Row, Screen } from "../src/ui";

type Tx = { id: string; name: string; date: string; amountCents: number; pending: boolean; category: { id: string; name: string } | null };
type Rule = { id: string; matchMerchant: string | null; actionCategoryId: string | null; name: string };

export default function MerchantScreen() {
  const params = useLocalSearchParams<{ name?: string }>();
  const name = params.name ?? "";
  const [rows, setRows] = useState<Tx[] | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [rule, setRule] = useState<Rule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!name) return;
    void api<{ transactions: Tx[] }>(`/api/transactions?merchant=${encodeURIComponent(name)}`)
      .then((res) => setRows(res.transactions))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load this merchant"));
    void api<{ groups: { categories: { id: string; name: string }[] }[] }>("/api/categories")
      .then((res) => setCategories(res.groups.flatMap((group) => group.categories)))
      .catch(() => undefined);
    void api<{ rules: Rule[] }>("/api/rules")
      .then((res) => {
        const match = res.rules.find((item) => item.matchMerchant && name.toLowerCase().includes(item.matchMerchant.toLowerCase()));
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
      {(rows ?? []).map((tx) => (
        <Row key={tx.id} title={tx.name} detail={`${tx.date}${tx.category?.name ? ` · ${tx.category.name}` : ""} · ${outflow(tx.amountCents)}`} />
      ))}
    </Screen>
  );
}
