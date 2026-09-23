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

  if (state?.needsGoogle) return <Redirect href="/login" />;

  return (
    <Screen
      title="Start Shelf"
      subtitle={
        state?.googleEmail
          ? "Google is done, and this Shelf has no key yet. Choose one with at least 12 characters."
          : "Choose a key of at least 12 characters. This is what locks your data."
      }
    >
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Note>{error}</Note> : null}
      <Button label="Create Shelf" onPress={() => void submit()} busy={busy} />
    </Screen>
  );
}
