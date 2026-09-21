export function dollarsToCents(value: number | string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatSignedMoney(cents: number, currency = "USD"): string {
  const abs = formatMoney(Math.abs(cents), currency);
  if (cents > 0) return `+${abs}`;
  if (cents < 0) return `-${abs}`;
  return abs;
}

/** Plaid: positive amount = money leaving the account. */
export function isOutflow(amountCents: number): boolean {
  return amountCents > 0;
}

export function displaySignedFromPlaid(amountCents: number): number {
  return -amountCents;
}

export function classifyAccount(type: string): "asset" | "liability" {
  if (type === "credit" || type === "loan") return "liability";
  return "asset";
}
