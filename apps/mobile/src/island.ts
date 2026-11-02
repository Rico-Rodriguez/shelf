import { Platform } from "react-native";
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
let announced = false;
let pendingSit: IslandSit | null = null;

function eligible(tx: IslandTx) {
  return Boolean(tx.pending) && tx.hidden !== true && tx.isTransfer !== true && tx.amountCents > 0;
}

function accountLine(tx: IslandTx) {
  const name = tx.account?.name || tx.accountName || "";
  const mask = tx.account?.mask ? `··${tx.account.mask}` : "";
  return [name, mask].filter(Boolean).join(" ") || "Pending";
}

function announce(id: string, props: Props) {
  if (announced) return;
  announced = true;
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

export function markIslandSat() {
  announced = true;
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
    const changed = current?.id !== next.id;
    current = { id: next.id, props };
    if (changed) announce(next.id, props);
  } catch {
    // ActivityKit can decline a start. The charge still lands in Latest Activity.
  }
}
