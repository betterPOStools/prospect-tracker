import { useCallback } from 'react'
import { useRecords, useRecordsDispatch } from '../store/RecordsContext'
import { fillFromAnchor } from '../data/dayPlanner'
import type { Anchor } from '../data/dayPlanner'

export function useDayPlanner() {
  const records = useRecords()
  const dispatch = useRecordsDispatch()

  const fillDay = useCallback(
    (anchor: Anchor, day: string, n: number, area = 'all') => {
      const result = fillFromAnchor(anchor, records, day, n, area)
      if (result.assignments.length > 0) {
        dispatch({ type: 'WEEK_ASSIGN', assignments: result.assignments })
      }
      return result
    },
    [records, dispatch],
  )

  const clearDay = useCallback(
    (day: string) => {
      dispatch({ type: 'CLEAR_DAY', day })
    },
    [dispatch],
  )

  const clearWeek = useCallback(() => {
    dispatch({ type: 'CLEAR_WEEK' })
  }, [dispatch])

  return { fillDay, clearDay, clearWeek }
}
