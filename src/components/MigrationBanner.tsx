// Shown on first launch when legacy localStorage data (vs_db) is detected.
// Runs the one-time migration and uploads to Supabase.

import { useState } from 'react'
import { migration as migrationFlags } from '../lib/storage'
import { runMigration } from '../data/migration'
import { supabase } from '../lib/supabase'
import { useRecordsDispatch } from '../store/RecordsContext'
import { useLeadsDispatch } from '../store/LeadsContext'
import { useStopsDispatch } from '../store/StopsContext'
import Button from './Button'

type Phase = 'idle' | 'running' | 'done' | 'error'

export default function MigrationBanner() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<{ records: number; leads: number; stops: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const recordsDispatch = useRecordsDispatch()
  const leadsDispatch   = useLeadsDispatch()
  const stopsDispatch   = useStopsDispatch()

  if (dismissed) return null

  async function runMig() {
    setPhase('running')
    setError(null)
    try {
      const bundle = runMigration()

      // Upload in batches
      const batchSize = 200
      for (let i = 0; i < bundle.records.length; i += batchSize) {
        await supabase.schema('prospect').from('records').upsert(bundle.records.slice(i, i + batchSize))
      }
      if (bundle.leads.length > 0) {
        await supabase.schema('prospect').from('leads').upsert(bundle.leads)
      }
      if (bundle.stops.length > 0) {
        await supabase.schema('prospect').from('canvass_stops').upsert(bundle.stops)
      }

      // Update contexts
      recordsDispatch({ type: 'SET_ALL', records: bundle.records })
      leadsDispatch({ type: 'SET_ALL', leads: bundle.leads })
      stopsDispatch({ type: 'SET_ALL', stops: bundle.stops })

      migrationFlags.markComplete()
      setResult({ records: bundle.records.length, leads: bundle.leads.length, stops: bundle.stops.length })
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Migration failed')
      setPhase('error')
    }
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
      {phase === 'idle' && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">Legacy data detected</p>
            <p className="text-xs text-amber-700">
              Your old prospect data needs to be migrated to the new database. This runs once and takes ~30 seconds.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>Later</Button>
            <Button variant="primary" size="sm" onClick={() => void runMig()}>Migrate Now</Button>
          </div>
        </div>
      )}

      {phase === 'running' && (
        <p className="text-sm text-amber-800">Migrating data to Supabase… please wait</p>
      )}

      {phase === 'done' && result && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-green-800">
            Migration complete — {result.records} records, {result.leads} leads, {result.stops} stops
          </p>
          <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>Dismiss</Button>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-red-800">Migration error: {error}</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>Skip</Button>
            <Button variant="primary" size="sm" onClick={() => void runMig()}>Retry</Button>
          </div>
        </div>
      )}
    </div>
  )
}
