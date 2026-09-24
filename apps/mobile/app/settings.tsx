import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Share } from "react-native";
import { api, apiText } from "../src/api";
import { Back, Button, Field, Note, Row, Screen } from "../src/ui";
import { useSession } from "../src/session";

type Household = {
  role: string;
  members: { userId: string; name: string; role: string }[];
};

export default function SettingsScreen() {
  const { state, signOut, refresh } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [csv, setCsv] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [home, setHome] = useState<Household | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api<{ accounts: { id: string; name: string }[] }>("/api/accounts").then((res) => {
      setAccounts(res.accounts);
      setAccountId(res.accounts[0]?.id ?? "");
    });
    void api<Household>("/api/household").then(setHome).catch(() => undefined);
  }, []);

  async function shareExport(format: "json" | "csv") {
    const text = format === "csv" ? await apiText("/api/export?format=csv") : JSON.stringify(await api("/api/export"));
    await Share.share({ message: text });
  }

  return (
    <Screen title="Settings" refresh={<Back />}>
      {message ? <Note>{message}</Note> : null}
      {state?.demoLoaded ? null : (
        <Button
          label="Load sample data"
          onPress={() =>
            void api<{ already?: boolean }>("/api/demo/seed", { method: "POST" })
              .then((res) => {
                setMessage(res.already ? "Sample data is already loaded." : "Sample data loaded. It is on Home.");
                return refresh();
              })
          }
        />
      )}
      <Row title="Manage rules" onPress={() => router.push("/rules")} />
      <Field label="Current Shelf key" value={current} onChangeText={setCurrent} shelfKey />
      <Field label="New Shelf key" value={next} onChangeText={setNext} shelfKey />
      <Button
        label="Change Shelf key"
        tone="quiet"
        onPress={() => {
          if (next.length < 12) {
            setMessage("Use at least 12 characters. A Shelf key is not a PIN.");
            return;
          }
          void api("/api/auth/password", { method: "POST", body: JSON.stringify({ current, next }) })
            .then(() => setMessage("Shelf key updated."))
            .catch((err: unknown) => setMessage(err instanceof Error ? err.message : "Could not change the Shelf key"));
        }}
      />
      <Button label="Export JSON" tone="quiet" onPress={() => void shareExport("json")} />
      <Button label="Export CSV" tone="quiet" onPress={() => void shareExport("csv")} />
      <Field label="CSV to import" value={csv} onChangeText={setCsv} multiline />
      <Note>Positive amounts are money out.</Note>
      {accounts.map((account) => (
        <Row key={account.id} title={accountId === account.id ? `Import into ${account.name}` : account.name} onPress={() => setAccountId(account.id)} />
      ))}
      <Button
        label="Import CSV"
        onPress={() =>
          void api<{ created: number }>("/api/import", { method: "POST", body: JSON.stringify({ accountId, csv }) }).then((res) =>
            setMessage(`Imported ${res.created} rows.`),
          )
        }
      />
      <Note>{home ? `Household role: ${home.role}` : "Household"}</Note>
      {(home?.members ?? []).map((member) => (
        <Row
          key={member.userId}
          title={home && home.members.length > 1 ? `${member.name} · ${member.role}` : member.name}
          detail={home?.role === "owner" && member.role !== "owner" ? "Remove" : undefined}
          onPress={
            home?.role === "owner" && member.role !== "owner"
              ? () => void api("/api/household", { method: "DELETE", body: JSON.stringify({ userId: member.userId }) }).then(() => api<Household>("/api/household").then(setHome))
              : undefined
          }
        />
      ))}
      {home?.role === "owner" ? (
        <Button
          label="Invite someone"
          onPress={() =>
            void api<{ code: string }>("/api/household/invites", { method: "POST", body: JSON.stringify({ role: "member" }) }).then((res) =>
              setMessage(`Share this code once. ${res.code}`),
            )
          }
        />
      ) : null}
      <Button label="Sign out" tone="danger" onPress={() => void signOut()} />
    </Screen>
  );
}
