import { Redirect, router } from "expo-router";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { api } from "../src/api";
import { googleRedirectHint, signInWithGoogle } from "../src/google";
import { useSession } from "../src/session";
import { Button, colors, Field, Note, Screen } from "../src/ui";

export default function LoginScreen() {
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
      const session = await refresh();
      router.replace(next === "setup" || session?.needsSetup ? "/setup" : "/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  if (!state || state.needsGoogle) {
    return (
      <Screen title="Sign in" subtitle="Use your Google account. A new Shelf asks you to create a key. An existing Shelf asks for the key already saved.">
        {error ? <Note>{error}</Note> : null}
        {state ? <Button label="Sign in with Google" onPress={() => void google()} busy={busy} /> : null}
        {googleRedirectHint() ? (
          <Note>{`In Google Cloud, add this Authorized redirect URI, then try again: ${googleRedirectHint()}`}</Note>
        ) : null}
      </Screen>
    );
  }

  if (state.needsSetup) return <Redirect href="/setup" />;

  return (
    <Screen title="Unlock" subtitle={state.googleEmail ? `${state.googleEmail}. Enter the Shelf key already saved. It is not your Google password.` : "Enter the Shelf key already saved."}>
      <Field label="Shelf key" value={password} onChangeText={setPassword} shelfKey />
      {error ? <Note>{error}</Note> : null}
      <Button label="Unlock" onPress={() => void submit()} busy={busy} />
      <Pressable onPress={() => router.push("/join")} hitSlop={8}>
        <Text style={{ color: colors.accentInk, fontSize: 15, fontWeight: "600" }}>Join with an invite</Text>
      </Pressable>
    </Screen>
  );
}
