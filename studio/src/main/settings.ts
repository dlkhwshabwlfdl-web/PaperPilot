import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Studio's own settings — stored locally in userData, never in the repo. */
export interface StudioSettings {
  rconHost: string
  rconPort: number
  /** Kept only in this local settings file; the core also accepts the
   *  PAPERPILOT_RCON_PASSWORD / RCON_PASSWORD environment variables, which
   *  take precedence when set. */
  rconPassword: string
  /** Minecraft server directory — used to resolve logs/latest.log and backups/. */
  serverDir: string
  /** run_command allowlist (enforced by the PaperPilot core). */
  allowlist: string[]
  /** Require an explicit confirmation before admin-tier tools run from the UI. */
  requireApproval: boolean
  theme: 'fluent-dark' | 'fluent-light' | 'catppuccin'
  accent: string
  density: 'comfortable' | 'compact'
}

export const DEFAULT_SETTINGS: StudioSettings = {
  rconHost: '127.0.0.1',
  rconPort: 25575,
  rconPassword: '',
  serverDir: '',
  allowlist: ['say', 'list', 'tps', 'save-all', 'whitelist', 'weather', 'time set day'],
  requireApproval: true,
  theme: 'fluent-dark',
  accent: '#4CC2FF',
  density: 'comfortable'
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'studio-settings.json')
}

export function loadSettings(): StudioSettings {
  try {
    const p = settingsPath()
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<StudioSettings>
      return { ...DEFAULT_SETTINGS, ...raw }
    }
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(next: StudioSettings): StudioSettings {
  const p = settingsPath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(next, null, 2), 'utf8')
  return next
}
