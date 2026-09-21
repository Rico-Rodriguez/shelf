export type SpendPart = { categoryId: string | null; amountCents: number };

type TxLike = {
  id: string;
  categoryId: string | null;
  amountCents: number;
  hidden: boolean;
  pending: boolean;
  isTransfer: boolean;
};

type SplitLike = { transactionId: string; categoryId: string | null; amountCents: number };

export function transactionParts(tx: TxLike, splits: SplitLike[]): SpendPart[] {
  if (tx.hidden || tx.pending || tx.isTransfer) return [];
  const mine = splits.filter((split) => split.transactionId === tx.id && split.amountCents !== 0);
  if (mine.length) {
    return mine.map((split) => ({ categoryId: split.categoryId, amountCents: split.amountCents }));
  }
  return [{ categoryId: tx.categoryId, amountCents: tx.amountCents }];
}
