import { useMemo, useState } from 'react'
import { useDatabase, useCanvass, useProspects } from '../../data/store.jsx'
import { calcPipeline, calcCanvassPerf, calcTerritory, calcDataQuality, calcLeadPipeline } from '../../data/analyticsCalc.js'
import { loadCanvassLog } from '../../data/canvassLog.js'
import { PRIORITY_COLOR, PRIORITIES } from '../../data/scoring.js'
import StatBar from '../../components/StatBar.jsx'

/* ── Inline styles ──────────────────────────────────────────────────── */
const sectionOuter = { background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: '12px' }
const sectionTitle = { fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }
const sectionSub   = { fontSize: '12px', color: 'var(--text2)', marginBottom: '10px' }
const metricRow    = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: '13px' }
const metricLabel  = { color: 'var(--text2)' }
const metricValue  = { fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)' }
const bigNumber    = { fontSize: '28px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' }
const bigLabel     = { fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }
const trackStyle   = { background: 'var(--bg3)', borderRadius: '4px', height: '6px', overflow: 'hidden' }
const gridTwo      = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }

function Section({ title, sub, children }) {
  return (
    <div style={sectionOuter}>
      <div style={sectionTitle}>{title}</div>
      {sub && <div style={sectionSub}>{sub}</div>}
      {children}
    </div>
  )
}

/* ── Chart primitives ───────────────────────────────────────────────── */

