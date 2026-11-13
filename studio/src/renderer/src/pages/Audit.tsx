import { useEffect, useState } from 'react'
import { fmtTime } from '../lib'

interface AuditRow {
  ts: string
  tool: string
  args: string
  outcome: string
  tier: string
  detail?: string
}

type Filter = 'all' | 'allowed' | 'denied'

export default function Audit(): React.JSX.Element {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    window.studio
      .audit(200)
      .then((r) => setRows(r as AuditRow[]))
      .catch(() => undefined)
  }, [])

  const shown = filter === 'all' ? rows : rows.filter((r) => r.outcome === filter)

  const exportJsonl = (): void => {
    const text = rows
      .slice()
      .reverse()
      .map((r) => JSON.stringify(r))
      .join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'paperpilot-audit.jsonl'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="page-title">Audit Log</div>
      <p className="page-sub">
        Every tool run through the PaperPilot core — recorded in an append-only JSONL log
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        {(
          [
            ['all', 'All'],
            ['allowed', 'Allowed'],
            ['denied', 'Denied']
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className="chip"
            style={
              filter === id
                ? { background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'transparent' }
                : undefined
            }
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn subtle small" onClick={exportJsonl} disabled={rows.length === 0}>
          Export .jsonl
        </button>
      </div>
      <div className="card">
        {shown.length === 0 ? (
          <p className="muted">
            No entries yet. The moment any tool runs — from the Tools page, a player action, or
            Copilot — it is written here, allowed or denied.
          </p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>TIME</th>
                <th>TOOL</th>
                <th>ARGS</th>
                <th>RESULT</th>
                <th>DETAIL</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {fmtTime(r.ts)}
                  </td>
                  <td>
                    <strong>{r.tool}</strong>
                  </td>
                  <td className="muted" style={{ maxWidth: 300, wordBreak: 'break-all' }}>
                    {r.args}
                  </td>
                  <td>
                    <span className={`pill ${r.outcome === 'denied' ? 'red' : 'green'}`}>
                      {r.outcome === 'denied' ? 'Denied' : 'Allowed'}
                    </span>
                  </td>
                  <td className="muted" style={{ maxWidth: 340 }}>
                    {r.detail ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        Denied calls are logged too — for example a run_command that is not on the allowlist
        stops here, whoever asked for it.
      </p>
    </div>
  )
}
