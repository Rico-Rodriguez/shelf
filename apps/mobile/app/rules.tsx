import { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../src/api";
import { Back, Button, Field, Loading, Note, Row, Screen } from "../src/ui";

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  matchMerchant: string | null;
  actionCategoryId: string | null;
  priority: number;
};

export default function RulesScreen() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState("");
  const [merchant, setMerchant] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [preview, setPreview] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void api<{ rules: Rule[] }>("/api/rules")
      .then((res) => setRules(res.rules))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load rules"));
    void api<{ groups: { categories: { id: string; name: string }[] }[] }>("/api/categories")
      .then((res) => setCategories(res.groups.flatMap((group) => group.categories)))
      .catch(() => undefined);
  }

  useEffect(load, []);

  async function move(index: number, dir: -1 | 1) {
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= rules.length) return;
    const next = rules.slice();
    const [row] = next.splice(index, 1);
    next.splice(nextIndex, 0, row);
    setRules(next);
    await Promise.all(next.map((rule, order) => api(`/api/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ priority: order }) })));
    load();
  }

  const body = { name: name || merchant, matchMerchant: merchant, actionCategoryId: categoryId || null, enabled: true };

  return (
    <Screen title="Rules" refresh={<Back />}>
      {error ? <Note>{error}</Note> : null}
      {!rules.length && !error ? <Loading /> : null}
      {rules.map((rule, index) => (
        <View key={rule.id} style={{ gap: 8 }}>
          <Row
            title={`${rule.enabled ? "" : "Off · "}${rule.name}`}
            detail={rule.matchMerchant ?? ""}
            onPress={() => void api(`/api/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !rule.enabled }) }).then(load)}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Earlier" tone="quiet" onPress={() => void move(index, -1)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Later" tone="quiet" onPress={() => void move(index, 1)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Delete" tone="danger" onPress={() => void api(`/api/rules/${rule.id}`, { method: "DELETE" }).then(load)} />
            </View>
          </View>
        </View>
      ))}
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Merchant contains" value={merchant} onChangeText={setMerchant} />
      {categories.slice(0, 12).map((category) => (
        <Row key={category.id} title={categoryId === category.id ? `Category: ${category.name}` : category.name} onPress={() => setCategoryId(category.id)} />
      ))}
      <Button
        label="Preview"
        tone="quiet"
        onPress={() =>
          void api<{ count: number }>("/api/rules/preview", { method: "POST", body: JSON.stringify(body) }).then((res) => setPreview(res.count))
        }
      />
      {preview != null ? <Note>{`${preview} transactions match.`}</Note> : null}
      <Button
        label="Save rule"
        onPress={() => void api("/api/rules", { method: "POST", body: JSON.stringify({ ...body, applyUnreviewed: true }) }).then(load)}
      />
    </Screen>
  );
}
