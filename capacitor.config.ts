import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the built web bundle in a native shell.
 *
 * Nothing here points at a dev server or a remote origin: the app is loaded
 * from the APK itself, which is what keeps it working with no network — the
 * same property the web build has.
 */
const config: CapacitorConfig = {
  appId: 'com.haseeb.app',
  appName: 'حسيب',
  webDir: 'dist',
  android: {
    // A clear WebView user agent makes crash reports and support tickets
    // identifiable as the Android shell rather than a random browser.
    appendUserAgent: 'Haseeb/1.0 (Android)',
  },
  // No plugins are declared: the launch splash comes from the Android launch
  // theme (AppTheme.NoActionBarLaunch → @drawable/splash), and every feature
  // the app has is web code running against the local database.
};

export default config;
