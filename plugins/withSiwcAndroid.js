const {
  withAndroidManifest,
  withAppBuildGradle,
} = require("expo/config-plugins");
module.exports = function withSiwcAndroid(config) {
  config = withAppBuildGradle(config, (c) => {
    c.modResults.contents += `
android {
 defaultConfig { testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner" }
 sourceSets { androidTest.java.srcDirs += file("$rootDir/../native-tests") }
}
dependencies {
 androidTestImplementation 'androidx.test:runner:1.6.2'
 androidTestImplementation 'androidx.test.ext:junit:1.2.1'
 androidTestImplementation 'androidx.test.uiautomator:uiautomator:2.3.0'
}
`;
    return c;
  });
  return withAndroidManifest(config, (config) => {
    const m = config.modResults.manifest;
    m["uses-permission"] ||= [];
    for (const name of [
      "android.permission.INTERNET",
      "android.permission.FOREGROUND_SERVICE",
    ]) {
      if (!m["uses-permission"].some((p) => p.$["android:name"] === name))
        m["uses-permission"].push({ $: { "android:name": name } });
    }
    // Inexact local reminders need no special exact-alarm access.
    m["uses-permission"] = m["uses-permission"].filter(
      (p) =>
        ![
          "android.permission.SCHEDULE_EXACT_ALARM",
          "android.permission.USE_EXACT_ALARM",
        ].includes(p.$["android:name"]),
    );
    const app = m.application[0];
    app.$["android:allowBackup"] = "false";
    app.$["android:fullBackupContent"] = "false";
    app.service ||= [];
    app.service = app.service.filter(
      (s) => s.$["android:name"] !== "com.teumknowledge.siwc.AuthService",
    );
    app.service.push({
      $: {
        "android:name": "com.teumknowledge.siwc.AuthService",
        "android:exported": "false",
        "android:foregroundServiceType": "shortService",
      },
    });
    return config;
  });
};
