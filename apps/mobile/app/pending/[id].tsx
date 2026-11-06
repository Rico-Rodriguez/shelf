import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { islandSitPlan, markIslandSat } from "../../src/island";
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
    markIslandSat(id || undefined);
    if (id) stageFlight(islandSitPlan({ id, merchant, amount }, colors.tertiary), reduceMotion);
    router.replace("/(app)");
  }, [amount, id, merchant, reduceMotion]);

  return null;
}
