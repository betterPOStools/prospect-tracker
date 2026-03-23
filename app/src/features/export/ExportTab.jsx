import { useRef, useState } from 'react'
import { useProspects, useProspectsDispatch, useCanvass, useCanvassDispatch, useDatabase, useDatabaseDispatch, useFileSync, useCurrentStatePayload } from '../../data/store.jsx'
import { loadSnapshots } from '../../data/storage.js'
import { exportKmz } from '../../data/kmzExport.js'
import Button from '../../components/Button.jsx'

function relativeTime(d) {
  if (!d) return 'never'
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 5)  return 'just now'
  if (s < 60) return s + 's ago'
  const m = Math.floor(s / 60)
  return m < 60 ? m + 'm ago' : Math.floor(m / 60) + 'h ago'
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

function downloadCSV(rows, filename) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const esc  = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  const csv  = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

function dateTag() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const sectionOuter = { background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: '12px' }
const sectionTitle = { fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '2px' }
const sectionSub   = { fontSize: '12px', color: 'var(--text2)', marginBottom: '10px' }
const sectionBody  = { display: 'flex', gap: '8px', flexWrap: 'wrap' }

function Section({ title, sub, children }) {
  return (
    <div style={sectionOuter}>
      <div style={sectionTitle}>{title}</div>
      {sub && <div style={sectionSub}>{sub}</div>}
      <div style={sectionBody}>{children}</div>
    </div>
  )
}

