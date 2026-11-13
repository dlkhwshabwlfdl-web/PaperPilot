import { useCallback, useEffect, useState } from 'react'
import type { StudioSettings } from '../../../preload/index'
import { fmtBytes, fmtDateTime } from '../lib'
import { ConfirmModal, ResultBox } from '../components/ui'

interface BackupEntry {
  name: string
  sizeBytes: number
  modified: string
}

export default function Backups({ settings }: { settings: StudioSettings }): React.JSX.Element {
  const [entries, setEntries] = useState<BackupEntry[]>([])
  const [total, setTotal] = useState(0)
  const [dir, setDir] = useState('')
  const [result, setResult] = useState<{ text?: string; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'prepare' | 'rotate' | null>(null)

  const load = useCallback(() => {
    window.studio
      .backups()
      .then((r) => {
        setEntries(r.entries)
        setTotal(r.totalBytes)
        setDir(r.dir)
      })
      .catch(() => undefined)
  }, [])

  useEffect(load, [load, settings.serverDir])

  const prepare = async (): Promise<void> => {
    setConfirm(null)
    setBusy(true)
    const r = await window.studio.callTool('backup_world', {})
    setResult(r.ok ? { text: r.text } : { error: r.error })
    setBusy(false)
    load()
  }

  const rotatePreview = async (): Promise<void> => {
    setBusy(true)
    const r = await window.studio.callTool('rotate_backups', { keep: 7, dryRun: true })
    setResult(r.ok ? { text: `Dry run — nothing deleted:\n${r.text}` } : { error: r.error })
    setBusy(false)
  }

  const rotate = async (): Promise<void> => {
    setConfirm(null)
    setBusy(true)
    const r = await window.studio.callTool('rotate_backups', { keep: 7 })
    setResult(r.ok ? { text: r.text } : { error: r.error })
    setBusy(false)
    load()
  }

  return (
    <div>
      <div className="page-title">Backups</div>
      <p className="page-sub">
        The backup folder of your server, read live from disk — rotation keeps the newest 7
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button
          className="btn accent"
          disabled={busy}
          onClick={() => (settings.requireApproval ? setConfirm('prepare') : prepare())}
        >
          Prepare world backup
        </button>
        <button className="btn subtle" disabled={busy} onClick={rotatePreview}>
          Rotate — dry run
        </button>
        <button
          className="btn subtle"
          disabled={busy}
          onClick={() => (settings.requireApproval ? setConfirm('rotate') : rotate())}
        >
          Rotate now (keep 7)
        </button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <h3>Backups on disk</h3>
          {entries.length === 0 ? (
            <p className="muted">
              No backups found in <code>{dir}</code> yet. “Prepare world backup” runs save-all /
              save-off / save-on on the server so your backup tooling can copy the world safely.
            </p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>SIZE</th>
                  <th>MODIFIED</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.name}>
                    <td>
                      <strong>{e.name}</strong>{' '}
                      {i === 0 && <span className="pill green">LATEST</span>}
                    </td>
                    <td>{fmtBytes(e.sizeBytes)}</td>
                    <td className="muted">{fmtDateTime(e.modified)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>Storage</h3>
          <div className="stat-value">{fmtBytes(total)}</div>
          <p className="muted small">
            across {entries.length} backup{entries.length === 1 ? '' : 's'} in
          </p>
          <p className="small" style={{ wordBreak: 'break-all', marginTop: 4 }}>
            {dir}
          </p>
          <p className="muted small" style={{ marginTop: 14, lineHeight: 1.6 }}>
            Rotation policy: keep the newest 7. rotate_backups always supports a dry run first,
            so you see exactly what would be deleted.
          </p>
          {result && (
            <div style={{ marginTop: 14 }}>
              <ResultBox text={result.text} error={result.error} />
            </div>
          )}
        </div>
      </div>
      {confirm === 'prepare' && (
        <ConfirmModal
          title="Prepare world backup"
          body="This runs save-all, save-off and save-on on the live server (an admin tool). Saving pauses briefly while it is off."
          confirmLabel="Run backup_world"
          onConfirm={prepare}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'rotate' && (
        <ConfirmModal
          title="Rotate backups"
          body="This deletes every backup older than the newest 7 in the backup folder. Consider a dry run first if you have not seen the list."
          confirmLabel="Delete old backups"
          danger
          onConfirm={rotate}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
