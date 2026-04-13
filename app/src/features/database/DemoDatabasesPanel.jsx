import { useState, useEffect, useCallback, useRef } from 'react'
import { useDatabase } from '../../data/store.jsx'
import { fetchBatchStatus, queueBatch, loadDemo } from '../../lib/demoBuilder.js'
import Button from '../../components/Button.jsx'

const POLL_INTERVAL = 10_000

const STATUS_LABEL = {
  no_snapshot: '—',
  queued:      'Queued',
  processing:  'Generating…',
  done:        'Ready ✓',
  failed:      'Failed',
}

const STATUS_STYLE = {
  no_snapshot: { background: 'var(--bg3)',      color: 'var(--text3)' },
  queued:      { background: 'var(--yellow-bg)', color: 'var(--yellow-text)' },
  processing:  { background: 'var(--yellow-bg)', color: 'var(--yellow-text)' },
  done:        { background: 'var(--green-bg)',  color: 'var(--green-text)' },
  failed:      { background: 'var(--red-bg)',    color: 'var(--red-text)' },
}

function StatusBadge({ status, title }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.no_snapshot
  return (
    <span title={title}
      style={{ ...s, padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 500, cursor: title ? 'help' : 'default' }}>
      {STATUS_LABEL[status] || '—'}
    </span>
  )
}

function truncUrl(url, max = 42) {
  if (!url || url.length <= max) return url
  return url.slice(0, 22) + '…' + url.slice(-(max - 23))
}

