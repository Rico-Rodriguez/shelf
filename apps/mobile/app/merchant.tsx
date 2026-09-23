import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { api } from "../src/api";
import { outflow } from "../src/format";
import { Back, Button, Loading, Note, Row, Screen } from "../src/ui";

type Tx = { id: string; name: string; amountCents: number; date: string; categoryId: string | null };
type Group = { categories: { id: string; name: string }[] };

export default function MerchantScreen() {
  const params = useLocalSearchParams<{ name?: string }>();
  const name = params.name ?? "";
  const [rows, setRows] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    void api<{ transactions: Tx[] }>(`/api/transactions?merchant=${encodeURIComponent(name)}`)
      .then((res) => setRows(res.transactions))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load this merchant"));
    void api<{ groups: Group[] }>("/api/categories")
      .then((res) => setCategories(res.groups.flatMap((group) => group.categories)))
      .catch(() => undefined);
  }, [name]);

  async function rule(categoryId: string) {
    await api("/api/rules", {
      method: "POST",
      body: JSON.stringify({ name: name, matchMerchant: name, actionCategoryId: categoryId, enabled: true, applyUnreviewed: true }),
    });
  }

  return (
    <Screen title={name || "Merchant"} refresh={<Back />}>
      {error ? <Note>{error}</Note> : null}
      {!rows.length && !error ? <Loading /> : null}
      {rows.map((tx) => (
        <Row key={tx.id} title={tx.date} detail={outflow(tx.amountCents)} />
      ))}
      <Note>Always categorize this merchant</Note>
      {categories.slice(0, 20).map((category) => (
        <Button key={category.id} label={category.name} tone="quiet" onPress={() => void rule(category.id)} />
      ))}
    </Screen>
  );
}
