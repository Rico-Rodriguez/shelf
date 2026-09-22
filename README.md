# Shelf

A private money app with a quiet luxury finish: accounts, a monthly plan, and one Insights view. Connect real banks with [Plaid’s Trial / Sandbox APIs](https://plaid.com/docs/account/billing/), or load sample data from Settings.

This is original software. It is not affiliated with Monarch.

## Run locally

You do **not** need Docker. Shelf uses embedded Postgres (PGlite) in `data/` when `DATABASE_URL` is unset.

```bash
cd shelf
cp .env.example .env
npm install
npm run icons
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Set a lock (password), then **Settings → Load sample data**.

Optional real Postgres (same schema as Railway):

```bash
docker compose up -d
# in .env
DATABASE_URL=postgresql://shelf:shelf@localhost:5432/shelf
```

## Plaid (Sandbox, then Trial)

1. Create a dashboard account at [dashboard.plaid.com](https://dashboard.plaid.com).
2. Put `PLAID_CLIENT_ID` and `PLAID_SECRET` in `.env`. Leave `PLAID_ENV=sandbox` while you build.
3. Restart `npm run dev`. **Accounts → Connect a bank** uses Plaid Link.
4. For live US/CA banks, apply for the [Trial plan](https://dashboard.plaid.com/trial-plan) (new US/CA teams on/after 2026-04-15). Trial includes Transactions, Balance, Investments, and Liabilities, and **10 Items**. An Item is one institution login. Removing an Item does **not** free a slot.
5. In the Plaid dashboard add:
   - Redirect: `http://localhost:3000/api/plaid/oauth` and later `https://YOUR_APP/api/plaid/oauth`
   - Webhook: `https://YOUR_APP/api/plaid/webhook` (localhost polls on focus + every 15 minutes instead)
6. Set `PLAID_ENV=production`, `PLAID_REDIRECT_URI`, `PLAID_WEBHOOK_URL`, `APP_SECRET`, and `APP_ENCRYPTION_KEY` (32+ characters each).

Never paste keys into chat. Access tokens are encrypted at rest.

## Deploy on Railway

1. Create a Railway project from this repo (Nixpacks).
2. Add a **Postgres** plugin. Railway sets `DATABASE_URL`.
3. Set variables: `APP_SECRET`, `APP_ENCRYPTION_KEY`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_REDIRECT_URI=https://YOUR_APP/api/plaid/oauth`, `PLAID_WEBHOOK_URL=https://YOUR_APP/api/plaid/webhook`.
4. Generate a public HTTPS URL.
5. On your phone: open the URL → Share → **Add to Home Screen**.

A `Dockerfile` is included if you prefer a container. Health check: `GET /api/health`.

## What Shelf includes

Home leads with safe-to-spend, a 30-day cash forecast, and a one-at-a-time review. Budget shows pace and can move money between categories. Insights compares this month with last month and a three-month average. Recurring splits bills from subscriptions. Settings has appearance, alerts, and CSV import. JSON/CSV export stays there too.

## Scripts

- `npm run dev` — local app
- `npm run build` / `npm start` — production server
- `npm run icons` — rebuild PWA PNGs
- `npm run smoke` — API smoke test against a running server
