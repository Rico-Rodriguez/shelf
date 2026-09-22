export type Pace = { label: string; tone: "on" | "behind" | "ahead" | "muted" };

export function goalPace(goal: {
  targetCents: number;
  targetDate: string | null;
  progressCents: number;
  remainingCents: number;
}): Pace {
  if (goal.remainingCents <= 0 && goal.targetCents > 0) return { label: "Complete", tone: "ahead" };
  if (!goal.targetDate || goal.targetCents <= 0) {
    return { label: goal.remainingCents > 0 ? "Open" : "Set a date", tone: "muted" };
  }
  const end = new Date(`${goal.targetDate}T12:00:00`).getTime();
  const daysLeft = Math.ceil((end - Date.now()) / 86_400_000);
  if (daysLeft < 0) return { label: "Past the date", tone: "behind" };
  const ratio = goal.progressCents / goal.targetCents;
  if (ratio >= 0.9 || daysLeft > 120) return { label: daysLeft <= 45 ? `${daysLeft} days left` : "On track", tone: "on" };
  if (ratio < 0.35 && daysLeft < 60) return { label: "Behind pace", tone: "behind" };
  return { label: `${daysLeft} days left`, tone: "on" };
}
