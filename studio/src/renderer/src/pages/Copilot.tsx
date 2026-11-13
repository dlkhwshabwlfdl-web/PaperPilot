import { useState } from 'react'
import type { StudioSettings } from '../../../preload/index'

interface Step {
  tool: string
  args: Record<string, unknown>
  why: string
}

interface Msg {
  from: 'you' | 'copilot'
  text: string
  steps?: Step[]
  state?: 'pending' | 'approved' | 'denied' | 'done'
  results?: string[]
}

/** Turn plain words into proposed PaperPilot tool calls. Nothing here runs
 *  on its own — every proposal waits for an explicit Approve click. */
function propose(text: string): Step[] | null {
  const t = text.trim()
  const low = t.toLowerCase()
  const name = /([A-Za-z0-9_]{1,16})/ 
  const steps: Step[] = []
  if (/^say\s+/i.test(t)) {
    return [{ tool: 'run_command', args: { command: t }, why: 'Broadcast a message in chat' }]
  }
  if (t.startsWith('/')) {
    return [
      { tool: 'run_command', args: { command: t.slice(1) }, why: 'Run this console command (allowlist applies)' }
    ]
  }
  if (/back\s?up/.test(low)) {
    steps.push({ tool: 'backup_world', args: {}, why: 'Prepare the world for backup (save-all / save-off / save-on)' })
    if (/rotat|clean|old|prune/.test(low)) {
      steps.push({ tool: 'rotate_backups', args: { keep: 7 }, why: 'Prune old backups, keep the newest 7' })
    }
    return steps
  }
  if (/diagnos|crash|health|check/.test(low)) {
    return [{ tool: 'diagnose_crash', args: { lines: 500 }, why: 'Scan recent logs for crash indicators' }]
  }
  if (/plugin/.test(low)) return [{ tool: 'list_plugins', args: {}, why: 'List installed plugins' }]
  if (/status|tps|how is the server|performance/.test(low)) {
    return [{ tool: 'server_status', args: {}, why: 'Version, players and TPS' }]
  }
  if (/who|players online|list players|online/.test(low)) {
    return [{ tool: 'list_players', args: {}, why: 'See who is online' }]
  }
  const kick = low.match(new RegExp(`kick\\s+${name.source}`))
  if (kick) return [{ tool: 'kick_player', args: { player: kick[1] }, why: `Kick ${kick[1]}` }]
  const ban = low.match(new RegExp(`ban\\s+${name.source}`))
  if (ban) return [{ tool: 'ban_player', args: { player: ban[1] }, why: `Ban ${ban[1]} (admin)` }]
  const wlAdd = low.match(new RegExp(`whitelist\\s+add\\s+${name.source}`))
  if (wlAdd) return [{ tool: 'whitelist_add', args: { player: wlAdd[1] }, why: `Whitelist ${wlAdd[1]}` }]
  const wlRem = low.match(new RegExp(`whitelist\\s+remove\\s+${name.source}`))
  if (wlRem) return [{ tool: 'whitelist_remove', args: { player: wlRem[1] }, why: `Un-whitelist ${wlRem[1]}` }]
  if (/logs?|log/.test(low)) {
    return [{ tool: 'read_logs', args: { lines: 100 }, why: 'Read the latest log lines' }]
  }
  return null
}

export default function Copilot({ settings }: { settings: StudioSettings }): React.JSX.Element {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      from: 'copilot',
      text: 'Tell me what you want in plain words — “back up the world and clean out the old backups”, “kick Alex”, “how is the server doing”. I draft the PaperPilot tool calls; nothing runs until you approve them.'
    }
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  const send = (): void => {
    const text = input.trim()
    if (!text) return
    setInput('')
    const steps = propose(text)
    setMsgs((m) => [
      ...m,
      { from: 'you', text },
      steps
        ? {
            from: 'copilot',
            text: `Here is what I would run${settings.requireApproval ? ' — your approval is required' : ''}:`,
            steps,
            state: 'pending'
          }
        : {
            from: 'copilot',
            text: 'I can draft calls for: backups (+ rotation), diagnostics, server status, players, plugins, logs, kick / ban / whitelist, “say …” broadcasts, and any /command (the allowlist still applies). Try one of those.'
          }
    ])
  }

  const decide = async (idx: number, approve: boolean): Promise<void> => {
    const msg = msgs[idx]
    if (!msg.steps) return
    if (!approve) {
      setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, state: 'denied' } : x)))
      return
    }
    setBusy(true)
    const results: string[] = []
    for (const s of msg.steps) {
      const r = await window.studio.callTool(s.tool, s.args)
      results.push(r.ok ? `${s.tool}: ${r.text}` : `${s.tool} — error: ${r.error}`)
    }
    setMsgs((m) =>
      m.map((x, i) => (i === idx ? { ...x, state: 'done', results } : x))
    )
    setBusy(false)
  }

  return (
    <div>
      <div className="page-title">AI Copilot</div>
      <p className="page-sub">
        Ask in plain language — Copilot proposes tool calls, you approve them. Nothing runs on
        its own, and every run lands in the audit log.
      </p>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 480 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.from === 'you' ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
            {m.from === 'copilot' && (
              <div className="small" style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}>
                ✦ Copilot
              </div>
            )}
            <div
              style={{
                background: m.from === 'you' ? 'rgba(76,194,255,0.16)' : 'var(--card-hover)',
                border: '1px solid var(--stroke)',
                borderRadius: 8,
                padding: '10px 14px',
                lineHeight: 1.6
              }}
            >
              {m.text}
            </div>
            {m.steps && (
              <div
                style={{
                  border: '1px solid var(--stroke)',
                  borderLeft: '3px solid var(--accent)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  marginTop: 8,
                  background: 'var(--card)'
                }}
              >
                {m.steps.map((s, j) => (
                  <div key={j} style={{ marginBottom: 6 }}>
                    <strong style={{ color: 'var(--accent)' }}>{s.tool}</strong>
                    {Object.keys(s.args).length > 0 && (
                      <span className="muted"> {JSON.stringify(s.args)}</span>
                    )}
                    <div className="muted small">{s.why}</div>
                  </div>
                ))}
                {m.state === 'pending' && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button className="btn accent small" disabled={busy} onClick={() => decide(i, true)}>
                      Approve & run
                    </button>
                    <button className="btn subtle small" disabled={busy} onClick={() => decide(i, false)}>
                      Deny
                    </button>
                  </div>
                )}
                {m.state === 'denied' && <div className="error-text small" style={{ marginTop: 8 }}>Denied — nothing ran.</div>}
                {m.state === 'done' && m.results && (
                  <div className="result-box" style={{ marginTop: 10 }}>
                    {m.results.join('\n')}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <input
          className="input"
          placeholder="Ask Copilot anything about your server…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn accent" onClick={send} style={{ flex: '0 0 100px' }}>
          Send
        </button>
      </div>
    </div>
  )
}
