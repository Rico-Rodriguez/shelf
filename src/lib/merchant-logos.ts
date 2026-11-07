import { eq } from "drizzle-orm";
import type { PlaidApi, Transaction } from "plaid";
import { getDb } from "@/db";
import { merchantLogos } from "@/db/schema";
import { merchantKey } from "./plan";
import { openText, sealText } from "./secrets";

/**
 * Plaid sends a merchant logo with most card transactions. Shelf keeps one sealed map of
 * merchant key -> logo URL so every screen can show a real logo without each API route
 * carrying it. The map is sealed like the rest of the vault, because it names merchants.
 */
type LogoStore = {
  logos: Record<string, string>;
  /** Plaid items whose older transactions were already read once for logos. */
  backfilled: string[];
  /** How far the history pass got for items it has not finished. */
  progress: Record<string, number>;
};

const ROW_ID = "default";
const BACKFILL_DAYS = 730;
const BACKFILL_PAGE = 500;
const BACKFILL_MAX_PAGES = 20;

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The best logo Plaid gave for a transaction: its own logo, then the merchant counterparty's. */
export function plaidLogo(tx: Pick<Transaction, "logo_url" | "counterparties">): string | null {
  const own = safeUrl(tx.logo_url);
  if (own) return own;
  const parties = tx.counterparties ?? [];
  const merchant = parties.find((party) => party.type === "merchant" && safeUrl(party.logo_url));
  const any = merchant ?? parties.find((party) => safeUrl(party.logo_url));
  return any ? safeUrl(any.logo_url) : null;
}

/** Adds every name a transaction can show under (merchant name and raw name) to `into`. */
export function collectLogo(into: Map<string, string>, tx: Transaction) {
  const url = plaidLogo(tx);
  if (!url) return;
  for (const name of [tx.merchant_name, tx.name, tx.counterparties?.find((p) => p.type === "merchant")?.name]) {
    const key = name ? merchantKey(name) : "";
    if (key) into.set(key, url);
  }
}

export async function readLogoStore(dek: Buffer): Promise<LogoStore> {
  const db = await getDb();
  const [row] = await db.select().from(merchantLogos).where(eq(merchantLogos.id, ROW_ID));
  const raw = row ? openText(row.secretEnc, dek) : null;
  if (!raw) return { logos: {}, backfilled: [], progress: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<LogoStore>;
    return {
      logos: parsed.logos && typeof parsed.logos === "object" ? parsed.logos : {},
      backfilled: Array.isArray(parsed.backfilled) ? parsed.backfilled : [],
      progress: parsed.progress && typeof parsed.progress === "object" ? parsed.progress : {},
    };
  } catch {
    return { logos: {}, backfilled: [], progress: {} };
  }
}

async function writeLogoStore(store: LogoStore, dek: Buffer) {
  const db = await getDb();
  const secretEnc = sealText(JSON.stringify(store), dek)!;
  await db
    .insert(merchantLogos)
    .values({ id: ROW_ID, secretEnc, updatedAt: new Date() })
    .onConflictDoUpdate({ target: merchantLogos.id, set: { secretEnc, updatedAt: new Date() } });
}

/**
 * Merges logos found during a sync. `backfilled` marks an item's history pass as finished;
 * `progress` records how far an unfinished pass got.
 */
export async function saveLogos(
  found: Map<string, string>,
  dek: Buffer,
  mark?: { backfilled?: string; progress?: [string, number] },
) {
  const store = await readLogoStore(dek);
  let changed = false;
  for (const [key, url] of found) {
    if (store.logos[key] !== url) {
      store.logos[key] = url;
      changed = true;
    }
  }
  const done = mark?.backfilled;
  if (done && !store.backfilled.includes(done)) {
    store.backfilled.push(done);
    delete store.progress[done];
    changed = true;
  }
  if (mark?.progress) {
    const [item, offset] = mark.progress;
    if (store.progress[item] !== offset) {
      store.progress[item] = offset;
      changed = true;
    }
  }
  if (changed) await writeLogoStore(store, dek);
}

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * Transactions synced before logos were kept never come back through /transactions/sync,
 * so read the item's history once with /transactions/get and keep only the logos.
 */
export async function backfillLogos(
  client: PlaidApi,
  access: string,
  into: Map<string, string>,
  opts: { offset?: number; deadline?: number } = {},
): Promise<{ done: boolean; offset: number }> {
  const start = isoDaysAgo(BACKFILL_DAYS);
  const end = isoDaysAgo(0);
  let offset = opts.offset ?? 0;
  for (let page = 0; page < BACKFILL_MAX_PAGES; page += 1) {
    if (opts.deadline && Date.now() > opts.deadline) return { done: false, offset };
    const res = await client.transactionsGet({
      access_token: access,
      start_date: start,
      end_date: end,
      options: { count: BACKFILL_PAGE, offset },
    });
    for (const tx of res.data.transactions) collectLogo(into, tx);
    offset += res.data.transactions.length;
    if (!res.data.transactions.length || offset >= res.data.total_transactions) return { done: true, offset };
  }
  return { done: true, offset };
}

/**
 * The logo map the phone reads. Beyond Plaid's names, it also maps each transaction's current
 * display name, so a merchant renamed by a rule keeps its logo.
 */
export function logoLookup(
  stored: Record<string, string>,
  txs: Array<{ name: string; merchantName: string | null; originalDescription: string | null }>,
): Record<string, string> {
  const out: Record<string, string> = { ...stored };
  for (const tx of txs) {
    const shown = merchantKey(tx.name);
    if (!shown || out[shown]) continue;
    for (const source of [tx.merchantName, tx.originalDescription]) {
      const url = source ? stored[merchantKey(source)] : undefined;
      if (url) {
        out[shown] = url;
        break;
      }
    }
  }
  return out;
}
