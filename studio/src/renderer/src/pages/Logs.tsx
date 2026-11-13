import { useCallback, useEffect, useState } from 'react'
import { logLevel, type LogLevel } from '../lib'

type Filter = 'ALL' | LogLevel

export default function Logs(): React.JSX.Element {
  const [lines, setLines] = useState<string[]>([])
  const [filter, setFilter] = useState<Filter>('ALL')
  const [search, setSearch] = useState('')
  const [auto, setAuto] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    window.studio
      .callTool('read_logs', { lines: 300, ...(search.trim() ? { search: search.trim() } : {}) })
      .then((r) => {
        if (r.ok && r.text !== undefined) {
          setLines(r.text.split('\n'))
          setError(null)
        } else {
          setError(r.error ?? 'Failed to read logs')
        }
      })
      .catch(() => setError('Bridge unavailable'))
  }, [search])

  useEffect(() => {
    load()
    if (!auto) return
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [load, auto])

  const shown = filter === 'ALL' ? lines : lines.filter((l) => logLevel(l) === filter)
  const chips: { id: Filter; label: string }[] = [
    { id: 'ALL', label: 'All' },
    { id: 'INFO', label: 'Info' },
    { id: 'WARN', label: 'Warnings' },
    { id: 'ERROR', label: 'Errors' }
  ]

  return (
    <div>
      <div className="page-title">Logs</div>
      <p className="page-sub">latest.log — live tail from read_logs, newest at the bottom</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        {chips.map((c) => (
          <button
            key={c.id}
            className={`chip`}
            style={
              filter === c.id
                ? { background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'transparent' }
                : undefined
            }
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </button>
        ))}
        <input
          className="input"
          style={{ width: 260, height: 32, marginLeft: 8 }}
          placeholder="Search the log…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Auto-refresh
        </label>
        <button className="btn subtle small" onClick={load}>
          Refresh
        </button>
      </div>
      {error ? (
        <div className="card">
          <p className="error-text">{error}</p>
          <p className="muted small" style={{ marginTop: 8 }}>
            Studio reads the log through the PaperPilot core — set the server folder in Settings
            so it can find logs/latest.log.
          </p>
        </div>
      ) : (
        <div className="term" style={{ height: 560 }}>
          {shown.map((l, i) => {
            const lvl = logLevel(l)
            return (
              <div key={i}>
                <span className={lvl === 'WARN' ? 'lvl-warn' : lvl === 'ERROR' ? 'lvl-error' : ''}>
                  {l}
                </span>
              </div>
            )
          })}
          {shown.length === 0 && <div className="muted">No lines match this filter.</div>}
        </div>
      )}
      <p className="muted small" style={{ marginTop: 10 }}>
        Showing up to 300 lines · refreshes every 5 seconds when auto-refresh is on
      </p>
    </div>
  )
}
