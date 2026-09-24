import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, cpSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mobile = join(root, "apps/mobile");
const exported = join(root, "tmp-ota");
const destination = join(root, "public/ota");
const origin = "https://shelf-xi-hazel.vercel.app";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
execFileSync(npx, ["expo", "export", "--platform", "ios", "--output-dir", exported], {
  cwd: mobile,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    CI: "1",
    EXPO_NO_TELEMETRY: "1",
    EXPO_NO_DOCTOR: "1",
    EXPO_PUBLIC_API_URL: origin,
  },
});

const metadata = JSON.parse(readFileSync(join(exported, "metadata.json"), "utf8"));
const ios = metadata.fileMetadata.ios;

function asset(path, contentType, extension) {
  const bytes = readFileSync(join(exported, path));
  const hash = createHash("sha256").update(bytes).digest("base64url");
  return {
    hash,
    key: hash,
    contentType,
    fileExtension: extension,
    url: `${origin}/ota/${path}`,
  };
}

const launch = asset(ios.bundle, "application/javascript");
delete launch.fileExtension;
const assets = ios.assets.map((file) => asset(file.path, file.ext === "ttf" ? "font/ttf" : "image/png", `.${file.ext}`));
const { exp } = createRequire(join(mobile, "package.json"))("@expo/config").getConfig(mobile, {
  skipSDKVersionRequirement: true,
});
const extra = { expoClient: exp };

const manifestPath = join(destination, "manifest.json");
try {
  const previous = JSON.parse(readFileSync(manifestPath, "utf8"));
  const sameLaunch = previous.launchAsset?.hash === launch.hash && previous.launchAsset?.key === launch.key;
  const sameAssets =
    previous.assets?.length === assets.length &&
    previous.assets.every((item, index) => item.hash === assets[index]?.hash && item.key === assets[index]?.key);
  const sameExtra = JSON.stringify(previous.extra) === JSON.stringify(extra);
  if (sameLaunch && sameAssets && sameExtra && previous.runtimeVersion === exp.runtimeVersion) {
    rmSync(exported, { recursive: true, force: true });
    console.log("Phone bundle is unchanged");
    process.exit(0);
  }
} catch {
  // First publish, or the previous manifest cannot be read.
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(join(exported, "_expo"), join(destination, "_expo"), { recursive: true });
cpSync(join(exported, "assets"), join(destination, "assets"), { recursive: true });
writeFileSync(
  join(destination, "manifest.json"),
  JSON.stringify({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    runtimeVersion: exp.runtimeVersion,
    launchAsset: launch,
    assets,
    metadata: {},
    extra,
  }),
);
rmSync(exported, { recursive: true, force: true });
console.log(`Published ${assets.length + 1} files to public/ota`);
