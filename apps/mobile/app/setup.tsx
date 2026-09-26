import { Redirect, router } from "expo-router";
import { useState } from "react";
import { api } from "../src/api";
import { useSession } from "../src/session";
import { Button, Field, Note, Screen } from "../src/ui";

export default function SetupScreen() {
  const { state, refresh } = useSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (password.length < 12) {
      setError("Use at least 12 characters. A Shelf key is not a PIN.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/setup", { method: "POST", body: JSON.stringify({ password }) });
      await refresh();
      router.replace("/enroll");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the lock");
    } finally {
      setBusy(false);
    }
  }

  if (!state || state.needsGoogle) return <Redirect href="/login" />;

  return (
    <Screen
      title="Create Key"
      subtitle="Choose a key of at least 12 characters to secure your data."
    >
      <Field label="Shelf key" value={password} onChangeText={setPassword} shelfKey />
      {error ? <Note>{error}</Note> : null}
      <Button label="Create Shelf" onPress={() => void submit()} busy={busy} />
    </Screen>
  );
}
