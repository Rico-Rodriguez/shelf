import { Text, VStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";

type PendingChargeProps = {
  merchant: string;
  amount: string;
  account: string;
};

function PendingCharge(props: PendingChargeProps, environment: LiveActivityEnvironment) {
  "widget";
  // The lock screen banner follows light and dark mode. The Dynamic Island is always black.
  const dim = environment.isLuminanceReduced;
  const dark = dim || environment.colorScheme === "dark";
  const ink = dark ? "#FFFFFF" : "#14181F";
  const quiet = dim ? "#FFFFFF" : dark ? "#A3ABB5" : "#6B7480";
  const islandInk = "#FFFFFF";
  const islandQuiet = dim ? "#FFFFFF" : "#A3ABB5";
  return {
    banner: (
      <VStack modifiers={[padding({ all: 14 })]}>
        <Text modifiers={[font({ weight: "semibold", size: 17 }), foregroundStyle(ink)]}>{props.merchant}</Text>
        <Text modifiers={[font({ weight: "bold", size: 28 }), foregroundStyle(quiet)]}>{props.amount}</Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(quiet)]}>{props.account}</Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(quiet)]}>Posts later</Text>
      </VStack>
    ),
    compactLeading: <Text modifiers={[font({ weight: "semibold", size: 12 }), foregroundStyle(islandInk)]}>{props.merchant}</Text>,
    compactTrailing: <Text modifiers={[font({ weight: "bold", size: 12 }), foregroundStyle(islandQuiet)]}>{props.amount}</Text>,
    minimal: <Text modifiers={[font({ weight: "bold", size: 12 }), foregroundStyle(islandInk)]}>{props.amount}</Text>,
    expandedLeading: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Text modifiers={[font({ weight: "semibold", size: 16 }), foregroundStyle(islandInk)]}>{props.merchant}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(islandQuiet)]}>{props.account}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Text modifiers={[font({ weight: "bold", size: 22 }), foregroundStyle(islandQuiet)]}>{props.amount}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(islandQuiet)]}>Posts later</Text>
      </VStack>
    ),
    expandedBottom: (
      <Text modifiers={[padding({ horizontal: 12, bottom: 8 }), font({ size: 13 }), foregroundStyle(islandQuiet)]}>Pending</Text>
    ),
  };
}

export default createLiveActivity("PendingCharge", PendingCharge);
