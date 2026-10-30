// Lets Staffora see the Play Store app on Android 11+ (package visibility).
//
// expo-camera checks for Google Play by looking up the Play Store package before it opens Google's
// QR scanner. Since Android 11 an app can only see packages its manifest lists under <queries>,
// so without this the check fails on every phone and the scanner says "Google Play Services is
// not available on this device" (owner's Samsung S21 FE, 30/10/2026).
const { withAndroidManifest } = require('expo/config-plugins');

const PLAY_STORE = 'com.android.vending';

module.exports = function withPlayStoreQuery(config) {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest.queries = manifest.queries ?? [{}];
    const queries = manifest.queries[0];
    queries.package = queries.package ?? [];
    if (!queries.package.some((p) => p.$?.['android:name'] === PLAY_STORE))
      queries.package.push({ $: { 'android:name': PLAY_STORE } });
    return c;
  });
};
