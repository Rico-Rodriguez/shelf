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

let tokenPromise: Promise<string | null> | undefined;

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
      await SecureStore.deleteItemAsync(TOKEN_KEY);
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

/** Reads a GET through a shared in-memory cache so tabs can show the last answer immediately. */
export function load<T>(path: string): Promise<T> {
  const pending = flight.get(path);
  if (pending) return pending as Promise<T>;
  const req = api<T>(path)
    .then((data) => {
      memory.set(path, data);
      flight.delete(path);
      return data;
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
