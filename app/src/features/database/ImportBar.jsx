import { useRef, useState } from 'react'
import { useDatabase, useDatabaseDispatch } from '../../data/store.jsx'
import { useSnapshots } from '../../hooks/useSnapshots.js'
import { processOutscraperRows, saveRawScrape } from '../../data/outscraper.js'
import btnStyles from '../../components/Button.module.css'

export default function ImportBar({ onImported }) {
  const db       = useDatabase()
  const dispatch = useDatabaseDispatch()
  const { takeSnapshot } = useSnapshots()
  const [msg, setMsg] = useState(null)
  const inputRef = useRef()

  async function handleFile(e) {
    const file = e.target.files[0]; if (!file) return

    const areaName = prompt(
      'Name this import area (e.g. "North Myrtle Beach", "Conway", "Myrtle Beach Strip"):\n\nThis groups the records so you can filter and schedule by area.',
      ''
    )
    if (areaName === null) { e.target.value = ''; return }
    const area = areaName.trim() || 'Unnamed Area'

    takeSnapshot('pre-import')
    setMsg({ text: 'Reading file…', type: 'ok' })

    try {
      const text = await file.text()
      let rows
      try {
        const parsed = JSON.parse(text)
        rows = Array.isArray(parsed) ? parsed : parsed.data || []
      } catch {
        setMsg({ text: 'Only JSON files are supported. XLSX/CSV import has been removed.', type: 'err' }); return
      }

      if (!rows.length) { setMsg({ text: 'No data found in file.', type: 'err' }); return }

      saveRawScrape(rows, area, 'file')
      const result = processOutscraperRows(rows, area, db.dbRecords, db.dbBlocklist, db.dbAreas)
      dispatch({ type: 'IMPORT', dbRecords: result.allRecords, dbAreas: result.dbAreas })
      setMsg({ text: `"${area}" imported — ${result.added} added, ${result.updated} updated, ${result.dupes} skipped. ${result.allRecords.length} total records.`, type: 'ok' })
      onImported?.()
    } catch (err) {
      setMsg({ text: 'Import failed: ' + err.message, type: 'err' })
    }
    e.target.value = ''
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>Import Outscraper Data</div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>Upload Outscraper JSON — scores, deduplicates, and groups by area automatically</div>
        </div>
        <label className={`${btnStyles.btn} ${btnStyles.primary}`} style={{ cursor: 'pointer', marginLeft: 'auto' }}>
          Import Data
          <input ref={inputRef} type="file" accept=".json" onChange={handleFile} style={{ display: 'none' }} />
        </label>
      </div>
      {msg && (
        <div style={{ fontSize: '12px', marginTop: '6px', color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)' }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}
