import type { CSSProperties } from 'react'

export const DEFAULT_SCHOOL_COLOR = '#216445'

export const SCHOOL_COLOR_PRESETS = [
  { name: 'Forest green', value: '#216445' },
  { name: 'Ocean blue', value: '#2563a6' },
  { name: 'Royal purple', value: '#7046a3' },
  { name: 'Teal', value: '#147d78' },
  { name: 'Burgundy', value: '#a13b57' },
  { name: 'Sunset orange', value: '#bd572d' },
  { name: 'Slate', value: '#526779' },
  { name: 'Navy', value: '#304b82' },
] as const

type SchoolColorStyle = CSSProperties & { [key: `--${string}`]: string }

function mixColor(color: string, target: number, weight: number) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16))
  return `#${channels.map((channel) => Math.round(channel * (1 - weight) + target * weight).toString(16).padStart(2, '0')).join('')}`
}

export function schoolColorText(color: string) {
  const validColor = /^#[\da-f]{6}$/i.test(color) ? color : DEFAULT_SCHOOL_COLOR
  const channels = [1, 3, 5].map((index) => Number.parseInt(validColor.slice(index, index + 2), 16) / 255)
  const luminance = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  return luminance > 0.179 ? '#172a1e' : '#ffffff'
}

export function schoolColorStyle(color: string): SchoolColorStyle {
  const primary = /^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_SCHOOL_COLOR
  const dark = mixColor(primary, 0, 0.46)
  return {
    '--school-primary': primary,
    '--school-primary-dark': dark,
    '--school-primary-deep': mixColor(primary, 0, 0.70),
    '--school-bg': mixColor(primary, 255, 0.965),
    '--school-soft': mixColor(primary, 255, 0.89),
    '--school-on-primary': schoolColorText(primary),
    '--school-on-dark': schoolColorText(dark),
  }
}
