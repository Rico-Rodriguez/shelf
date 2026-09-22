import { formatMoney } from "./money";

export function versusPhrase(deltaCents: number | null, noun = "Spending"): string | null {
  if (deltaCents == null) return null;
  const abs = formatMoney(Math.abs(deltaCents));
  if (Math.abs(deltaCents) < 100) return `${noun} is in line with your usual month.`;
  if (deltaCents > 0) return `${noun} is ${abs} above your usual month.`;
  return `${noun} is ${abs} under your usual month.`;
}

export function versusShort(spentCents: number, usualCents: number | null): string | null {
  if (usualCents == null) return null;
  const delta = spentCents - usualCents;
  if (Math.abs(delta) < 100) return "In line with usual";
  if (delta > 0) return `${formatMoney(delta)} above usual`;
  return `${formatMoney(-delta)} under usual`;
}

export function payoffMonths(balanceCents: number, aprPercent: number, paymentCents: number): number | null {
  const balance = Math.abs(balanceCents);
  if (balance <= 0 || paymentCents <= 0) return null;
  const rate = aprPercent / 100 / 12;
  if (rate <= 0) return Math.ceil(balance / paymentCents);
  if (paymentCents <= balance * rate) return null;
  const months = -Math.log(1 - (rate * balance) / paymentCents) / Math.log(1 + rate);
  if (!Number.isFinite(months) || months <= 0) return null;
  return Math.ceil(months);
}
