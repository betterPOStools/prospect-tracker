import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.valuesystems.prospecttracker',
  appName: 'Prospect Tracker',
  webDir: 'dist',
  server: {
    // Uncomment for Android dev hot reload — set to your machine's LAN IP:
    // url: 'http://192.168.x.x:5173',
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
