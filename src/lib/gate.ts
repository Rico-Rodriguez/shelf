export function gateToken(): string | undefined {
  return process.env["APP_GATE_TOKEN"];
}

function internalHost(host: string): boolean {
  const name = host.replace(/^\[|\]$/g, "").split(":")[0];
  return name === "0.0.0.0" || name === "127.0.0.1" || name === "::" || name === "::1";
}

function localHttpHost(host: string): boolean {
  const name = host.replace(/^\[|\]$/g, "").split(":")[0];
  if (name === "localhost" || name.endsWith(".localhost") || name.endsWith(".nip.io") || name.endsWith(".sslip.io")) return true;
  const parts = name.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export function publicOrigin(request: Request): string {
  const configured = process.env["NEXT_PUBLIC_APP_URL"]?.replace(/\/$/, "");
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = request.headers.get("host")?.trim();
  const candidate = forwarded && !internalHost(forwarded) ? forwarded : host && !internalHost(host) ? host : "";
  if (candidate) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      (localHttpHost(candidate) ? "http" : "https");
    return `${proto}://${candidate}`;
  }
  if (configured) return configured;
  return new URL(request.url).origin;
}

export function gateMatches(presented: string | undefined, expected: string | undefined): boolean {
  if (!expected) return process.env.NODE_ENV !== "production";
  if (!presented || presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i++) diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
