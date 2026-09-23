import { router } from "expo-router";
import { useSession } from "../../src/session";
import { Button, Row, Screen } from "../../src/ui";

const LINKS = [
  ["/insights", "Insights", "spark"],
  ["/bills", "Bills", "calendar"],
  ["/goals", "Goals", "flag"],
  ["/cash-flow", "Cash flow", "flow"],
  ["/investments", "Investments", "chart"],
  ["/notifications", "Notifications", "bell"],
  ["/rules", "Rules", "list"],
  ["/settings", "Settings", "gear"],
] as const;

export default function MoreScreen() {
  const { signOut } = useSession();
  return (
    <Screen title="More">
      {LINKS.map(([href, label, icon]) => (
        <Row key={href} title={label} icon={icon} onPress={() => router.push(href)} />
      ))}
      <Button label="Sign out" tone="quiet" onPress={() => void signOut()} />
    </Screen>
  );
}
