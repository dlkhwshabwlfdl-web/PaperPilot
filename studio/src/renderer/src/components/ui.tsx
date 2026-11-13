import type { ReactNode } from 'react'

export function Modal({
  title,
  children,
  onClose
}: {
  title: string
  children: ReactNode
  onClose: () => void
}): React.JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel
}: {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="muted" style={{ lineHeight: 1.6, marginBottom: 18 }}>
        {body}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn subtle" onClick={onCancel}>
          Cancel
        </button>
        <button className={`btn ${danger ? 'danger' : 'accent'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function ResultBox({ text, error }: { text?: string; error?: string }): React.JSX.Element {
  return <div className="result-box">{error ? `Error: ${error}` : text}</div>
}

export function Toggle({
  on,
  onChange
}: {
  on: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <button
      className={`toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
    />
  )
}
