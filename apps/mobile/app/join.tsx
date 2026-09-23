import { router } from "expo-router";
import { useState } from "react";
import { api } from "../src/api";
import { useSession } from "../src/session";
import { Button, Field, Note, Screen } from "../src/ui";

export default function JoinScreen() {
  const { refresh } = useSession();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
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
      await api("/api/auth/invite", {
        method: "POST",
        body: JSON.stringify({ code, password, name }),
      });
      await refresh();
      router.replace("/enroll");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Join" subtitle="Use an invite code and a new Shelf key of at least 12 characters.">
      <Field label="Invite code" value={code} onChangeText={setCode} />
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Shelf key" value={password} onChangeText={setPassword} shelfKey />
      {error ? <Note>{error}</Note> : null}
      <Button label="Join household" onPress={() => void submit()} busy={busy} />
    </Screen>
  );
}
