-- Stores Outscraper webhook results until the app picks them up
create table if not exists webhook_results (
  id          bigint generated always as identity primary key,
  task_id     text not null,
  title       text default '',
  tags        text default '',
  record_count int default 0,
  result_data jsonb not null default '[]'::jsonb,
  received_at timestamptz default now(),
  imported    boolean default false,
  imported_at timestamptz
);

-- Index for quick lookup of unimported results
create index if not exists idx_webhook_unimported on webhook_results (imported) where imported = false;

-- Allow the Edge Function (service role) to insert
-- Allow the anon key (app) to read and update imported flag
alter table webhook_results enable row level security;

create policy "anon can read webhook results"
  on webhook_results for select
  using (true);

create policy "anon can update imported flag"
  on webhook_results for update
  using (true)
  with check (true);

create policy "service role can insert"
  on webhook_results for insert
  with check (true);
