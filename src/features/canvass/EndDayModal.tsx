import { useState } from 'react'
import type { CanvassStop } from '../../types'
import { useStopsDispatch } from '../../store/StopsContext'
import { useRecordsDispatch } from '../../store/RecordsContext'
import { db } from '../../lib/supabase'
import { appendDaySummary } from '../../data/canvassLog'
import Modal from '../../components/Modal'
import Button from '../../components/Button'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the next Mon–Fri date as YYYY-MM-DD. */
function getNextBusinessDay(): string {
  const d = new Date()
  do {
    d.setDate(d.getDate() + 1)
  } while (d.getDay() === 0 || d.getDay() === 6) // skip Sat/Sun
  return d.toISOString().slice(0, 10)
}

// ── Props ────────────────────────────────────────────────────────────────────

interface EndDayModalProps {
  open: boolean
  onClose: () => void
  stops: CanvassStop[]
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EndDayModal({ open, onClose, stops }: EndDayModalProps) {
  const stopsDispatch = useStopsDispatch()
  const recordsDispatch = useRecordsDispatch()

  const [busy, setBusy] = useState(false)

  // ── Summary counts ───────────────────────────────────────────────────────

  const queueCount = stops.filter(
    (s) => s.status === 'queued' || s.status === 'not_visited'
  ).length
  const cblCount = stops.filter((s) => s.status === 'come_back_later').length
  const dmuCount = stops.filter((s) => s.status === 'dm_unavailable').length
  const canvassedCount = stops.filter((s) => s.status === 'canvassed').length
  const convertedCount = stops.filter((s) => s.status === 'converted').length
  const totalCount = stops.length

  // ── Summary rows ─────────────────────────────────────────────────────────

  const rows: { label: string; count: number; detail: string; color?: string }[] = [
    {
      label: 'Queue',
      count: queueCount,
      detail: 'returned to database as unworked',
      color: 'text-yellow-600',
    },
    {
      label: 'Come back later',
      count: cblCount,
      detail: 'kept as follow-up',
      color: 'text-orange-600',
    },
    {
      label: 'DM unavailable',
      count: dmuCount,
      detail: 'kept as follow-up',
      color: 'text-orange-600',
    },
    {
      label: 'Canvassed',
      count: canvassedCount,
      detail: 'record marked canvassed',
      color: 'text-green-600',
    },
    {
      label: 'Converted',
      count: convertedCount,
      detail: 'already converted to lead',
      color: 'text-blue-600',
    },
  ]

  // ── Confirm handler ──────────────────────────────────────────────────────

  async function handleConfirm() {
    setBusy(true)
    const now = new Date().toISOString()
    const nextBizDay = getNextBusinessDay()
    const idsToDelete: string[] = []

    for (const stop of stops) {
      switch (stop.status) {
        // ── Queued / not visited: revert parent record to unworked ──────
        case 'queued':
        case 'not_visited': {
          if (stop.record_id) {
            await db
              .from('records')
              .update({ status: 'unworked', updated_at: now })
              .eq('id', stop.record_id)
            recordsDispatch({
              type: 'UPDATE_STATUS',
              id: stop.record_id,
              status: 'unworked',
            })
          }
          idsToDelete.push(stop.id)
          break
        }

        // ── Follow-ups: set follow_up_date to next business day, archive ─
        case 'come_back_later':
        case 'dm_unavailable': {
          await db
            .from('canvass_stops')
            .update({ follow_up_date: nextBizDay, updated_at: now })
            .eq('id', stop.id)
          stopsDispatch({
            type: 'UPDATE',
            stop: { ...stop, follow_up_date: nextBizDay, updated_at: now },
          })
          break
        }

        // ── Canvassed: mark parent record as canvassed, remove stop ─────
        case 'canvassed': {
          if (stop.record_id) {
            await db
              .from('records')
              .update({ status: 'canvassed', updated_at: now })
              .eq('id', stop.record_id)
            recordsDispatch({
              type: 'UPDATE_STATUS',
              id: stop.record_id,
              status: 'canvassed',
            })
          }
          idsToDelete.push(stop.id)
          break
        }

        // ── Converted: already handled, just remove stop ────────────────
        case 'converted': {
          idsToDelete.push(stop.id)
          break
        }

        // ── Dropped or any other status: just remove ────────────────────
        default: {
          idsToDelete.push(stop.id)
          break
        }
      }
    }

    // Batch delete processed stops from DB
    if (idsToDelete.length) {
      await db.from('canvass_stops').delete().in('id', idsToDelete)
      stopsDispatch({ type: 'DELETE_MANY', ids: idsToDelete })
    }

    // Log the day summary to canvass log (localStorage)
    const todayStr = new Date().toISOString().slice(0, 10)
    appendDaySummary({
      date: todayStr,
      total: totalCount,
      notVis: queueCount,
      noAns: 0,
      cbl: cblCount,
      dmu: dmuCount,
      notInt: canvassedCount,
      converted: convertedCount,
    })

    setBusy(false)
    onClose()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="End Day Summary"
      size="sm"
    >
      <div className="flex flex-col gap-4">
        {/* Summary table */}
        <div className="rounded-lg border border-[#1e2535] overflow-hidden">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between border-b border-[#1e2535] px-3 py-2 last:border-b-0 transition-colors duration-150 hover:bg-[#1a2030]"
            >
              <div className="flex flex-col">
                <span className={`text-sm font-medium ${row.color ?? 'text-slate-100'}`}>
                  {row.label}
                </span>
                <span className="text-[11px] text-slate-500">{row.detail}</span>
              </div>
              <span className={`text-lg font-bold ${row.color ?? 'text-slate-100'}`}>
                {row.count}
              </span>
            </div>
          ))}

          {/* Total row */}
          <div className="flex items-center justify-between bg-[#0f1117] px-3 py-2">
            <span className="text-sm font-semibold text-slate-100">Total</span>
            <span className="text-lg font-bold text-slate-100">{totalCount}</span>
          </div>
        </div>

        {/* Explanation */}
        <p className="text-xs text-slate-500 leading-relaxed">
          Queue stops are returned to the database as unworked. Come back later and DM
          unavailable stops are kept as follow-ups for{' '}
          <strong>{getNextBusinessDay()}</strong>. Canvassed and converted stops are
          archived.
        </p>

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleConfirm}
            disabled={busy || totalCount === 0}
          >
            {busy ? 'Processing...' : 'End Day'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
