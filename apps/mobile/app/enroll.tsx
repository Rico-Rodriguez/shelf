import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Text } from "react-native";
import { api } from "../src/api";
import { useSession } from "../src/session";
import { Button, colors, Field, Loading, Note, Screen } from "../src/ui";

export default function EnrollScreen() {
  const { refresh } = useSession();
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

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
      const res = await api<{ recoveryCodes?: string[] }>("/api/auth/totp/setup", { method: "POST", body: JSON.stringify({ code }) });
      await refresh();
      if (res.recoveryCodes?.length) {
        setRecoveryCodes(res.recoveryCodes);
        return;
      }
      router.replace("/(app)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code does not match");
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCodes) {
    return (
      <Screen title="Recovery codes" subtitle="Each code works once, anywhere a 6-digit code works. They will not be shown again.">
        {recoveryCodes.map((item) => (
          <Text key={item} selectable style={{ fontSize: 18, letterSpacing: 1, color: colors.ink }}>
            {item}
          </Text>
        ))}
        <Button label="I've saved these codes" onPress={() => router.replace("/(app)")} />
      </Screen>
    );
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
