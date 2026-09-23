import { Link, router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { api } from "../src/api";
import { googleRedirectHint, signInWithGoogle } from "../src/google";
import { useSession } from "../src/session";
import { Button, Field, Note, Screen } from "../src/ui";

export default function LoginScreen() {
  const { state, refresh } = useSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ needTotp?: boolean; needEnroll?: boolean }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      await refresh();
      if (res.needTotp) router.replace("/totp");
      else if (res.needEnroll) router.replace("/enroll");
      else router.replace("/(app)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    try {
      const next = await signInWithGoogle();
      await refresh();
      router.replace(next === "setup" ? "/setup" : "/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  if (state?.needsGoogle) {
    return (
      <Screen title="Sign in" subtitle="Use your Google account. Shelf asks for the password after that.">
        {error ? <Note>{error}</Note> : null}
        <Button label="Sign in with Google" onPress={() => void google()} busy={busy} />
        {googleRedirectHint() ? (
          <Note>{`In Google Cloud, add this Authorized redirect URI, then try again: ${googleRedirectHint()}`}</Note>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen title="Unlock" subtitle={state?.googleEmail ?? "Enter the key for this Shelf."}>
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Note>{error}</Note> : null}
      <Button label="Unlock" onPress={() => void submit()} busy={busy} />
      <Link href="/join"><Text>Join with an invite</Text></Link>
    </Screen>
  );
}
