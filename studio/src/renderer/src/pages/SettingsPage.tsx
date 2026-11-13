import { useState } from 'react'
import type { ServerStatus, StudioSettings } from '../../../preload/index'
import { ACCENTS } from '../lib'
import { ResultBox, Toggle } from '../components/ui'

type Section = 'connection' | 'appearance' | 'safety' | 'about'
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'connection', label: 'Connection' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'safety', label: 'Safety & approvals' },
  { id: 'about', label: 'About' }
]

const THEMES: {
  id: StudioSettings['theme']
  name: string
  bg: string
  nav: string
  cardBg: string
  accent: string
  text: string
}[] = [
  { id: 'fluent-dark', name: 'Fluent Dark', bg: '#202020', nav: 'rgba(255,255,255,0.06)', cardBg: 'rgba(255,255,255,0.1)', accent: '#4CC2FF', text: '#ffffff' },
  { id: 'fluent-light', name: 'Fluent Light', bg: '#f3f3f3', nav: 'rgba(255,255,255,0.9)', cardBg: '#ffffff', accent: '#0067c0', text: '#1c1c1c' },
  { id: 'catppuccin', name: 'Catppuccin Mocha', bg: '#1e1e2e', nav: '#181825', cardBg: '#313244', accent: '#cba6f7', text: '#cdd6f4' }
]

