import { useCallback } from 'react'
import { useStopsDispatch } from '../store/StopsContext'
import { db } from '../lib/supabase'
import type { ActivityType, Activity } from '../types'

let idCounter = 0
function localId() {
  return `act_local_${Date.now()}_${++idCounter}`
}

export function useActivities() {
  const dispatch = useStopsDispatch()

  const addActivity = useCallback(
    async (
      stopId: string,
      type: ActivityType,
      text?: string,
      system = false,
    ): Promise<Activity> => {
      const now = new Date().toISOString()
      const activity: Activity = {
        id: localId(),
        stop_id: stopId,
        type,
        text,
        system,
        created_at: now,
      }

      // Optimistic local update
      dispatch({ type: 'APPEND_ACTIVITY', stop_id: stopId, activity })

      // Persist to Supabase
      const { data, error } = await db
        .from('activities')
        .insert({
          stop_id: stopId,
          type,
          text: text ?? null,
          system,
        })
        .select()
        .single()

      if (!error && data) {
        // Replace local id with server id
        const serverActivity: Activity = {
          id: data.id as string,
          stop_id: stopId,
          type,
          text: text ?? undefined,
          system,
          created_at: data.created_at as string,
        }
        dispatch({ type: 'APPEND_ACTIVITY', stop_id: stopId, activity: serverActivity })
      }

      return activity
    },
    [dispatch],
  )

  return { addActivity }
}