export default function ExportTab() {
  const prospects   = useProspects()
  const pDispatch   = useProspectsDispatch()
  const canvass     = useCanvass()
  const cDispatch   = useCanvassDispatch()
  const db          = useDatabase()
  const dbDispatch  = useDatabaseDispatch()
  const fileSync    = useFileSync()
  const payload     = useCurrentStatePayload()

  const [msg, setMsg] = useState(null)
  const importRef = useRef()

  async function handleLinkFile() {
    await fileSync.linkFile()
    fileSync.flushWrite(payload) // handleRef is set synchronously inside linkFile
  }
  async function handleCreateNewFile() {
    await fileSync.createNewFile()
    fileSync.flushWrite(payload)
  }

  function flash(text, type = 'ok') {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 5000)
  }

  // ── Exports ────────────────────────────────────────────────────────────────

  function exportFullJSON() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      prospects,
      canvass,
      dbRecords:   db.dbRecords,
      dbClusters:  db.dbClusters,
      dbAreas:     db.dbAreas,
      dbBlocklist: db.dbBlocklist,
      snapshots:   loadSnapshots(),
    }
    downloadJSON(payload, `prospect-tracker-backup-${dateTag()}.json`)
    flash(`Full backup exported (${prospects.length} leads, ${canvass.length} canvass, ${db.dbRecords.length} DB records).`)
  }

  function exportDbCSV() {
    if (!db.dbRecords.length) { flash('No DB records to export.', 'err'); return }
    const rows = db.dbRecords.map(r => ({
      Name: r.n, Address: r.a, City: r.ci, ZIP: r.zi, Phone: r.ph,
      Website: r.web, Email: r.em, Type: r.ty,
      Rating: r.rt, Reviews: r.rv, Score: r.sc, Priority: r.pr,
      Status: r.st, Zone: r.zo, Area: r.ar, Day: r.da,
      ContactName: r.cn, ContactTitle: r.ct, Notes: r.nt,
    }))
    downloadCSV(rows, `db-records-${dateTag()}.csv`)
    flash(`${rows.length} DB records exported to CSV.`)
  }

  function exportProspectsCSV() {
    if (!prospects.length) { flash('No leads to export.', 'err'); return }
    const rows = prospects.map(p => ({
      Name: p.name, Owner: p.owner, Email: p.email, Phone: p.phone,
      Address: p.address, POS: p.pos, Status: p.status,
      Notes: p.notes, AddedDate: p.addedDate,
    }))
    downloadCSV(rows, `leads-${dateTag()}.csv`)
    flash(`${rows.length} leads exported to CSV.`)
  }

  async function handleExportKmz() {
    if (!db.dbRecords.length) { flash('No DB records to export.', 'err'); return }
    const count = await exportKmz(db.dbRecords, `prospect-tracker-${dateTag()}.kmz`)
    if (!count) { flash('No records have GPS coordinates — import Outscraper data with lat/lng.', 'err'); return }
    flash(`KMZ exported — ${count} mapped records across 5 priority layers.`)
  }

  function exportCanvassCSV() {
    if (!canvass.length) { flash('No canvass stops to export.', 'err'); return }
    const rows = canvass.map(s => ({
      Name: s.name, Address: s.addr, Phone: s.phone,
      Status: s.status, Date: s.date, Notes: s.notes,
      Priority: s.priority, Score: s.score, Email: s.email,
    }))
    downloadCSV(rows, `canvass-log-${dateTag()}.csv`)
    flash(`${rows.length} canvass stops exported to CSV.`)
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport(e) {
    const file = e.target.files[0]; if (!file) return
    try {
      const text = await file.text()
      let raw = JSON.parse(text)

      // Handle old export format: bare array of prospects
      if (Array.isArray(raw)) raw = { prospects: raw }

      const data = raw
      const dateLabel = data.exportedAt || data.savedAt
        ? `dated ${new Date(data.exportedAt || data.savedAt).toLocaleString()}`
        : `from file "${file.name}"`

      if (!confirm(`Restore backup ${dateLabel}?\n\nThis will replace ALL current data. Make sure to export a backup first.`)) {
        e.target.value = ''; return
      }
      if (data.dbRecords !== undefined) {
        dbDispatch({ type: 'RESTORE_SNAPSHOT',
          dbRecords: data.dbRecords, dbClusters: data.dbClusters,
          dbAreas: data.dbAreas, dbBlocklist: data.dbBlocklist })
      }
      if (data.prospects !== undefined) pDispatch({ type: '_REPLACE_ALL', items: data.prospects })
      if (data.canvass   !== undefined) cDispatch({ type: '_REPLACE_ALL', items: data.canvass })
      flash(`Restored: ${(data.prospects||[]).length} leads, ${(data.canvass||[]).length} canvass, ${(data.dbRecords||[]).length} DB records.`)
    } catch (err) {
      flash('Import failed: ' + err.message, 'err')
    }
    e.target.value = ''
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // ── File Sync status helpers ──────────────────────────────────────────────────
  const dotColor = fileSync.status === 'error'  ? 'var(--red-text)'
                 : fileSync.status === 'saving' ? 'var(--yellow-text)'
                 : 'var(--green-text)'

  return (
    <div>
      {msg && (
        <div style={{ fontSize: '12px', marginBottom: '10px', padding: '8px 12px', borderRadius: 'var(--radius)',
          background: msg.type === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
          color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)',
          border: `0.5px solid ${msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)'}` }}>
          {msg.text}
        </div>
      )}

      {/* File Sync */}
      <Section title="Auto File Sync" sub={
        fileSync.isAvailable
          ? fileSync.linked
            ? `Linked to ${fileSync.fileName} — changes auto-save every ~1.5s`
            : fileSync.status === 'needs-permission'
              ? 'Previously linked file needs re-authorization.'
              : 'Link a JSON file in your repo and the app auto-saves to it on every change.'
          : 'Not available in this browser (Firefox/Safari) — use manual export below.'
      }>
        {!fileSync.isAvailable && (
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Use "Export Backup JSON" + git commit to sync manually.</span>
        )}
        {fileSync.isAvailable && !fileSync.linked && fileSync.status !== 'needs-permission' && (<>
          <Button size="sm" variant="primary" onClick={handleLinkFile}>Link existing file</Button>
          <Button size="sm" onClick={handleCreateNewFile}>Create new file</Button>
        </>)}
        {fileSync.isAvailable && fileSync.status === 'needs-permission' && (<>
          <div style={{ width: '100%', fontSize: '12px', padding: '6px 10px', borderRadius: 'var(--radius)', background: 'var(--yellow-bg)', color: 'var(--yellow-text)', marginBottom: '4px' }}>
            {fileSync.fileName} needs re-authorization to continue auto-saving.
          </div>
          <Button size="sm" variant="primary" onClick={fileSync.requestAccess}>Re-authorize</Button>
          <Button size="sm" variant="danger" onClick={fileSync.unlinkFile}>Unlink</Button>
        </>)}
        {fileSync.isAvailable && fileSync.linked && (<>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{fileSync.fileName}</span>
            <span style={{ color: 'var(--text3)' }}>·</span>
            <span style={{ color: 'var(--text2)' }}>
              {fileSync.status === 'saving' ? 'Saving…'
               : fileSync.status === 'error' ? `Error: ${fileSync.error}`
               : fileSync.lastSavedAt ? `Saved ${relativeTime(fileSync.lastSavedAt)}`
               : 'Not yet saved'}
            </span>
          </div>
          <Button size="sm" variant="danger" onClick={fileSync.unlinkFile} style={{ marginLeft: 'auto' }}>Unlink</Button>
        </>)}
      </Section>

      <Section
        title="Full Backup (JSON)"
        sub="Export everything — leads, canvass, database, zones, blocklist. Use this for git-based sync: export → commit → push.">
        <Button size="sm" variant="primary" onClick={exportFullJSON}>Export Backup JSON</Button>
        <label style={{
          display: 'inline-flex', alignItems: 'center', cursor: 'pointer',
          padding: '0 10px', height: '30px', fontSize: '12px', fontWeight: 500,
          background: 'var(--bg)', color: 'var(--text)', borderRadius: 'var(--radius)',
          border: '0.5px solid var(--border)',
        }}>
          Import from JSON
          <input ref={importRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        </label>
      </Section>

      <Section
        title="Export to KMZ"
        sub="Export DB records as a Google Earth / Google My Maps file. 5 layers: 🔥 Fire, 🥵 Hot, ☀️ Warm, 🥶 Cold, ☠️ Dead. Only records with GPS coordinates are included.">
        <Button size="sm" variant="primary" onClick={handleExportKmz}>
          Export KMZ ({db.dbRecords.filter(r => r.lt && r.lg).length} mapped)
        </Button>
      </Section>

      <Section
        title="Export to CSV"
        sub="Export individual datasets to CSV for use in Excel or Google Sheets.">
        <Button size="sm" onClick={exportDbCSV}>
          DB Records ({db.dbRecords.length})
        </Button>
        <Button size="sm" onClick={exportProspectsCSV}>
          Leads ({prospects.length})
        </Button>
        <Button size="sm" onClick={exportCanvassCSV}>
          Canvass Log ({canvass.length})
        </Button>
      </Section>

      <Section
        title="Git Sync Workflow"
        sub="How to keep data in sync across devices using git:">
        <div style={{ width: '100%', fontSize: '12px', color: 'var(--text2)', lineHeight: 1.7 }}>
          <div><strong style={{ color: 'var(--text)' }}>1. Export</strong> — Click "Export Backup JSON" → save the file to your repo folder (e.g. <code style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>data/backup.json</code>)</div>
          <div><strong style={{ color: 'var(--text)' }}>2. Commit &amp; Push</strong> — <code style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>git add data/backup.json &amp;&amp; git commit -m "sync" &amp;&amp; git push</code></div>
          <div><strong style={{ color: 'var(--text)' }}>3. Pull &amp; Import</strong> — On another device: <code style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>git pull</code> → click "Import from JSON" → select the file</div>
          <div style={{ marginTop: '4px', color: 'var(--text3)', fontSize: '11px' }}>Per-field timestamps ensure deterministic merge resolution when both devices have changes.</div>
        </div>
      </Section>
    </div>
  )
}
