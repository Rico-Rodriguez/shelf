export function googleClientId(): string {
  return process.env["GOOGLE_CLIENT_ID"]?.trim() ?? "";
}

export function googleClientSecret(): string {
  return process.env["GOOGLE_CLIENT_SECRET"]?.trim() ?? "";
}

export function googleConfigured(): boolean {
  return googleClientId().length > 8 && googleClientSecret().length > 8;
}

export function allowedGoogleEmail(): string {
  return (process.env["GOOGLE_ALLOWED_EMAIL"]?.trim() || "rico21r@gmail.com").toLowerCase();
}

export function googleSessionOk(session: { googleEmail?: string; googleSub?: string }): boolean {
  if (!googleConfigured()) return true;
  return session.googleEmail === allowedGoogleEmail() && Boolean(session.googleSub);
}
