import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { markIslandSat } from "../../src/island";
import { stageFlight } from "../../src/flight";
import { useReduceMotion } from "../../src/theme";
import { colors } from "../../src/ui";

/** The Dynamic Island tap opens Shelf on this route, then the charge sits down on Today. */
export default function IslandLanding() {
  const reduceMotion = useReduceMotion();
  const params = useLocalSearchParams<{ id?: string; merchant?: string; amount?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const merchant = typeof params.merchant === "string" && params.merchant ? params.merchant : "Pending";
  const amount = typeof params.amount === "string" ? params.amount : "";

  useEffect(() => {
    markIslandSat();
    if (id) {
      const from = { x: 80, y: 6, width: 210, height: 32 };
      stageFlight(
        {
          id: "island-sit",
          hide: [`today.tx.${id}`, `today.tx.${id}.amount`],
          pieces: [
            {
              key: "merchant",
              text: merchant,
              meta: "Posts later",
              color: colors.tertiary,
              fontSize: 15,
              fontWeight: "600",
              from,
              toAnchor: `today.tx.${id}`,
              toFontSize: 16,
            },
            {
              key: "amount",
              text: amount,
              color: colors.tertiary,
              fontSize: 15,
              fontWeight: "700",
              from: { x: from.x + 120, y: from.y, width: 88, height: 28 },
              toAnchor: `today.tx.${id}.amount`,
              toFontSize: 16,
            },
          ],
        },
        reduceMotion,
      );
    }
    router.replace("/(app)");
  }, [amount, id, merchant, reduceMotion]);

  return null;
}
