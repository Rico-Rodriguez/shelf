import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { api } from "../../src/api";
import { money } from "../../src/format";
import { connectBank } from "../../src/plaid";
import { Button, Field, Loading, Note, Row, Screen } from "../../src/ui";

type Account = {
  id: string;
  name: string;
  type: string;
  mask: string | null;
  currentBalanceCents: number;
  isHidden: boolean;
};

export default function AccountsScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [plaidConfigured, setPlaidConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [type, setType] = useState("depository");

  const load = useCallback(() => {
    void api<{ accounts: Account[]; plaidConfigured: boolean }>("/api/accounts")
      .then((res) => {
        setAccounts(res.accounts.filter((account) => !account.isHidden));
        setPlaidConfigured(res.plaidConfigured);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load accounts"));
  }, []);

  useFocusEffect(load);

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
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Accounts">
      {error ? <Note>{error}</Note> : null}
      {!accounts.length && !error ? <Loading /> : null}
      {plaidConfigured ? <Button label="Connect a bank" onPress={() => void link()} busy={busy} /> : <Note>Add Plaid keys on the server to connect a bank.</Note>}
      <Button label="Sync" tone="quiet" onPress={() => void sync()} busy={busy} />
      {accounts.map((account) => (
        <Row
          key={account.id}
          title={`${account.name}${account.mask ? ` · ${account.mask}` : ""}`}
          detail={money(account.currentBalanceCents)}
          onPress={() => router.push(`/account/${account.id}`)}
        />
      ))}
      <Note>Manual account</Note>
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Balance" value={balance} onChangeText={setBalance} keyboardType="numeric" />
      {["depository", "credit", "investment", "loan"].map((kind) => (
        <Row key={kind} title={type === kind ? `Type: ${kind}` : kind} onPress={() => setType(kind)} />
      ))}
      <Button label="Add account" onPress={() => void add()} busy={busy} />
    </Screen>
  );
}
