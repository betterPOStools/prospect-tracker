import { useMemo } from 'react'
import { useRecords } from '../../store/RecordsContext'
import { useLeads } from '../../store/LeadsContext'
import { useStops } from '../../store/StopsContext'
import {
  calcPipeline,
  calcTerritory,
  calcDataQuality,
  calcLeadPipeline,
  calcCanvassPerf,
} from '../../data/analyticsCalc'
import { loadCanvassLog } from '../../data/canvassLog'

function StatBox({
  label,
  value,
  color,
}: {
  label: string
  value: number | string
  color?: string
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl px-3 py-3 text-center"
      style={{ background: color ? color + '18' : undefined, border: `1px solid ${color ?? '#e5e7eb'}20` }}
    >
      <span className="text-xl font-bold" style={{ color: color ?? '#374151' }}>
        {value}
      </span>
      <span className="mt-0.5 text-[11px] font-medium text-gray-500">{label}</span>
    </div>
  )
}

function ProgressRow({ label, pct, count }: { label: string; pct: number; count: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-gray-600">
        <span className="font-medium">{label}</span>
        <span>
          {count} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
  )
}

export default function AnalyticsPanel() {
  const records = useRecords()
  const leads = useLeads()
  const stops = useStops()

  const pipeline = useMemo(() => calcPipeline(records), [records])
  const territory = useMemo(() => calcTerritory(records), [records])
  const quality = useMemo(() => calcDataQuality(records), [records])
  const leadPipeline = useMemo(() => calcLeadPipeline(leads), [leads])
  const canvassPerf = useMemo(() => {
    const log = loadCanvassLog()
    return calcCanvassPerf(stops, log)
  }, [stops])

  const worked =
    pipeline.byStatus.in_canvass +
    pipeline.byStatus.canvassed +
    pipeline.byStatus.converted

  const convRatePct =
    pipeline.conversionRate != null
      ? Math.round(pipeline.conversionRate * 100)
      : null

  const winRatePct =
    leadPipeline.winRate != null ? Math.round(leadPipeline.winRate * 100) : null

  const barMax = Math.max(...canvassPerf.dailyLog.map((d) => d.total), 1)

  return (
    <div className="flex flex-col gap-6 overflow-y-auto p-4">
      {/* Pipeline Overview */}
      <section>
        <SectionHeader title="Pipeline Overview" />
        <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
          <span className="text-2xl font-bold text-gray-900">{pipeline.total}</span>
          <span>total records</span>
        </div>
        <div className="mb-3 grid grid-cols-5 gap-2">
          <StatBox label="Fire" value={pipeline.byPriority.Fire} color="#ef4444" />
          <StatBox label="Hot" value={pipeline.byPriority.Hot} color="#f97316" />
          <StatBox label="Warm" value={pipeline.byPriority.Warm} color="#eab308" />
          <StatBox label="Cold" value={pipeline.byPriority.Cold} color="#3b82f6" />
          <StatBox label="Dead" value={pipeline.byPriority.Dead} color="#6b7280" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Unworked" value={pipeline.byStatus.unworked} />
          <StatBox label="Worked" value={worked} />
          <StatBox
            label="Conv. Rate"
            value={convRatePct != null ? `${convRatePct}%` : 'N/A'}
            color="#10b981"
          />
        </div>
      </section>

      {/* Data Quality */}
      <section>
        <SectionHeader title="Data Quality" />
        {quality == null ? (
          <p className="text-sm text-gray-400">No records yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <ProgressRow label="Phone" pct={quality.pctPhone} count={quality.withPhone} />
            <ProgressRow label="Email" pct={quality.pctEmail} count={quality.withEmail} />
            <ProgressRow label="Contact" pct={quality.pctContact} count={quality.withContact} />
            <ProgressRow label="Website" pct={quality.pctWebsite} count={quality.withWebsite} />
            <ProgressRow label="Coordinates" pct={quality.pctCoords} count={quality.withCoords} />
            <div className="mt-1 flex flex-col gap-1">
              <div className="flex justify-between text-xs text-gray-600">
                <span className="font-medium">Avg Score</span>
                <span>{quality.avgScore}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all"
                  style={{ width: `${quality.avgScore}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Territory Coverage */}
      <section>
        <SectionHeader title="Territory Coverage" />
        <div className="mb-2 text-sm text-gray-600">
          Overall coverage:{' '}
          <span className="font-semibold text-gray-900">{territory.overallCoverage}%</span>
        </div>
        {territory.byArea.length === 0 ? (
          <p className="text-sm text-gray-400">No areas imported yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Area</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Worked%</th>
                  <th className="px-3 py-2 text-right font-medium">Avg Score</th>
                  <th className="px-3 py-2 text-right font-medium">Conv Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {territory.byArea.map((a) => (
                  <tr key={a.area}>
                    <td className="px-3 py-2 font-medium text-gray-900">{a.area}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{a.total}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{a.coveragePct}%</td>
                    <td className="px-3 py-2 text-right text-gray-600">{a.avgScore}</td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {a.convRate != null ? `${Math.round(a.convRate * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Lead Pipeline */}
      <section>
        <SectionHeader title="Lead Pipeline" />
        <div className="grid grid-cols-5 gap-2">
          <StatBox label="Total" value={leadPipeline.total} />
          <StatBox label="Open" value={leadPipeline.byStatus.Open} color="#3b82f6" />
          <StatBox label="Won" value={leadPipeline.byStatus.Won} color="#10b981" />
          <StatBox label="Lost" value={leadPipeline.byStatus.Lost} color="#ef4444" />
          <StatBox
            label="Win Rate"
            value={winRatePct != null ? `${winRatePct}%` : 'N/A'}
            color="#10b981"
          />
        </div>
      </section>

      {/* Canvass Performance */}
      <section>
        <SectionHeader title="Canvass Performance" />
        <div className="mb-3 grid grid-cols-3 gap-2">
          <StatBox label="Today Worked" value={canvassPerf.today.total} />
          <StatBox label="Today Conv." value={canvassPerf.today.converted} color="#10b981" />
          <StatBox
            label="Avg Stops/Day"
            value={canvassPerf.avgStopsPerDay.toFixed(1)}
          />
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <StatBox
            label="Avg Conv. Rate"
            value={
              canvassPerf.avgConversionRate != null
                ? `${Math.round(canvassPerf.avgConversionRate * 100)}%`
                : 'N/A'
            }
            color="#10b981"
          />
          <StatBox label="Days Logged" value={canvassPerf.totalDaysLogged} />
        </div>

        {/* Last 14 Days Bar Chart */}
        {canvassPerf.dailyLog.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">Last 14 Days</p>
            <div className="flex h-20 items-end gap-1">
              {canvassPerf.dailyLog.map((d) => (
                <div
                  key={d.date}
                  className="group relative flex flex-1 flex-col items-center gap-0.5"
                  title={`${d.date}: ${d.total} stops, ${d.converted} converted`}
                >
                  <div className="relative flex w-full flex-col-reverse items-center">
                    {/* Converted layer */}
                    <div
                      className="w-full rounded-sm bg-green-500"
                      style={{ height: `${(d.converted / barMax) * 64}px` }}
                    />
                    {/* Stops above converted */}
                    <div
                      className="w-full rounded-sm bg-blue-400"
                      style={{
                        height: `${((d.total - d.converted) / barMax) * 64}px`,
                        minHeight: d.total > d.converted ? 2 : 0,
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-gray-400">
                    {d.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-blue-400" />
                Stops
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-green-500" />
                Converted
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
