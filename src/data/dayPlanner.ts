import { haversine } from './clustering'
import type { ProspectRecord } from '../types'

export interface Anchor {
  lat: number
  lng: number
  name?: string
}

export interface FillResult {
  assignments: Array<{ id: string; day: string }>
  skippedNoCoords: number
}

/**
 * Fill a day's stops by proximity to an anchor point.
 *
 * Replaces the old density-clustering autoAssignDay. Instead of finding the
 * densest cluster, the user picks an explicit anchor (a specific record, a
 * follow-up stop, or their current GPS location) and we pull the N nearest
 * unworked records to it.
 *
 * @param anchor     - lat/lng point to fill around (any reference location)
 * @param records    - all prospect.records
 * @param day        - 'Monday' | 'Tuesday' | etc.
 * @param n          - number of stops to assign
 * @param area       - optional area filter ('all' = no filter)
 */
export function fillFromAnchor(
  anchor: Anchor,
  records: ProspectRecord[],
  day: string,
  n: number,
  area: string = 'all'
): FillResult {
  const todayISO = new Date().toISOString().slice(0, 10)
  let skippedNoCoords = 0

  const pool = records.filter((r) => {
    if (r.status !== 'unworked' || r.day) return false
    if (!r.lat || !r.lng) { skippedNoCoords++; return false }
    if (area !== 'all' && r.area !== area) return false
    // Skip records on cooldown (follow-up date in the future)
    if (r.notes?.startsWith('cooloff:')) {
      const cooloff = r.notes.match(/cooloff:(\d{4}-\d{2}-\d{2})/)
      if (cooloff && cooloff[1] > todayISO) return false
    }
    return true
  })

  const sorted = pool
    .map((r) => ({
      record: r,
      dist: haversine(anchor.lat, anchor.lng, r.lat!, r.lng!),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n)

  return {
    assignments: sorted.map(({ record }) => ({ id: record.id, day })),
    skippedNoCoords,
  }
}
