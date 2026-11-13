import { useEffect, useState } from 'react'
import type { StudioSettings, ToolInfo } from '../../../preload/index'
import { Modal, ResultBox } from '../components/ui'

const TIER_ORDER = ['readonly', 'operator', 'admin'] as const
const TIER_LABEL: Record<string, string> = {
  readonly: 'READ-ONLY',
  operator: 'OPERATOR',
  admin: 'ADMIN'
}
const TIER_PILL: Record<string, string> = {
  readonly: 'green',
  operator: 'yellow',
  admin: 'red'
}

export default function Tools({ settings }: { settings: StudioSettings }): React.JSX.Element {
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [active, setActive] = useState<ToolInfo | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ text?: string; error?: string } | null>(null)

  useEffect(() => {
    window.studio.listTools().then(setTools).catch(() => undefined)
  }, [])

  const open = (t: ToolInfo): void => {
    setActive(t)
    setValues({})
    setResult(null)
  }

  const run = async (): Promise<void> => {
    if (!active) return
    const args: Record<string, unknown> = {}
    for (const a of active.args) {
      const raw = (values[a.name] ?? '').trim()
      if (raw === '') continue
      args[a.name] = a.kind === 'number' ? Number(raw) : a.kind === 'boolean' ? raw === 'true' : raw
    }
    setBusy(true)
    const r = await window.studio.callTool(active.name, args)
    setResult(r.ok ? { text: r.text } : { error: r.error })
    setBusy(false)
  }

  return (
    <div>
      <div className="page-title">Tools</div>
      <p className="page-sub">
        All {tools.length} PaperPilot tools — the same guarded path the AI uses. Admin tools
        {settings.requireApproval ? ' ask for confirmation first.' : ' run immediately (approval is off in Settings).'}
      </p>
      {TIER_ORDER.map((tier) => {
        const group = tools.filter((t) => t.tier === tier)
        if (group.length === 0) return null
        return (
          <div key={tier} style={{ marginBottom: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span className={`pill ${TIER_PILL[tier]}`}>{TIER_LABEL[tier]}</span>
              <span className="muted small">{group.length} tools</span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {group.map((t) => (
                <div key={t.name} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{t.name}</div>
                  <p className="muted small" style={{ lineHeight: 1.55, flex: 1 }}>
                    {t.description}
                  </p>
                  <button
                    className="btn subtle small"
                    style={{ marginTop: 14, alignSelf: 'flex-start' }}
                    onClick={() => open(t)}
                  >
                    Run…
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {active && (
        <Modal title={active.name} onClose={() => setActive(null)}>
          <p className="muted small" style={{ lineHeight: 1.6, marginBottom: 14 }}>
            {active.description}
          </p>
          {active.tier === 'admin' && settings.requireApproval && (
            <p
              className="small"
              style={{
                background: 'rgba(252,209,63,0.12)',
                border: '1px solid var(--stroke)',
                borderRadius: 6,
                padding: '9px 12px',
                marginBottom: 14
              }}
            >
              This is an <strong>admin</strong> tool. Pressing Run is your approval — the call
              and its outcome are written to the audit log.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {active.args.map((a) => (
              <label key={a.name} style={{ display: 'block' }}>
                <span className="small" style={{ fontWeight: 600 }}>
                  {a.name}
                  {a.required ? '' : ' (optional)'}
                </span>
                {a.kind === 'boolean' ? (
                  <select
                    className="input"
                    style={{ marginTop: 6 }}
                    value={values[a.name] ?? ''}
                    onChange={(e) => setValues({ ...values, [a.name]: e.target.value })}
                  >
                    <option value="">— default —</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    className="input"
                    style={{ marginTop: 6 }}
                    type={a.kind === 'number' ? 'number' : 'text'}
                    placeholder={a.description}
                    value={values[a.name] ?? ''}
                    onChange={(e) => setValues({ ...values, [a.name]: e.target.value })}
                  />
                )}
                {a.description && (
                  <span className="muted small" style={{ display: 'block', marginTop: 4 }}>
                    {a.description}
                  </span>
                )}
              </label>
            ))}
          </div>
          {result && (
            <div style={{ marginTop: 16 }}>
              <ResultBox text={result.text} error={result.error} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button className="btn subtle" onClick={() => setActive(null)}>
              Close
            </button>
            <button className="btn accent" onClick={run} disabled={busy}>
              {busy ? 'Running…' : 'Run'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
