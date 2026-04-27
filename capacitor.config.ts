import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.boiaro.app',
  appName: 'BoiAro',
  webDir: 'dist',
  server: {
    url: 'https://boiaro.com.bd',
    cleartext: true,
  },
};

export default config;
