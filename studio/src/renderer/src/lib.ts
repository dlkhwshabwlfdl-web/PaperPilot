export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour12: false })
}

/** Pick a readable text color for an accent background. */
export function accentTextFor(hex: string): string {
  const m = hex.replace('#', '')
  if (m.length !== 6) return '#00304d'
  const r = parseInt(m.slice(0, 2), 16) / 255
  const g = parseInt(m.slice(2, 4), 16) / 255
  const b = parseInt(m.slice(4, 6), 16) / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.45 ? '#1b1b1b' : '#ffffff'
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'OTHER'

export function logLevel(line: string): LogLevel {
  if (/WARN|WARNING/.test(line)) return 'WARN'
  if (/ERROR|SEVERE|Exception/.test(line)) return 'ERROR'
  if (/INFO/.test(line)) return 'INFO'
  return 'OTHER'
}

export const ACCENTS: { hex: string; name: string }[] = [
  { hex: '#4CC2FF', name: 'System blue' },
  { hex: '#CBA6F7', name: 'Lavender' },
  { hex: '#A6E3A1', name: 'Mint' },
  { hex: '#F5C2E7', name: 'Pink' },
  { hex: '#FAB387', name: 'Peach' },
  { hex: '#89DCEB', name: 'Sky' }
]
