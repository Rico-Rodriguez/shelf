export type LiabilitySummary = {
  kind: string;
  apr: number | null;
  minimumCents: number | null;
  due: string | null;
};

export function summarizeLiability(raw: string | null | undefined): LiabilitySummary | null {
  if (!raw) return null;
  let data: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    data = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const aprs = Array.isArray(data.aprs) ? data.aprs : [];
  const firstApr = aprs.find((row) => row && typeof row === "object") as { apr_percentage?: number } | undefined;
  const rate = data.interest_rate as { percentage?: number } | undefined;
  const apr = typeof firstApr?.apr_percentage === "number" ? firstApr.apr_percentage : typeof rate?.percentage === "number" ? rate.percentage : null;
  const minimum =
    typeof data.minimum_payment_amount === "number"
      ? data.minimum_payment_amount
      : typeof data.next_monthly_payment === "number"
        ? data.next_monthly_payment
        : null;
  const due = typeof data.next_payment_due_date === "string" ? data.next_payment_due_date : null;
  return {
    kind: typeof data.kind === "string" ? data.kind : "loan",
    apr,
    minimumCents: minimum == null ? null : Math.round(minimum * 100),
    due,
  };
}
