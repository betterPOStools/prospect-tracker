import { useRef, useState } from 'react'
import { useDatabase, useDatabaseDispatch, useProspects, useCanvass } from '../../data/store.jsx'
import { useSnapshots } from '../../hooks/useSnapshots.js'
import { calcScore, calcPriority } from '../../data/scoring.js'
import { buildClusters } from '../../data/clustering.js'
import { isBlocklisted } from '../../data/blocklist.js'
import Button from '../../components/Button.jsx'
import btnStyles from '../../components/Button.module.css'

export default function ImportBar({ onImported }) {
  const db         = useDatabase()
  const dispatch   = useDatabaseDispatch()
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
      const XLSX = (await import('xlsx')).default
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: 'array' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!rows.length) { setMsg({ text: 'No data found in file.', type: 'err' }); return }

      const existingById   = Object.fromEntries(db.dbRecords.map(r => [r.id, r]))
      const existingByName = Object.fromEntries(db.dbRecords.map(r => [(r.n + '|' + r.zi).toLowerCase(), r]))

      let added = 0, updated = 0, dupes = 0
      const newRecords = []
      const seenInImport = new Set()

      rows.forEach(row => {
        const name = row.name || row['Business Name'] || ''
        if (!name) return
        if (isBlocklisted(name, db.dbBlocklist)) { dupes++; return }

        const lat     = parseFloat(row.latitude  || row.lat || 0)
        const lng     = parseFloat(row.longitude || row.lng || 0)
        const zip     = String(row.postal_code || row.ZIP || '')
        const placeId = row.place_id || row.google_id || ''
        const dedupKey = placeId ? `pid_${placeId}` : `nm_${name.toLowerCase().replace(/\W/g, '')}_${zip}`

        if (seenInImport.has(dedupKey)) { dupes++; return }
        seenInImport.add(dedupKey)

        const id = placeId ? `db_${placeId}` : `db_${name.replace(/\W/g, '_')}_${zip}`

        const fresh = {
          id, n: name,
          ty:  row.subtypes || row.category    || row.Type     || '',
          a:   row.address  || (row.street ? (row.street + ', ' + (row.city || '') + ', ' + (row.state_code || '') + ' ' + zip) : '') || row.Address || '',
          ci:  row.city     || row.City  || '',
          zi:  zip,
          ph:  String(row.phone || row.Phone || ''),
          web: row.website  || row.Website || '',
          mn:  row.menu_link || row['Menu Link'] || '',
          em:  row.email    || row.Email || '',
          es:  row['email.emails_validator.status'] || row['Email Status'] || '',
          lt: lat, lg: lng,
          rt:  parseFloat(row.rating  || row['Google Rating'] || 0),
          rv:  parseInt(row.reviews   || row['Review Count']  || 0),
          ch:  row['chain_info.chain'] === 'True' || row['Is Chain'] === 'Yes' || false,
          fb:  row.company_facebook  || row.Facebook  || '',
          ig:  row.company_instagram || row.Instagram || '',
          cn:  row.full_name        || row['Contact Name']  || '',
          ct:  row.title            || row['Contact Title'] || '',
          hr:  row.working_hours_csv_compatible || '',
          pi:  placeId,
          ar:  area,
          zo:  '',
          da:  '',
          st:  'unworked',
        }

        const cleanedScore = parseInt(row['Lead Score'] || 0)
        fresh.sc = Math.max(calcScore(fresh), cleanedScore)
        fresh.pr = calcPriority(fresh.sc)

        const existing = existingById[id] || existingByName[(name + '|' + zip).toLowerCase()]
        if (existing) {
          fresh.st = existing.st
          fresh.zo = existing.zo
          fresh.da = existing.da
          fresh.ar = existing.ar || area
          updated++
        } else {
          added++
        }

        newRecords.push(fresh)
      })

      const importedIds = new Set(newRecords.map(r => r.id))
      const kept = db.dbRecords.filter(r => !importedIds.has(r.id))
      const allRecords = [...kept, ...newRecords]

      const dbClusters = buildClusters(allRecords)
      const memberToZone = {}
      dbClusters.forEach(c => c.mb.forEach(mid => { memberToZone[mid] = c.id }))
      allRecords.forEach(r => { if (!r.zo || !existingById[r.id]?.zo) r.zo = memberToZone[r.id] || '' })

      const dbAreas = [...new Set([...db.dbAreas, area])]

      dispatch({ type: 'IMPORT', dbRecords: allRecords, dbClusters, dbAreas })
      setMsg({ text: `"${area}" imported — ${added} added, ${updated} updated, ${dupes} skipped. ${allRecords.length} total records.`, type: 'ok' })
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
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>Upload your Outscraper XLSX — scores, deduplicates, and clusters automatically</div>
        </div>
        <label className={`${btnStyles.btn} ${btnStyles.primary}`} style={{ cursor: 'pointer', marginLeft: 'auto' }}>
          Import XLSX
          <input ref={inputRef} type="file" accept=".xlsx,.csv" onChange={handleFile} style={{ display: 'none' }} />
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
