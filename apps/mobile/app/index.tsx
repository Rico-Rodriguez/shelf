import { Redirect } from "expo-router";
import { Loading, Note, Screen } from "../src/ui";
import { useSession } from "../src/session";

export default function Gate() {
  const { ready, state, error } = useSession();
  if (!ready) return <Screen title="Shelf"><Loading label="Opening" /></Screen>;
  if (error) {
    return (
      <Screen title="Shelf" subtitle="The phone app talks to your Shelf server.">
        <Note>{error}</Note>
        <Note>Set EXPO_PUBLIC_API_URL to the server, and EXPO_PUBLIC_GATE_TOKEN when the server expects a gate.</Note>
      </Screen>
    );
  }
  if (!state) return <Screen title="Shelf"><Note>No session.</Note></Screen>;
  if (state.needsGoogle) return <Redirect href="/login" />;
  if (state.needsSetup) return <Redirect href="/setup" />;
  if (state.needsEnroll) return <Redirect href="/enroll" />;
  if (state.needsTotp || !state.unlocked) return <Redirect href="/login" />;
  return <Redirect href="/(app)" />;
}
