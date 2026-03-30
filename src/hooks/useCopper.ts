import { useState, useCallback } from 'react'
import type { Lead, ProspectRecord } from '../types'
import { useLeadsDispatch } from '../store/LeadsContext'
import { db } from '../lib/supabase'
import { settings } from '../lib/storage'
import {
  isCopperConfigured,
  pushLeadToCopper,
  fetchPipelines,
  type CopperCredentials,
  type CopperPipeline,
} from '../lib/copper'

export function useCopper() {
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dispatch = useLeadsDispatch()

  const configured = isCopperConfigured()

  const pushLead = useCallback(
    async (lead: Lead, record?: ProspectRecord): Promise<boolean> => {
      // Already fully pushed
      if (lead.copper_opportunity_id) return true

      setPushing(true)
      setError(null)

      const creds: CopperCredentials = {
        apiKey: settings.getCopperApiKey(),
        email: settings.getCopperEmail(),
      }

      const pipeline = settings.getCopperPipeline()
      if (!pipeline) {
        setError('Pipeline not configured. Go to Settings → Copper CRM.')
        setPushing(false)
        return false
      }

      try {
        const result = await pushLeadToCopper(
          creds,
          lead,
          record,
          pipeline.pipeline_id,
          pipeline.stage_id,
        )

        // Persist copper IDs to Supabase
        await db
          .from('leads')
          .update({
            copper_company_id: result.company_id,
            copper_person_id: result.person_id,
            copper_opportunity_id: result.opportunity_id,
          })
          .eq('id', lead.id)

        // Update local state
        dispatch({
          type: 'UPDATE',
          lead: {
            ...lead,
            copper_company_id: result.company_id,
            copper_person_id: result.person_id,
            copper_opportunity_id: result.opportunity_id,
          },
        })

        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Push to Copper failed')
        return false
      } finally {
        setPushing(false)
      }
    },
    [dispatch],
  )

  const loadPipelines = useCallback(async (): Promise<CopperPipeline[]> => {
    const creds: CopperCredentials = {
      apiKey: settings.getCopperApiKey(),
      email: settings.getCopperEmail(),
    }
    return fetchPipelines(creds)
  }, [])

  return { configured, pushing, error, pushLead, loadPipelines }
}
