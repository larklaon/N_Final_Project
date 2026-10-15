const { withAndroidManifest } = require('expo/config-plugins');
module.exports = function withSiwcAndroid(config) {
  return withAndroidManifest(config, config => {
    const m = config.modResults.manifest;
    m['uses-permission'] ||= [];
    for (const name of ['android.permission.INTERNET', 'android.permission.FOREGROUND_SERVICE']) {
      if (!m['uses-permission'].some(p => p.$['android:name'] === name)) m['uses-permission'].push({ $: { 'android:name': name } });
    }
    // Inexact local reminders need no special exact-alarm access.
    m['uses-permission'] = m['uses-permission'].filter(p => !['android.permission.SCHEDULE_EXACT_ALARM', 'android.permission.USE_EXACT_ALARM'].includes(p.$['android:name']));
    const app = m.application[0];
    app.$['android:allowBackup'] = 'false';
    app.$['android:fullBackupContent'] = 'false';
    app.service ||= [];
    app.service = app.service.filter(s => s.$['android:name'] !== 'com.teumknowledge.siwc.AuthService');
    app.service.push({ $: { 'android:name': 'com.teumknowledge.siwc.AuthService', 'android:exported': 'false', 'android:foregroundServiceType': 'shortService' } });
    return config;
  });
};
