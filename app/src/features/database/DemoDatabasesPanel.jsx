import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useDatabase } from '../../data/store.jsx'
import { fetchBatchStatus, queueBatch, loadDemo } from '../../lib/demoBuilder.js'
import Button from '../../components/Button.jsx'

const POLL_INTERVAL = 10_000

const STATUS_LABEL = {
  no_snapshot: 'Not started',
  queued:      'Queued',
  processing:  'Generating…',
  done:        'Ready ✓',
  failed:      'Failed',
}

const STATUS_STYLE = {
  no_snapshot: { background: 'var(--bg3)',       color: 'var(--text3)' },
  queued:      { background: 'var(--yellow-bg)', color: 'var(--yellow-text)' },
  processing:  { background: 'var(--yellow-bg)', color: 'var(--yellow-text)' },
  done:        { background: 'var(--green-bg)',  color: 'var(--green-text)' },
  failed:      { background: 'var(--red-bg)',    color: 'var(--red-text)' },
}

const DEMO_STATUS_OPTIONS = [
  { value: '',             label: 'All statuses' },
  { value: 'no_snapshot',  label: 'Not started' },
  { value: 'queued',       label: 'Queued' },
  { value: 'processing',   label: 'Generating' },
  { value: 'done',         label: 'Ready' },
  { value: 'failed',       label: 'Failed' },
]

