import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../src/api";
import { CategoryPicker, Charge, ChargeSheet } from "../src/charge";
import { ReviewCard } from "../src/decide";
import { money } from "../src/format";
import { Icon } from "../src/icons";
import { celebrate, SuccessMark } from "../src/toast";
import { colors, Field, Sheet } from "../src/ui";

type Group = { name: string; categories: { id: string; name: string }[] };

function stamp(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}

export default function ReviewScreen() {
  const [rows, setRows] = useState<Charge[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [reviewedCount, setReviewedCount] = useState(0);
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return Promise.all([
      api<{ transactions: Charge[] }>("/api/transactions?reviewed=false"),
      api<{ groups: Group[] }>("/api/categories"),
    ])
      .then(([tx, cats]) => {
        setRows(tx.transactions);
        setGroups(cats.groups);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load review"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = rows?.[0] ?? null;
  const next = rows?.[1] ?? null;
  const categories = groups.flatMap((group) => group.categories);

  useEffect(() => {
    if (!current) return;
    setCategoryId(current.categoryId ?? "");
    setName(current.merchantName || current.name);
    setRenaming(false);
    setPicking(false);
  }, [current?.id]);

  function skip() {
    setRows((list) => {
      if (!list || list.length < 2) return list;
      return [...list.slice(1), list[0]];
    });
  }

  async function markReviewed() {
    if (!current) return;
    const id = current.id;
    celebrate("Reviewed");
    setReviewedCount((count) => count + 1);
    setRows((list) => (list ?? []).filter((row) => row.id !== id));
    try {
      await api(`/api/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ categoryId: categoryId || null, reviewed: true, name: name.trim() || current.name }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      void load();
    }
  }

  const categoryName = categories.find((category) => category.id === categoryId)?.name ?? "Category";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 8 }}>
        <Pressable accessibilityLabel="Back" onPress={() => router.back()} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <View style={{ transform: [{ rotate: "180deg" }] }}>
            <Icon name="chevron" size={20} color={colors.ink} />
          </View>
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: colors.ink, marginRight: 44 }}>Review Transactions</Text>
      </View>
      {error ? <Text style={{ color: colors.danger, textAlign: "center", paddingHorizontal: 24 }}>{error}</Text> : null}
      {rows === null && !error ? <Text style={{ color: colors.muted, textAlign: "center", marginTop: 48 }}>Loading</Text> : null}
      {rows && !current ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <SuccessMark />
          <Text style={{ fontSize: 22, fontWeight: "600", color: colors.ink }}>You’re caught up</Text>
        </View>
      ) : null}
      {current ? (
        <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 12 }}>
          <View style={{ flex: 1, justifyContent: "center" }}>
            {next ? (
              <View pointerEvents="none" style={{ position: "absolute", left: 18, right: 18, top: 18, bottom: 0, borderRadius: 28, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }} />
            ) : null}
            <ReviewCard id={current.id} onReviewed={() => void markReviewed()} onSkip={skip}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingVertical: 36, gap: 16 }}>
                <Text style={{ fontSize: 12, letterSpacing: 1.4, color: colors.tertiary }}>{stamp(current.date)}</Text>
                <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: "600", letterSpacing: -0.6, color: colors.ink, textAlign: "center" }}>{name}</Text>
                <Text style={{ fontSize: 36, fontWeight: "600", letterSpacing: -1, color: colors.ink }}>{money(Math.abs(current.amountCents))}</Text>
                <Pressable
                  onPress={() => setPicking(true)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, minHeight: 36, borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong }}
                >
                  <Text style={{ color: colors.ink, fontWeight: "600" }}>{categoryName}</Text>
                  <Text style={{ color: colors.muted }}>▾</Text>
                </Pressable>
                {current.originalDescription && current.originalDescription !== name ? (
                  <Text style={{ color: colors.tertiary, textAlign: "center" }} numberOfLines={2}>{current.originalDescription}</Text>
                ) : null}
                <Pressable onPress={() => { setRenaming(true); }}>
                  <Text style={{ color: colors.ink, textDecorationLine: "underline" }}>{`Not ${name}?`}</Text>
                </Pressable>
                {current.account?.name ? <Text style={{ color: colors.muted }}>{current.account.name}{current.pending ? " · Pending" : ""}</Text> : null}
              </View>
            </ReviewCard>
          </View>
          <Text style={{ textAlign: "right", color: colors.tertiary, marginTop: 12 }}>{reviewedCount} reviewed</Text>
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "flex-end", gap: 28, paddingTop: 16 }}>
            <Round label="Skip" onPress={skip}>
              <Text style={{ color: colors.ink, fontSize: 16 }}>▸</Text>
            </Round>
            <Round label="Edit" onPress={() => setEditing(true)}>
              <Text style={{ color: colors.ink, fontSize: 16 }}>✎</Text>
            </Round>
            <Round label="Reviewed" filled onPress={() => void markReviewed()}>
              <Text style={{ color: colors.bg, fontSize: 20, fontWeight: "700" }}>✓</Text>
            </Round>
          </View>
        </View>
      ) : null}

      {picking ? (
        <Sheet title="Category" onClose={() => setPicking(false)}>
          <CategoryPicker
            groups={groups}
            selected={categoryId}
            onSelect={(id) => {
              setCategoryId(id);
              setPicking(false);
            }}
          />
        </Sheet>
      ) : null}

      {renaming && current ? (
        <Sheet title="Name" onClose={() => setRenaming(false)}>
          <Field label="What should this be called?" value={name} onChangeText={setName} />
          <Pressable onPress={() => setRenaming(false)} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.accentInk, fontWeight: "600" }}>Done</Text>
          </Pressable>
        </Sheet>
      ) : null}

      {editing && current ? (
        <ChargeSheet
          tx={{ ...current, categoryId: categoryId || current.categoryId, name }}
          groups={groups}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setReviewedCount((count) => count + 1);
            setRows((list) => (list ?? []).filter((row) => row.id !== current.id));
            celebrate("Reviewed");
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Round({ label, onPress, filled, children }: { label: string; onPress: () => void; filled?: boolean; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", gap: 8 }}>
      <View style={{ width: filled ? 72 : 56, height: filled ? 72 : 56, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: filled ? colors.ink : colors.fill }}>
        {children}
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
