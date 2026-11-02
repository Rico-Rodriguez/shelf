import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { currentTotp } from "../src/lib/totp.ts";

const secretPath = "data/smoke-totp-secret";

function saveSmokeSecret(secret) {
  mkdirSync("data", { recursive: true });
  writeFileSync(secretPath, String(secret));
}

function smokeTotp() {
  return currentTotp(readFileSync(secretPath, "utf8").trim());
}

const base = process.env.SMOKE_URL ?? "http://127.0.0.1:3000";
const password = process.env.SMOKE_PASSWORD ?? "shelf-smoke-key";

async function req(path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { res, text, json };
}

const jar = [];

async function authed(path, init = {}) {
  return req(path, {
    ...init,
    headers: { cookie: jar.join("; "), ...(init.headers ?? {}) },
  });
}

function remember(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) jar.push(c.split(";")[0]);
}

const session = await req("/api/auth/session");
let token = "";
if (session.json?.needsSetup) {
  const setup = await req("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  if (!setup.res.ok || !setup.json?.token) {
    console.error("setup failed", setup.text);
    process.exit(1);
  }
  token = setup.json.token;
  remember(setup.res);
} else {
  const login = await req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  if (!login.res.ok || !login.json?.token) {
    console.error("login failed", login.text);
    process.exit(1);
  }
  token = login.json.token;
  remember(login.res);
}

const bearer = await req("/api/auth/session", { headers: { authorization: `Bearer ${token}` } });
const sessionOpen = Boolean(bearer.json?.unlocked || bearer.json?.needsEnroll || bearer.json?.needsTotp);
if (!bearer.res.ok || !sessionOpen) {
  console.error("bearer session failed", bearer.text);
  process.exit(1);
}
console.log("ok bearer");

if (bearer.json?.needsEnroll) {
  const enroll = await authed("/api/auth/totp/setup");
  if (!enroll.res.ok || !enroll.json?.secret) {
    console.error("totp setup failed", enroll.text);
    process.exit(1);
  }
  saveSmokeSecret(enroll.json.secret);
  remember(enroll.res);
  const confirm = await authed("/api/auth/totp/setup", {
    method: "POST",
    body: JSON.stringify({ code: currentTotp(enroll.json.secret) }),
  });
  if (!confirm.res.ok || !confirm.json?.token) {
    console.error("totp confirm failed", confirm.text);
    process.exit(1);
  }
  token = confirm.json.token;
  remember(confirm.res);
  console.log("ok enroll");
}

if (bearer.json?.needsTotp) {
  let code = "";
  try {
    code = smokeTotp();
  } catch {
    console.error("totp required but data/smoke-totp-secret is missing");
    process.exit(1);
  }
  const totp = await authed("/api/auth/totp", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (!totp.res.ok || !totp.json?.token) {
    console.error("totp failed", totp.text);
    process.exit(1);
  }
  token = totp.json.token;
  remember(totp.res);
  console.log("ok totp");
}

const open = await req("/api/auth/session", { headers: { authorization: `Bearer ${token}` } });
if (!open.json?.unlocked) {
  console.error("session is not unlocked", open.text);
  process.exit(1);
}
const bearerDash = await req("/api/dashboard", { headers: { authorization: `Bearer ${token}` } });
if (!bearerDash.res.ok) {
  console.error("bearer dashboard failed", bearerDash.text.slice(0, 400));
  process.exit(1);
}
console.log("ok bearer dashboard");

const health = await req("/api/health");
if (!health.json?.ok) {
  console.error("health failed", health.text);
  process.exit(1);
}

await authed("/api/demo/seed", { method: "POST" });

const paths = [
  "/api/dashboard",
  "/api/accounts",
  "/api/transactions",
  "/api/budget",
  "/api/recurring",
  "/api/cash-flow",
  "/api/reports",
  "/api/investments",
  "/api/goals",
  "/api/categories",
  "/api/rules",
];

for (const path of paths) {
  const { res, text } = await authed(path);
  if (!res.ok) {
    console.error("fail", path, res.status, text.slice(0, 400));
    process.exit(1);
  }
  console.log("ok", path);
}

const home = await req("/");
if (home.res.status >= 400) {
  console.error("page fail", "/", home.res.status);
  process.exit(1);
}
console.log("ok page /");

console.log("smoke passed");
