import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, peek } from "./api";
import { dayLabel, flowMoney, isLiability, merchantMatchKey, money, shelfColor, signed } from "./format";
import { anchorRect, useFlightHidden, useMeasuredAnchor, type FlightPiece, type FlightRect } from "./flight";
import { tapPress, tapSelect } from "./haptic";
import { Icon } from "./icons";
import { useReduceMotion } from "./theme";
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

type Pair = { id: string; name: string; date: string; amountCents?: number; account: string | null };
type ShelfAccount = { id: string; name: string; type: string; currentBalanceCents: number };
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
  origin = null,
  originAnchor,
  carry = null,
  titleAnchor,
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
  origin?: FlightRect | null;
  originAnchor?: string;
  carry?: FlightPiece[] | null;
  titleAnchor?: string;
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
  const [shelfAccounts, setShelfAccounts] = useState<ShelfAccount[]>(() => peek<{ accounts: ShelfAccount[] }>("/api/accounts")?.accounts ?? []);
  const [crossPieces, setCrossPieces] = useState<FlightPiece[] | null>(null);
  const [crossed, setCrossed] = useState(false);
  const [crossToken, setCrossToken] = useState(0);
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
    void api<{ accounts: ShelfAccount[] }>("/api/accounts")
      .then((res) => setShelfAccounts(res.accounts))
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
  const showCrossing = Boolean(isTransfer || tx.isTransfer || transferPairId);
  const linked = pairs.find((pair) => pair.id === transferPairId) ?? null;
  const sourceAccount = shelfAccounts.find((account) => account.name === tx.account?.name) ?? null;
  const destAccount = linked?.account ? shelfAccounts.find((account) => account.name === linked.account) ?? null : null;

  function choosePair(pair: Pair | null) {
    setTransferPairId(pair?.id ?? null);
    if (pair) setIsTransfer(true);
    setCrossed(false);
    setCrossPieces(null);
    setCrossToken((value) => value + 1);
    setPicking(null);
  }

  return (
    <Sheet
      title={pickingCategory ? "Select Category" : merchantName}
      onClose={pickingCategory ? () => setPickingCategory(false) : onClose}
      origin={pickingCategory ? null : origin}
      originAnchor={pickingCategory ? undefined : originAnchor}
      carry={pickingCategory ? null : carry}
      titleAnchor={pickingCategory ? undefined : titleAnchor}
      overlay={crossPieces}
      onOverlayDone={() => {
        setCrossPieces(null);
        setCrossed(true);
      }}
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
        <SheetAmount cents={tx.amountCents} />
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

      {showCrossing ? (
        <TransferCross
          txId={tx.id}
          amountText={money(Math.abs(tx.amountCents))}
          source={sourceAccount}
          dest={destAccount}
          destName={linked?.account ?? null}
          crossed={crossed}
          token={crossToken}
          pairs={pairs}
          onChoose={choosePair}
          onFly={setCrossPieces}
        />
      ) : null}

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
        <SheetSwatch color={currentCategoryColor} />
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
              <Pressable onPress={() => choosePair(null)} style={choice}>
                <Text style={{ color: colors.ink }}>No linked transfer</Text>
              </Pressable>
              {pairs.map((pair) => (
                <Pressable
                  key={pair.id}
                  onPress={() => choosePair(pair)}
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

function balanceFace(account: ShelfAccount | null) {
  if (!account) return null;
  const liability = isLiability(account.type);
  const cents = liability ? -Math.abs(account.currentBalanceCents) : account.currentBalanceCents;
  return {
    name: account.name,
    label: liability ? signed(cents) : money(cents),
    color: liability ? colors.danger : colors.ink,
  };
}

function SheetAmount({ cents }: { cents: number }) {
  const flow = flowMoney(cents);
  const measure = useMeasuredAnchor("sheet.amount", { text: flow.text, color: flow.color, fontSize: 36 });
  const opacity = useFlightHidden("sheet.amount");
  return (
    <View {...measure} style={{ opacity }}>
      <FlowAmount cents={cents} size={36} />
    </View>
  );
}

function SheetSwatch({ color }: { color: string }) {
  const measure = useMeasuredAnchor("sheet.color");
  const opacity = useFlightHidden("sheet.color");
  return <View {...measure} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, opacity }} />;
}

function TransferCross({
  txId,
  amountText,
  source,
  dest,
  destName,
  crossed,
  token,
  pairs,
  onChoose,
  onFly,
}: {
  txId: string;
  amountText: string;
  source: ShelfAccount | null;
  dest: ShelfAccount | null;
  destName: string | null;
  crossed: boolean;
  token: number;
  pairs: Pair[];
  onChoose: (pair: Pair) => void;
  onFly: (pieces: FlightPiece[]) => void;
}) {
  const reduceMotion = useReduceMotion();
  const sourceFace = balanceFace(source);
  const destFace = balanceFace(dest);
  const sourceMeasure = useMeasuredAnchor(
    `transfer.source.${txId}`,
    sourceFace ? { text: sourceFace.label, color: sourceFace.color, fontSize: 16 } : null,
  );
  const destMeasure = useMeasuredAnchor(
    `transfer.dest.${txId}`,
    destFace ? { text: destFace.label, color: destFace.color, fontSize: 16 } : null,
  );
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (crossed || !source || !dest) return;
    if (reduceMotion) return;
    if (started.current === token) return;
    const timer = setTimeout(() => {
      const from = anchorRect(`transfer.source.${txId}`);
      const to = anchorRect(`transfer.dest.${txId}`);
      if (!from || !to) return;
      started.current = token;
      onFly([
        {
          key: `cross-${token}`,
          text: amountText,
          color: colors.tertiary,
          fontSize: 22,
          fontWeight: "700",
          from,
          to,
          toFontSize: 16,
        },
      ]);
    }, 160);
    return () => clearTimeout(timer);
  }, [amountText, crossed, dest, onFly, reduceMotion, source, token, txId]);

  return (
    <View style={{ gap: 10, padding: 16, borderRadius: 18, borderCurve: "continuous", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}>
      <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: colors.tertiary }}>TRANSFER</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <View {...sourceMeasure} style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, color: colors.muted }}>{sourceFace?.name ?? "This account"}</Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: sourceFace?.color ?? colors.ink, fontVariant: ["tabular-nums"] }}>
            {sourceFace?.label ?? "—"}
          </Text>
        </View>
        <View {...destMeasure} style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={{ fontSize: 13, color: colors.muted }}>{destFace?.name ?? destName ?? "Other account"}</Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: destFace?.color ?? colors.ink, fontVariant: ["tabular-nums"] }}>
            {destFace?.label ?? "—"}
          </Text>
        </View>
      </View>
      {crossed || reduceMotion ? (
        <Text style={{ textAlign: "center", fontSize: 13, color: colors.tertiary }}>
          {destFace ? `Settled in ${destFace.name}` : "Pick the other side"}
        </Text>
      ) : (
        <Text style={{ textAlign: "center", fontSize: 22, fontWeight: "700", color: colors.tertiary, fontVariant: ["tabular-nums"] }}>{amountText}</Text>
      )}
      {!dest ? (
        <View style={{ gap: 0 }}>
          {pairs.length === 0 ? <Text style={{ fontSize: 14, color: colors.muted }}>No matching transfer yet.</Text> : null}
          {pairs.map((pair) => (
            <Pressable key={pair.id} onPress={() => onChoose(pair)} style={{ minHeight: 44, justifyContent: "center" }}>
              <Text style={{ fontSize: 15, color: colors.ink }}>
                {`${pair.date} · ${pair.name}${pair.account ? ` · ${pair.account}` : ""}`}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
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
