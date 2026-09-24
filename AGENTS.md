# Agent Instructions for Shelf

## Architecture & Deployment Model

- **Server**: Next.js deployed on Vercel / Railway.
- **Mobile Client**: Expo React Native in `apps/mobile`.
- **OTA Updates (`publish-ota.yml`)**: Runs automatically on pushes affecting `apps/mobile/**`. It exports the JS bundle and updates the phone over-the-air seamlessly without requiring a new binary install.
- **Native iOS IPA Builds (`ios-ipa.yml`)**: Builds the unsigned/ad-hoc `Shelf.ipa` using macOS runners.

## Critical Rules for AI Assistants

### 1. Manual IPA Trigger Alerts
macOS runners on GitHub Actions consume runner minutes at a **10× rate**, so automatic push triggers have been disabled on `ios-ipa.yml`. It is strictly manual (`workflow_dispatch`).

**Whenever you make or propose changes that:**
- Add, update, or remove native modules or packages with iOS native code (CocoaPods).
- Upgrade Expo SDK or React Native core versions.
- Modify `apps/mobile/app.json` (such as `runtimeVersion`, permissions, camera/photo prompts, deep-link URL schemes, icons, or splash screens).

**YOU MUST EXPLICITLY NOTIFY THE USER:**
> "⚠️ **Manual IPA Build Required**: These changes modify native iOS capabilities or `runtimeVersion`. OTA updates are not sufficient for this change. Please manually trigger the **Shelf IPA** workflow in GitHub Actions (or run `gh workflow run ios-ipa.yml`) and install the new IPA."

### 2. Regular Updates (OTA)
For all standard UI, screens, styling, React components, state, copy, and API integrations:
- Do **not** ask the user to rebuild the IPA.
- Confirm that the automatic OTA pipeline (`publish-ota.yml`) will update the app over-the-air hands-off upon push to master.
