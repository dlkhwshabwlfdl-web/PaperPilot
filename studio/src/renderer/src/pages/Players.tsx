import { useState } from 'react'
import type { ServerStatus, StudioSettings } from '../../../preload/index'
import { ConfirmModal, ResultBox } from '../components/ui'

type Pending =
  | { kind: 'kick' | 'ban' | 'whitelist_add' | 'whitelist_remove'; player: string }
  | null

export default function Players({
  status,
  settings
}: {
  status: ServerStatus | null
  settings: StudioSettings
}): React.JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)
  const [info, setInfo] = useState<{ text?: string; error?: string } | null>(null)
  const [infoBusy, setInfoBusy] = useState(false)
  const [pending, setPending] = useState<Pending>(null)
  const [actionResult, setActionResult] = useState<{ text?: string; error?: string } | null>(null)

  const players = status?.players ?? []

  const select = async (name: string): Promise<void> => {
    setSelected(name)
    setActionResult(null)
    setInfoBusy(true)
    const r = await window.studio.callTool('player_info', { player: name })
    setInfo(r.ok ? { text: r.text } : { error: r.error })
    setInfoBusy(false)
  }

  const runPending = async (): Promise<void> => {
    if (!pending) return
    const r = await window.studio.callTool(pending.kind, { player: pending.player })
    setActionResult(r.ok ? { text: r.text } : { error: r.error })
    setPending(null)
  }

  const confirmCopy: Record<string, { title: string; body: string; label: string; danger?: boolean }> = {
    kick: {
      title: 'Kick player',
      body: `Kick ${pending?.player} from the server? They can rejoin right away.`,
      label: 'Kick'
    },
    ban: {
      title: 'Ban player',
      body: `Ban ${pending?.player} from the server? This is an admin action and is written to the audit log.`,
      label: 'Ban player',
      danger: true
    },
    whitelist_add: {
      title: 'Add to whitelist',
      body: `Add ${pending?.player} to the server whitelist?`,
      label: 'Add'
    },
    whitelist_remove: {
      title: 'Remove from whitelist',
      body: `Remove ${pending?.player} from the server whitelist?`,
      label: 'Remove'
    }
  }

  return (
    <div>
      <div className="page-title">Players</div>
      <p className="page-sub">
        {status?.online
          ? `${players.length} online now — details from player_info, actions run through the same guarded tool path`
          : 'Server offline — connect to see who is playing'}
      </p>
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <h3>Online players</h3>
          {players.length === 0 ? (
            <p className="muted">Nobody is online right now.</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>PLAYER</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr
                    key={p}
                    onClick={() => select(p)}
                    style={{
                      cursor: 'pointer',
                      background: selected === p ? 'var(--card-hover)' : 'transparent'
                    }}
                  >
                    <td>
                      <span
                        className="avatar"
                        style={{ width: 28, height: 28, fontSize: 12, marginRight: 10 }}
                      >
                        {p.charAt(0).toUpperCase()}
                      </span>
                      <strong>{p}</strong>
                    </td>
                    <td>
                      <span className="pill green">Online</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>{selected ?? 'Player details'}</h3>
          {!selected && <p className="muted small">Select a player to load player_info.</p>}
          {selected && infoBusy && <p className="muted small">Loading…</p>}
          {selected && !infoBusy && info && <ResultBox text={info.text} error={info.error} />}
          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <button
                className="btn subtle"
                onClick={() => setPending({ kind: 'kick', player: selected })}
              >
                Kick player
              </button>
              <button
                className="btn subtle"
                onClick={() => setPending({ kind: 'whitelist_add', player: selected })}
              >
                Add to whitelist
              </button>
              <button
                className="btn subtle"
                onClick={() => setPending({ kind: 'whitelist_remove', player: selected })}
              >
                Remove from whitelist
              </button>
              <button
                className="btn danger"
                onClick={() => setPending({ kind: 'ban', player: selected })}
              >
                Ban player
              </button>
            </div>
          )}
          {actionResult && (
            <div style={{ marginTop: 14 }}>
              <ResultBox text={actionResult.text} error={actionResult.error} />
            </div>
          )}
          {settings.requireApproval && (
            <p className="muted small" style={{ marginTop: 12 }}>
              Ban is an admin action — Studio asks before it runs.
            </p>
          )}
        </div>
      </div>
      {pending && (
        <ConfirmModal
          title={confirmCopy[pending.kind].title}
          body={confirmCopy[pending.kind].body}
          confirmLabel={confirmCopy[pending.kind].label}
          danger={confirmCopy[pending.kind].danger}
          onConfirm={runPending}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
