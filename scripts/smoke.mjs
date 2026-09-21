const base = process.env.SMOKE_URL ?? "http://127.0.0.1:3000";
const password = process.env.SMOKE_PASSWORD ?? "shelfpass";

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
if (session.json?.needsSetup) {
  const setup = await req("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  remember(setup.res);
} else {
  const login = await req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  if (!login.res.ok) {
    console.error("login failed", login.text);
    process.exit(1);
  }
  remember(login.res);
}

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

for (const path of ["/", "/accounts", "/transactions", "/budget", "/recurring", "/cash-flow", "/reports", "/investments", "/goals", "/settings"]) {
  const { res } = await authed(path);
  if (res.status >= 400) {
    console.error("page fail", path, res.status);
    process.exit(1);
  }
  console.log("ok page", path);
}

console.log("smoke passed");
