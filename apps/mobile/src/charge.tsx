import { router } from "expo-router";
import { useMemo, useState, useEffect } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { api } from "./api";
import { dayLabel, merchantMatchKey, shelfColor } from "./format";
import { tapPress, tapSelect } from "./haptic";
import { Icon } from "./icons";
import { Button, Card, colors, Field, FlowAmount, Note, Section, SearchField, Sheet, Switch } from "./ui";

export type ChargeGroup = {
  name: string;
  color?: string | null;
  categories: { id: string; name: string; color?: string | null }[];
};

export type Charge = {
  id: string;
  name: string;
  merchantName: string | null;
  amountCents: number;
  date: string;
  pending: boolean;
  reviewed: boolean;
  hidden: boolean;
  categoryId: string | null;
  notes: string | null;
  goalId: string | null;
  isTransfer: boolean;
  transferPairId: string | null;
  originalDescription: string | null;
  category: { name: string; color?: string | null } | null;
  account: { name: string } | null;
  tags: { name: string }[];
  splits: { categoryId: string | null; amountCents: number }[];
};

type Pair = { id: string; name: string; date: string; account: string | null };
type Goal = { id: string; name: string };
type SplitDraft = { categoryId: string; amount: string };

export function getCategoryColor(
  category?: { color?: string | null; name?: string } | null,
  group?: { color?: string | null } | null,
): string {
  if (category?.color) return shelfColor(category.color);
  if (group?.color) return shelfColor(group.color);
  const name = category?.name || "General";
  const palette = [
    "#1B7A62", // Emerald
    "#2F5D8C", // Classic Blue
    "#8A5A2B", // Warm Brown
    "#6B4F9A", // Purple
    "#C47A1A", // Amber
    "#D94A2E", // Terra Cotta
    "#3D6B5A", // Forest
    "#B04A3A", // Rust
    "#4B6584", // Slate
    "#0F5241", // Deep Pine
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

export function ChargeSheet({
  tx,
  groups,
  onClose,
  onSaved,
  onOptimistic,
  onRevert,
  onHold,
}: {
  tx: Charge;
  groups: ChargeGroup[];
  onClose: () => void;
  onSaved: (clearedIds?: string[], ruleId?: string | null) => void;
  onOptimistic?: (draft: { categoryId: string | null; always: boolean; hidden: boolean; name: string }) => void;
  onRevert?: (message: string, retry: () => void) => void;
  onHold?: (hold: {
    categoryId: string | null;
    always: boolean;
    hidden: boolean;
    name: string;
    body: Record<string, unknown>;
    merchant: string;
    rename?: string;
  }) => void;
}) {
  const [name, setName] = useState(tx.name);
  const [categoryId, setCategoryId] = useState(tx.categoryId);
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [tagText, setTagText] = useState(tx.tags.map((tag) => tag.name).join(", "));
  const [hidden, setHidden] = useState(tx.hidden);
  const [isTransfer, setIsTransfer] = useState(tx.isTransfer);
  const [goalId, setGoalId] = useState(tx.goalId);
  const [transferPairId, setTransferPairId] = useState(tx.transferPairId);
  const [splits, setSplits] = useState<SplitDraft[]>(
    tx.splits.filter((part) => part.categoryId).map((part) => ({ categoryId: part.categoryId!, amount: (part.amountCents / 100).toFixed(2) })),
  );
  const [more, setMore] = useState(false);
  const [always, setAlways] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [picking, setPicking] = useState<number | "goal" | "pair" | null>(null);
  const [pickingCategory, setPickingCategory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => groups.flatMap((group) => group.categories), [groups]);

  useEffect(() => {
    void api<{ goals: Goal[] }>("/api/goals")
      .then((res) => setGoals(res.goals))
      .catch(() => undefined);
    void api<{ candidates: Pair[] }>(`/api/transactions?pairFor=${tx.id}`)
      .then((res) => setPairs(res.candidates))
      .catch(() => undefined);
  }, [tx.id]);

  function save() {
    const draft = { categoryId: categoryId || null, always: always && Boolean(categoryId), hidden, name };
    const body = {
      name,
      categoryId: categoryId || null,
      reviewed: true,
      hidden,
      notes,
      isTransfer: Boolean(transferPairId) || isTransfer,
      goalId,
      transferPairId,
      tags: tagText.split(",").map((item) => item.trim()).filter(Boolean),
      splits: splits.filter((part) => part.categoryId && part.amount).map((part) => ({ categoryId: part.categoryId, amount: Number(part.amount) })),
    };
    const persist = async () => {
      await api(`/api/transactions/${tx.id}`, { method: "PATCH", body: JSON.stringify(body) });
      const clearedIds: string[] = [tx.id];
      let ruleId: string | null = null;
      if (draft.always && categoryId) {
        const merchant = tx.merchantName || name;
        const ruleRes = await api<{ id: string; applied?: number; ids?: string[] }>("/api/rules", {
          method: "POST",
          body: JSON.stringify({
            name: merchant,
            matchMerchant: merchantMatchKey(merchant),
            actionCategoryId: categoryId,
            actionRename: name !== tx.name ? name : undefined,
            enabled: true,
            applyUnreviewed: true,
          }),
        });
        ruleId = ruleRes.id;
        if (ruleRes.ids?.length) clearedIds.push(...ruleRes.ids);
      }
      onSaved(clearedIds, ruleId);
    };
    onOptimistic?.(draft);
    if (onHold) {
      onHold({
        ...draft,
        body,
        merchant: tx.merchantName || name,
        rename: name !== tx.name ? name : undefined,
      });
      onClose();
      return;
    }
    const retry = () => {
      onOptimistic?.(draft);
      void persist().catch((err: unknown) => {
        onRevert?.(err instanceof Error ? err.message : "Could not save", retry);
      });
    };
    onClose();
    void persist().catch((err: unknown) => {
      onRevert?.(err instanceof Error ? err.message : "Could not save", retry);
    });
  }

  function categoryName(id: string | null) {
    return categories.find((category) => category.id === id)?.name ?? "Uncategorized";
  }

  const currentCategory = categories.find((category) => category.id === categoryId);
  const currentCategoryColor = getCategoryColor(currentCategory);
  const merchantName = tx.merchantName || name;

  return (
    <Sheet
      title={pickingCategory ? "Select Category" : merchantName}
      onClose={pickingCategory ? () => setPickingCategory(false) : onClose}
    >
      {pickingCategory ? (
        <View style={{ gap: 12 }}>
          <Pressable
            onPress={() => setPickingCategory(false)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}
          >
            <Icon name="chevron-left" size={16} color={colors.accentInk} />
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.accentInk }}>
              Back to details
            </Text>
          </Pressable>
          <CategoryPicker
            groups={groups}
            selected={categoryId}
            onSelect={(id) => {
              setCategoryId(id);
              setPickingCategory(false);
            }}
            onClose={() => setPickingCategory(false)}
          />
        </View>
      ) : (
        <>
      <View style={{ alignItems: "center", gap: 6, paddingVertical: 8 }}>
        <FlowAmount cents={tx.amountCents} size={36} />
        <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center" }}>
          {[dayLabel(tx.date), tx.account?.name, tx.pending ? "Pending" : ""].filter(Boolean).join(" · ")}
        </Text>
        {tx.originalDescription && tx.originalDescription !== name ? (
          <Text style={{ fontSize: 12, color: colors.tertiary, textAlign: "center", marginTop: 2 }}>
            Original: {tx.originalDescription}
          </Text>
        ) : null}
      </View>

      {error ? <Note>{error}</Note> : null}

      {/* Dedicated Category Selector Card */}
      <Pressable
        onPress={() => {
          tapPress();
          setPickingCategory(true);
        }}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderRadius: 18,
            borderCurve: "continuous",
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.line,
            gap: 12,
          },
          pressed ? { opacity: 0.85, transform: [{ scale: 0.985 }] } : null,
        ]}
      >
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: currentCategoryColor }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Category
          </Text>
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.ink, marginTop: 2 }}>
            {categoryName(categoryId)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderCurve: "continuous", backgroundColor: colors.fill }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>Change</Text>
          <Icon name="chevron" size={14} color={colors.ink} />
        </View>
      </Pressable>

      {/* Rule Option */}
      <Pressable
        onPress={() => {
          tapSelect();
          setAlways((value) => !value);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          borderRadius: 18,
          borderCurve: "continuous",
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.line,
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>
            Always categorize {merchantName} this way
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>
            Future transactions will auto-file as {categoryName(categoryId)}
          </Text>
        </View>
        <Switch on={always} />
      </Pressable>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          label="History"
          tone="quiet"
          onPress={() => {
            onClose();
            router.push({ pathname: "/merchant", params: { name: merchantName } });
          }}
        />
        <Button
          label={more ? "Fewer details" : "More details"}
          tone="quiet"
          onPress={() => setMore((value) => !value)}
        />
      </View>

      {more ? (
        <View style={{ gap: 12 }}>
          <Field label="Name" value={name} onChangeText={setName} />

          <Section title="Goal" />
          <Pressable onPress={() => setPicking(picking === "goal" ? null : "goal")} style={toggle}>
            <Text style={{ fontSize: 16, color: colors.ink }}>{goals.find((goal) => goal.id === goalId)?.name ?? "No goal"}</Text>
          </Pressable>
          {picking === "goal" ? (
            <Card>
              <Pressable onPress={() => { setGoalId(null); setPicking(null); }} style={choice}>
                <Text style={{ color: goalId ? colors.ink : colors.accentInk }}>No goal</Text>
              </Pressable>
              {goals.map((goal) => (
                <Pressable key={goal.id} onPress={() => { setGoalId(goal.id); setPicking(null); }} style={choice}>
                  <Text style={{ color: goalId === goal.id ? colors.accentInk : colors.ink }}>{goal.name}</Text>
                </Pressable>
              ))}
            </Card>
          ) : null}

          <Section title="Linked transfer" />
          <Pressable onPress={() => setPicking(picking === "pair" ? null : "pair")} style={toggle}>
            <Text style={{ fontSize: 16, color: colors.ink }}>
              {pairs.find((pair) => pair.id === transferPairId)?.name ?? (transferPairId ? "Linked transfer" : "No linked transfer")}
            </Text>
          </Pressable>
          {picking === "pair" ? (
            <Card>
              <Pressable onPress={() => { setTransferPairId(null); setPicking(null); }} style={choice}>
                <Text style={{ color: colors.ink }}>No linked transfer</Text>
              </Pressable>
              {pairs.map((pair) => (
                <Pressable
                  key={pair.id}
                  onPress={() => {
                    setTransferPairId(pair.id);
                    setIsTransfer(true);
                    setPicking(null);
                  }}
                  style={choice}
                >
                  <Text style={{ color: transferPairId === pair.id ? colors.accentInk : colors.ink }}>
                    {`${pair.date} · ${pair.name}${pair.account ? ` · ${pair.account}` : ""}`}
                  </Text>
                </Pressable>
              ))}
            </Card>
          ) : null}

          <Field label="Note" value={notes} onChangeText={setNotes} multiline />
          <Field label="Tags" value={tagText} onChangeText={setTagText} placeholder="groceries, trip" />

          <Section title="Splits" />
          {splits.map((part, index) => (
            <View key={`${index}-${part.categoryId}`} style={{ gap: 8 }}>
              <Pressable onPress={() => setPicking(picking === index ? null : index)} style={toggle}>
                <Text style={{ flex: 1, fontSize: 16, color: colors.ink }}>{categoryName(part.categoryId)}</Text>
              </Pressable>
              {picking === index ? (
                <Card>
                  {categories.map((category) => (
                    <Pressable
                      key={category.id}
                      onPress={() => {
                        const next = splits.slice();
                        next[index] = { ...part, categoryId: category.id };
                        setSplits(next);
                        setPicking(null);
                      }}
                      style={choice}
                    >
                      <Text style={{ color: part.categoryId === category.id ? colors.accentInk : colors.ink }}>{category.name}</Text>
                    </Pressable>
                  ))}
                </Card>
              ) : null}
              <Field
                label="Amount"
                value={part.amount}
                onChangeText={(amount) => {
                  const next = splits.slice();
                  next[index] = { ...part, amount };
                  setSplits(next);
                }}
                keyboardType="decimal-pad"
              />
              <Button label="Remove split" tone="quiet" onPress={() => setSplits(splits.filter((_, item) => item !== index))} />
            </View>
          ))}
          <Button label="Add split" tone="quiet" onPress={() => setSplits([...splits, { categoryId: "", amount: "" }])} />

          <Pressable onPress={() => setHidden((value) => !value)} style={toggle}>
            <Text style={{ flex: 1, fontSize: 16, color: colors.ink }}>Hide from budget</Text>
            <Switch on={hidden} />
          </Pressable>
          <Pressable onPress={() => setIsTransfer((value) => !value)} style={toggle}>
            <Text style={{ flex: 1, fontSize: 16, color: colors.ink }}>Count as transfer</Text>
            <Switch on={isTransfer} />
          </Pressable>
        </View>
      ) : null}

      <Button label="Save Changes" onPress={() => void save()} busy={busy} block />
    </>
  )}
