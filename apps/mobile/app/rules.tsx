import { useEffect, useState } from "react";
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

  const body = { name: name || merchant, matchMerchant: merchant, actionCategoryId: categoryId || null, enabled: true };

  return (
    <Screen title="Rules" refresh={<Back />}>
      {error ? <Note>{error}</Note> : null}
      {!rules.length && !error ? <Loading /> : null}
      {rules.map((rule) => (
        <Row
          key={rule.id}
          title={`${rule.enabled ? "" : "Off · "}${rule.name}`}
          detail={rule.matchMerchant ?? ""}
          onPress={() => void api(`/api/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !rule.enabled }) }).then(load)}
        />
      ))}
      {rules.map((rule) => (
        <Button key={`del-${rule.id}`} label={`Delete ${rule.name}`} tone="danger" onPress={() => void api(`/api/rules/${rule.id}`, { method: "DELETE" }).then(load)} />
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
