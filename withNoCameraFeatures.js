const { withAndroidManifest } = require("@expo/config-plugins");

const CAMERA_PERMISSIONS = ["android.permission.CAMERA"];
const CAMERA_FEATURE_PREFIX = "android.hardware.camera";

module.exports = function withNoCameraFeatures(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    if (Array.isArray(manifest["uses-permission"])) {
      manifest["uses-permission"] = manifest["uses-permission"].filter(
        (p) => !(p.$ && CAMERA_PERMISSIONS.includes(p.$["android:name"]))
      );
    }
    if (Array.isArray(manifest["uses-permission-sdk-23"])) {
      manifest["uses-permission-sdk-23"] = manifest["uses-permission-sdk-23"].filter(
        (p) => !(p.$ && CAMERA_PERMISSIONS.includes(p.$["android:name"]))
      );
    }
    if (Array.isArray(manifest["uses-feature"])) {
      manifest["uses-feature"] = manifest["uses-feature"].filter(
        (f) =>
          !(
            f.$ &&
            typeof f.$["android:name"] === "string" &&
            f.$["android:name"].startsWith(CAMERA_FEATURE_PREFIX)
          )
      );
    }

    return cfg;
  });
};
