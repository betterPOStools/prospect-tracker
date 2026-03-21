import { useState } from 'react'
import { useSnapshots } from '../../hooks/useSnapshots.js'
import Button from '../../components/Button.jsx'

export default function SnapshotManager() {
  const { takeSnapshot, restoreSnapshot, deleteSnapshot, getSnapshots } = useSnapshots()
  const [open, setOpen] = useState(false)
  const [msg, setMsg]   = useState(null)
  const [, forceUpdate] = useState(0)

  function refresh() { forceUpdate(n => n + 1) }

  function handleSave() {
    const ok = takeSnapshot('manual')
    if (!ok) { setMsg({ text: 'Nothing to snapshot — no data yet.', type: 'err' }); return }
    setMsg({ text: 'Snapshot saved.', type: 'ok' })
    if (!open) setOpen(true)
    refresh()
  }

  function handleRestore(idx) {
    restoreSnapshot(idx)
    refresh()
  }

  function handleDelete(idx) {
    deleteSnapshot(idx)
    refresh()
  }

  const snaps = getSnapshots()

  return (
    <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>Database Snapshots</div>
          <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Auto-saved before every import · Restore any point instantly</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <Button size="sm" variant="primary" onClick={handleSave}>Save Snapshot</Button>
          <Button size="sm" onClick={() => { setOpen(o => !o); refresh() }}>History {open ? '▴' : '▾'}</Button>
        </div>
      </div>

      {msg && <div style={{ fontSize: '12px', marginTop: '6px', color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)' }}>{msg.text}</div>}

      {open && (
        <div style={{ marginTop: '12px' }}>
          {snaps.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text2)' }}>
              No snapshots yet — taken automatically before every import, or click Save Snapshot anytime.
            </div>
          ) : snaps.map(s => (
            <div key={s.idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderBottom: '0.5px solid var(--border)', fontSize: '13px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{s.label}</div>
                <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{new Date(s.ts).toLocaleString()} · {s.age}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                  {s.records} DB · {s.clusters} zones{s.leads ? ` · ${s.leads} leads` : ''}{s.canvass ? ` · ${s.canvass} canvass` : ''} · {s.size}KB
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <Button size="sm" variant="primary" onClick={() => handleRestore(s.idx)}>Restore</Button>
                <Button size="sm" variant="danger"  onClick={() => handleDelete(s.idx)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
