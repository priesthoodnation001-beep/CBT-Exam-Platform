import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'edu.timpriest.cbt',
  appName: 'TIMPRIEST EDU CBT',
  webDir: 'dist',
  ...(process.env.CAPACITOR_SERVER_URL ? {
    server: {
      url: process.env.CAPACITOR_SERVER_URL,
      allowNavigation: ['exam.timpriestedu.name.ng'],
    },
  } : {}),
}

export default config