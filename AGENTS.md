# Agent Instructions for Shelf

## Architecture & Deployment Model

- **Server**: Next.js deployed on Vercel / Railway.
- **Mobile Client**: Expo React Native in `apps/mobile`.
- **OTA Updates (`publish-ota.yml`)**: Runs automatically on pushes affecting `apps/mobile/**`. It exports the JS bundle and updates the phone over-the-air seamlessly without requiring a new binary install.
- **Native iOS IPA Builds (`ios-ipa.yml`)**: Manual `workflow_dispatch` only. A successful build uploads the versioned IPA, stable `Shelf.ipa`, and `altstore.json` to the `ipa` release. Feather adds `https://github.com/Rico-Rodriguez/shelf/releases/download/ipa/altstore.json`. Do not add a push trigger, and do not commit the IPA into the site.

## Critical Rules for AI Assistants

### 1. Manual IPA Trigger Alerts
macOS runners on GitHub Actions consume runner minutes at a **10× rate**, so automatic push triggers have been disabled on `ios-ipa.yml`. It is strictly manual (`workflow_dispatch`).

**Whenever you make or propose changes that:**
- Add, update, or remove native modules or packages with iOS native code (CocoaPods).
- Upgrade Expo SDK or React Native core versions.
- Modify `apps/mobile/app.json` (such as `runtimeVersion`, permissions, camera/photo prompts, deep-link URL schemes, icons, or splash screens).

**YOU MUST EXPLICITLY NOTIFY THE USER:**
> "⚠️ **Manual IPA Build Required**: These changes modify native iOS capabilities or `runtimeVersion`. OTA updates are not sufficient for this change. Please manually trigger the **Shelf IPA** workflow in GitHub Actions (or run `gh workflow run ios-ipa.yml`) and install the new IPA."

### 2. Regular Updates (OTA Updates are Automated & Free)
Because GitHub Actions quotas on private repositories can be exhausted, **do not rely solely on GitHub Actions cloud runners for OTA**.

Whenever making or committing changes to `apps/mobile/**`, `scripts/publish-ota.mjs`, or `src/app/api/ota/**`:
1. The AI / local git hook (`.githooks/pre-commit`) automatically executes `node scripts/publish-ota.mjs`.
2. The compiled bundle in `public/ota/` MUST be staged and committed alongside the code changes (`git add public/ota`).
3. When pushed to GitHub, Vercel automatically deploys `public/ota` live to the phone at `https://shelf-xi-hazel.vercel.app/api/ota`.
4. This costs **0 GitHub Actions minutes** and requires **zero manual steps** from the user. Confirm to the user that the phone app updates seamlessly on its next launch.

## Cursor Cloud specific instructions

- Node 22 is the server runtime (see the root `Dockerfile`). Do not start Postgres or Docker for normal work. With `DATABASE_URL` unset, the API uses embedded PGlite and writes the database under `data/`.
- Install dependencies with `npm ci` at the repo root. In `apps/mobile`, `npm ci` fails on the checked-in lockfile unless peer conflicts are ignored: `npm ci --legacy-peer-deps` (root `react@19.2.3` vs locked `react-dom@19.3.0`).
- If `.env` is missing, copy `.env.example` to `.env`. Plaid keys can stay empty. Sample data does not need them.
- Start the API with `npm run dev` (port 3000, hostname `0.0.0.0`). `GET /api/health` returns `{"ok":true}` after the database opens.
- `npm run lint` and `npx tsc --noEmit` are the server checks. `npm run smoke` is the end-to-end check against that server: it creates the lock, enrolls TOTP, seeds demo data, and reads the main API routes. Run it only against a local server.
- The phone app typechecks with `npx tsc --noEmit` inside `apps/mobile`. It is not a browser app (Expo web dependencies are not installed). iOS and Android need a device or simulator, which this environment does not provide.
