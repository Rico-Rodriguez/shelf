import { Platform } from "react-native";
import type { FlightPlan, FlightRect } from "./flight";
import { money } from "./format";
import PendingCharge from "./widgets/pending-activity";

export type IslandTx = {
  id: string;
  name: string;
  merchantName?: string | null;
  amountCents: number;
  pending?: boolean;
  hidden?: boolean;
  isTransfer?: boolean;
  accountName?: string | null;
  account?: { name?: string | null; mask?: string | null } | null;
};

export type IslandSit = { id: string; merchant: string; amount: string };

type Props = { merchant: string; amount: string; account: string };

const listeners = new Set<(arrival: IslandSit) => void>();
let current: { id: string; props: Props } | null = null;
/** The charge whose sit-down has already been played or claimed, so each charge sits once. */
let announcedId: string | null = null;
let pendingSit: IslandSit | null = null;

/** Where the Dynamic Island sits on screen, for flights that start there. */
export const ISLAND_RECT: FlightRect = { x: 80, y: 6, width: 210, height: 32 };

/** The flight that carries an Island charge down into Latest Activity on Today. */
export function islandSitPlan(arrival: IslandSit, color: string): FlightPlan {
  return {
    id: "island-sit",
    hide: [`today.tx.${arrival.id}`, `today.tx.${arrival.id}.amount`],
    pieces: [
      {
        key: "merchant",
        text: arrival.merchant,
        meta: "Posts later",
        color,
        fontSize: 15,
        fontWeight: "600",
        from: ISLAND_RECT,
        toAnchor: `today.tx.${arrival.id}`,
        toFontSize: 16,
      },
      {
        key: "amount",
        text: arrival.amount,
        color,
        fontSize: 15,
        fontWeight: "700",
        from: { x: ISLAND_RECT.x + 120, y: ISLAND_RECT.y, width: 88, height: 28 },
        toAnchor: `today.tx.${arrival.id}.amount`,
        toFontSize: 16,
      },
    ],
  };
}

function eligible(tx: IslandTx) {
  return Boolean(tx.pending) && tx.hidden !== true && tx.isTransfer !== true && tx.amountCents > 0;
}

function accountLine(tx: IslandTx) {
  const name = tx.account?.name || tx.accountName || "";
  const mask = tx.account?.mask ? `··${tx.account.mask}` : "";
  return [name, mask].filter(Boolean).join(" ") || "Pending";
}

function announce(id: string, props: Props) {
  if (announcedId === id) return;
  announcedId = id;
  pendingSit = { id, merchant: props.merchant, amount: props.amount };
  for (const listener of listeners) listener(pendingSit);
}

export function onIslandSit(listener: (arrival: IslandSit) => void) {
  listeners.add(listener);
  if (pendingSit) listener(pendingSit);
  return () => {
    listeners.delete(listener);
  };
}

/** The sit-down for this charge (or the one waiting) was played, so do not play it again. */
export function markIslandSat(id?: string) {
  announcedId = id ?? pendingSit?.id ?? announcedId;
  pendingSit = null;
}

export function islandChargeId() {
  return current?.id ?? null;
}

export function syncIsland(rows: IslandTx[]) {
  if (Platform.OS !== "ios") return;
  const next = rows.find(eligible) ?? null;
  try {
    const instances = PendingCharge.getInstances();
    if (!next) {
      for (const instance of instances) void instance.end("immediate");
      current = null;
      pendingSit = null;
      return;
    }
    const props: Props = {
      merchant: next.merchantName || next.name,
      amount: money(next.amountCents),
      account: accountLine(next),
    };
    const url = `shelf://pending/${encodeURIComponent(next.id)}?merchant=${encodeURIComponent(props.merchant)}&amount=${encodeURIComponent(props.amount)}`;
    if (instances.length === 0) PendingCharge.start(props, url);
    else {
      void instances[0].update(props);
      for (const extra of instances.slice(1)) void extra.end("immediate");
    }
    current = { id: next.id, props };
    announce(next.id, props);
  } catch {
    // ActivityKit can decline a start. The charge still lands in Latest Activity.
  }
}
