import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import { api } from "./api";
import { merchantMatchKey } from "./format";

const INDEX_KEY = "shelf.rev.ob";
const CHUNK = 1500;
const MAX_ATTEMPTS = 6;

export type HeldReview = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  keepCategory: boolean;
  wasUnreviewed: boolean;
  name?: string;
  hidden?: boolean;
};

type Settle = { resolve: () => void; reject: (err: unknown) => void };

type ReviewJob = {
  id: string;
  kind: "review";
  txId: string;
  categoryId: string | null;
  makeRule: boolean;
  merchant: string;
  matchMerchant: string;
  rename?: string;
  body?: Record<string, unknown>;
  affected: HeldReview[];
  previous: { id: string; categoryId: string | null; reviewed?: boolean }[];
  revert?: Record<string, unknown>;
  patchDone: boolean;
  ruleId: string | null;
  attempts: number;
  cancelled: boolean;
  settle?: Settle;
};

type BulkJob = {
  id: string;
  kind: "bulk";
  ids: string[];
  categoryId: string | null;
  keepCategory: boolean;
  affected: HeldReview[];
  snapshots: { id: string; categoryId: string | null; reviewed: boolean; hidden?: boolean }[];
  sent: boolean;
  attempts: number;
  cancelled: boolean;
  settle?: Settle;
};

type Job = ReviewJob | BulkJob;
type Reason = "change" | "hydrated" | "settled" | "stalled";

let jobs: Job[] = [];
let stalled = false;
let ready = false;
let flushing = false;
let inflightId: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let persistChain: Promise<void> = Promise.resolve();
let starting: Promise<void> | null = null;
const listeners = new Set<(reason: Reason) => void>();

function emit(reason: Reason) {
  for (const listener of listeners) listener(reason);
}

