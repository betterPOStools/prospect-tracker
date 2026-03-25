import { useCanvass, useCanvassDispatch, useDatabaseDispatch } from '../../data/store.jsx'
import { CANVASS_ACTIVE } from './constants.js'
import { appendDaySummary } from '../../data/canvassLog.js'
import Modal from '../../components/Modal.jsx'
import Button from '../../components/Button.jsx'

const ENDDAY_KEY = 'vs_endday'

function loadTodayAccum(todayStr) {
  try {
    const raw = localStorage.getItem(ENDDAY_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    return saved.date === todayStr ? saved : null
  } catch { return null }
}

function saveTodayAccum(stats) {
  localStorage.setItem(ENDDAY_KEY, JSON.stringify(stats))
}

export default function EndDayModal({ onClose }) {
  const canvassStops    = useCanvass()
  const canvassDispatch = useCanvassDispatch()
  const dbDispatch      = useDatabaseDispatch()

  const todayStr   = new Date().toLocaleDateString()
  const todayStops = canvassStops.filter(c => c.date === todayStr && CANVASS_ACTIVE.includes(c.status))

  // Current batch counts
  const batchTotal    = todayStops.length
  const batchNotVis   = todayStops.filter(c => c.status === 'Not visited yet').length
  const batchNoAns    = todayStops.filter(c => c.status === 'No answer / closed').length
  const batchCbl      = todayStops.filter(c => c.status === 'Come back later').length
  const batchDmu      = todayStops.filter(c => c.status === 'Decision maker unavailable').length
  const batchNotInt   = todayStops.filter(c => c.status === 'Not interested').length
  const batchConverted = canvassStops.filter(c => c.date === todayStr && c.status === 'Converted').length

  // Accumulated from prior End Day runs today
  const prior = loadTodayAccum(todayStr)

  const total     = batchTotal     + (prior?.total     || 0)
  const notVis    = batchNotVis    + (prior?.notVis    || 0)
  const noAns     = batchNoAns     + (prior?.noAns     || 0)
  const cbl       = batchCbl       + (prior?.cbl       || 0)
  const dmu       = batchDmu       + (prior?.dmu       || 0)
  const notInt    = batchNotInt    + (prior?.notInt    || 0)
  const converted = batchConverted + (prior?.converted || 0)

  function confirm() {
    const toRemove = []
    const dbUpdates = [] // { id, fields }

    todayStops.forEach(c => {
      if (c.status === 'Not visited yet') {
        if (c.fromDb) dbUpdates.push({ id: c.fromDb, fields: { st: 'unworked', da: '' } })
        toRemove.push(c.id)
      } else if (c.status === 'Come back later' || c.status === 'Decision maker unavailable') {
        // Move to Follow Up immediately by backdating
        canvassDispatch({ type: 'UPDATE', stop: { ...c, date: 'ended' } })
      } else {
        // No answer / Not interested — log visit, reset to unworked
        const label = c.status === 'No answer / closed' ? 'No answer' : 'Not interested'
        const note  = todayStr + ': ' + label
        if (c.fromDb) {
          const fields = { st: 'unworked', da: '', _note: note }
          if (c.status === 'Not interested') fields._downgrade = true
          dbUpdates.push({ id: c.fromDb, fields })
        }
        toRemove.push(c.id)
      }
    })

    // Persist accumulated daily totals
    saveTodayAccum({ date: todayStr, total, notVis, noAns, cbl, dmu, notInt, converted })
    appendDaySummary({ date: todayStr, total, notVis, noAns, cbl, dmu, notInt, converted })

    // Batch DB updates
    if (dbUpdates.length) {
      dbDispatch({ type: 'END_DAY_UPDATE', updates: dbUpdates })
    }
    if (toRemove.length) {
      canvassDispatch({ type: 'DELETE_MANY', ids: toRemove })
    }
    onClose()
  }

  return (
    <Modal title="End Day Summary" onClose={onClose}>
      <div style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--text2)', lineHeight: '1.7' }}>
        <strong>Today's canvass recap:</strong><br /><br />
        Total stops in queue: <strong>{total}</strong><br />
        {converted > 0 && <><span style={{ color: 'var(--green-text)' }}>Converted to lead: <strong>{converted}</strong></span><br /></>}
        {cbl    > 0 && <>Come back later: <strong>{cbl}</strong> → moves to Follow Up<br /></>}
        {dmu    > 0 && <>Decision maker unavailable: <strong>{dmu}</strong> → moves to Follow Up<br /></>}
        {noAns  > 0 && <>No answer / closed: <strong>{noAns}</strong> → visit logged, returned to DB pool<br /></>}
        {notInt > 0 && <>Not interested: <strong>{notInt}</strong> → visit logged, priority lowered, returned to DB pool<br /></>}
        {notVis > 0 && <><span style={{ color: 'var(--yellow-text)' }}>Not visited yet: <strong>{notVis}</strong> → remains unworked in database</span><br /></>}
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
        Come back later and Decision maker unavailable stops move to <strong>Follow Up</strong> immediately.
        No answer and Not interested stops are logged and returned to the database pool.
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={confirm}>End Day</Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  )
}
