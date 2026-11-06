import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Share, Text, View } from "react-native";
import { api, apiText } from "../src/api";
import { Icon } from "../src/icons";
import { Back, Button, Card, colors, Field, LoadError, MenuRow, Note, Screen, Section, Segment, Sheet, SmallSections, ToggleRow } from "../src/ui";
import { useSession } from "../src/session";
import { setMotionMode, useMotionMode, useTheme } from "../src/theme";

type Household = {
  role: string;
  members: { userId: string; name: string; role: string }[];
};

export default function SettingsScreen() {
  const { state, signOut, lock, refresh } = useSession();
  const { mode, setMode } = useTheme();
  const motion = useMotionMode();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [home, setHome] = useState<Household | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sampleBusy, setSampleBusy] = useState<"load" | "clear" | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [demoOn, setDemoOn] = useState<boolean | null>(null);
  const demo = demoOn ?? Boolean(state?.demoLoaded);

  function loadSample() {
    setSampleBusy("load");
    setSampleError(null);
    setMessage(null);
    void api<{ already?: boolean }>("/api/demo/seed", { method: "POST" })
      .then((res) => {
        setDemoOn(true);
        setMessage(res.already ? "Sample data is already loaded." : "Sample data loaded. It is on Home.");
        return refresh();
      })
      .catch((err: unknown) => setSampleError(err instanceof Error ? err.message : "Could not load sample data"))
      .finally(() => setSampleBusy(null));
  }

  function clearSample() {
    setSampleBusy("clear");
    setSampleError(null);
    setMessage(null);
    void api("/api/demo/clear", { method: "POST" })
      .then(() => {
        setDemoOn(false);
        setMessage("Sample data removed.");
        return refresh();
      })
      .catch((err: unknown) => setSampleError(err instanceof Error ? err.message : "Could not remove sample data"))
      .finally(() => setSampleBusy(null));
  }

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
      <SmallSections value="small">
      {message ? <Note>{message}</Note> : null}
      {sampleError ? <LoadError message={sampleError} onRetry={demo ? clearSample : loadSample} /> : null}

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
        <ToggleRow
          divided
          label="Expressive motion"
          detail="Numbers roll, charts draw in and sheets spring. Turn off for simple fades."
          on={motion === "expressive"}
          onPress={() => setMotionMode(motion === "expressive" ? "calm" : "expressive")}
        />
      </Card>

      <Section title="Household" />
      <Card>
        {(home?.members ?? []).map((member, index) => {
          const removable = home?.role === "owner" && member.role !== "owner";
          return (
            <MenuRow
              key={member.userId}
              divided={index > 0}
              title={member.name}
              subtitle={member.name.toLowerCase() === member.role.toLowerCase() ? undefined : member.role.charAt(0).toUpperCase() + member.role.slice(1)}
              plain
              trailing={removable ? <Text style={{ fontSize: 15, fontWeight: "500", color: colors.danger }}>Remove</Text> : undefined}
              onPress={
                removable
                  ? () => void api("/api/household", { method: "DELETE", body: JSON.stringify({ userId: member.userId }) }).then(() => api<Household>("/api/household").then(setHome))
                  : () => undefined
              }
            />
          );
        })}
        {home?.role === "owner" ? (
          <MenuRow
            divided={(home.members ?? []).length > 0}
            icon="plus"
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

      <Section title="Data" />
      <Card>
        <MenuRow title="Rules" subtitle="File new purchases automatically" icon="list" onPress={() => router.push("/rules")} />
        <MenuRow title="Import a CSV" subtitle="Add rows from a bank export" icon="add" divided onPress={() => {
          setMessage(null);
          setImporting(true);
        }} />
        <MenuRow title="Export as JSON" icon="flow" divided onPress={() => void shareExport("json")} />
        <MenuRow title="Export as CSV" icon="flow" divided onPress={() => void shareExport("csv")} />
        {demo ? (
          <MenuRow
            title={sampleBusy === "clear" ? "Removing sample data" : "Remove sample data"}
            danger
            divided
            onPress={clearSample}
          />
        ) : (
          <MenuRow
            title={sampleBusy === "load" ? "Loading sample data" : "Load sample data"}
            icon="spark"
            divided
            onPress={loadSample}
          />
        )}
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
        <MenuRow title="Lock Shelf" plain onPress={() => void lock().then(() => router.replace("/"))} />
        <MenuRow title="Sign out" danger divided onPress={() => void signOut().then(() => router.replace("/"))} />
      </Card>
      </SmallSections>
      {importing ? (
        <Sheet title="Import a CSV" onClose={() => setImporting(false)}>
          <Card>
            {accounts.map((account, index) => (
              <MenuRow
                key={account.id}
                divided={index > 0}
                title={account.name}
                plain
                trailing={accountId === account.id ? <Icon name="check" size={18} color={colors.accentInk} /> : undefined}
                onPress={() => setAccountId(account.id)}
              />
            ))}
            <View style={{ padding: 16, gap: 12 }}>
              <Field label="CSV to import" value={csv} onChangeText={setCsv} multiline />
              <Note>{`Positive amounts are money out. Importing into ${importName}.`}</Note>
              {message ? <Note>{message}</Note> : null}
              <Button
                label="Import CSV"
                block
                onPress={() =>
                  void api<{ created: number }>("/api/import", { method: "POST", body: JSON.stringify({ accountId, csv }) }).then((res) => {
                    setMessage(`Imported ${res.created} rows.`);
                    setCsv("");
                    setImporting(false);
                  }).catch((err: unknown) => setMessage(err instanceof Error ? err.message : "Could not import that file."))
                }
              />
            </View>
          </Card>
        </Sheet>
      ) : null}
    </Screen>
  );
}