function StatusBadge({ status, title }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.no_snapshot
  return (
    <span title={title}
      style={{ ...s, padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 500,
               cursor: title ? 'help' : 'default', whiteSpace: 'nowrap' }}>
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
  const [statuses,    setStatuses]    = useState({})
  const [queuing,     setQueuing]     = useState(false)
  const [queueMsg,    setQueueMsg]    = useState('')
  const [loadingId,   setLoadingId]   = useState(null)
  const [loadMsgs,    setLoadMsgs]    = useState({})
  const [nameFilter,  setNameFilter]  = useState('')
  const [cityFilter,  setCityFilter]  = useState('')
  const [typeFilter,  setTypeFilter]  = useState('')
  const [statusFilter,setStatusFilter]= useState('')
  const pollRef = useRef(null)

  // Records that have a menu link or website — either works for scraping
  const menuRecords = useMemo(
    () => dbRecords.filter(r => r.mn || r.web),
    [dbRecords],
  )

  // Unique sorted cities and types for filter dropdowns
  const cities = useMemo(
    () => [...new Set(menuRecords.map(r => r.ci).filter(Boolean))].sort(),
    [menuRecords],
  )
  const types = useMemo(
    () => [...new Set(menuRecords.map(r => r.ty).filter(Boolean))].sort(),
    [menuRecords],
  )

  const visible = useMemo(() => {
    return menuRecords.filter(r => {
      if (nameFilter && !r.n?.toLowerCase().includes(nameFilter.toLowerCase())) return false
      if (cityFilter && r.ci !== cityFilter) return false
      if (typeFilter && r.ty !== typeFilter) return false
      if (statusFilter) {
        const s = statuses[r.id]?.status || 'no_snapshot'
        if (s !== statusFilter) return false
      }
      return true
    })
  }, [menuRecords, nameFilter, cityFilter, typeFilter, statusFilter, statuses])

  // Count how many visible rows still need generation
  const toGenerate = useMemo(
    () => visible.filter(r => {
      const s = statuses[r.id]?.status
      return !s || s === 'no_snapshot' || s === 'failed'
    }).length,
    [visible, statuses],
  )

  const needsPoll = visible.some(r => {
    const s = statuses[r.id]?.status
    return s === 'queued' || s === 'processing'
  })

  const poll = useCallback(async () => {
    if (!menuRecords.length) return
    try {
      const results = await fetchBatchStatus(menuRecords.map(r => r.id))
      const map = {}
      results.forEach(r => { map[r.pt_record_id] = r })
      setStatuses(prev => ({ ...prev, ...map }))
    } catch { /* silent */ }
  }, [menuRecords])

  // Initial fetch on mount
  useEffect(() => {
    poll() // eslint-disable-line react-hooks/set-state-in-effect
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Recurring poll while rows are in-flight
  useEffect(() => {
    clearInterval(pollRef.current)
    if (needsPoll) {
      pollRef.current = setInterval(poll, POLL_INTERVAL)
    }
    return () => clearInterval(pollRef.current)
  }, [needsPoll, poll])

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
      .map(r => ({ pt_record_id: r.id, name: r.n, menu_url: r.mn || r.web, restaurant_type: r.ty || '' }))

    if (!toQueue.length) { flashQueueMsg('Nothing new to queue.'); return }

    setQueuing(true)
    try {
      const res = await queueBatch(toQueue, true)
      flashQueueMsg(
        `Queued ${res.queued}${res.skipped ? `, skipped ${res.skipped} already ready` : ''}.`
      )
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
        [{ pt_record_id: r.id, name: r.n, menu_url: r.mn || r.web, restaurant_type: r.ty || '' }],
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

  const selectStyle = {
    fontSize: '12px', padding: '4px 6px',
    background: 'var(--bg2)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: '6px',
  }

  return (
    <div>

      {/* Summary bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
          {visible.length.toLocaleString()} records
        </span>
        {toGenerate > 0 && (
          <span style={{ fontSize: '12px', color: 'var(--text3)', background: 'var(--bg3)',
                         padding: '2px 8px', borderRadius: '10px' }}>
            {toGenerate} to generate
          </span>
        )}
        {visible.length !== menuRecords.length && (
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
            of {menuRecords.length.toLocaleString()} total
          </span>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" placeholder="Search name…"
          value={nameFilter} onChange={e => setNameFilter(e.target.value)}
          style={{ ...selectStyle, width: '140px' }}
        />
        <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} style={{ ...selectStyle, maxWidth: '130px' }}>
          <option value="">All cities</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...selectStyle, maxWidth: '140px' }}>
          <option value="">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...selectStyle, maxWidth: '130px' }}>
          {DEMO_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {(nameFilter || cityFilter || typeFilter || statusFilter) && (
          <button
            onClick={() => { setNameFilter(''); setCityFilter(''); setTypeFilter(''); setStatusFilter('') }}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '11px',
                     cursor: 'pointer', padding: '2px 4px' }}>
            Clear ✕
          </button>
        )}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
        <Button size="sm" variant="primary" onClick={handleQueueAll} disabled={queuing || toGenerate === 0}>
          {queuing ? 'Queuing…' : `Queue All (${toGenerate})`}
        </Button>
        {queueMsg && (
          <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{queueMsg}</span>
        )}
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text3)', padding: '10px 0' }}>
          {menuRecords.length === 0
            ? 'No records have a menu link or website.'
            : 'No records match the current filters.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ color: 'var(--text3)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '4px 8px 7px 0', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '4px 8px 7px',   fontWeight: 500 }}>City</th>
                <th style={{ padding: '4px 8px 7px',   fontWeight: 500 }}>URL</th>
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
                const url    = r.mn || r.web

                return (
                  <tr key={r.id} style={{ borderBottom: '0.5px solid var(--border)' }}>

                    <td style={{ padding: '8px 8px 8px 0', fontWeight: 500, color: 'var(--text)',
                                 maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.n}
                    </td>

                    <td style={{ padding: '8px', color: 'var(--text3)', whiteSpace: 'nowrap', fontSize: '11px' }}>
                      {r.ci || '—'}
                    </td>

                    <td style={{ padding: '8px', color: 'var(--text3)',
                                 maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <a href={url} target="_blank" rel="noreferrer"
                         style={{ color: 'var(--blue-text)', textDecoration: 'none' }}>
                        {truncUrl(url)}
                      </a>
                      {!r.mn && r.web && (
                        <span style={{ fontSize: '10px', color: 'var(--text3)', marginLeft: '3px' }}>site</span>
                      )}
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
                      ) : null}
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
