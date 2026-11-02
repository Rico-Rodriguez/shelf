// AltStore / Feather source for Shelf.
// Same shape as critter-clash tools/altstore_source.py. The file is a release
// asset, not a file served by the website:
//   node scripts/altstore-source.mjs --ipa dist/Shelf.ipa --out dist/altstore.json
//   node scripts/altstore-source.mjs --validate dist/altstore.json
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "Rico-Rodriguez/shelf";
const SOURCE_URL = `https://github.com/${REPO}/releases/download/ipa/altstore.json`;
const ICON_URL = "https://raw.githubusercontent.com/Rico-Rodriguez/shelf/master/apps/mobile/assets/icon.png";
const TINT = "111111";
const BUNDLE_ID = "app.shelf.mobile";
const SOURCE_ID = "app.shelf.source";
const DEVELOPER = "Rico Rodriguez";
// Feather rejects the whole source unless category is in AltStore's fixed list.
// "finance" is not on that list. "utilities" is.
const CATEGORIES = new Set([
  "developer",
  "entertainment",
  "games",
  "lifestyle",
  "other",
  "photo-video",
  "social",
  "utilities",
]);

function ipaDownloadUrl(version, buildVersion) {
  return `https://github.com/${REPO}/releases/download/ipa/Shelf-${version}-${buildVersion}.ipa`;
}

function flag(name, required = false) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    if (required) {
      console.error("Usage: node scripts/altstore-source.mjs --ipa <file> --out <file> --min-os <version> [--date <iso>]");
      console.error("       node scripts/altstore-source.mjs --validate <file>");
      process.exit(1);
    }
    return "";
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Missing value for ${name}`);
    process.exit(1);
  }
  return value;
}

function need(obj, key, kind, where) {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) throw new Error(`${where}: missing '${key}'`);
  const value = obj[key];
  if (kind === "string" && (typeof value !== "string" || value.length === 0)) {
    throw new Error(`${where}: '${key}' should be a non-empty string`);
  }
  if (kind === "number" && (typeof value !== "number" || !Number.isInteger(value))) {
    throw new Error(`${where}: '${key}' should be an integer`);
  }
  if (kind === "array" && !Array.isArray(value)) throw new Error(`${where}: '${key}' should be an array`);
  if (kind === "object" && (value === null || typeof value !== "object" || Array.isArray(value))) {
    throw new Error(`${where}: '${key}' should be an object`);
  }
}

function validate(src) {
  need(src, "name", "string", "source");
  need(src, "identifier", "string", "source");
  need(src, "sourceURL", "string", "source");
  need(src, "apps", "array", "source");
  if (src.apps.length === 0) throw new Error("source: apps is empty");
  if (src.identifier !== SOURCE_ID) throw new Error(`identifier must be ${SOURCE_ID}`);
  if (src.sourceURL !== SOURCE_URL) throw new Error(`sourceURL must be ${SOURCE_URL}`);
  if (src.tintColor !== TINT) throw new Error(`source tintColor must be ${TINT}`);
  if (src.iconURL !== ICON_URL) throw new Error(`source iconURL must be ${ICON_URL}`);
  for (const app of src.apps) {
    const where = `app ${app.name}`;
    for (const key of ["name", "bundleIdentifier", "developerName", "localizedDescription", "iconURL"]) {
      need(app, key, "string", where);
    }
    if (app.bundleIdentifier !== BUNDLE_ID) throw new Error(`${where}: bundleIdentifier must be ${BUNDLE_ID}`);
    if (app.developerName !== DEVELOPER) throw new Error(`${where}: developerName must be ${DEVELOPER}`);
    if (app.tintColor !== TINT) throw new Error(`${where}: tintColor must be ${TINT}`);
    if (app.iconURL !== ICON_URL) throw new Error(`${where}: iconURL must be ${ICON_URL}`);
    if (!CATEGORIES.has(app.category)) {
      throw new Error(`${where}: category '${app.category}' is not in AltStore's list`);
    }
    if (app.category !== "utilities") throw new Error(`${where}: category must be utilities`);
    need(app, "versions", "array", where);
    need(app, "appPermissions", "object", where);
    if (app.versions.length === 0) throw new Error(`${where}: versions is empty`);
    for (const version of app.versions) {
      const at = `${where} version`;
      for (const key of ["version", "buildVersion", "date", "downloadURL", "minOSVersion"]) {
        need(version, key, "string", at);
      }
      need(version, "size", "number", at);
      if (version.size <= 0) throw new Error(`${where}: version size must be positive`);
      if (Number.isNaN(Date.parse(version.date))) throw new Error(`${where}: date is not ISO 8601`);
      const expected = ipaDownloadUrl(version.version, version.buildVersion);
      if (version.downloadURL !== expected) throw new Error(`${where}: downloadURL must be ${expected}`);
    }
    for (const key of ["version", "versionDate", "downloadURL"]) need(app, key, "string", `${where} (legacy)`);
    need(app, "size", "number", `${where} (legacy)`);
    if (app.version !== app.versions[0].version) throw new Error(`${where}: legacy version does not match versions[0]`);
    if (app.downloadURL !== app.versions[0].downloadURL) throw new Error(`${where}: legacy downloadURL does not match versions[0]`);
    if (app.size !== app.versions[0].size) throw new Error(`${where}: legacy size does not match versions[0]`);
  }
  if (/github\.com\/[^/\s]+\/shelf\/releases\/download\/(?!ipa\/)/i.test(JSON.stringify(src))) {
    throw new Error("source points at an unexpected GitHub release");
  }
}

