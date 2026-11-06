import { useSyncExternalStore } from "react";
import { cacheHydrationPromise, load, peek, subscribeCache } from "./api";

const PATH = "/api/merchants/logos";
type LogoResponse = { logos?: Record<string, string> };

/** Same key the server uses (src/lib/plan.ts merchantKey). */
export function merchantKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

let requested = false;
const EMPTY: Record<string, string> = {};

function current(): Record<string, string> {
  return peek<LogoResponse>(PATH)?.logos ?? EMPTY;
}

function subscribe(onChange: () => void) {
  if (!requested) {
    requested = true;
    // Show the saved map at once, then refresh it once per launch.
    void cacheHydrationPromise.then(() => load(PATH)).catch(() => {
      requested = false;
    });
  }
  return subscribeCache<LogoResponse>(PATH, onChange);
}

/** Reloads the logo map, after a sync brings in new merchants. */
export function refreshMerchantLogos() {
  void load(PATH).catch(() => undefined);
}

/** The merchant's real logo URL from Plaid, or null when it has none. */
export function useMerchantLogo(name: string | null | undefined): string | null {
  const logos = useSyncExternalStore(subscribe, current, current);
  if (!name) return null;
  const key = merchantKey(name);
  return logos[key] ?? logos[merchantKey(name.replace(/^the\s+/i, ""))] ?? null;
}
