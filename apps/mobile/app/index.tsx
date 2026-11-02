import { Redirect } from "expo-router";
import { Button, Loading, Note, Screen } from "../src/ui";
import { useSession } from "../src/session";

export default function Gate() {
  const { ready, state, error, refresh } = useSession();
  if (!ready) return <Screen title="Shelf"><Loading label="Opening" /></Screen>;
  const open = Boolean(state && state.unlocked && !state.needsTotp && !state.needsEnroll && !state.needsSetup && !state.needsGoogle);
  if (open) return <Redirect href="/(app)" />;
  if (error && !state) {
    return (
      <Screen title="Shelf">
        <Note tone="danger">{error}</Note>
        <Button label="Retry" tone="quiet" onPress={() => void refresh()} />
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
