// Supabase Edge Function — receives Outscraper webhook notifications and fetches + stores results.
//
// Deploy:
//   supabase secrets set OUTSCRAPER_API_KEY=your-key
//   supabase functions deploy outscraper-webhook --no-verify-jwt
//
// Webhook URL: https://<project-ref>.supabase.co/functions/v1/outscraper-webhook
//
// Outscraper's webhook is a *notification*, not a data delivery. The payload is:
//   { id, status, results_location, quota_usage, ... }
//
// This function fetches the actual results from results_location before storing them,
// so the data is persisted even if the user doesn't open the app within the 2-hour window.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const oscraperKey  = Deno.env.get('OUTSCRAPER_API_KEY') || ''

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    console.log('[webhook] received:', JSON.stringify({ id: body.id, status: body.status, results_location: body.results_location }))

    const taskId          = body.id || body.task_id || ''
    const status          = (body.status || '').toUpperCase()
    const resultsLocation = body.results_location || ''

    if (!taskId) {
      return jsonResponse({ error: 'No task ID in payload' }, 400)
    }

    // Fetch actual results from Outscraper API
    let data: Record<string, unknown>[] = []
    let title = ''
    let tags  = ''

    if (resultsLocation && oscraperKey && ['SUCCESS', 'FINISHED', 'DONE'].includes(status)) {
      try {
        const resp = await fetch(resultsLocation, {
          headers: { 'X-API-KEY': oscraperKey },
        })
        if (resp.ok) {
          const result = await resp.json()
          data  = result.data || []
          title = result.metadata?.title || result.title || ''
          tags  = result.metadata?.tags  || result.tags  || ''

          // Outscraper sometimes wraps rows in an extra array per query
          if (data.length > 0 && Array.isArray(data[0]) && !(data[0] as Record<string, unknown>)?.name) {
            data = (data as unknown[][]).flat() as Record<string, unknown>[]
          }
          console.log(`[webhook] fetched ${data.length} rows from results_location`)
        } else {
          console.error(`[webhook] results fetch failed: ${resp.status}`)
        }
      } catch (e) {
        console.error('[webhook] results fetch error:', (e as Error).message)
      }
    } else if (!oscraperKey) {
      console.warn('[webhook] OUTSCRAPER_API_KEY not set — cannot fetch results')
    }

    // Fall back to inline data if present (future-proofing)
    if (!data.length && body.data) {
      data = body.data
      if (data.length > 0 && Array.isArray(data[0]) && !(data[0] as Record<string, unknown>)?.name) {
        data = (data as unknown[][]).flat() as Record<string, unknown>[]
      }
    }

    // Store in Supabase
    const supabase = createClient(supabaseUrl, serviceKey)
    const { error } = await supabase.from('webhook_results').insert({
      task_id:          taskId,
      title:            title || body.metadata?.title || body.title || '',
      tags:             tags  || body.metadata?.tags  || body.tags  || '',
      record_count:     data.length,
      result_data:      data,
      results_location: resultsLocation,
    })

    if (error) {
      console.error('Insert failed:', error.message)
      return jsonResponse({ error: error.message }, 500)
    }

    console.log(`[webhook] stored task ${taskId}: ${data.length} records`)
    return jsonResponse({ ok: true, task_id: taskId, records: data.length }, 200)
  } catch (e) {
    console.error('Webhook error:', (e as Error).message)
    return jsonResponse({ error: (e as Error).message }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
