import { router } from "expo-router";
import { useState } from "react";
import { api } from "../src/api";
import { useSession } from "../src/session";
import { Button, Field, Note, Screen } from "../src/ui";

export default function TotpScreen() {
  const { refresh } = useSession();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/totp", { method: "POST", body: JSON.stringify({ code }) });
      await refresh();
      router.replace("/(app)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code does not match");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Code" subtitle="Six-digit code, or a one-time recovery code.">
      <Field label="Code" value={code} onChangeText={setCode} keyboardType="default" />
      {error ? <Note>{error}</Note> : null}
      <Button label="Continue" onPress={() => void submit()} busy={busy} />
    </Screen>
  );
}
