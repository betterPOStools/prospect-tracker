// Supabase Edge Function — receives Outscraper webhook POSTs and stores results.
//
// Deploy: supabase functions deploy outscraper-webhook --no-verify-jwt
// Webhook URL: https://<project-ref>.supabase.co/functions/v1/outscraper-webhook
//
// Outscraper POSTs the full task result as JSON when a scrape completes.
// The payload shape is: { id, status, data: [...rows], ... }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()

    // Outscraper webhook payload: { id, status, data, metadata, ... }
    const taskId = body.id || body.task_id || ''
    const status = (body.status || '').toLowerCase()
    const title  = body.metadata?.title || body.title || ''
    const tags   = body.metadata?.tags || body.tags || ''

    // Extract result rows
    let data = body.data || []
    // Outscraper sometimes wraps rows in an extra array per query
    if (data.length > 0 && Array.isArray(data[0]) && !data[0]?.name) {
      data = data.flat()
    }

    if (!taskId) {
      return new Response(JSON.stringify({ error: 'No task ID in payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Store in Supabase
    const supabase = createClient(supabaseUrl, serviceKey)
    const { error } = await supabase.from('webhook_results').insert({
      task_id:      taskId,
      title,
      tags,
      record_count: data.length,
      result_data:  data,
    })

    if (error) {
      console.error('Insert failed:', error.message)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      ok: true,
      task_id: taskId,
      records: data.length,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('Webhook error:', e.message)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
