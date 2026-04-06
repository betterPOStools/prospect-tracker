import { useState } from 'react'
import { useLocationTracking, getMileageByDay } from '../../hooks/useLocationTracking.js'
import Button from '../../components/Button.jsx'

const sectionOuter = { background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: '12px' }
const sectionTitle = { fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '2px' }
const sectionSub   = { fontSize: '12px', color: 'var(--text2)', marginBottom: '10px' }

function formatMiles(miles) {
  return miles < 0.1 ? `${Math.round(miles * 5280)} ft` : `${miles.toFixed(1)} mi`
}

function formatDuration(points) {
  if (points.length < 2) return '--'
  const start = new Date(points[0].ts)
  const end = new Date(points[points.length - 1].ts)
  const mins = Math.round((end - start) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  return `${h}h ${mins % 60}m`
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function MileagePanel() {
  const {
    tracking, startTracking, stopTracking,
    todayMiles, allTracks, currentPos, clearTracks,
  } = useLocationTracking()

  const [showConfirm, setShowConfirm] = useState(null)
  const days = getMileageByDay(allTracks)
  const totalMiles = days.reduce((sum, d) => sum + d.miles, 0)

  return (
    <div>
      {/* Live Tracking Control */}
      <div style={sectionOuter}>
        <div style={sectionTitle}>Location Tracking</div>
        <div style={sectionSub}>
          {tracking
            ? 'GPS is active — tracking your route in the background.'
            : 'Start tracking to log mileage for today\'s canvass route.'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          {tracking ? (
            <Button size="sm" variant="danger" onClick={stopTracking}>
              Stop Tracking
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={startTracking}>
              Start Tracking
            </Button>
          )}

          {tracking && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: 'var(--green-text)',
                boxShadow: '0 0 6px var(--green-text)',
                display: 'inline-block',
              }} />
              <span style={{ fontSize: '12px', color: 'var(--green-text)', fontWeight: 500 }}>
                Recording
              </span>
            </div>
          )}
        </div>

        {/* Today's Stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px',
        }}>
          <div style={{
            background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '10px 12px',
            border: '0.5px solid var(--border)',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Today</div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
              {formatMiles(todayMiles)}
            </div>
          </div>
          <div style={{
            background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '10px 12px',
            border: '0.5px solid var(--border)',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Points</div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
              {allTracks.filter(t => t.ts.startsWith(new Date().toISOString().slice(0, 10))).length}
            </div>
          </div>
          <div style={{
            background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '10px 12px',
            border: '0.5px solid var(--border)',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>All Time</div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
              {formatMiles(totalMiles)}
            </div>
          </div>
        </div>

        {currentPos && (
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px', fontFamily: 'var(--mono)' }}>
            Last: {currentPos.lat.toFixed(5)}, {currentPos.lng.toFixed(5)}
          </div>
        )}
      </div>

      {/* Mileage Log */}
      <div style={sectionOuter}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={sectionTitle}>Mileage Log</div>
            <div style={sectionSub}>{days.length} day{days.length !== 1 ? 's' : ''} recorded</div>
          </div>
          {days.length > 0 && (
            showConfirm === 'all' ? (
              <div style={{ display: 'flex', gap: '6px' }}>
                <Button size="sm" variant="danger" onClick={() => { clearTracks(); setShowConfirm(null) }}>
                  Confirm Clear All
                </Button>
                <Button size="sm" onClick={() => setShowConfirm(null)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="danger" onClick={() => setShowConfirm('all')}>
                Clear All
              </Button>
            )
          )}
        </div>

        {days.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text3)', padding: '16px 0', textAlign: 'center' }}>
            No tracking data yet. Start tracking to log mileage.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {days.map(day => (
              <div key={day.date} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '8px 12px',
                border: '0.5px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                    {formatDate(day.date)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                    {day.points.length} points
                    {day.points.length >= 2 && (
                      <> &middot; {formatTime(day.points[0].ts)} - {formatTime(day.points[day.points.length - 1].ts)} &middot; {formatDuration(day.points)}</>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                    {day.miles.toFixed(1)} mi
                  </span>
                  {showConfirm === day.date ? (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <Button size="sm" variant="danger" onClick={() => { clearTracks(day.date); setShowConfirm(null) }}>
                        Delete
                      </Button>
                      <Button size="sm" onClick={() => setShowConfirm(null)}>No</Button>
                    </div>
                  ) : (
                    <button onClick={() => setShowConfirm(day.date)}
                      style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '14px', padding: '2px 4px' }}
                      title="Delete this day"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export */}
      {days.length > 0 && (
        <div style={sectionOuter}>
          <div style={sectionTitle}>Export Mileage</div>
          <div style={sectionSub}>Download your mileage log as CSV for expense reporting.</div>
          <Button size="sm" variant="primary" onClick={() => exportMileageCSV(days)}>
            Export CSV
          </Button>
        </div>
      )}
    </div>
  )
}

function exportMileageCSV(days) {
  const rows = days.map(d => ({
    Date: d.date,
    Miles: d.miles.toFixed(1),
    Points: d.points.length,
    Start: d.points.length >= 1 ? formatTimeCSV(d.points[0].ts) : '',
    End: d.points.length >= 2 ? formatTimeCSV(d.points[d.points.length - 1].ts) : '',
    Duration: formatDuration(d.points),
  }))

  const cols = Object.keys(rows[0])
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: `mileage-log.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

function formatTimeCSV(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
