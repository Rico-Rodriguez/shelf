import { api } from "./api";
import type { Charge } from "./charge";
import { merchantMatchKey } from "./format";
import { dismissUndo, offerUndo } from "./toast";

export function matchesMerchantRule(tx: { name: string; merchantName: string | null }, merchant: string): boolean {
  const key = merchantMatchKey(merchant).toLowerCase();
  if (!key) return false;
  return `${tx.merchantName ?? ""} ${tx.name}`.toLowerCase().includes(key);
}

/** Current charge, plus every other visible unreviewed charge the rule would clear. */
export function matchingReviewIds(rows: Charge[], tx: Charge, makeRule: boolean): string[] {
  if (!makeRule) return [tx.id];
  const merchant = tx.merchantName || tx.name;
  const ids = [tx.id];
  for (const row of rows) {
    if (row.id === tx.id || row.reviewed || row.hidden) continue;
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
  makeRule: boolean;
  ids: string[];
  previous: { id: string; categoryId: string | null }[];
  label: string;
  apply: () => void;
  restore: () => void;
  onFailure: (retry: () => void) => void;
  onUndo: (undo: () => Promise<void>) => (() => Promise<void>) | void;
};

/** Paint the queue, show the undo chip, then talk to the server. A failure puts the same cards back. */
export function performReview(input: ReviewRun) {
  const gate = { cancelled: false, ruleId: null as string | null, failed: false };
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
      input.onFailure(() => performReview(input));
    }
  };
  const handed = input.onUndo(undo) ?? undo;
  offerUndo(input.label, () => handed());

  settle = (async () => {
    await api(`/api/transactions/${input.tx.id}`, {
      method: "PATCH",
      body: JSON.stringify({ categoryId: input.categoryId, reviewed: true }),
    });
    if (input.makeRule && input.categoryId && !gate.cancelled) {
      const merchant = input.tx.merchantName || input.tx.name;
      const res = await api<{ id: string }>("/api/rules", {
        method: "POST",
        body: JSON.stringify({
          name: merchant,
          matchMerchant: merchantMatchKey(merchant),
          actionCategoryId: input.categoryId,
          enabled: true,
          applyUnreviewed: true,
        }),
      });
      gate.ruleId = res.id;
    }
    if (gate.cancelled) await revertReview(input, gate.ruleId);
  })().catch((err: unknown) => {
    if (gate.cancelled) {
      void revertReview(input, gate.ruleId).catch(() => undefined);
      throw err;
    }
    gate.failed = true;
    dismissUndo();
    input.restore();
    input.onFailure(() => performReview(input));
    throw err;
  });

  void settle.catch(() => undefined);
}

async function revertReview(input: ReviewRun, ruleId: string | null) {
  await api(`/api/transactions/${input.tx.id}`, {
    method: "PATCH",
    body: JSON.stringify({ categoryId: input.tx.categoryId, reviewed: false }),
  });
  const others = input.previous.filter((row) => row.id !== input.tx.id);
  if (others.length) {
    await api("/api/transactions/review-all", {
      method: "POST",
      body: JSON.stringify({ restore: others }),
    });
  }
  if (ruleId) await api(`/api/rules/${ruleId}`, { method: "DELETE" }).catch(() => undefined);
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