function HBar({ pct, color, label, detail }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
        <span style={{ color: 'var(--text2)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{detail || `${pct}%`}</span>
      </div>
      <div style={trackStyle}>
        <div style={{ height: '100%', width: Math.max(pct, 1) + '%', background: color, borderRadius: '4px', transition: 'width .3s' }} />
      </div>
    </div>
  )
}

function StackedBar({ segments, height = 8 }) {
  const total = segments.reduce((s, seg) => s + seg.count, 0)
  if (total === 0) return null
  return (
    <div style={{ display: 'flex', borderRadius: '4px', overflow: 'hidden', height }}>
      {segments.filter(s => s.count > 0).map((seg, i) => (
        <div key={i} style={{ flex: seg.count, background: seg.color, minWidth: '2px' }}
          title={`${seg.label}: ${seg.count}`} />
      ))}
    </div>
  )
}

function Sparkline({ data, maxDays = 14 }) {
  if (!data.length) return <div style={{ fontSize: '12px', color: 'var(--text3)', padding: '8px 0' }}>No daily data yet — run End Day to start logging</div>
  const maxTotal = Math.max(...data.map(d => d.total || 1), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '60px', padding: '4px 0' }}>
      {data.map((d, i) => {
        const h = ((d.total || 0) / maxTotal) * 100
        const convH = d.total > 0 ? ((d.converted || 0) / maxTotal) * 100 : 0
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
            title={`${d.date}: ${d.total} stops, ${d.converted || 0} converted`}>
            <div style={{ position: 'relative', height: h + '%', minHeight: '2px', borderRadius: '2px 2px 0 0', background: 'var(--blue-bg)' }}>
              {convH > 0 && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: convH + '%', background: 'var(--green-text)', borderRadius: '0 0 2px 2px', opacity: 0.7 }} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ScoreHistogram({ buckets }) {
  const max = Math.max(...buckets, 1)
  const labels = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90+']
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '60px' }}>
        {buckets.map((count, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
            title={`${labels[i]}: ${count} records`}>
            <div style={{ height: (count / max) * 100 + '%', minHeight: count > 0 ? '2px' : '0', background: 'var(--accent)', borderRadius: '2px 2px 0 0', transition: 'height .3s' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
        {labels.map((l, i) => (
          <div key={i} style={{ flex: 1, fontSize: '9px', color: 'var(--text3)', textAlign: 'center' }}>{l}</div>
        ))}
      </div>
    </div>
  )
}

/* ── Sections ───────────────────────────────────────────────────────── */

function PipelineSection({ data }) {
  const { total, byPriority, byStatus, conversionRate } = data
  const statusStages = [
    { key: 'unworked',   label: 'Unworked',   color: 'var(--text3)' },
    { key: 'in_canvass', label: 'In Canvass',  color: 'var(--blue-text)' },
    { key: 'canvassed',  label: 'Canvassed',   color: 'var(--yellow-text)' },
    { key: 'converted',  label: 'Converted',   color: 'var(--green-text)' },
    { key: 'lead',       label: 'Lead',        color: 'var(--purple-text)' },
  ]

  return (
    <Section title="Pipeline Overview" sub={`${total} total records in database`}>
      <StatBar stats={PRIORITIES.map(p => ({ n: byPriority[p], label: p }))} />
      <div style={{ marginTop: '12px' }}>
        {statusStages.map(s => {
          const count = byStatus[s.key]
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return <HBar key={s.key} pct={pct} color={s.color} label={s.label} detail={`${count} (${pct}%)`} />
        })}
      </div>
      <div style={{ marginTop: '8px', display: 'flex', gap: '24px' }}>
        <div>
          <div style={bigNumber}>{conversionRate !== null ? (conversionRate * 100).toFixed(1) + '%' : 'N/A'}</div>
          <div style={bigLabel}>Conversion rate (worked → converted/lead)</div>
        </div>
      </div>
    </Section>
  )
}

function CanvassSection({ data }) {
  const { today, dailyLog, avgStopsPerDay, avgConversionRate, totalDaysLogged } = data
  const todayStats = [
    { n: today.total,         label: 'Total' },
    { n: today.converted,     label: 'Converted' },
    { n: today.dropped,       label: 'Dropped' },
    { n: today.noAnswer,      label: 'No Answer' },
    { n: today.comeBack,      label: 'Come Back' },
    { n: today.notInterested, label: 'Not Int.' },
  ]

  return (
    <Section title="Canvass Performance" sub="Today's snapshot + daily trend">
      <StatBar stats={todayStats} />
      <div style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>
          Last {dailyLog.length} days <span style={{ color: 'var(--text3)' }}>(blue = stops, green = converted)</span>
        </div>
        <Sparkline data={dailyLog} />
      </div>
      <div style={{ marginTop: '8px', display: 'flex', gap: '20px', fontSize: '13px', flexWrap: 'wrap' }}>
        <div><span style={metricLabel}>Avg stops/day: </span><span style={metricValue}>{avgStopsPerDay.toFixed(1)}</span></div>
        <div><span style={metricLabel}>Avg conversion: </span><span style={metricValue}>{avgConversionRate !== null ? (avgConversionRate * 100).toFixed(1) + '%' : 'N/A'}</span></div>
        <div><span style={metricLabel}>Days logged: </span><span style={metricValue}>{totalDaysLogged}</span></div>
      </div>
    </Section>
  )
}

function TerritorySection({ data }) {
  const { byArea, overallCoverage } = data

  const statusSegments = a => [
    { label: 'In Canvass',  count: a.in_canvass, color: 'var(--blue-text)' },
    { label: 'Canvassed',   count: a.canvassed,  color: 'var(--yellow-text)' },
    { label: 'Converted',   count: a.converted,  color: 'var(--green-text)' },
    { label: 'Lead',        count: a.lead,        color: 'var(--purple-text)' },
    { label: 'Unworked',    count: a.unworked,    color: 'var(--bg3)' },
  ]

  return (
    <Section title="Territory Coverage" sub={`${byArea.length} areas · ${overallCoverage}% overall coverage`}>
      {byArea.map(a => (
        <div key={a.area} style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{a.area}</span>
            <span style={{ fontSize: '12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
              {a.coveragePct}% worked · {a.worked}/{a.total}
            </span>
          </div>
          <StackedBar segments={statusSegments(a)} height={6} />
          <div style={{ display: 'flex', gap: '10px', marginTop: '3px', fontSize: '11px', color: 'var(--text3)' }}>
            {a.in_canvass > 0 && <span>{a.in_canvass} in canvass</span>}
            {a.canvassed > 0  && <span>{a.canvassed} canvassed</span>}
            {a.converted > 0  && <span>{a.converted} converted</span>}
            {a.lead > 0       && <span>{a.lead} leads</span>}
            {a.convRate !== null && <span style={{ marginLeft: 'auto' }}>{(a.convRate * 100).toFixed(0)}% conv rate</span>}
          </div>
        </div>
      ))}
    </Section>
  )
}

function DataQualitySection({ data }) {
  if (!data) return <Section title="Data Quality"><div style={{ fontSize: '13px', color: 'var(--text3)' }}>No records in database</div></Section>

  const fields = [
    { label: 'Phone',    pct: data.pctPhone,     n: data.withPhone,     color: 'var(--green-text)' },
    { label: 'Email',    pct: data.pctEmail,      n: data.withEmail,     color: 'var(--blue-text)' },
    { label: 'Website',  pct: data.pctWebsite,    n: data.withWebsite,   color: 'var(--accent)' },
    { label: 'Contact',  pct: data.pctContact,    n: data.withContact,   color: 'var(--purple-text)' },
    { label: 'Hours',    pct: data.pctHours,      n: data.withHours,     color: 'var(--yellow-text)' },
    { label: 'Employees', pct: data.pctEmployees, n: data.withEmployees, color: 'var(--orange-text)' },
  ]

  return (
    <Section title="Data Quality" sub={`${data.total} records · avg score ${data.avgScore}`}>
      <div style={gridTwo}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text2)', marginBottom: '6px' }}>Field Enrichment</div>
          {fields.map(f => (
            <HBar key={f.label} pct={f.pct} color={f.color} label={f.label} detail={`${f.pct}% (${f.n}/${data.total})`} />
          ))}
        </div>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text2)', marginBottom: '6px' }}>Score Distribution</div>
          <ScoreHistogram buckets={data.scoreBuckets} />
        </div>
      </div>
    </Section>
  )
}

function LeadSection({ data }) {
  const { total, byStatus, winRate } = data

  return (
    <Section title="Lead Pipeline" sub={`${total} total leads`}>
      <StatBar stats={[
        { n: byStatus.Open, label: 'Open' },
        { n: byStatus.Won, label: 'Won' },
        { n: byStatus.Lost, label: 'Lost' },
        { n: byStatus.Abandoned, label: 'Abandoned' },
      ]} />
      <div style={{ marginTop: '8px' }}>
        <div style={bigNumber}>{winRate !== null ? (winRate * 100).toFixed(0) + '%' : 'N/A'}</div>
        <div style={bigLabel}>Win rate (Won / decided)</div>
      </div>
    </Section>
  )
}

/* ── Main panel ─────────────────────────────────────────────────────── */

export default function AnalyticsPanel() {
  const { dbRecords } = useDatabase()
  const canvassStops = useCanvass()
  const prospects    = useProspects()

  const [dailyLog] = useState(() => loadCanvassLog())

  const pipeline    = useMemo(() => calcPipeline(dbRecords),                    [dbRecords])
  const canvassPerf = useMemo(() => calcCanvassPerf(canvassStops, dailyLog),    [canvassStops, dailyLog])
  const territory   = useMemo(() => calcTerritory(dbRecords),                    [dbRecords])
  const quality     = useMemo(() => calcDataQuality(dbRecords),                 [dbRecords])
  const leadStats   = useMemo(() => calcLeadPipeline(prospects),                [prospects])

  return (
    <div style={{ padding: '2px 0' }}>
      <PipelineSection data={pipeline} />
      <CanvassSection data={canvassPerf} />
      <TerritorySection data={territory} />
      <DataQualitySection data={quality} />
      <LeadSection data={leadStats} />
    </div>
  )
}
