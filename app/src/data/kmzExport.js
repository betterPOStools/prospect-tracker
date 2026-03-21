import JSZip from 'jszip'
import { PRIORITIES, PRIORITY_EMOJI } from './scoring.js'

const ICONS = {
  Fire: 'http://maps.google.com/mapfiles/kml/paddle/red-circle.png',
  Hot:  'http://maps.google.com/mapfiles/kml/paddle/orange-circle.png',
  Warm: 'http://maps.google.com/mapfiles/kml/paddle/ylw-circle.png',
  Cold: 'http://maps.google.com/mapfiles/kml/paddle/ltblu-circle.png',
  Dead: 'http://maps.google.com/mapfiles/kml/paddle/wht-circle.png',
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function placemark(r) {
  const desc = [
    r.a   && `Address: ${r.a}`,
    r.ph  && `Phone: ${r.ph}`,
    r.web && `Website: ${r.web}`,
    r.em  && `Email: ${r.em}`,
    r.rt  && `Rating: ${r.rt} ★ (${r.rv || 0} reviews)`,
    r.ty  && `Type: ${r.ty}`,
    r.nt  && `Notes: ${r.nt}`,
  ].filter(Boolean).join('&#10;')

  return `    <Placemark>
      <name>${esc(r.n)}</name>
      <description>${esc(desc)}</description>
      <styleUrl>#style-${r.pr}</styleUrl>
      <Point><coordinates>${r.lg},${r.lt},0</coordinates></Point>
    </Placemark>`
}

function buildKml(dbRecords) {
  const styles = PRIORITIES.map(p => `  <Style id="style-${p}">
    <IconStyle>
      <Icon><href>${ICONS[p]}</href></Icon>
    </IconStyle>
  </Style>`).join('\n')

  const folders = PRIORITIES.map(p => {
    const records = dbRecords.filter(r => r.pr === p && r.lt && r.lg)
    if (!records.length) return ''
    return `  <Folder>
    <name>${PRIORITY_EMOJI[p]} ${p} (${records.length})</name>
    <description>${p} priority prospects — score ${
      p === 'Fire' ? '100+' :
      p === 'Hot'  ? '80–99' :
      p === 'Warm' ? '60–79' :
      p === 'Cold' ? '40–59' : 'below 40'
    }</description>
${records.map(placemark).join('\n')}
  </Folder>`
  }).filter(Boolean).join('\n')

  const mapped = dbRecords.filter(r => r.lt && r.lg).length
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Prospect Tracker — ${new Date().toLocaleDateString()}</name>
  <description>${mapped} mapped records across ${PRIORITIES.filter(p => dbRecords.some(r => r.pr === p && r.lt && r.lg)).length} priority tiers</description>
${styles}
${folders}
</Document>
</kml>`
}

export async function exportKmz(dbRecords, filename) {
  const mapped = dbRecords.filter(r => r.lt && r.lg)
  if (!mapped.length) return 0

  const kml  = buildKml(dbRecords)
  const zip  = new JSZip()
  zip.file('doc.kml', kml)

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
  return mapped.length
}
