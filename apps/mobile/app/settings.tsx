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
  const [inviteRole, setInviteRole] = useState("member");
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
      <Note>{state?.demoLoaded ? "Sample data is loaded." : "Sample data is not loaded."}</Note>
      <Button
        label="Load sample data"
        onPress={() => void api("/api/demo/seed", { method: "POST" }).then(() => refresh()).then(() => setMessage("Sample data is ready."))}
      />
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry />
      <Field label="New password" value={next} onChangeText={setNext} secureTextEntry />
      <Button
        label="Change password"
        tone="quiet"
        onPress={() =>
          void api("/api/auth/password", { method: "POST", body: JSON.stringify({ current, next }) })
            .then(() => setMessage("Password updated."))
            .catch((err: unknown) => setMessage(err instanceof Error ? err.message : "Could not change the password"))
        }
      />
      <Button label="Export JSON" tone="quiet" onPress={() => void shareExport("json")} />
      <Button label="Export CSV" tone="quiet" onPress={() => void shareExport("csv")} />
      <Field label="CSV to import" value={csv} onChangeText={setCsv} multiline />
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
          title={`${member.name} · ${member.role}`}
          onPress={() => void api("/api/household", { method: "DELETE", body: JSON.stringify({ userId: member.userId }) }).then(() => api<Household>("/api/household").then(setHome))}
        />
      ))}
      <Button label={`Invite as ${inviteRole}`} tone="quiet" onPress={() => setInviteRole(inviteRole === "member" ? "advisor" : "member")} />
      <Button
        label="Create invite"
        onPress={() =>
          void api<{ code: string }>("/api/household/invites", { method: "POST", body: JSON.stringify({ role: inviteRole }) }).then((res) =>
            setMessage(`Invite code: ${res.code}`),
          )
        }
      />
      <Button label="Sign out" tone="danger" onPress={() => void signOut()} />
    </Screen>
  );
}
