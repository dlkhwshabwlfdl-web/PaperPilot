import { useCallback, useEffect, useRef, useState } from 'react'
import type { ServerStatus, StudioSettings } from '../../preload/index'
import { accentTextFor } from './lib'
import Overview from './pages/Overview'
import Tools from './pages/Tools'
import Players from './pages/Players'
import Backups from './pages/Backups'
import Logs from './pages/Logs'
import Audit from './pages/Audit'
import Copilot from './pages/Copilot'
import SettingsPage from './pages/SettingsPage'

export type Page =
  | 'overview'
  | 'tools'
  | 'players'
  | 'backups'
  | 'logs'
  | 'audit'
  | 'copilot'
  | 'settings'

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '▦' },
  { id: 'tools', label: 'Tools', icon: '⚙' },
  { id: 'players', label: 'Players', icon: '👥' },
  { id: 'backups', label: 'Backups', icon: '🗄' },
  { id: 'logs', label: 'Logs', icon: '☰' },
  { id: 'audit', label: 'Audit Log', icon: '✓' },
  { id: 'copilot', label: 'AI Copilot', icon: '✦' },
  { id: 'settings', label: 'Settings', icon: '⛭' }
]

function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('overview')
  const [settings, setSettings] = useState<StudioSettings | null>(null)
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [history, setHistory] = useState<number[]>([])
  const statusRef = useRef<ServerStatus | null>(null)

  const poll = useCallback(async () => {
    try {
      const s = await window.studio.status()
      statusRef.current = s
      setStatus(s)
      if (s.online && s.tps && s.tps.length > 0) {
        setHistory((h) => [...h.slice(-29), s.tps![0]])
      }
    } catch {
      setStatus({ online: false, raw: '', error: 'Bridge unavailable' })
    }
  }, [])

  useEffect(() => {
    window.studio.getSettings().then(setSettings).catch(() => undefined)
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [poll])

  useEffect(() => {
    if (!settings) return
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.style.setProperty('--accent', settings.accent)
    document.documentElement.style.setProperty(
      '--accent-text',
      accentTextFor(settings.accent)
    )
  }, [settings])

  const saveSettings = useCallback(async (next: StudioSettings) => {
    const saved = await window.studio.setSettings(next)
    setSettings(saved)
    poll()
  }, [poll])

  const online = status?.online ?? false

  return (
    <div className="app">
      <aside className="nav">
        <div className="app-row">
          <div className="app-icon">P</div>
          <div className="app-name">PaperPilot Studio</div>
        </div>
        <div className="nav-search">Search tools, players…</div>
        <nav className="nav-items">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? 'active' : ''}`}
              onClick={() => setPage(n.id)}
            >
              <span style={{ width: 18, textAlign: 'center' }}>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="nav-spacer" />
        <div className="nav-status">
          <div className="status-line">
            <span
              className="dot"
              style={{ background: online ? 'var(--green)' : 'var(--red)' }}
            />
            {status === null ? 'Connecting…' : online ? 'Server online' : 'Server offline'}
          </div>
          <div className="status-sub">
            {online && status
              ? `TPS ${status.tps?.[0] ?? '—'} · MSPT ${status.mspt ?? '—'} · ${status.playersOnline ?? 0} players`
              : status?.error
                ? 'Check Settings → Connection'
                : 'Trying to reach the server…'}
          </div>
          <div className="profile-row">
            <span className="avatar" style={{ width: 30, height: 30, fontSize: 13 }}>
              A
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Owner</div>
              <div className="muted" style={{ fontSize: 11 }}>
                PaperPilot core · admin tier
              </div>
            </div>
          </div>
        </div>
      </aside>
      <div className="main">
        <div className="titlebar">
          <div className="win-controls">
            <button className="win-btn" onClick={() => window.studio.minimize()}>
              —
            </button>
            <button className="win-btn" onClick={() => window.studio.maximize()}>
              □
            </button>
            <button className="win-btn close" onClick={() => window.studio.close()}>
              ✕
            </button>
          </div>
        </div>
        <div className="content">
          {page === 'overview' && (
            <Overview status={status} history={history} go={setPage} refresh={poll} />
          )}
          {page === 'tools' && settings && <Tools settings={settings} />}
          {page === 'players' && settings && <Players status={status} settings={settings} />}
          {page === 'backups' && settings && <Backups settings={settings} />}
          {page === 'logs' && <Logs />}
          {page === 'audit' && <Audit />}
          {page === 'copilot' && settings && <Copilot settings={settings} />}
          {page === 'settings' && settings && (
            <SettingsPage settings={settings} onSave={saveSettings} status={status} />
          )}
          {!settings && page !== 'overview' && <p className="muted">Loading settings…</p>}
        </div>
      </div>
    </div>
  )
}

export default App
