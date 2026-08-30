import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.boiaro.app',
  appName: 'BoiAro',
  webDir: 'dist',
  server: {
    url: 'https://boiaro.com',
    // cleartext was `true`, which makes Android permit plaintext HTTP traffic
    // app-wide even though the app itself loads over HTTPS — it only weakens
    // the transport. Re-enable locally (and only locally) if you point `url`
    // at an http:// dev server.
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
