import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "shelf.token";

export function apiBase(): string {
  return (process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (!token) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
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