</Sheet>
  );
}

export function CategoryPicker({
  groups,
  selected,
  onSelect,
  onClose,
}: {
  groups: ChargeGroup[];
  selected: string | null;
  onSelect: (id: string) => void;
  onClose?: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  // Pick top quick-access categories when not searching
  const quickCategories = useMemo(() => {
    const list: { id: string; name: string; color?: string | null }[] = [];
    const seen = new Set<string>();
    // Take first 1-2 categories from common expense groups
    for (const group of groups) {
      if (group.name.toLowerCase().includes("income")) continue;
      for (const cat of group.categories) {
        if (!seen.has(cat.id)) {
          seen.add(cat.id);
          list.push({ ...cat, color: getCategoryColor(cat, group) });
          if (list.length >= 6) break;
        }
      }
      if (list.length >= 6) break;
    }
    return list;
  }, [groups]);

  const shown = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          categories: group.categories.filter(
            (category) =>
              !needle ||
              category.name.toLowerCase().includes(needle) ||
              group.name.toLowerCase().includes(needle),
          ),
        }))
        .filter((group) => group.categories.length > 0),
    [groups, needle],
  );

  return (
    <View style={{ gap: 16 }}>
      {/* Search Input Bar with Apple HIG SearchField */}
      <SearchField value={query} onChangeText={setQuery} placeholder="Search categories..." />

      {/* Suggested Quick-Picks when not searching */}
      {!needle && quickCategories.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.tertiary, letterSpacing: 0.8, textTransform: "uppercase" }}>
            Suggested
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {quickCategories.map((category) => {
              const on = category.id === selected;
              const catColor = category.color || colors.accent;
              return (
                <Pressable
                  key={category.id}
                  onPress={() => {
                    tapSelect();
                    onSelect(category.id);
                    onClose?.();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 999,
                    borderCurve: "continuous",
                    backgroundColor: on ? colors.accentSoft : colors.card,
                    borderWidth: 1,
                    borderColor: on ? colors.accent : colors.line,
                  }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor }} />
                  <Text style={{ fontSize: 14, fontWeight: on ? "700" : "500", color: on ? colors.accentInk : colors.ink }}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* No results message */}
      {shown.length === 0 ? (
        <View style={{ paddingVertical: 24, alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: "500", color: colors.muted }}>
            No categories match "{query}"
          </Text>
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.accentInk }}>
              Clear search
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Grouped Category Sections */}
      {shown.map((group) => {
        return (
          <View key={group.name} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  letterSpacing: 0.8,
                  color: colors.tertiary,
                  textTransform: "uppercase",
                }}
              >
                {group.name}
              </Text>
            </View>
            <Card>
              {group.categories.map((category, index) => {
                const on = category.id === selected;
                const catColor = getCategoryColor(category, group);
                return (
                  <Pressable
                    key={category.id}
                    onPress={() => {
                      tapSelect();
                      onSelect(category.id);
                      onClose?.();
                    }}
                    style={{
                      minHeight: 52,
                      paddingHorizontal: 16,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderTopWidth: index ? 1 : 0,
                      borderTopColor: colors.line,
                      backgroundColor: on ? colors.accentSoft : "transparent",
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: catColor }} />
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: on ? "600" : "400",
                          color: on ? colors.accentInk : colors.ink,
                          letterSpacing: -0.2,
                        }}
                      >
                        {category.name}
                      </Text>
                    </View>
                    {on ? (
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: colors.accent,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name="check" size={14} color="#fff" filled />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </Card>
          </View>
        );
      })}
    </View>
  );
}

const toggle = {
  minHeight: 52,
  paddingHorizontal: 16,
  borderRadius: 16,
  borderCurve: "continuous" as const,
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.line,
  borderTopColor: colors.specularTop || colors.line,
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  gap: 12,
};

const choice = {
  minHeight: 46,
  justifyContent: "center" as const,
  paddingHorizontal: 16,
  borderTopWidth: 1,
  borderTopColor: colors.line,
};
