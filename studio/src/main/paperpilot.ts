import { app } from 'electron'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AuditLogger, type AuditEntry } from '../core/audit'
import type { PaperPilotConfig } from '../core/config'
import { RconClient } from '../core/rcon'
import { createTools, type ToolDefinition } from '../core/tools'
import type { StudioSettings } from './settings'

export interface ToolInfo {
  name: string
  description: string
  tier: string
  args: { name: string; description: string; required: boolean; kind: 'string' | 'number' | 'boolean' }[]
}

export interface ServerStatus {
  online: boolean
  version?: string
  playersOnline?: number
  playersMax?: number
  players?: string[]
  tps?: number[]
  mspt?: number | null
  raw: string
  error?: string
}

export interface BackupInfo {
  name: string
  sizeBytes: number
  modified: string
}

/**
 * Hosts the real PaperPilot core in-process — the exact same createTools /
 * RconClient / AuditLogger code that ships in the PaperPilot repo. Every
 * call goes through the core's guarded handler (tier check + allowlist +
 * audit log), so the UI can never do anything the MCP server couldn't.
 */
export class PaperPilotService {
  private tools = new Map<string, ToolDefinition>()
  private settings: StudioSettings
  private auditPath: string
  private backupDir: string

  constructor(settings: StudioSettings) {
    this.settings = settings
    this.auditPath = join(app.getPath('userData'), 'paperpilot-audit.jsonl')
    this.backupDir = 'backups'
    this.rebuild()
  }

  updateSettings(settings: StudioSettings): void {
    this.settings = settings
    this.rebuild()
  }

  private rebuild(): void {
    const s = this.settings
    const serverDir = s.serverDir.trim()
    const password =
      process.env.PAPERPILOT_RCON_PASSWORD || process.env.RCON_PASSWORD || s.rconPassword
    this.backupDir = serverDir ? join(serverDir, 'backups') : 'backups'
    const config: PaperPilotConfig = {
      rconHost: s.rconHost || '127.0.0.1',
      rconPort: s.rconPort || 25575,
      rconPassword: password,
      // Studio is the server owner's own app: the core instance runs at the
      // admin tier, and Studio adds its own approval gate on top (Settings →
      // Safety). The run_command allowlist still applies inside the core.
      tier: 'admin',
      allowlist: s.allowlist,
      logPath: serverDir ? join(serverDir, 'logs', 'latest.log') : 'logs/latest.log',
      auditLogPath: this.auditPath,
      backupDir: this.backupDir
    }
    const rcon = new RconClient({
      host: config.rconHost,
      port: config.rconPort,
      password: config.rconPassword
    })
    const audit = new AuditLogger(config.auditLogPath)
    const tools = createTools({ config, rcon, audit })
    this.tools = new Map(tools.map((t) => [t.name, t]))
  }

  listTools(): ToolInfo[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      tier: t.tier,
      args: Object.entries(t.inputSchema).map(([name, schema]) => {
        const sc = schema as unknown as {
          description?: string
          isOptional?: () => boolean
          _def?: { typeName?: string; innerType?: { _def?: { typeName?: string } } }
        }
        const typeName = sc._def?.innerType?._def?.typeName ?? sc._def?.typeName ?? ''
        return {
          name,
          description: sc.description ?? '',
          required: !(typeof sc.isOptional === 'function' && sc.isOptional()),
          kind: (typeName.includes('Number')
            ? 'number'
            : typeName.includes('Boolean')
              ? 'boolean'
              : 'string') as 'string' | 'number' | 'boolean'
        }
      })
    }))
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ ok: boolean; text?: string; error?: string }> {
    const tool = this.tools.get(name)
    if (!tool) return { ok: false, error: `Unknown tool "${name}".` }
    try {
      const text = await tool.handler(args ?? {})
      return { ok: true, text }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** server_status, parsed into fields for the dashboard. */
  async status(): Promise<ServerStatus> {
    const res = await this.callTool('server_status', {})
    if (!res.ok) return { online: false, raw: '', error: res.error }
    const raw = res.text ?? ''
    const out: ServerStatus = { online: true, raw }
    for (const line of raw.split('\n')) {
      if (line.startsWith('Version:')) out.version = line.slice(8).trim()
      if (line.startsWith('Players:')) {
        const m = line.match(/Players:\s*(\d+|\?)\s*\/\s*(\d+|\?)/)
        if (m) {
          out.playersOnline = m[1] === '?' ? undefined : Number(m[1])
          out.playersMax = m[2] === '?' ? undefined : Number(m[2])
        }
        const names = line.split('—')[1]?.trim()
        out.players = names ? names.split(',').map((n) => n.trim()).filter(Boolean) : []
      }
      if (line.startsWith('TPS')) {
        // Parse only after the colon — the "(1m/5m/15m)" label itself
        // contains numbers that are not TPS values.
        const after = line.slice(line.indexOf(':') + 1)
        const nums = after.match(/[\d.]+/g)
        if (nums && nums.length >= 3) out.tps = nums.slice(0, 3).map(Number)
        const mspt = line.match(/MSPT:\s*([\d.]+)/)
        out.mspt = mspt ? Number(mspt[1]) : null
      }
    }
    // Some Paper builds report the player count in a format the core's
    // parser marks as "?". Fall back to the raw list_players text so the
    // dashboard still shows the real numbers.
    if (out.playersOnline === undefined) {
      const lp = await this.callTool('list_players', {})
      if (lp.ok && lp.text) {
        const clean = lp.text.replace(/§./g, '')
        const m = clean.match(/There are\s+(\d+)\s+out of maximum\s+(\d+)/)
        if (m) {
          out.playersOnline = Number(m[1])
          out.playersMax = Number(m[2])
        }
        if (!out.players || out.players.length === 0) {
          const names = clean.split(':').slice(1).join(':').trim()
          if (names && out.playersOnline && out.playersOnline > 0) {
            out.players = names.split(',').map((n) => n.trim()).filter(Boolean)
          } else if (out.playersOnline === 0) {
            out.players = []
          }
        }
      }
    }
    return out
  }

  /** Backup folders/files in the configured backup dir — read from disk. */
  listBackups(): { entries: BackupInfo[]; totalBytes: number; dir: string } {
    const dir = resolve(this.backupDir)
    const entries: BackupInfo[] = []
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) {
        try {
          const st = statSync(join(dir, name))
          entries.push({
            name,
            sizeBytes: st.size,
            modified: st.mtime.toISOString()
          })
        } catch {
          /* skip unreadable entries */
        }
      }
    }
    entries.sort((a, b) => (a.modified < b.modified ? 1 : -1))
    return { entries, totalBytes: entries.reduce((sum, e) => sum + e.sizeBytes, 0), dir }
  }

  /** Last N entries of the core's JSONL audit log. */
  readAudit(limit = 200): AuditEntry[] {
    if (!existsSync(this.auditPath)) return []
    try {
      const lines = readFileSync(this.auditPath, 'utf8').trim().split('\n').filter(Boolean)
      return lines
        .slice(-limit)
        .map((l) => JSON.parse(l) as AuditEntry)
        .reverse()
    } catch {
      return []
    }
  }
}
