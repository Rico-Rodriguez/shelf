// The lock screen and Dynamic Island read a Live Activity's layout from the
// App Group that the app shares with its widget extension. A sideloaded build
// (Feather, AltStore) is re-signed without that App Group, so the extension
// finds no layout and draws an error box or nothing. This patch lets the
// extension fall back to a copy of the layout baked into its own Info.plist
// (written by plugins/with-live-activity-layout.js at prebuild).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "node_modules/expo-widgets/ios/Widgets/Utils.swift");
const MARK = "ShelfLiveActivityLayouts";

if (!existsSync(file)) {
  console.log("patch-expo-widgets: expo-widgets is not installed, skipping");
  process.exit(0);
}

const source = readFileSync(file, "utf8");
if (source.includes(MARK)) process.exit(0);

const before = 'let layout = WidgetsStorage.getString(forKey: "__expo_widgets_live_activity_\\(name)_layout") ?? ""';
const after = [
  'let stored = WidgetsStorage.getString(forKey: "__expo_widgets_live_activity_\\(name)_layout")',
  '  let baked = (Bundle.main.object(forInfoDictionaryKey: "' + MARK + '") as? [String: String])?[name]',
  '  let layout = (stored?.isEmpty == false ? stored : nil) ?? baked ?? ""',
].join("\n");

if (!source.includes(before)) {
  console.error("patch-expo-widgets: Utils.swift changed upstream. Update scripts/patch-expo-widgets.mjs.");
  process.exit(1);
}
writeFileSync(file, source.replace(before, after));
console.log("patch-expo-widgets: Live Activity layout fallback added");
