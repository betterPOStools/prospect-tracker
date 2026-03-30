import { useState, useCallback } from 'react'
import JSZip from 'jszip'
import { useRecords, useRecordsDispatch } from '../../store/RecordsContext'
import { useLeads, useLeadsDispatch } from '../../store/LeadsContext'
import { useStops, useStopsDispatch } from '../../store/StopsContext'
import { db } from '../../lib/supabase'
import { exportFile } from '../../lib/platform'
import { loadCanvassLog } from '../../data/canvassLog'
import { isLegacyRecord, migrateLegacyFile } from '../../data/migration'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import type { ProspectRecord } from '../../types'

// ── CSV helper ────────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => JSON.stringify(r[h] ?? '')).join(','),
    ),
  ]
  return lines.join('\n')
}

// ── KML generation ─────────────────────────────────────────────────────────────

const PRIORITY_ORDER = ['Fire', 'Hot', 'Warm', 'Cold', 'Dead'] as const

function escapeCDATA(str: string): string {
  return str.replace(/]]>/g, ']]]]><![CDATA[>')
}

function generateKML(records: ProspectRecord[]): string {
  const byPriority: Record<string, ProspectRecord[]> = {
    Fire: [], Hot: [], Warm: [], Cold: [], Dead: [],
  }
  for (const r of records) {
    if (r.lat != null && r.lng != null && r.priority in byPriority) {
      byPriority[r.priority].push(r)
    }
  }

  const folderXml = PRIORITY_ORDER.map((priority) => {
    const placemarks = byPriority[priority]
      .map(
        (r) =>
          `    <Placemark>
      <name><![CDATA[${escapeCDATA(r.name)}]]></name>
      <description><![CDATA[${escapeCDATA(
        [r.address, r.phone, r.email].filter(Boolean).join(' | '),
      )}]]></description>
      <Point><coordinates>${r.lng},${r.lat},0</coordinates></Point>
    </Placemark>`,
      )
      .join('\n')
    return `  <Folder>\n    <name>${priority}</name>\n${placemarks}\n  </Folder>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Prospect Tracker Export</name>
${folderXml}
</Document>
</kml>`
}

// ── ExportPanel ───────────────────────────────────────────────────────────────

export default function ExportPanel() {
  const records = useRecords()
  const leads = useLeads()
  const stops = useStops()
  const recordsDispatch = useRecordsDispatch()
  const leadsDispatch = useLeadsDispatch()
  const stopsDispatch = useStopsDispatch()

  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoreModal, setRestoreModal] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState<string | null>(null)

  // ── Full JSON backup ──────────────────────────────────────────────────────

  const handleDownloadBackup = useCallback(async () => {
    setExportBusy('backup')
    try {
      const backup = {
        records,
        leads,
        stops,
        exportedAt: new Date().toISOString(),
      }
      await exportFile(
        JSON.stringify(backup, null, 2),
        `prospect-backup-${Date.now()}.json`,
        'application/json',
      )
    } finally {
      setExportBusy(null)
    }
  }, [records, leads, stops])

  // ── Restore from JSON ─────────────────────────────────────────────────────

  const handleRestoreConfirm = useCallback(async () => {
    if (!restoreFile) return
    setRestoring(true)
    setRestoreError(null)
    try {
      const text = await restoreFile.text()
      const raw = JSON.parse(text) as unknown

      // Detect legacy/v1 format and migrate automatically
      const isLegacy = (() => {
        if (Array.isArray(raw)) return isLegacyRecord(raw[0])
        if (raw && typeof raw === 'object') {
          const obj = raw as Record<string, unknown>
          if (obj['version'] === 1) return true           // v1 backup
          if (typeof obj['vs_db'] === 'string') return true
          if (Array.isArray(obj['records']) && obj['records'].length > 0) return isLegacyRecord(obj['records'][0])
        }
        return false
      })()

      let records: ProspectRecord[]
      let leads: unknown[]
      let stops: unknown[]

      if (isLegacy) {
        const bundle = migrateLegacyFile(raw)
        records = bundle.records
        leads   = bundle.leads
        stops   = bundle.stops
      } else {
        const data = raw as { records?: ProspectRecord[]; leads?: unknown[]; stops?: unknown[] }
        records = data.records ?? []
        leads   = data.leads   ?? []
        stops   = data.stops   ?? []
      }

      if (records.length > 0) {
        recordsDispatch({ type: 'SET_ALL', records })
        for (let i = 0; i < records.length; i += 500) {
          await db.from('records').upsert(records.slice(i, i + 500))
        }
      }
      if (leads.length > 0) {
        leadsDispatch({ type: 'SET_ALL', leads: leads as never[] })
        await db.from('leads').upsert(leads as object[])
      }
      if (stops.length > 0) {
        stopsDispatch({ type: 'SET_ALL', stops: stops as never[] })
        await db.from('canvass_stops').upsert(stops as object[])
      }

      setRestoreModal(false)
      setRestoreFile(null)
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : 'Restore failed — invalid backup file')
    } finally {
      setRestoring(false)
    }
  }, [restoreFile, recordsDispatch, leadsDispatch, stopsDispatch])

  // ── KMZ export ────────────────────────────────────────────────────────────

  const handleExportKMZ = useCallback(async () => {
    setExportBusy('kmz')
    try {
      const kml = generateKML(records)
      const zip = new JSZip()
      zip.file('doc.kml', kml)
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `prospects-${Date.now()}.kmz`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportBusy(null)
    }
  }, [records])

  // ── CSV exports ───────────────────────────────────────────────────────────

  const handleExportRecordsCSV = useCallback(async () => {
    setExportBusy('records-csv')
    try {
      const csv = toCSV(records as unknown as Record<string, unknown>[])
      await exportFile(csv, `records-${Date.now()}.csv`, 'text/csv')
    } finally {
      setExportBusy(null)
    }
  }, [records])

  const handleExportLeadsCSV = useCallback(async () => {
    setExportBusy('leads-csv')
    try {
      const csv = toCSV(leads as unknown as Record<string, unknown>[])
      await exportFile(csv, `leads-${Date.now()}.csv`, 'text/csv')
    } finally {
      setExportBusy(null)
    }
  }, [leads])

  const handleExportCanvassCSV = useCallback(async () => {
    setExportBusy('canvass-csv')
    try {
      const log = loadCanvassLog()
      const csv = toCSV(log as unknown as Record<string, unknown>[])
      await exportFile(csv, `canvass-log-${Date.now()}.csv`, 'text/csv')
    } finally {
      setExportBusy(null)
    }
  }, [])

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Full Backup */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Full Backup (JSON)</h3>
        <p className="mb-3 text-xs text-gray-500">
          Exports all {records.length} records, {leads.length} leads, and {stops.length} canvass
          stops.
        </p>
        <Button
          onClick={handleDownloadBackup}
          disabled={exportBusy === 'backup'}
          size="sm"
        >
          {exportBusy === 'backup' ? 'Exporting…' : 'Download Backup'}
        </Button>
      </section>

      <div className="border-t border-gray-100" />

      {/* Restore */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Restore from JSON</h3>
        <p className="mb-3 text-xs text-gray-500">
          Replaces all local data and syncs to Supabase. This cannot be undone without a new
          backup.
        </p>
        <div className="flex flex-col gap-2">
          <input
            type="file"
            accept=".json"
            className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-800 hover:file:bg-gray-200"
            onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="danger"
            size="sm"
            disabled={!restoreFile}
            onClick={() => setRestoreModal(true)}
          >
            Restore from File
          </Button>
        </div>
      </section>

      <div className="border-t border-gray-100" />

      {/* KMZ */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Export KMZ (Google Earth)</h3>
        <p className="mb-3 text-xs text-gray-500">
          Exports records with coordinates as a KMZ file with 5 priority layers.{' '}
          {records.filter((r) => r.lat != null && r.lng != null).length} of {records.length}{' '}
          records have coordinates.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExportKMZ}
          disabled={exportBusy === 'kmz'}
        >
          {exportBusy === 'kmz' ? 'Generating…' : 'Export KMZ'}
        </Button>
      </section>

      <div className="border-t border-gray-100" />

      {/* CSV */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Export CSV</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportRecordsCSV}
            disabled={exportBusy === 'records-csv'}
          >
            {exportBusy === 'records-csv' ? 'Exporting…' : 'Records CSV'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportLeadsCSV}
            disabled={exportBusy === 'leads-csv'}
          >
            {exportBusy === 'leads-csv' ? 'Exporting…' : 'Leads CSV'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCanvassCSV}
            disabled={exportBusy === 'canvass-csv'}
          >
            {exportBusy === 'canvass-csv' ? 'Exporting…' : 'Canvass Log CSV'}
          </Button>
        </div>
      </section>

      {/* Restore Confirm Modal */}
      <Modal
        open={restoreModal}
        onClose={() => setRestoreModal(false)}
        title="Confirm Restore"
        size="sm"
      >
        <p className="mb-4 text-sm text-gray-700">
          This will replace all current records, leads, and stops with the backup data and sync
          to Supabase. This cannot be undone.
        </p>
        {restoreError && <p className="mb-3 text-xs text-red-600">{restoreError}</p>}
        <div className="flex gap-2">
          <Button
            variant="danger"
            onClick={handleRestoreConfirm}
            disabled={restoring}
          >
            {restoring ? 'Restoring…' : 'Yes, Restore'}
          </Button>
          <Button variant="secondary" onClick={() => setRestoreModal(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  )
}