export function subscribeOutbox(listener: (reason: Reason) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function outboxStalled(): boolean {
  return stalled && jobs.some((job) => !job.cancelled);
}

export function heldReviews(): HeldReview[] {
  const byId = new Map<string, HeldReview>();
  for (const job of jobs) {
    if (job.cancelled) continue;
    for (const row of job.affected) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export function heldUnreviewedCount(): number {
  return heldReviews().filter((row) => row.wasUnreviewed).length;
}

export function applyHeld<T extends { id: string; reviewed: boolean; categoryId: string | null; category: { name: string; color?: string | null } | null }>(rows: T[]): T[] {
  const held = new Map(heldReviews().map((row) => [row.id, row]));
  if (!held.size) return rows;
  return rows.map((row) => {
    const extra = held.get(row.id);
    if (!extra) return row;
    const base = extra.keepCategory
      ? { ...row, reviewed: true }
      : {
          ...row,
          reviewed: true,
          categoryId: extra.categoryId,
          category: extra.categoryName
            ? { name: extra.categoryName, color: extra.categoryColor }
            : row.categoryId === extra.categoryId
              ? row.category
              : row.category,
        };
    return {
      ...base,
      ...(extra.name ? { name: extra.name } : {}),
      ...(extra.hidden ? { hidden: true } : {}),
    };
  });
}

function schedule(delay: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, delay);
}

function persist() {
  const snapshot = JSON.stringify({ jobs, stalled });
  persistChain = persistChain.then(() => writeChunks(snapshot)).catch(() => undefined);
}

async function writeChunks(snapshot: string) {
  const parts: string[] = [];
  for (let i = 0; i < snapshot.length; i += CHUNK) parts.push(snapshot.slice(i, i + CHUNK));
  const previous = Number(await SecureStore.getItemAsync(INDEX_KEY).catch(() => "0")) || 0;
  await SecureStore.setItemAsync(INDEX_KEY, String(parts.length));
  for (let i = 0; i < parts.length; i += 1) {
    await SecureStore.setItemAsync(`${INDEX_KEY}.${i}`, parts[i]);
  }
  for (let i = parts.length; i < previous; i += 1) {
    await SecureStore.deleteItemAsync(`${INDEX_KEY}.${i}`).catch(() => undefined);
  }
}

async function readChunks(): Promise<{ jobs: Job[]; stalled: boolean } | null> {
  const count = Number(await SecureStore.getItemAsync(INDEX_KEY).catch(() => null));
  if (!Number.isFinite(count) || count <= 0) return null;
  let raw = "";
  for (let i = 0; i < count; i += 1) {
    const part = await SecureStore.getItemAsync(`${INDEX_KEY}.${i}`).catch(() => null);
    if (part == null) return null;
    raw += part;
  }
  const parsed = JSON.parse(raw) as { jobs?: Job[]; stalled?: boolean };
  return { jobs: parsed.jobs ?? [], stalled: Boolean(parsed.stalled) };
}

export function startReviewOutbox(): Promise<void> {
  if (!starting) {
    starting = (async () => {
      const hadMemory = jobs.length > 0;
      try {
        const disk = await readChunks();
        if (disk) {
          const seen = new Set(jobs.map((job) => job.id));
          for (const job of disk.jobs) {
            if (!seen.has(job.id)) jobs.push(job);
          }
          stalled = hadMemory ? false : Boolean(disk.stalled) && jobs.some((job) => !job.cancelled);
        }
      } catch {
        // A damaged outbox must not block new reviews.
      }
      ready = true;
      persist();
      emit("hydrated");
      if (!stalled) void flush();
    })();
    AppState.addEventListener("change", (state) => {
      if (state === "active" && ready && !stalled) void flush();
    });
  }
  return starting;
}

function queue(job: Job) {
  jobs.push(job);
  stalled = false;
  if (ready) persist();
  else void startReviewOutbox();
  emit("change");
  if (ready) schedule(jobs.length > 1 ? 250 : 0);
}

export function enqueueReview(input: {
  txId: string;
  categoryId: string | null;
  makeRule: boolean;
  merchant: string;
  rename?: string;
  body?: Record<string, unknown>;
  affected: HeldReview[];
  previous: { id: string; categoryId: string | null; reviewed?: boolean }[];
  revert?: Record<string, unknown>;
}): ReviewJob {
  const job: ReviewJob = {
    id: `review-${input.txId}-${Date.now()}`,
    kind: "review",
    txId: input.txId,
    categoryId: input.categoryId,
    makeRule: input.makeRule,
    merchant: input.merchant,
    matchMerchant: merchantMatchKey(input.merchant),
    rename: input.rename,
    body: input.body,
    affected: input.affected,
    previous: input.previous,
    revert: input.revert,
    patchDone: false,
    ruleId: null,
    attempts: 0,
    cancelled: false,
  };
  queue(job);
  return job;
}

export function enqueueBulk(input: {
  ids: string[];
  categoryId: string | null;
  keepCategory: boolean;
  affected: HeldReview[];
  snapshots: BulkJob["snapshots"];
}): BulkJob {
  const job: BulkJob = {
    id: `bulk-${Date.now()}`,
    kind: "bulk",
    ids: input.ids,
    categoryId: input.categoryId,
    keepCategory: input.keepCategory,
    affected: input.affected,
    snapshots: input.snapshots,
    sent: false,
    attempts: 0,
    cancelled: false,
  };
  queue(job);
  return job;
}

export function cancelJob(job: Job): Promise<void> {
  job.cancelled = true;
  if (inflightId === job.id) {
    return new Promise((resolve, reject) => {
      job.settle = { resolve, reject };
    });
  }
  jobs = jobs.filter((item) => item !== job);
  persist();
  emit("change");
  if (!landed(job)) return Promise.resolve();
  return compensate(job);
}

async function finishCancelled(job: Job) {
  try {
    if (landed(job)) await compensate(job);
    job.settle?.resolve();
  } catch (err) {
    job.settle?.reject(err);
  } finally {
    jobs = jobs.filter((item) => item !== job);
    persist();
  }
}

function landed(job: Job): boolean {
  if (job.kind === "bulk") return job.sent;
  return job.patchDone || Boolean(job.ruleId);
}

export function retryAllReviews() {
  stalled = false;
  for (const job of jobs) job.attempts = 0;
  persist();
  emit("change");
  schedule(0);
}

async function flush() {
  if (flushing || stalled || !ready) return;
  flushing = true;
  try {
    while (jobs.length && !stalled) {
      const job = jobs[0];
      if (job.cancelled) {
        await finishCancelled(job);
        continue;
      }
      inflightId = job.id;
      try {
        await send(job);
        inflightId = null;
        if (job.cancelled) {
          await finishCancelled(job);
          continue;
        }
        jobs = jobs.filter((item) => item !== job);
        persist();
        emit("settled");
      } catch {
        inflightId = null;
        if (job.cancelled) {
          await finishCancelled(job).catch(() => undefined);
          continue;
        }
        job.attempts += 1;
        persist();
        if (job.attempts >= MAX_ATTEMPTS) {
          stalled = true;
          persist();
          emit("stalled");
          break;
        }
        schedule(Math.min(30_000, 1000 * 2 ** (job.attempts - 1)));
        break;
      }
    }
    if (!jobs.length && stalled) {
      stalled = false;
      persist();
      emit("change");
    }
  } finally {
    flushing = false;
    persist();
  }
}

async function send(job: Job) {
  if (job.kind === "bulk") {
    if (job.keepCategory || !job.categoryId) {
      await api("/api/transactions/review-all", { method: "POST", body: JSON.stringify({ ids: job.ids }) });
    } else {
      await Promise.all(
        job.ids.map((id) =>
          api(`/api/transactions/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ categoryId: job.categoryId, reviewed: true }),
          }),
        ),
      );
    }
    job.sent = true;
    return;
  }
  if (!job.patchDone) {
    await api(`/api/transactions/${job.txId}`, {
      method: "PATCH",
      body: JSON.stringify(job.body ?? { categoryId: job.categoryId, reviewed: true }),
    });
    job.patchDone = true;
    persist();
  }
  if (job.makeRule && job.categoryId && !job.ruleId) {
    const created = await api<{ id: string }>("/api/rules", {
      method: "POST",
      body: JSON.stringify({
        name: job.merchant,
        matchMerchant: job.matchMerchant,
        actionCategoryId: job.categoryId,
        actionRename: job.rename,
        enabled: true,
        applyUnreviewed: true,
      }),
    });
    job.ruleId = created.id;
  }
}

async function compensate(job: Job) {
  if (job.kind === "bulk") {
    if (!job.sent) return;
    await Promise.all(
      job.snapshots.map((row) =>
        api(`/api/transactions/${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({ categoryId: row.categoryId, reviewed: row.reviewed, hidden: row.hidden }),
        }),
      ),
    );
    return;
  }
  if (job.patchDone || job.ruleId) {
    if (job.revert) {
      await api(`/api/transactions/${job.txId}`, { method: "PATCH", body: JSON.stringify(job.revert) });
    }
    const rows = job.previous.length ? job.previous : [{ id: job.txId, categoryId: null, reviewed: false }];
    for (const row of rows) {
      if (job.revert && row.id === job.txId) continue;
      await api(`/api/transactions/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ categoryId: row.categoryId, reviewed: row.reviewed ?? false }),
      });
    }
  }
  if (job.ruleId) await api(`/api/rules/${job.ruleId}`, { method: "DELETE" }).catch(() => undefined);
}