export default function SettingsPage({
  settings,
  onSave,
  status
}: {
  settings: StudioSettings
  onSave: (next: StudioSettings) => Promise<void>
  status: ServerStatus | null
}): React.JSX.Element {
  const [section, setSection] = useState<Section>('appearance')
  const [draft, setDraft] = useState<StudioSettings>(settings)
  const [savedNote, setSavedNote] = useState('')
  const [testResult, setTestResult] = useState<{ text?: string; error?: string } | null>(null)
  const [newAllow, setNewAllow] = useState('')

  const applyNow = (patch: Partial<StudioSettings>): void => {
    const next = { ...settings, ...patch }
    setDraft(next)
    onSave(next).catch(() => undefined)
  }

  const saveDraft = async (): Promise<void> => {
    await onSave(draft)
    setSavedNote('Saved — the core reconnected with these settings.')
  }

  const testConnection = async (): Promise<void> => {
    await onSave(draft)
    const r = await window.studio.callTool('server_status', {})
    setTestResult(r.ok ? { text: r.text } : { error: r.error })
  }

  return (
    <div>
      <div className="page-title">Settings</div>
      <p className="page-sub">Make Studio yours — changes apply instantly and are saved on this device</p>
      <div className="grid" style={{ gridTemplateColumns: '240px 1fr', alignItems: 'start' }}>
        <div className="card" style={{ padding: 10 }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`nav-item ${section === s.id ? 'active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
          <p className="muted small" style={{ padding: '12px 10px 6px', lineHeight: 1.6 }}>
            Settings live in Studio’s own local config — never in the repo. The RCON password can
            also come from the PAPERPILOT_RCON_PASSWORD environment variable.
          </p>
        </div>

        <div>
          {section === 'connection' && (
            <div className="card">
              <h3>Connection</h3>
              <p className="muted small" style={{ marginBottom: 16 }}>
                How Studio reaches your Paper server (PaperPilot core, in-process)
              </p>
              <div className="grid" style={{ gridTemplateColumns: '1fr 160px 1fr' }}>
                <label>
                  <span className="small muted">RCON host</span>
                  <input
                    className="input"
                    style={{ marginTop: 6 }}
                    value={draft.rconHost}
                    onChange={(e) => setDraft({ ...draft, rconHost: e.target.value })}
                  />
                </label>
                <label>
                  <span className="small muted">RCON port</span>
                  <input
                    className="input"
                    style={{ marginTop: 6 }}
                    type="number"
                    value={draft.rconPort}
                    onChange={(e) => setDraft({ ...draft, rconPort: Number(e.target.value) })}
                  />
                </label>
                <label>
                  <span className="small muted">RCON password</span>
                  <input
                    className="input"
                    style={{ marginTop: 6 }}
                    type="password"
                    value={draft.rconPassword}
                    onChange={(e) => setDraft({ ...draft, rconPassword: e.target.value })}
                  />
                </label>
              </div>
              <label style={{ display: 'block', marginTop: 14 }}>
                <span className="small muted">Server folder (for logs/latest.log and backups/)</span>
                <input
                  className="input"
                  style={{ marginTop: 6 }}
                  placeholder="C:\\path\\to\\your\\paper-server"
                  value={draft.serverDir}
                  onChange={(e) => setDraft({ ...draft, serverDir: e.target.value })}
                />
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 18,
                  borderTop: '1px solid var(--stroke)',
                  paddingTop: 16
                }}
              >
                <span
                  className="dot"
                  style={{ background: status?.online ? 'var(--green)' : 'var(--red)' }}
                />
                <strong>
                  {status?.online ? `Connected — ${status.version ?? 'Paper server'}` : 'Not connected'}
                </strong>
                {status?.online && status.tps && (
                  <span className="muted small">TPS {status.tps[0]}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn accent" onClick={testConnection}>
                  Test connection
                </button>
                <button className="btn subtle" onClick={saveDraft}>
                  Save
                </button>
                {savedNote && <span className="small muted" style={{ alignSelf: 'center' }}>{savedNote}</span>}
              </div>
              {testResult && (
                <div style={{ marginTop: 14 }}>
                  <ResultBox text={testResult.text} error={testResult.error} />
                </div>
              )}
            </div>
          )}

          {section === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card">
                <h3>Appearance</h3>
                <p className="muted small" style={{ marginBottom: 14 }}>
                  Theme, accent color and density for the whole app
                </p>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  {THEMES.map((t) => (
                    <div
                      key={t.id}
                      className={`card theme-card ${settings.theme === t.id ? 'selected' : ''}`}
                      style={{ cursor: 'pointer', padding: 12 }}
                      onClick={() => applyNow({ theme: t.id })}
                    >
                      <div style={{ background: t.bg, borderRadius: 6, height: 92, display: 'flex', overflow: 'hidden' }}>
                        <div style={{ width: 52, background: t.nav, padding: 8 }}>
                          <div style={{ height: 6, borderRadius: 3, background: t.accent, marginBottom: 6 }} />
                          <div style={{ height: 5, borderRadius: 2, background: t.text, opacity: 0.5, marginBottom: 5 }} />
                          <div style={{ height: 5, borderRadius: 2, background: t.text, opacity: 0.35 }} />
                        </div>
                        <div style={{ flex: 1, padding: 10 }}>
                          <div style={{ height: 32, borderRadius: 4, background: t.cardBg, marginBottom: 8 }} />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ flex: 1, height: 26, borderRadius: 4, background: t.cardBg }} />
                            <div style={{ flex: 1, height: 26, borderRadius: 4, background: t.accent }} />
                          </div>
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, marginTop: 10 }}>{t.name}</div>
                      {settings.theme === t.id && (
                        <div className="small" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                          Current theme
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ fontWeight: 600, margin: '20px 0 10px' }}>Accent color</div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  {ACCENTS.map((a) => (
                    <span
                      key={a.hex}
                      className={`accent-dot ${settings.accent === a.hex ? 'accent-ring' : ''}`}
                      style={{ background: a.hex }}
                      title={a.name}
                      onClick={() => applyNow({ accent: a.hex })}
                    />
                  ))}
                  <span className="muted small">
                    {ACCENTS.find((a) => a.hex === settings.accent)?.name ?? settings.accent} —
                    used for the primary button, selection and links
                  </span>
                </div>
              </div>
              <div className="card">
                {(
                  [
                    ['Density', 'Spacing of lists, tables and cards', 'density'],
                    ['App language', 'Interface language — English for now, more can be added later', 'language']
                  ] as const
                ).map(([title, desc, kind]) => (
                  <div
                    key={kind}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 0',
                      borderTop: '1px solid var(--stroke)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{title}</div>
                      <div className="muted small">{desc}</div>
                    </div>
                    {kind === 'density' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['comfortable', 'compact'] as const).map((d) => (
                          <button
                            key={d}
                            className={`btn small ${settings.density === d ? 'accent' : 'subtle'}`}
                            onClick={() => applyNow({ density: d })}
                          >
                            {d === 'comfortable' ? 'Comfortable' : 'Compact'}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="chip">English</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === 'safety' && (
            <div className="card">
              <h3>Safety & approvals</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Require approval for admin tools</div>
                  <div className="muted small">Ban, run_command and backups always wait for a human click</div>
                </div>
                <Toggle
                  on={settings.requireApproval}
                  onChange={(v) => applyNow({ requireApproval: v })}
                />
              </div>
              <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: 16, marginTop: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 10 }}>run_command allowlist</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {draft.allowlist.map((c) => (
                    <span key={c} className="chip">
                      {c}
                      <button
                        style={{ marginLeft: 6, opacity: 0.7 }}
                        onClick={() =>
                          setDraft({ ...draft, allowlist: draft.allowlist.filter((x) => x !== c) })
                        }
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <input
                      className="input"
                      style={{ width: 150, height: 28 }}
                      placeholder="add command…"
                      value={newAllow}
                      onChange={(e) => setNewAllow(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newAllow.trim()) {
                          setDraft({ ...draft, allowlist: [...draft.allowlist, newAllow.trim()] })
                          setNewAllow('')
                        }
                      }}
                    />
                  </span>
                </div>
                <p className="muted small" style={{ marginTop: 12, lineHeight: 1.6 }}>
                  Enforced inside the PaperPilot core: anything not on this list is refused — for
                  you and for Copilot alike. Press Save to apply changes.
                </p>
                <button className="btn accent" style={{ marginTop: 12 }} onClick={saveDraft}>
                  Save
                </button>
                {savedNote && <span className="small muted" style={{ marginLeft: 10 }}>{savedNote}</span>}
              </div>
            </div>
          )}

          {section === 'about' && (
            <div className="card">
              <h3>About</h3>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
                <div className="app-icon" style={{ width: 44, height: 44, fontSize: 22 }}>
                  P
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>PaperPilot Studio</div>
                  <div className="muted small">Companion app for PaperPilot v1.1.0</div>
                </div>
              </div>
              {(
                [
                  ['Version', '1.20.0'],
                  ['Tools', '13 · 3 permission tiers'],
                  ['Audit log', 'Always on'],
                  ['Design', 'Fluent v2 — Figma']
                ] as const
              ).map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '9px 0',
                    borderTop: '1px solid var(--stroke)'
                  }}
                >
                  <span className="muted">{k}</span>
                  <strong>{v}</strong>
                </div>
              ))}
              <p className="muted small" style={{ marginTop: 14, lineHeight: 1.6 }}>
                Studio hosts the PaperPilot core in-process: the same code, the same guards, the
                same audit log as the MCP server on GitHub.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
