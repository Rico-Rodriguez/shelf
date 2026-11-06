import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, load as read, peek, subscribeCache } from "../src/api";
import { accountIdentity, isLiability, money, netWorthCents, signed } from "../src/format";
import { anchorRect, stageFlight, useMeasuredAnchor } from "../src/flight";
import { tapPress } from "../src/haptic";
import { connectBank } from "../src/plaid";
import { useReduceMotion } from "../src/theme";
import { Back, Button, Card, colors, Field, GlassButton, Hero, LoadError, Loading, Note, Screen, Section, Sheet } from "../src/ui";

type Account = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalanceCents: number;
  isManual: boolean;
  isHidden: boolean;
  includeInNetWorth?: boolean;
  plaidItemId: string | null;
};

type Item = { id: string; institutionName: string | null; status: string; errorCode: string | null };

function accountLine(account: Account) {
  return accountIdentity(account);
}

type AccountsPayload = { accounts: Account[]; items?: Item[]; plaidConfigured: boolean };

export default function AccountsScreen() {
  const reduceMotion = useReduceMotion();
  const cached = peek<AccountsPayload>("/api/accounts");
  const [accounts, setAccounts] = useState<Account[] | null>(cached ? cached.accounts : null);
  const [showHidden, setShowHidden] = useState(false);
  const [items, setItems] = useState<Item[]>(cached?.items ?? []);
  const [plaidConfigured, setPlaidConfigured] = useState(cached?.plaidConfigured ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [type, setType] = useState("depository");

  const load = useCallback(() => {
    return read<AccountsPayload>("/api/accounts")
      .then((res) => {
        setAccounts(res.accounts);
        setItems(res.items ?? []);
        setPlaidConfigured(res.plaidConfigured);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load accounts"));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    return subscribeCache<AccountsPayload>("/api/accounts", (res) => {
      if (!res?.accounts) return;
      setAccounts(res.accounts);
      setItems(res.items ?? []);
      setPlaidConfigured(res.plaidConfigured);
    });
  }, []);

  const all = accounts ?? [];
  const hidden = all.filter((account) => account.isHidden);
  const visible = all.filter((account) => !account.isHidden || showHidden);
  const worth = accounts ? netWorthCents(accounts) : 0;
  const counted = all.filter((account) => !account.isHidden && account.includeInNetWorth !== false);
  const assetTotal = counted.filter((account) => !isLiability(account.type)).reduce((sum, account) => sum + account.currentBalanceCents, 0);
  const debtTotal = counted.filter((account) => isLiability(account.type)).reduce((sum, account) => sum + Math.abs(account.currentBalanceCents), 0);

  const institutions = useMemo(() => {
    const map = new Map<string, { key: string; name: string; rows: Account[] }>();
    for (const account of visible) {
      const item = account.plaidItemId ? items.find((row) => row.id === account.plaidItemId) : null;
      const key = item?.id ?? "manual";
      const bucket = map.get(key) ?? { key, name: item?.institutionName || (account.isManual ? "Added by you" : "Bank"), rows: [] };
      bucket.rows.push(account);
      map.set(key, bucket);
    }
    return [...map.values()];
  }, [visible, items]);

  async function sync() {
    setBusy(true);
    try {
      await api("/api/plaid/sync", { method: "POST", body: "{}" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function link() {
    setBusy(true);
    try {
      await connectBank();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect a bank");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    setBusy(true);
    try {
      await api("/api/accounts", {
        method: "POST",
        body: JSON.stringify({ name, type, currentBalance: Number(balance || 0) }),
      });
      setName("");
      setBalance("");
      setOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Accounts"
      refresh={router.canGoBack() ? <Back label="Today" /> : undefined}
      onRefresh={load}
      action={
        <GlassButton
          label="Add"
          icon="plus"
          onPress={() => setOpen(true)}
          compact
        />
      }
    >
      {error ? <LoadError message={error} onRetry={() => void load()} /> : null}
      {accounts === null && !error ? <Loading /> : null}
      {all.length > 0 ? (
        <Hero
          label="Net worth"
          cents={worth}
          tone={worth < 0 ? "bad" : undefined}
          shares={[
            { label: "Assets", cents: assetTotal, color: colors.accent },
            { label: "Debts", cents: debtTotal, color: colors.danger },
          ]}
        />
      ) : null}

      {items
        .filter((item) => item.status !== "ok")
        .map((item) => (
          <Note key={item.id}>{`${item.institutionName || "Bank"} needs attention${item.errorCode ? ` (${item.errorCode})` : ""}`}</Note>
        ))}

      {accounts && all.length === 0 ? (
        <View style={{ gap: 12, alignItems: "center" }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.ink }}>Add a bank or a balance</Text>
          <Button label="Add an account" onPress={() => setOpen(true)} />
        </View>
      ) : null}

      {plaidConfigured ? (
        <Card>
          <View style={{ minHeight: 56, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable onPress={() => void link()} disabled={busy}>
              <Text style={{ color: colors.accentInk, fontWeight: "600", fontSize: 16 }}>Connect a bank</Text>
            </Pressable>
            <Pressable onPress={() => void sync()} disabled={busy}>
              <Text style={{ color: colors.accentInk, fontWeight: "600", fontSize: 16 }}>{busy ? "Refreshing…" : "Refresh"}</Text>
            </Pressable>
          </View>
        </Card>
      ) : accounts ? (
        <Note>Bank connect isn’t available.</Note>
      ) : null}

      {institutions.map((group) => {
        const total = group.rows.reduce((sum, account) => {
          const amount = Math.abs(account.currentBalanceCents);
          return sum + (isLiability(account.type) ? -amount : amount);
        }, 0);
        return (
          <View key={group.key} style={{ gap: 8 }}>
            <Section title={group.name} trailing={money(total)} />
            <Card>
              {group.rows.map((account, index) => {
                const liability = isLiability(account.type);
                const cents = liability ? -Math.abs(account.currentBalanceCents) : account.currentBalanceCents;
                const line = accountLine(account);
                return (
                  <Pressable
                    key={account.id}
                    onPress={() => {
                      const nameFrom = anchorRect(`account.row.${account.id}.name`);
                      const balanceFrom = anchorRect(`worth.row.${account.id}`);
                      const pieces = [];
                      if (nameFrom) {
                        pieces.push({
                          key: "name",
                          text: account.name,
                          color: colors.ink,
                          fontSize: 17,
                          fontWeight: "600" as const,
                          from: nameFrom,
                          toAnchor: "account.hero.name",
                          toFontSize: 17,
                        });
                      }
                      if (balanceFrom) {
                        pieces.push({
                          key: "balance",
                          text: liability ? signed(cents) : money(cents),
                          color: liability ? colors.danger : colors.ink,
                          fontSize: 16,
                          fontWeight: "700" as const,
                          from: balanceFrom,
                          toAnchor: "account.hero.balance",
                          toFontSize: 46,
                        });
                      }
                      if (pieces.length) {
                        stageFlight({ id: "account-open", hide: ["account.hero.name", "account.hero.balance"], pieces }, reduceMotion);
                      }
                      router.push(`/account/${account.id}`);
                    }}
                    onPressIn={tapPress}
                    style={({ pressed }) => [{ minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }, pressed ? { backgroundColor: colors.fill } : null]}
                  >
                    <View style={{ flex: 1 }}>
                      <AccountName id={account.id} name={account.name} />
                      {line || account.includeInNetWorth === false || account.isHidden ? (
                        <Text numberOfLines={1} style={{ fontSize: 13, color: colors.muted }}>
                          {[line, account.includeInNetWorth === false ? "Not in net worth" : "", account.isHidden ? "Hidden" : ""].filter(Boolean).join(" · ")}
                        </Text>
                      ) : null}
                    </View>
                    <AccountBalance id={account.id} text={liability ? signed(cents) : money(cents)} color={liability ? colors.danger : colors.ink} />
                  </Pressable>
                );
              })}
            </Card>
          </View>
        );
      })}

      {hidden.length > 0 ? (
        <Pressable
          onPress={() => {
            tapPress();
            setShowHidden((value) => !value);
          }}
          style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: colors.accentInk, fontWeight: "600", fontSize: 15 }}>
            {showHidden ? "Hide hidden" : `Show hidden (${hidden.length})`}
          </Text>
        </Pressable>
      ) : null}

      {open ? (
        <Sheet title="Add an account" onClose={() => setOpen(false)}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Checking, Home, Car…" />
          <Section title="Type" />
          {["depository", "credit", "investment", "loan", "other"].map((kind) => (
            <Pressable key={kind} onPress={() => setType(kind)}>
              <Text style={{ fontSize: 16, paddingVertical: 8, color: type === kind ? colors.accentInk : colors.ink }}>
                {kind === "depository" ? "Deposit" : kind.charAt(0).toUpperCase() + kind.slice(1)}
              </Text>
            </Pressable>
          ))}
          <Field label="Balance" value={balance} onChangeText={setBalance} keyboardType="decimal-pad" placeholder="0.00" />
          <Button label="Add account" onPress={() => void add()} busy={busy} />
        </Sheet>
      ) : null}
    </Screen>
  );
}

function AccountName({ id, name }: { id: string; name: string }) {
  const measure = useMeasuredAnchor(`account.row.${id}.name`, { text: name, color: colors.ink, fontSize: 17 });
  return (
    <View ref={measure.ref} onLayout={measure.onLayout} collapsable={false}>
      <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "500", color: colors.ink }}>{name}</Text>
    </View>
  );
}

function AccountBalance({ id, text, color }: { id: string; text: string; color: string }) {
  const measure = useMeasuredAnchor(`worth.row.${id}`, { text, color, fontSize: 16 });
  return (
    <View ref={measure.ref} onLayout={measure.onLayout} collapsable={false}>
      <Text style={{ fontSize: 16, fontWeight: "600", color }}>{text}</Text>
    </View>
  );
}
