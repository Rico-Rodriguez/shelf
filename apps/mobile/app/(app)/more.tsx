import { router } from "expo-router";
import { useSession } from "../../src/session";
import { Button, Card, MenuRow, Screen } from "../../src/ui";

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
    <Screen title="More" framed>
      <Card>
        {LINKS.map(([href, label, icon], index) => (
          <MenuRow key={href} title={label} icon={icon} divided={index > 0} onPress={() => router.push(href)} />
        ))}
      </Card>
      <Button label="Sign out" tone="quiet" onPress={() => void signOut()} />
    </Screen>
  );
}
