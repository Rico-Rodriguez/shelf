import { router, usePathname } from "expo-router";
import { Text } from "react-native";
import { useSession } from "../../src/session";
import { Button, Card, colors, MenuRow, Screen, Section } from "../../src/ui";

const PRIMARY = [
  ["/insights", "Insights", "spark"],
  ["/bills", "Bills", "calendar"],
  ["/goals", "Goals", "flag"],
] as const;

const SECONDARY = [
  ["/cash-flow", "Cash flow", "flow"],
  ["/investments", "Investments", "chart"],
  ["/rules", "Rules", "list"],
  ["/notifications", "Notifications", "bell"],
  ["/settings", "Settings", "gear"],
] as const;

export default function MoreScreen() {
  const { signOut } = useSession();
  const path = usePathname();
  return (
    <Screen title="More" framed>
      <Card>
        {PRIMARY.map(([href, label, icon], index) => (
          <MenuRow key={href} title={label} icon={icon} divided={index > 0} active={path.startsWith(href)} onPress={() => router.push(href)} />
        ))}
      </Card>
      <Section title="Also" />
      <Card>
        {SECONDARY.map(([href, label, icon], index) => (
          <MenuRow key={href} title={label} icon={icon} divided={index > 0} active={path.startsWith(href)} onPress={() => router.push(href)} />
        ))}
      </Card>
      <Button label="Sign out" tone="quiet" onPress={() => void signOut()} />
      <Text style={{ textAlign: "center", color: colors.tertiary, fontSize: 12 }}>Shelf</Text>
    </Screen>
  );
}
