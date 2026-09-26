import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, load as read, peek } from "../../src/api";
import { isLiability, money, signed } from "../../src/format";
import { tapPress } from "../../src/haptic";
import { connectBank } from "../../src/plaid";
import { Back, Button, Card, colors, Field, GlassButton, Hero, Loading, Note, Screen, Section, Sheet } from "../../src/ui";

type Account = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalanceCents: number;
  isManual: boolean;
  isHidden: boolean;
  plaidItemId: string | null;
};

type Item = { id: string; institutionName: string | null; status: string; errorCode: string | null };

function accountLine(account: Account) {
  const kind = account.subtype || account.type;
  const label = kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "";
  const mask = account.mask ? `···${account.mask}` : "";
  return [label, mask].filter(Boolean).join(" · ");
}

type AccountsPayload = { accounts: Account[]; items?: Item[]; plaidConfigured: boolean };

export default function AccountsScreen() {
  const cached = peek<AccountsPayload>("/api/accounts");
  const [accounts, setAccounts] = useState<Account[] | null>(cached ? cached.accounts.filter((account) => !account.isHidden) : null);
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
        setAccounts(res.accounts.filter((account) => !account.isHidden));
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

  const visible = accounts ?? [];
  const assets = visible.filter((account) => !isLiability(account.type));
  const debts = visible.filter((account) => isLiability(account.type));
  const assetTotal = assets.reduce((sum, account) => sum + account.currentBalanceCents, 0);
  const debtTotal = debts.reduce((sum, account) => sum + Math.abs(account.currentBalanceCents), 0);

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
      framed={!router.canGoBack()}
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
      {error ? <Note>{error}</Note> : null}
      {accounts === null && !error ? <Loading /> : null}
      {visible.length > 0 ? (
        <Hero
          label="Net worth"
          cents={assetTotal - debtTotal}
          tone={assetTotal - debtTotal < 0 ? "bad" : undefined}
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

      {accounts && institutions.length === 0 ? (
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
        <Note>Add Plaid keys on the server to connect a bank.</Note>
      ) : null}

      {institutions.map((group) => {
        const total = group.rows.reduce((sum, account) => {
          const amount = Math.abs(account.currentBalanceCents);
          return sum + (isLiability(account.type) ? -amount : amount);
        }, 0);
        return (
          <View key={group.key} style={{ gap: 8 }}>
            <Section title={group.name} trailing={signed(total)} />
            <Card>
              {group.rows.map((account, index) => {
                const liability = isLiability(account.type);
                const cents = liability ? -Math.abs(account.currentBalanceCents) : account.currentBalanceCents;
                const line = accountLine(account);
                return (
                  <Pressable
                    key={account.id}
                    onPress={() => router.push(`/account/${account.id}`)}
                    onPressIn={tapPress}
                    style={({ pressed }) => [{ minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }, pressed ? { backgroundColor: colors.fill } : null]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "500", color: colors.ink }}>{account.name}</Text>
                      {line ? <Text numberOfLines={1} style={{ fontSize: 13, color: colors.muted }}>{line}</Text> : null}
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: liability ? colors.danger : colors.ink }}>{liability ? signed(cents) : money(cents)}</Text>
                  </Pressable>
                );
              })}
            </Card>
          </View>
        );
      })}

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
