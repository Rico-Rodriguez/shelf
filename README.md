# Shelf

A private money app for iPhone and Android. Accounts, a monthly plan, bills, goals, and insights. Connect real banks with [Plaid’s Trial / Sandbox APIs](https://plaid.com/docs/account/billing/), or load sample data from Settings.

The phone app is in `apps/mobile` (Expo). This repository’s server keeps the database, the lock, and the Plaid secret. The website UI is not the product.

This is original software. It is not affiliated with Monarch.

## Server

You do **not** need Docker. Shelf uses embedded Postgres (PGlite) in `data/` when `DATABASE_URL` is unset.

```bash
cp .env.example .env
npm install
npm run dev
```

The server listens on [http://localhost:3000](http://localhost:3000). Opening that address in a browser only confirms the server is up.

Optional real Postgres (same schema as Railway):

```bash
docker compose up -d
# in .env
DATABASE_URL=postgresql://shelf:shelf@localhost:5432/shelf
```

## Installing and updating the iPhone app

The copy installed on the phone updates its own screens. A push that changes `apps/mobile`, `scripts/publish-ota.mjs`, or the update workflow exports the JavaScript bundle and commits it to `master`. Vercel deploys `master` to [https://shelf-xi-hazel.vercel.app](https://shelf-xi-hazel.vercel.app). The next time the installed app opens, it downloads that bundle from `/api/ota` and reloads. Closing it fully and opening it again always checks. After an update is already running, bringing Shelf back to the foreground checks again.

The download replaces the JavaScript and the pictures and fonts that JavaScript loads. The header change from Shelf to Belf was that kind of change. So is a new screen, a color, copy, a chart, a form, or the address the screens call, because that address is written into the bundle when it is exported.

These changes are inside the installed iOS app, so they need a new `Shelf.ipa`:

- A new native module, or a newer Expo or React Native. JavaScript-only packages can go out in an update. A package with iOS code is compiled into the install.
- The icon, the name under the icon, or the splash screen.
- A new iOS permission, such as the camera or photo prompt.
- The `shelf` URL scheme as iOS has it registered. The update also carries a copy of that scheme so linking can start. iOS still only opens URLs the installed app registered.
- `runtimeVersion` or the update address in `apps/mobile/app.json`. Both are stored in the installed app. The current runtime is `1.1.0`. Bump it in the same change as the new install, so an older phone does not load a bundle that calls native code it does not have. `1.1.0` adds `react-native-svg` (charts) and `expo-haptics`. Phones still on `1.0.0` keep the previous screens until they install the new IPA.

Server changes, such as an API route or the database, deploy with the website. The phone does not need an update for those unless its screens have to change too.

GitHub Actions builds that install file on a Mac when `apps/mobile` or `.github/workflows/ios-ipa.yml` changes on `master` or `cursor/native-parity-08b4`. The run summary prints a direct download for `Shelf.ipa`. That link lasts about ten minutes. After it expires, the same file stays at the `ipa` release: `https://github.com/Rico-Rodriguez/shelf/releases/download/ipa/Shelf.ipa`. Sideload that file. Do not unzip it. The Actions artifact named Shelf is a zip around the IPA, and macOS will not open that zip. The IPA has an ad-hoc signature so the package is valid. Your sideload tool still signs it with your Apple ID. The Actions page for this private repo is only visible in a browser signed in as the account that owns the repository.

The phone must already contain `expo-updates` for a later screen change to arrive on its own. The install built before that package was added cannot download an update. One sideload of an IPA that includes it is enough.

`scripts/publish-ota.mjs` is what the GitHub job runs. It exports the iOS bundle with `EXPO_PUBLIC_API_URL` set to the live server, names each file by its hash, and stores the Expo app config in the update, including the `shelf` URL scheme. A missing scheme makes the first open of an update crash. The next open then uses the copy that was installed. Asset names cannot contain a slash, or the phone refuses to store the update.

## Phone app

```bash
cd apps/mobile
npm install
# iOS simulator can use localhost. Android emulator uses http://10.0.2.2:3000
EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start
```

Create a lock in the app, then Settings → Load sample data.

Bank connect uses Plaid’s native Link SDK, so it needs a development build. `npx expo run:ios` needs macOS. Android is `npx expo run:android`. Set `PLAID_ANDROID_PACKAGE=app.shelf.mobile` on the server, and register the iOS redirect URI in the Plaid dashboard.

If `APP_GATE_TOKEN` is set and Google sign-in is not, pass the same value as `EXPO_PUBLIC_GATE_TOKEN`.

Sign-in returns a bearer token stored in the Keychain or Keystore. The website cookie session still works for the API.

## Plaid (Sandbox, then Trial)

1. Create a dashboard account at [dashboard.plaid.com](https://dashboard.plaid.com).
2. Put `PLAID_CLIENT_ID` and `PLAID_SECRET` in `.env`. Leave `PLAID_ENV=sandbox` while you build.
3. Restart `npm run dev`. In the app, Accounts → Connect a bank.
4. For live US/CA banks, apply for the [Trial plan](https://dashboard.plaid.com/trial-plan) (new US/CA teams on/after 2026-04-15). Trial includes Transactions, Balance, Investments, and Liabilities, and **10 Items**. An Item is one institution login. Removing an Item does **not** free a slot.
5. In the Plaid dashboard add:
   - Redirect: `http://localhost:3000/api/plaid/oauth` and later `https://YOUR_APP/api/plaid/oauth`
   - Webhook: `https://YOUR_APP/api/plaid/webhook` (the app can sync on demand)
6. Set `PLAID_ENV=production`, `PLAID_REDIRECT_URI`, `PLAID_WEBHOOK_URL`, `APP_SECRET`, and `APP_ENCRYPTION_KEY` (32+ characters each).

Never paste keys into chat. Access tokens are encrypted at rest.

## Deploy on Railway

1. Create a Railway project from this repo (Nixpacks).
2. Add a **Postgres** plugin. Railway sets `DATABASE_URL`.
3. Set variables: `APP_SECRET`, `APP_ENCRYPTION_KEY`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_REDIRECT_URI=https://YOUR_APP/api/plaid/oauth`, `PLAID_WEBHOOK_URL=https://YOUR_APP/api/plaid/webhook`.
4. Generate a public HTTPS URL and set `EXPO_PUBLIC_API_URL` to it when you start the phone app.

A `Dockerfile` is included if you prefer a container. Health check: `GET /api/health`.

## What Shelf includes

Home leads with this month’s spending, what you saved, the latest charges, and the next bills. Budget is money left in the plan, category by category. Insights is this month against your usual month, plus net worth. Bills open on a monthly total. JSON/CSV export stays in Settings.

## Scripts

- `npm run dev` — local server
- `npm run build` / `npm start` — production server
- `npm run smoke` — API smoke test against a running server