function build(ipaPath, minOs, date) {
  const app = JSON.parse(readFileSync(join(root, "apps/mobile/app.json"), "utf8")).expo;
  const version = String(app.version ?? "");
  const buildVersion = String(app.ios?.buildNumber ?? "");
  const name = String(app.name ?? "");
  const bundle = String(app.ios?.bundleIdentifier ?? "");
  const runtime = String(app.runtimeVersion ?? "");
  if (!version || !buildVersion || !name || !bundle) {
    throw new Error("app.json is missing name, version, ios.buildNumber, or ios.bundleIdentifier");
  }
  if (bundle !== BUNDLE_ID) throw new Error(`ios.bundleIdentifier must be ${BUNDLE_ID}`);
  if (!minOs) throw new Error("minOSVersion is required (--min-os). Feather needs it on versions[0].");
  const size = statSync(ipaPath).size;
  const when = date || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const downloadURL = ipaDownloadUrl(version, buildVersion);
  const notes = `${name} ${version} (${buildVersion}), runtime ${runtime}. Screen updates arrive over the air. Install this when the runtime changes.`;
  const description = "Shelf is a private money app. Accounts, a monthly plan, bills, goals, and insights. Most screen changes arrive over the air. Install a new build here when the runtime changes.";
  const versionEntry = {
    version,
    buildVersion,
    date: when,
    localizedDescription: notes,
    downloadURL,
    size,
    minOSVersion: minOs,
  };
  const listing = {
    name,
    bundleIdentifier: bundle,
    developerName: DEVELOPER,
    subtitle: "Accounts, a monthly plan, bills, goals, and insights.",
    localizedDescription: description,
    iconURL: ICON_URL,
    tintColor: TINT,
    category: "utilities",
    versions: [versionEntry],
    appPermissions: { entitlements: [], privacy: {} },
    version,
    versionDate: when,
    versionDescription: notes,
    downloadURL,
    size,
  };
  return {
    name,
    identifier: SOURCE_ID,
    subtitle: "Sideload builds of Shelf",
    description: "Shelf builds for Feather, AltStore, and SideStore.",
    iconURL: ICON_URL,
    website: `https://github.com/${REPO}`,
    tintColor: TINT,
    sourceURL: SOURCE_URL,
    featuredApps: [bundle],
    apps: [listing],
    news: [],
  };
}

const validatePath = flag("--validate");
if (validatePath) {
  validate(JSON.parse(readFileSync(resolve(validatePath), "utf8")));
  console.log(`${validatePath}: valid AltStore source`);
} else {
  const ipaPath = resolve(flag("--ipa", true));
  const outPath = resolve(flag("--out", true));
  const source = build(ipaPath, flag("--min-os"), flag("--date"));
  validate(source);
  writeFileSync(outPath, `${JSON.stringify(source, null, 2)}\n`);
  const listed = source.apps[0].versions[0];
  console.log(`wrote ${outPath} (${listed.size} bytes, ${source.name} ${listed.version} build ${listed.buildVersion})`);
}
