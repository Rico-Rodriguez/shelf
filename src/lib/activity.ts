export function activityHref(query: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `/transactions?${search}` : "/transactions";
}