export default function DemoDatabasesPanel() {
  const { dbRecords } = useDatabase()
  const [open,       setOpen]       = useState(false)
  const [statuses,   setStatuses]   = useState({})   // { [id]: status_result }
  const [queuing,    setQueuing]    = useState(false)
  const [queueMsg,   setQueueMsg]   = useState('')
  const [loadingId,  setLoadingId]  = useState(null)
  const [loadMsgs,   setLoadMsgs]   = useState({})   // { [id]: string }
  const [areaFilter, setAreaFilter] = useState('')
  const pollRef = useRef(null)

  // Records that have a menu link — these are the ones we can generate
  const menuRecords = dbRecords.filter(r => r.mn)

  const visible = areaFilter
    ? menuRecords.filter(r => (r.ci || '').toLowerCase().includes(areaFilter.toLowerCase()))
    : menuRecords

  // Are any visible rows still in flight?
  const needsPoll = visible.some(r => {
    const s = statuses[r.id]?.status
    return s === 'queued' || s === 'processing'
  })

  const poll = useCallback(async () => {
    if (!visible.length) return
    try {
      const results = await fetchBatchStatus(visible.map(r => r.id))
      const map = {}
      results.forEach(r => { map[r.pt_record_id] = r })
      setStatuses(prev => ({ ...prev, ...map }))
    } catch { /* silent — transient network errors shouldn't crash the panel */ }
  }, [visible])

  // Fetch once when panel opens; statuses render as "—" briefly until the
  // first poll resolves (typically <1s on local network).
  // poll() is async — setStatuses is only called after awaiting fetchBatchStatus,
  // so there is no synchronous cascading render; the lint rule is a false positive here.
  useEffect(() => {
    if (!open) return
    poll() // eslint-disable-line react-hooks/set-state-in-effect
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Recurring poll while rows are in-flight
  useEffect(() => {
    clearInterval(pollRef.current)
    if (open && needsPoll) {
      pollRef.current = setInterval(poll, POLL_INTERVAL)
    }
    return () => clearInterval(pollRef.current)
  }, [open, needsPoll, poll])

  // ── Actions ────────────────────────────────────────────────────────────────

  function flashQueueMsg(msg) {
    setQueueMsg(msg)
    setTimeout(() => setQueueMsg(''), 4000)
  }

  async function handleQueueAll() {
    const toQueue = visible
      .filter(r => {
        const s = statuses[r.id]?.status
        return !s || s === 'no_snapshot' || s === 'failed'
      })
      .map(r => ({ pt_record_id: r.id, name: r.n, menu_url: r.mn, restaurant_type: r.ty || '' }))

    if (!toQueue.length) { flashQueueMsg('Nothing new to queue.'); return }

    setQueuing(true)
    try {
      const res = await queueBatch(toQueue, true)
      flashQueueMsg(
        `Queued ${res.queued}${res.skipped ? `, skipped ${res.skipped} already ready` : ''}.`
      )
      // Optimistic update
      const updates = {}
      toQueue.forEach(p => { updates[p.pt_record_id] = { pt_record_id: p.pt_record_id, status: 'queued' } })
      setStatuses(prev => ({ ...prev, ...updates }))
    } catch {
      flashQueueMsg('Queue request failed — check your connection.')
    }
    setQueuing(false)
  }

  async function handleQueueSingle(r) {
    setStatuses(prev => ({ ...prev, [r.id]: { pt_record_id: r.id, status: 'queued' } }))
    try {
      await queueBatch(
        [{ pt_record_id: r.id, name: r.n, menu_url: r.mn, restaurant_type: r.ty || '' }],
        false,
      )
    } catch {
      setStatuses(prev => ({ ...prev, [r.id]: { pt_record_id: r.id, status: 'failed', error: 'Queue request failed' } }))
    }
  }

  async function handleLoadDemo(r) {
    setLoadingId(r.id)
    try {
      const { ok, status, data } = await loadDemo(r.id)
      const msg = ok
        ? 'Queued for deployment ✓'
        : status === 404
          ? 'No demo built yet'
          : data.error || 'Load failed'
      setLoadMsgs(prev => ({ ...prev, [r.id]: msg }))
      setTimeout(() => setLoadMsgs(prev => { const n = { ...prev }; delete n[r.id]; return n }), 4000)
    } catch {
      setLoadMsgs(prev => ({ ...prev, [r.id]: 'Network error' }))
      setTimeout(() => setLoadMsgs(prev => { const n = { ...prev }; delete n[r.id]; return n }), 3000)
    }
    setLoadingId(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>

      {/* Header / toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                 display: 'flex', alignItems: 'center', gap: '7px', width: '100%', textAlign: 'left' }}>
        <span style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1 }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Demo Databases</span>
        {menuRecords.length > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--text3)', background: 'var(--bg3)',
                         padding: '1px 7px', borderRadius: '10px', fontWeight: 400 }}>
            {menuRecords.length} with menu
          </span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: '12px' }}>

          {/* Controls row */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
            <input
              type="text" placeholder="Filter by city…"
              value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
              style={{ fontSize: '12px', padding: '4px 8px', width: '150px' }}
            />
            <Button size="sm" variant="primary" onClick={handleQueueAll} disabled={queuing || !visible.length}>
              {queuing ? 'Queuing…' : 'Queue All with Menus'}
            </Button>
            {queueMsg && (
              <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{queueMsg}</span>
            )}
          </div>

          {visible.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text3)', padding: '10px 0' }}>
              {menuRecords.length === 0 ? 'No records have a menu link.' : 'No results for this city filter.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ color: 'var(--text3)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '4px 8px 7px 0', fontWeight: 500 }}>Name</th>
                    <th style={{ padding: '4px 8px 7px',   fontWeight: 500 }}>Menu URL</th>
                    <th style={{ padding: '4px 8px 7px',   fontWeight: 500 }}>Status</th>
                    <th style={{ padding: '4px 0   7px 8px', fontWeight: 500, width: '90px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(r => {
                    const entry  = statuses[r.id]
                    const status = entry?.status || 'no_snapshot'
                    const msg    = loadMsgs[r.id]
                    const isLoading = loadingId === r.id

                    return (
                      <tr key={r.id} style={{ borderBottom: '0.5px solid var(--border)' }}>

                        <td style={{ padding: '8px 8px 8px 0', fontWeight: 500, color: 'var(--text)',
                                     maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.n}
                        </td>

                        <td style={{ padding: '8px', color: 'var(--text3)',
                                     maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <a href={r.mn} target="_blank" rel="noreferrer"
                             style={{ color: 'var(--blue-text)', textDecoration: 'none' }}>
                            {truncUrl(r.mn)}
                          </a>
                        </td>

                        <td style={{ padding: '8px' }}>
                          <StatusBadge status={status} title={status === 'failed' ? entry?.error : undefined} />
                        </td>

                        <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {msg ? (
                            <span style={{ fontSize: '11px',
                                           color: msg.includes('✓') ? 'var(--green-text)' : 'var(--red-text)' }}>
                              {msg}
                            </span>
                          ) : status === 'done' ? (
                            <Button size="sm" onClick={() => handleLoadDemo(r)} disabled={isLoading}>
                              {isLoading ? '…' : 'Load Demo'}
                            </Button>
                          ) : (status === 'no_snapshot' || status === 'failed') ? (
                            <Button size="sm" onClick={() => handleQueueSingle(r)}>
                              {status === 'failed' ? 'Retry' : 'Generate'}
                            </Button>
                          ) : null /* queued / processing: spinner implied by badge */}
                        </td>

                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
