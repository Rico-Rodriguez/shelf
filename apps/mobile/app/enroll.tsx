import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Image } from "react-native";
import { api } from "../src/api";
import { useSession } from "../src/session";
import { Button, Field, Loading, Note, Screen } from "../src/ui";

export default function EnrollScreen() {
  const { refresh } = useSession();
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ qr: string; secret: string }>("/api/auth/totp/setup")
      .then((res) => {
        setQr(res.qr);
        setSecret(res.secret);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not start two-factor"));
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/totp/setup", { method: "POST", body: JSON.stringify({ code }) });
      await refresh();
      router.replace("/(app)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code does not match");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Two-factor" subtitle="Add this key to an authenticator app, then enter the code.">
      {qr ? <Image source={{ uri: qr }} style={{ width: 220, height: 220, alignSelf: "center" }} /> : <Loading />}
      {secret ? <Note>{secret}</Note> : null}
      <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" />
      {error ? <Note>{error}</Note> : null}
      <Button label="Confirm" onPress={() => void submit()} busy={busy} />
    </Screen>
  );
}
