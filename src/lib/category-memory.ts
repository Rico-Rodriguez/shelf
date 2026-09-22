const KEY = "shelf-category-memory";

type Memory = { recent: string[]; counts: Record<string, number> };

function empty(): Memory {
  return { recent: [], counts: {} };
}

export function readCategoryMemory(): Memory {
  if (typeof window === "undefined") return empty();
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || "") as Partial<Memory>;
    return {
      recent: Array.isArray(raw.recent) ? raw.recent.filter((id): id is string => typeof id === "string") : [],
      counts: raw.counts && typeof raw.counts === "object" ? raw.counts : {},
    };
  } catch {
    return empty();
  }
}

export function rememberCategory(id: string) {
  if (!id || typeof window === "undefined") return;
  const memory = readCategoryMemory();
  memory.recent = [id, ...memory.recent.filter((item) => item !== id)].slice(0, 8);
  memory.counts[id] = (Number(memory.counts[id]) || 0) + 1;
  window.localStorage.setItem(KEY, JSON.stringify(memory));
}

/** Recent picks first, then categories used most often, then the list order. */
export function rankCategories(pool: string[], frequent: string[], limit = 6) {
  const memory = readCategoryMemory();
  const score = new Map<string, number>();
  const bump = (id: string, amount: number) => score.set(id, (score.get(id) ?? 0) + amount);
  memory.recent.forEach((id, index) => bump(id, (memory.recent.length - index) * 5));
  for (const [id, count] of Object.entries(memory.counts)) bump(id, Number(count) || 0);
  frequent.forEach((id, index) => bump(id, frequent.length - index));
  const ranked = pool.filter((id) => (score.get(id) ?? 0) > 0).sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0));
  const picked = [...ranked];
  for (const id of pool) {
    if (picked.length >= limit) break;
    if (!picked.includes(id)) picked.push(id);
  }
  return picked.slice(0, limit);
}
