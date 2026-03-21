import { useState } from 'react'
import { useDatabase, useDatabaseDispatch } from '../../data/store.jsx'
import { DEFAULT_BLOCKLIST } from '../../data/blocklist.js'
import Button from '../../components/Button.jsx'

export default function BlocklistManager() {
  const { dbBlocklist } = useDatabase()
  const dispatch = useDatabaseDispatch()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [msg, setMsg] = useState(null)

  function add() {
    const val = input.trim().toLowerCase()
    if (!val) return
    if (dbBlocklist.includes(val)) { setMsg(`"${val}" is already in the blocklist.`); return }
    dispatch({ type: 'SET_BLOCKLIST', dbBlocklist: [...dbBlocklist, val] })
    setInput('')
    setMsg(`"${val}" added.`)
  }

  function remove(i) {
    const next = [...dbBlocklist]
    next.splice(i, 1)
    dispatch({ type: 'SET_BLOCKLIST', dbBlocklist: next })
  }

  function reset() {
    if (!confirm('Reset blocklist to defaults? Your custom additions will be lost.')) return
    dispatch({ type: 'SET_BLOCKLIST', dbBlocklist: [...DEFAULT_BLOCKLIST] })
    setMsg(`Reset to ${DEFAULT_BLOCKLIST.length} defaults.`)
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: open ? '10px' : 0 }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>Chain Blocklist</div>
          <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Businesses matching these terms are skipped automatically on import</div>
        </div>
        <Button size="sm" style={{ marginLeft: 'auto' }} onClick={() => setOpen(o => !o)}>
          Manage {open ? '▴' : '▾'}
        </Button>
      </div>

      {open && (
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' }}>
            {dbBlocklist.length} terms — case-insensitive partial match.
          </div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            <input type="text" value={input} placeholder="Add term (e.g. Subway)"
              style={{ flex: 1 }} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && add()} />
            <Button size="sm" variant="primary" onClick={add}>Add</Button>
            <Button size="sm" onClick={reset}>Reset to defaults</Button>
          </div>
          {msg && <div style={{ fontSize: '12px', color: 'var(--green-text)', marginBottom: '6px' }}>{msg}</div>}
          <div style={{ maxHeight: 'min(200px, 40vh)', overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            {dbBlocklist.map((term, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderBottom: '0.5px solid var(--border)', fontSize: '13px' }}>
                <span>{term}</span>
                <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
