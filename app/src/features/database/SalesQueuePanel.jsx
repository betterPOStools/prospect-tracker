import { useState, useEffect, useMemo } from 'react'
import { useDatabase } from '../../data/store.jsx'
import {
  fetchRankings, compareSalesQueue,
  TIER_LABEL, TIER_STYLE, TIER_ORDER,
} from '../../lib/rankings.js'

const VOLUME_LABEL = { high: 'High', medium: 'Med', low: 'Low', unknown: '—' }
const VOLUME_STYLE = {
  high:    { color: 'var(--green-text)' },
  medium:  { color: 'var(--yellow-text)' },
  low:     { color: 'var(--text3)' },
  unknown: { color: 'var(--text3)' },
}

const DEFAULT_TIERS = ['small_indie', 'mid_market', 'kiosk_tier']

function TierBadge({ tier }) {
  const s = TIER_STYLE[tier] || TIER_STYLE.not_a_fit
  return (
    <span style={{ ...s, padding: '2px 8px', borderRadius: '12px',
                   fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap' }}>
      {TIER_LABEL[tier] || tier}
    </span>
  )
}

export default function SalesQueuePanel() {
  const { dbRecords } = useDatabase()
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [tierFilter,setTierFilter]= useState(new Set(DEFAULT_TIERS))
  const [posOnly,   setPosOnly]   = useState(false)
  const [nameFilter,setNameFilter]= useState('')
  const [cityFilter,setCityFilter]= useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await fetchRankings()
        if (!alive) return
        setRows(data)
      } catch (e) {
        if (alive) setError(e.message || 'Failed to load rankings')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // Map PT records by place_id so we can surface canvass state
  const recordMap = useMemo(() => {
    const m = new Map()
    dbRecords.forEach(r => {
      if (r.id?.startsWith('db_')) m.set(r.id.slice(3), r)
    })
    return m
  }, [dbRecords])

  const cities = useMemo(
    () => [...new Set(rows.map(r => r.city).filter(Boolean))].sort(),
    [rows],
  )

  const visible = useMemo(() => {
    const out = rows.filter(r => {
      if (!tierFilter.has(r.tier)) return false
      if (posOnly && (!r.detected_pos || r.detected_pos === 'unknown' || r.detected_pos === 'none_detected')) return false
      if (nameFilter && !r.name?.toLowerCase().includes(nameFilter.toLowerCase())) return false
      if (cityFilter && r.city !== cityFilter) return false
      return true
    })
    out.sort(compareSalesQueue)
    return out
  }, [rows, tierFilter, posOnly, nameFilter, cityFilter])

  function toggleTier(t) {
    const next = new Set(tierFilter)
    if (next.has(t)) next.delete(t); else next.add(t)
    setTierFilter(next)
  }

  const selectStyle = {
    fontSize: '12px', padding: '4px 6px',
    background: 'var(--bg2)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: '6px',
  }

  if (loading) return <div style={{ padding: '24px', color: 'var(--text3)', fontSize: '13px' }}>Loading rankings…</div>
  if (error)   return <div style={{ padding: '24px', color: 'var(--red-text)', fontSize: '13px' }}>Error: {error}</div>
  if (!rows.length) return <div style={{ padding: '24px', color: 'var(--text3)', fontSize: '13px' }}>No rankings yet — run the batch classifier in demo-builder/agent.</div>

  const tierCounts = rows.reduce((acc, r) => { acc[r.tier] = (acc[r.tier] || 0) + 1; return acc }, {})

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
          {visible.length.toLocaleString()} prospects
        </span>
        {visible.length !== rows.length && (
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
            of {rows.length.toLocaleString()} ranked
          </span>
        )}
      </div>

      {/* Tier chips */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
        {Object.keys(TIER_ORDER).map(t => {
          const active = tierFilter.has(t)
          const s = TIER_STYLE[t]
          return (
            <button key={t} onClick={() => toggleTier(t)}
              style={{
                ...(active ? s : { background: 'var(--bg2)', color: 'var(--text3)' }),
                border: active ? '1px solid transparent' : '1px solid var(--border)',
                padding: '3px 10px', borderRadius: '12px', fontSize: '11px',
                fontWeight: 500, cursor: 'pointer',
              }}>
              {TIER_LABEL[t]} <span style={{ opacity: 0.6 }}>{tierCounts[t] || 0}</span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search name…"
          value={nameFilter} onChange={e => setNameFilter(e.target.value)}
          style={{ ...selectStyle, width: '140px' }} />
        <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
          style={{ ...selectStyle, maxWidth: '140px' }}>
          <option value="">All cities</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px',
                        fontSize: '12px', color: 'var(--text2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={posOnly} onChange={e => setPosOnly(e.target.checked)} />
          POS detected only
        </label>
        {(nameFilter || cityFilter || posOnly) && (
          <button onClick={() => { setNameFilter(''); setCityFilter(''); setPosOnly(false) }}
            style={{ background: 'none', border: 'none', color: 'var(--text3)',
                     fontSize: '11px', cursor: 'pointer', padding: '2px 4px' }}>
            Clear ✕
          </button>
        )}
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text3)', padding: '10px 0' }}>
          No prospects match the current filters.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ color: 'var(--text3)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '4px 8px 7px 0',  fontWeight: 500 }}>Name</th>
                <th style={{ padding: '4px 8px 7px',    fontWeight: 500 }}>City</th>
                <th style={{ padding: '4px 8px 7px',    fontWeight: 500 }}>Tier</th>
                <th style={{ padding: '4px 8px 7px',    fontWeight: 500, textAlign: 'right' }}>Score</th>
                <th style={{ padding: '4px 8px 7px',    fontWeight: 500 }}>Volume</th>
                <th style={{ padding: '4px 8px 7px',    fontWeight: 500 }}>Current POS</th>
                <th style={{ padding: '4px 0 7px 8px',  fontWeight: 500 }}>In PT</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => {
                const rec = recordMap.get(r.place_id)
                const volume = r.estimated_swipe_volume || 'unknown'
                return (
                  <tr key={r.place_id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '8px 8px 8px 0', fontWeight: 500, color: 'var(--text)',
                                 maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={r.reasoning || ''}>
                      {r.name}
                    </td>
                    <td style={{ padding: '8px', color: 'var(--text3)', whiteSpace: 'nowrap', fontSize: '11px' }}>
                      {r.city || '—'}{r.state ? ` · ${r.state}` : ''}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <TierBadge tier={r.tier} />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.score}
                    </td>
                    <td style={{ padding: '8px', fontSize: '11px', ...VOLUME_STYLE[volume] }}
                        title={r.swipe_volume_evidence || ''}>
                      {VOLUME_LABEL[volume]}
                    </td>
                    <td style={{ padding: '8px', color: 'var(--text2)', fontSize: '11px', whiteSpace: 'nowrap' }}
                        title={r.detected_pos_evidence || ''}>
                      {r.detected_pos && r.detected_pos !== 'unknown' && r.detected_pos !== 'none_detected'
                        ? r.detected_pos
                        : <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 0 8px 8px', fontSize: '11px',
                                 color: rec ? 'var(--green-text)' : 'var(--text3)' }}>
                      {rec ? (rec.st || 'yes') : '—'}
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
