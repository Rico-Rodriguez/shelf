import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "./api";
import { dayLabel } from "./format";
import { Button, Card, colors, Field, FlowAmount, Note, Section, Sheet } from "./ui";

export type ChargeGroup = { name: string; categories: { id: string; name: string }[] };

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

export function ChargeSheet({
  tx,
  groups,
  onClose,
  onSaved,
}: {
  tx: Charge;
  groups: ChargeGroup[];
  onClose: () => void;
  onSaved: () => void;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categories = groups.flatMap((group) => group.categories);

  useEffect(() => {
    void api<{ goals: Goal[] }>("/api/goals")
      .then((res) => setGoals(res.goals))
      .catch(() => undefined);
    void api<{ candidates: Pair[] }>(`/api/transactions?pairFor=${tx.id}`)
      .then((res) => setPairs(res.candidates))
      .catch(() => undefined);
  }, [tx.id]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        body: JSON.stringify({
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
        }),
      });
      if (always && categoryId) {
        const merchant = tx.merchantName || name;
        await api("/api/rules", {
          method: "POST",
          body: JSON.stringify({
            name: merchant,
            matchMerchant: merchant,
            actionCategoryId: categoryId,
            actionRename: name !== tx.name ? name : undefined,
            enabled: true,
            applyUnreviewed: true,
          }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  function categoryName(id: string | null) {
    return categories.find((category) => category.id === id)?.name ?? "Category";
  }

  return (
    <Sheet title={tx.merchantName || name} onClose={onClose}>
      <FlowAmount cents={tx.amountCents} size={32} />
      <Note>{[dayLabel(tx.date), tx.account?.name, tx.pending ? "Pending" : ""].filter(Boolean).join(" · ")}</Note>
      {tx.originalDescription && tx.originalDescription !== name ? <Note>{tx.originalDescription}</Note> : null}
      <Button label="History" tone="quiet" onPress={() => { onClose(); router.push({ pathname: "/merchant", params: { name: tx.merchantName || tx.name } }); }} />
      {error ? <Note>{error}</Note> : null}
      <Section title="Category" />
      <Card>
        {groups.map((group) =>
          group.categories.map((category) => (
            <Pressable
              key={category.id}
              onPress={() => setCategoryId(category.id)}
              style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.line }}
            >
              <Text style={{ fontSize: 16, color: categoryId === category.id ? colors.accentInk : colors.ink }}>{group.name === "Income" ? category.name : `${category.name}`}</Text>
            </Pressable>
          )),
        )}
      </Card>
      <Pressable onPress={() => setAlways((value) => !value)} style={toggle}>
        <Text style={{ flex: 1, fontSize: 16, color: colors.ink }}>Always categorize this merchant this way</Text>
        <Text style={{ fontWeight: "600", color: always ? colors.accentInk : colors.muted }}>{always ? "On" : "Off"}</Text>
      </Pressable>
      <Button label={more ? "Less" : "More"} tone="quiet" onPress={() => setMore((value) => !value)} />
      {more ? (
        <>
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
            <Text style={{ fontWeight: "600", color: hidden ? colors.accentInk : colors.muted }}>{hidden ? "On" : "Off"}</Text>
          </Pressable>
          <Pressable onPress={() => setIsTransfer((value) => !value)} style={toggle}>
            <Text style={{ flex: 1, fontSize: 16, color: colors.ink }}>Count as transfer</Text>
            <Text style={{ fontWeight: "600", color: isTransfer ? colors.accentInk : colors.muted }}>{isTransfer ? "On" : "Off"}</Text>
          </Pressable>
        </>
      ) : null}
      <Button label="Save" onPress={() => void save()} busy={busy} />
    </Sheet>
  );
}

const toggle = {
  minHeight: 52,
  paddingHorizontal: 16,
  borderRadius: 16,
  backgroundColor: colors.card,
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  gap: 12,
};
const choice = { minHeight: 44, justifyContent: "center" as const, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.line };
