// Bakes each Live Activity's layout into the widget extension's Info.plist,
// so the lock screen and Dynamic Island can draw it even when the App Group
// is missing (sideloaded builds). See scripts/patch-expo-widgets.mjs.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const plist = require("@expo/plist").default;
const { withFinalizedMod } = require("expo/config-plugins");

const KEY = "ShelfLiveActivityLayouts";
const TARGET = "ExpoWidgetsTarget";

function layoutsFrom(projectRoot, dir) {
  const babel = require(require.resolve("@babel/core", { paths: [projectRoot] }));
  const layouts = {};
  const folder = path.join(projectRoot, dir);
  for (const name of fs.readdirSync(folder)) {
    if (!/\.(tsx?|jsx?)$/.test(name)) continue;
    const filename = path.join(folder, name);
    const { code } = babel.transformFileSync(filename, {
      cwd: projectRoot,
      caller: { name: "metro", bundler: "metro", platform: "ios" },
    });
    const stub = new Proxy({}, { get: () => () => undefined });
    const widgets = {
      createLiveActivity(activity, layout) {
        if (typeof layout !== "string") throw new Error(`${name}: ${activity} has no "widget" layout`);
        layouts[activity] = layout;
      },
      createWidget() {},
    };
    const module = { exports: {} };
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      require: (id) => (id === "expo-widgets" ? widgets : stub),
    });
  }
  return layouts;
}

module.exports = function withLiveActivityLayout(config, { dir = "src/widgets" } = {}) {
  return withFinalizedMod(config, [
    "ios",
    async (config) => {
      const { projectRoot, platformProjectRoot } = config.modRequest;
      const infoPath = path.join(platformProjectRoot, TARGET, "Info.plist");
      if (!fs.existsSync(infoPath)) throw new Error(`with-live-activity-layout: ${infoPath} is missing. Is expo-widgets listed before this plugin?`);
      const layouts = layoutsFrom(projectRoot, dir);
      if (Object.keys(layouts).length === 0) throw new Error(`with-live-activity-layout: no Live Activities found in ${dir}`);
      const info = plist.parse(fs.readFileSync(infoPath, "utf8"));
      info[KEY] = layouts;
      fs.writeFileSync(infoPath, plist.build(info));
      return config;
    },
  ]);
};
