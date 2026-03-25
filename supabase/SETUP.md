# Outscraper Webhook Setup

This captures Outscraper results automatically — even when the app is closed.

## How it works

1. Outscraper completes a scrape → POSTs results to your Supabase Edge Function
2. Edge Function stores results in `webhook_results` table
3. Next time you open the app → Queue view auto-imports pending results

## Setup steps

### 1. Create the database table

Run the SQL in `migrations/001_webhook_results.sql` in your Supabase SQL Editor:
- Go to Supabase Dashboard → SQL Editor → New query
- Paste the contents and run

### 2. Deploy the Edge Function

```bash
# Install Supabase CLI if needed
brew install supabase/tap/supabase

# Link to your project (one-time)
cd /path/to/prospect-tracker
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function (--no-verify-jwt allows Outscraper to call it without auth)
supabase functions deploy outscraper-webhook --no-verify-jwt
```

Your webhook URL will be:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/outscraper-webhook
```

### 3. Add the webhook URL to the app

1. Open the app → Database → Outscraper → Settings
2. Paste your webhook URL in the "Webhook URL" field
3. Save settings

Now all new scrapes will include the webhook URL. When Outscraper finishes, it POSTs
results directly to your Edge Function.

### 4. Test it

1. Submit a small scrape (1-2 ZIPs)
2. Close the app
3. Wait for the scrape to complete (~5-15 min)
4. Open the app → Queue tab
5. You should see "Webhook: 1 task auto-imported" message

## Notes

- The Edge Function uses the service role key (set automatically by Supabase)
- Results are stored as JSONB, so large scrapes may take a few seconds to insert
- The `imported` flag prevents re-importing the same results
- You can also click "Check Webhook" in the Queue view to manually check for results
