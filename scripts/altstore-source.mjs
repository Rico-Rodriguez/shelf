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
const IPA_URL = `https://github.com/${REPO}/releases/download/ipa/Shelf.ipa`;
const ICON_URL = "https://shelf-xi-hazel.vercel.app/apple-touch-icon.png";
const TINT = "1B7A62";

function flag(name, required = false) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    if (required) {
      console.error("Usage: node scripts/altstore-source.mjs --ipa <file> --out <file> [--min-os <version>] [--date <iso>]");
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
  if (src.sourceURL !== SOURCE_URL) throw new Error(`sourceURL must be ${SOURCE_URL}`);
  for (const app of src.apps) {
    const where = `app ${app.name}`;
    for (const key of ["name", "bundleIdentifier", "developerName", "localizedDescription", "iconURL"]) {
      need(app, key, "string", where);
    }
    need(app, "versions", "array", where);
    need(app, "appPermissions", "object", where);
    if (app.versions.length === 0) throw new Error(`${where}: versions is empty`);
    for (const version of app.versions) {
      const at = `${where} version`;
      for (const key of ["version", "buildVersion", "date", "downloadURL"]) need(version, key, "string", at);
      need(version, "size", "number", at);
      if (version.size <= 0) throw new Error(`${where}: version size must be positive`);
      if (Number.isNaN(Date.parse(version.date))) throw new Error(`${where}: date is not ISO 8601`);
      if (!version.downloadURL.startsWith("https://")) throw new Error(`${where}: downloadURL must be https`);
      if (version.downloadURL !== IPA_URL) throw new Error(`${where}: downloadURL must be ${IPA_URL}`);
    }
    for (const key of ["version", "versionDate", "downloadURL"]) need(app, key, "string", `${where} (legacy)`);
    need(app, "size", "number", `${where} (legacy)`);
    if (app.version !== app.versions[0].version) throw new Error(`${where}: legacy version does not match versions[0]`);
    if (app.downloadURL !== app.versions[0].downloadURL) throw new Error(`${where}: legacy downloadURL does not match versions[0]`);
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
  const size = statSync(ipaPath).size;
  const when = date || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const notes = `${name} ${version} (${buildVersion}), runtime ${runtime}. Screen updates arrive over the air. Install this when the runtime changes.`;
  const description = "Shelf is a private money app. Accounts, a monthly plan, bills, goals, and insights. Most screen changes arrive over the air. Install a new build here when the runtime changes.";
  const versionEntry = {
    version,
    buildVersion,
    date: when,
    localizedDescription: notes,
    downloadURL: IPA_URL,
    size,
  };
  if (minOs) versionEntry.minOSVersion = minOs;
  const listing = {
    name,
    bundleIdentifier: bundle,
    developerName: "Rico Rodriguez",
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
    downloadURL: IPA_URL,
    size,
  };
  return {
    name,
    identifier: "app.shelf.source",
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
