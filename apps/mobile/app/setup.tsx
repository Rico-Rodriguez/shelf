import { router } from "expo-router";
import { useState } from "react";
import { api } from "../src/api";
import { signInWithGoogle } from "../src/google";
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

  async function google() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Create a lock" subtitle="At least 12 characters. This wraps the key to your data.">
      {state?.needsGoogle ? <Button label="Sign in with Google" onPress={() => void google()} busy={busy} /> : null}
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Note>{error}</Note> : null}
      <Button label="Create Shelf" onPress={() => void submit()} busy={busy} />
    </Screen>
  );
}
