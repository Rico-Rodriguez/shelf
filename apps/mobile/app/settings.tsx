import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Share, View } from "react-native";
import { api, apiText } from "../src/api";
import { Back, Button, Card, Field, MenuRow, Note, Screen, Section, Segment } from "../src/ui";
import { useSession } from "../src/session";
import { useTheme } from "../src/theme";

type Household = {
  role: string;
  members: { userId: string; name: string; role: string }[];
};

export default function SettingsScreen() {
  const { state, signOut, refresh } = useSession();
  const { mode, setMode } = useTheme();
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

  const importName = accounts.find((account) => account.id === accountId)?.name ?? "Choose an account";

  return (
    <Screen title="Settings" refresh={<Back />}>
      {message ? <Note>{message}</Note> : null}

      <Section title="Appearance" />
      <Card>
        <View style={{ padding: 12 }}>
          <Segment
            value={mode}
            onChange={(next) => setMode(next as "system" | "light" | "dark")}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </View>
      </Card>

      <Section title="Household" />
      <Card>
        {(home?.members ?? []).map((member, index) => (
          <MenuRow
            key={member.userId}
            divided={index > 0}
            title={home && home.members.length > 1 ? `${member.name} · ${member.role}` : member.name}
            onPress={
              home?.role === "owner" && member.role !== "owner"
                ? () => void api("/api/household", { method: "DELETE", body: JSON.stringify({ userId: member.userId }) }).then(() => api<Household>("/api/household").then(setHome))
                : () => undefined
            }
          />
        ))}
        {home?.role === "owner" ? (
          <MenuRow
            divided={(home.members ?? []).length > 0}
            title="Invite someone"
            onPress={() =>
              void api<{ code: string }>("/api/household/invites", { method: "POST", body: JSON.stringify({ role: "member" }) }).then((res) =>
                setMessage(`Share this code once. ${res.code}`),
              )
            }
          />
        ) : null}
        {!home ? <Note>Household</Note> : null}
      </Card>

      {state?.demoLoaded ? null : (
        <>
          <Section title="Sample" />
          <Card>
            <MenuRow
              title="Load sample data"
              onPress={() =>
                void api<{ already?: boolean }>("/api/demo/seed", { method: "POST" })
                  .then((res) => {
                    setMessage(res.already ? "Sample data is already loaded." : "Sample data loaded. It is on Home.");
                    return refresh();
                  })
                  .catch((err: unknown) => setMessage(err instanceof Error ? err.message : "Could not load sample data"))
              }
            />
          </Card>
        </>
      )}
      <Section title="Rules" />
      <Card>
        <MenuRow title="Manage rules" icon="list" onPress={() => router.push("/rules")} />
      </Card>

      <Section title="Export" />
      <Card>
        <MenuRow title="JSON" onPress={() => void shareExport("json")} />
        <MenuRow title="CSV" divided onPress={() => void shareExport("csv")} />
      </Card>

      <Section title="Import" />
      <Card>
        {accounts.map((account, index) => (
          <MenuRow key={account.id} divided={index > 0} title={account.name} active={accountId === account.id} onPress={() => setAccountId(account.id)} />
        ))}
        <View style={{ padding: 16, gap: 12 }}>
          <Field label="CSV to import" value={csv} onChangeText={setCsv} multiline />
          <Note>{`Positive amounts are money out. Importing into ${importName}.`}</Note>
          <Button label="Import CSV" block onPress={() => void api<{ created: number }>("/api/import", { method: "POST", body: JSON.stringify({ accountId, csv }) }).then((res) => setMessage(`Imported ${res.created} rows.`))} />
        </View>
      </Card>

      <Section title="Shelf key" />
      <Card>
        <View style={{ padding: 16, gap: 12 }}>
        <Field label="Current Shelf key" value={current} onChangeText={setCurrent} shelfKey />
        <Field label="New Shelf key" value={next} onChangeText={setNext} shelfKey placeholder="12+ characters" />
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
        </View>
      </Card>

      <Card>
        <MenuRow title="Sign out" danger onPress={() => void signOut()} />
      </Card>
    </Screen>
  );
}
