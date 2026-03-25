-- Add results_location column for debugging and fallback fetching
alter table webhook_results add column if not exists results_location text default '';
