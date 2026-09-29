import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'edu.timpriest.cbt',
  appName: 'TIMPRIEST EDU CBT',
  webDir: 'dist',
  server: {
    cleartext: true,
    url: 'http://192.168.0.116:8787',
  },
}

export default config