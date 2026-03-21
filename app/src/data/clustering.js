export function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8
  const dlat = (lat2 - lat1) * Math.PI / 180
  const dlng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dlng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

export function buildClusters(records, radiusMiles = 0.5) {
  const clusters = []
  const byZip = {}
  records.forEach(r => { (byZip[r.zi] || (byZip[r.zi] = [])).push(r) })

  Object.entries(byZip).forEach(([zip, pts]) => {
    const sorted = [...pts].sort((a, b) => (b.rv || 0) - (a.rv || 0))
    const assigned = new Set()

    sorted.forEach(anchor => {
      if (assigned.has(anchor.id)) return
      const members = [anchor]
      assigned.add(anchor.id)
      sorted.forEach(pt => {
        if (assigned.has(pt.id)) return
        if (haversine(anchor.lt, anchor.lg, pt.lt, pt.lg) <= radiusMiles) {
          members.push(pt)
          assigned.add(pt.id)
        }
      })

      const clat = members.reduce((s, m) => s + m.lt, 0) / members.length
      const clng = members.reduce((s, m) => s + m.lg, 0) / members.length

      const wordCount = {}
      members.forEach(m => {
        (m.a || '').split(/[\s,]+/).forEach(w => {
          if (w.length > 3 && !/^\d/.test(w)) wordCount[w] = (wordCount[w] || 0) + 1
        })
      })
      const topWord = Object.entries(wordCount).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
      const hot = members.filter(m => m.pr === 'Fire' || m.pr === 'Hot').length

      clusters.push({
        id:  `zone_${zip}_${clusters.length}`,
        nm:  topWord ? `${zip} — ${topWord}` : zip,
        zi:  zip,
        lt:  Math.round(clat * 100000) / 100000,
        lg:  Math.round(clng * 100000) / 100000,
        cnt: members.length,
        hot,
        mb:  members.map(m => m.id),
      })
    })
  })

  return clusters.sort((a, b) => b.cnt - a.cnt)
}
