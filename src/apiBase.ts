// Leave VITE_API_URL empty for the website (same address as the page).
// For the phone app, set it to your Railway address, e.g. https://your-app.up.railway.app
const configured = (import.meta.env.VITE_API_URL as string | undefined) || ''

export const API_BASE = configured.replace(/\/$/, '')
