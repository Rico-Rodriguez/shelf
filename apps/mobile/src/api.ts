import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "shelf.token";
const LIVE_SERVER = "https://shelf-xi-hazel.vercel.app";

function localServer(value: string): boolean {
  try {
    const host = new URL(value).hostname;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".nip.io") || host.endsWith(".sslip.io")) return true;
    const parts = host.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
    const [a, b] = parts;
    return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  } catch {
    return false;
  }
}

export function apiBase(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
  // A published bundle keeps the live server when the baked address is local.
  // A dev session can still point at the machine running the API.
  if (configured && (__DEV__ || !localServer(configured))) return configured;
  return LIVE_SERVER;
}

const memory = new Map<string, unknown>();
const flight = new Map<string, Promise<unknown>>();
type CacheListener = (data: unknown) => void;
const listeners = new Map<string, Set<CacheListener>>();

let tokenPromise: Promise<string | null> | undefined;

const PERSIST_PREFIX = "shelf.c.";
const PERSIST_INDEX_KEY = "shelf.c.idx";
const PERSISTED_PREFIXES = [
  "/api/dashboard",
  "/api/accounts",
  "/api/categories",
  "/api/budget",
  "/api/transactions",
  "/api/recurring",
  "/api/reports",
  "/api/cash-flow",
  "/api/goals",
  "/api/investments",
  "/api/rules",
  "/api/notifications",
];
/** Saved pages beyond this drop the oldest, so one-off searches do not pile up in the keychain. */
const PERSIST_LIMIT = 48;

function persistKey(path: string): string {
  return `${PERSIST_PREFIX}${path.replace(/[^a-zA-Z0-9]/g, "_")}`.slice(0, 64);
}

let knownPersistedKeys = new Set<string>();

async function persistItem(path: string, data: unknown) {
  if (!PERSISTED_PREFIXES.some((p) => path.startsWith(p))) return;
  try {
    const raw = JSON.stringify(data);
    if (raw.length < 64000) {
      const key = persistKey(path);
      await SecureStore.setItemAsync(key, raw);
      if (!knownPersistedKeys.has(path)) {
        knownPersistedKeys.add(path);
        while (knownPersistedKeys.size > PERSIST_LIMIT) {
          const oldest = knownPersistedKeys.values().next().value as string;
          knownPersistedKeys.delete(oldest);
          SecureStore.deleteItemAsync(persistKey(oldest)).catch(() => undefined);
        }
        await SecureStore.setItemAsync(
          PERSIST_INDEX_KEY,
          JSON.stringify(Array.from(knownPersistedKeys)),
        ).catch(() => undefined);
      }
    }
  } catch {
    // Ignore storage limits
  }
}

// Immediately initiate hydration from disk so memory is primed as early as possible
export const cacheHydrationPromise = (async () => {
  try {
    const rawIdx = await SecureStore.getItemAsync(PERSIST_INDEX_KEY);
    const paths: string[] = rawIdx ? JSON.parse(rawIdx) : [
      "/api/dashboard",
      "/api/accounts",
      "/api/categories",
      "/api/transactions?countOnly=1",
    ];
    knownPersistedKeys = new Set(paths);
    // Read every saved page at once; one at a time made the first screen wait.
    await Promise.all(
      paths.map(async (path) => {
        try {
          const raw = await SecureStore.getItemAsync(persistKey(path));
          if (raw) {
            const parsed = JSON.parse(raw);
            if (!memory.has(path)) {
              memory.set(path, parsed);
              notifyCache(path, parsed);
            }
          }
        } catch {
          // Ignore single key error
        }
      }),
    );
  } catch {
    // Ignore index hydration error
  }
})();

export function getToken(): Promise<string | null> {
  if (!tokenPromise) {
    tokenPromise = SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  }
  return tokenPromise;
}

export async function setToken(token: string | null): Promise<void> {
  tokenPromise = Promise.resolve(token);
  try {
    if (!token) {
      memory.clear();
      flight.clear();
      listeners.clear();
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      for (const path of knownPersistedKeys) {
        SecureStore.deleteItemAsync(persistKey(path)).catch(() => undefined);
      }
      knownPersistedKeys.clear();
      SecureStore.deleteItemAsync(PERSIST_INDEX_KEY).catch(() => undefined);
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // The memory token still authorizes this session when the keychain is unavailable.
  }
}

export function peek<T>(path: string): T | undefined {
  return memory.get(path) as T | undefined;
}

/** Subscribe to updates for a specific cache key/path. */
export function subscribeCache<T>(path: string, callback: (data: T) => void): () => void {
  let set = listeners.get(path);
  if (!set) {
    set = new Set();
    listeners.set(path, set);
  }
  set.add(callback as CacheListener);
  return () => {
    set?.delete(callback as CacheListener);
    if (set && set.size === 0) listeners.delete(path);
  };
}

function notifyCache(path: string, data: unknown) {
  const set = listeners.get(path);
  if (set) {
    for (const cb of set) cb(data);
  }
}

type Retainer = (path: string, data: unknown) => unknown;
const retainers = new Set<Retainer>();

/** Reapply a local overlay to every cache write until the server copy agrees. */
export function retainWrites(retain: Retainer): () => void {
  retainers.add(retain);
  return () => {
    retainers.delete(retain);
  };
}

export function cachePaths(): string[] {
  return [...memory.keys()];
}

function commitCache(path: string, data: unknown) {
  let next = data;
  for (const retain of retainers) next = retain(path, next);
  memory.set(path, next);
  notifyCache(path, next);
  void persistItem(path, next);
}

/** Directly write to in-memory cache and notify all active listeners immediately. */
export function writeCache<T>(path: string, data: T): void {
  commitCache(path, data);
}

/** Optimistically update cached data and notify UI immediately. */
export function mutateCache<T>(path: string, updater: (current: T | undefined) => T): T {
  const current = memory.get(path) as T | undefined;
  const next = updater(current);
  writeCache(path, next);
  return next;
}

/** Reads a GET through a shared in-memory cache so tabs can show the last answer immediately. */
export function load<T>(path: string): Promise<T> {
  const pending = flight.get(path);
  if (pending) return pending as Promise<T>;
  const req = api<T>(path)
    .then((data) => {
      flight.delete(path);
      commitCache(path, data);
      return memory.get(path) as T;
    })
    .catch((err: unknown) => {
      flight.delete(path);
      throw err;
    });
  flight.set(path, req);
  return req;
}

export function warm(paths: string[]) {
  for (const path of paths) void load(path).catch(() => undefined);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function authHeaders(extra?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extra);
  const token = await getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  const gate = process.env.EXPO_PUBLIC_GATE_TOKEN;
  if (gate) headers.set("x-shelf-gate", gate);
  return headers;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    try {
      const text = await res.text();
      if (text) return text;
    } catch {
      return res.statusText;
    }
  }
  return res.statusText || "Request failed";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(`${apiBase()}${path}`, { ...init, headers });
  if (!res.ok) {
    const message = await readError(res);
    if (res.status === 401 && message === "locked") await setToken(null);
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json()) as T & { token?: string };
  if (json && typeof json === "object" && typeof json.token === "string") {
    await setToken(json.token);
  }
  return json;
}

export async function apiText(path: string): Promise<string> {
  const headers = await authHeaders();
  const res = await fetch(`${apiBase()}${path}`, { headers });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return res.text();
}
