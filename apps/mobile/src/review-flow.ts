import type { Charge } from "./charge";
import { sameMerchant } from "./format";
import { dismissUndo, offerUndo } from "./toast";
import { cancelJob, enqueueReview, type HeldReview } from "./review-outbox";

export function matchesMerchantRule(tx: { name: string; merchantName: string | null }, merchant: string): boolean {
  const names = [tx.merchantName, tx.name].filter((name): name is string => Boolean(name));
  return names.some((name) => sameMerchant(name, merchant));
}

/** Current charge, plus every other visible charge from the same merchant when a rule is on. */
export function matchingReviewIds(rows: Charge[], tx: Charge, makeRule: boolean): string[] {
  if (!makeRule) return [tx.id];
  const merchant = tx.merchantName || tx.name;
  const ids = [tx.id];
  for (const row of rows) {
    if (row.id === tx.id || row.hidden) continue;
    if (matchesMerchantRule(row, merchant)) ids.push(row.id);
  }
  return ids;
}

type Face = { name: string; color?: string | null } | null;

export function applyReviewRows(
  rows: Charge[],
  ids: string[],
  categoryId: string | null,
  face: Face,
  drop: boolean,
): Charge[] {
  const chosen = new Set(ids);
  if (drop) return rows.filter((row) => !chosen.has(row.id));
  return rows.map((row) => {
    if (!chosen.has(row.id)) return row;
    const category = face
      ? { name: face.name, color: face.color ?? null }
      : row.categoryId === categoryId
        ? row.category
        : null;
    return { ...row, reviewed: true, categoryId, category };
  });
}

export function restoreReviewRows(rows: Charge[], snapshots: Charge[]): Charge[] {
  const snaps = new Map(snapshots.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const next = rows.map((row) => {
    const snap = snaps.get(row.id);
    if (!snap) return row;
    seen.add(row.id);
    return snap;
  });
  const missing = snapshots.filter((row) => !seen.has(row.id));
  return [...missing, ...next];
}

type ReviewRun = {
  tx: Charge;
  categoryId: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  goalId?: string | null;
  makeRule: boolean;
  ids: string[];
  previous: { id: string; categoryId: string | null; reviewed: boolean }[];
  label: string;
  apply: () => void;
  restore: () => void;
  onFailure: (retry: () => void) => void;
  onUndo: (undo: () => Promise<void>) => (() => Promise<void>) | void;
};

/** Paint the queue and keep that review locally until the outbox lands it. Undo is the only way back. */
export function performReview(input: ReviewRun) {
  const merchant = input.tx.merchantName || input.tx.name;
  const affected: HeldReview[] = input.previous.map((row) => ({
    id: row.id,
    categoryId: input.categoryId,
    categoryName: input.categoryName ?? null,
    categoryColor: input.categoryColor ?? null,
    keepCategory: false,
    wasUnreviewed: !row.reviewed,
  }));
  const goalId = input.goalId || null;
  const job = enqueueReview({
    txId: input.tx.id,
    categoryId: input.categoryId,
    makeRule: input.makeRule && Boolean(input.categoryId),
    merchant,
    affected,
    previous: input.previous,
    body: goalId ? { categoryId: input.categoryId, reviewed: true, goalId } : undefined,
    revert: goalId ? { categoryId: input.tx.categoryId, reviewed: input.tx.reviewed, goalId: input.tx.goalId } : undefined,
  });
  input.apply();

  const undo = async () => {
    input.restore();
    dismissUndo();
    try {
      await cancelJob(job);
    } catch {
      input.apply();
      input.onFailure(() => performReview(input));
    }
  };
  const handed = input.onUndo(undo) ?? undo;
  offerUndo(input.label, () => handed());
}

type UndoableRun = {
  label: string;
  apply: () => void;
  restore: () => void;
  request: () => Promise<void>;
  compensate: () => Promise<void>;
  onFailure: (retry: () => void) => void;
  onUndoFailure?: (retry: () => void) => void;
};

/** Apply, show the undo chip, then run the request. Undo and failure both put the same screen back. */
export function runUndoable(input: UndoableRun) {
  const gate = { cancelled: false, failed: false };
  input.apply();
  let settle!: Promise<void>;
  const undo = async () => {
    if (gate.cancelled || gate.failed) return;
    gate.cancelled = true;
    input.restore();
    dismissUndo();
    try {
      await settle;
    } catch {
      input.apply();
      (input.onUndoFailure ?? input.onFailure)(() => runUndoable(input));
    }
  };
  offerUndo(input.label, () => undo());
  settle = input
    .request()
    .then(async () => {
      if (gate.cancelled) await input.compensate();
    })
    .catch((err: unknown) => {
      if (gate.cancelled) {
        void input.compensate().catch(() => undefined);
        throw err;
      }
      gate.failed = true;
      dismissUndo();
      input.restore();
      input.onFailure(() => runUndoable(input));
      throw err;
    });
  void settle.catch(() => undefined);
}
