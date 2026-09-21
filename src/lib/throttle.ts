const WINDOW_MS = 15 * 60 * 1000;
const MAX_USER = 5;
const MAX_IP = 20;

const ipHits = new Map<string, { n: number; reset: number }>();

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

export function ipBlocked(ip: string): boolean {
  const row = ipHits.get(ip);
  if (!row) return false;
  if (row.reset < Date.now()) {
    ipHits.delete(ip);
    return false;
  }
  return row.n >= MAX_IP;
}

export function noteIpFailure(ip: string) {
  const now = Date.now();
  const row = ipHits.get(ip);
  if (!row || row.reset < now) {
    ipHits.set(ip, { n: 1, reset: now + WINDOW_MS });
    return;
  }
  row.n += 1;
}

export function clearIpFailures(ip: string) {
  ipHits.delete(ip);
}

export function lockMessage(lockedUntil: Date | null | undefined): string | null {
  if (!lockedUntil) return null;
  if (lockedUntil.getTime() <= Date.now()) return null;
  return "Too many attempts. Try again in 15 minutes.";
}

export function nextLock(failedAttempts: number): { failedAttempts: number; lockedUntil: Date | null } {
  const next = failedAttempts + 1;
  if (next >= MAX_USER) return { failedAttempts: 0, lockedUntil: new Date(Date.now() + WINDOW_MS) };
  return { failedAttempts: next, lockedUntil: null };
}
