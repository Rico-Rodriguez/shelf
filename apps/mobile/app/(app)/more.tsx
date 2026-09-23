import { router } from "expo-router";
import { useSession } from "../../src/session";
import { Button, Row, Screen } from "../../src/ui";

const LINKS = [
  ["/insights", "Insights"],
  ["/bills", "Bills"],
  ["/goals", "Goals"],
  ["/cash-flow", "Cash flow"],
  ["/investments", "Investments"],
  ["/notifications", "Notifications"],
  ["/rules", "Rules"],
  ["/settings", "Settings"],
] as const;

export default function MoreScreen() {
  const { signOut } = useSession();
  return (
    <Screen title="More">
      {LINKS.map(([href, label]) => (
        <Row key={href} title={label} onPress={() => router.push(href)} />
      ))}
      <Button label="Sign out" tone="quiet" onPress={() => void signOut()} />
    </Screen>
  );
}
