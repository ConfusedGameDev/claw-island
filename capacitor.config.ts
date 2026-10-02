import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.confusedgame.clawisland',
  appName: 'Claw Island',
  webDir: 'dist',
  backgroundColor: '#1b2140',
  server: {
    // Serve from https://localhost so secure-context APIs (audio, storage) behave like the web.
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#1b2140',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#1b2140',
  },
};

export default config;
