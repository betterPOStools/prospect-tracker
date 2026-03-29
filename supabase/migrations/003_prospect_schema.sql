-- Prospect Tracker normalized schema
-- Migrated from JSON blob (app_state.payload) to per-table rows

CREATE SCHEMA IF NOT EXISTS prospect;

-- ── prospect.records ──────────────────────────────────────────────────────────
-- Scraped prospects from Outscraper. Scored and prioritized.

CREATE TABLE prospect.records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  type              TEXT,
  city              TEXT,
  zip               TEXT,
  phone             TEXT,
  email             TEXT,
  address           TEXT,
  website           TEXT,
  menu_link         TEXT,
  score             INTEGER DEFAULT 0,
  priority          TEXT DEFAULT 'Cold',
  area              TEXT,
  day               TEXT,
  status            TEXT DEFAULT 'unworked',
  place_id          TEXT UNIQUE,
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  rating            NUMERIC(2,1),
  reviews           INTEGER,
  is_chain          BOOLEAN DEFAULT false,
  facebook          TEXT,
  instagram         TEXT,
  contact_name      TEXT,
  contact_title     TEXT,
  working_hours     JSONB,
  phone_carrier     TEXT,
  phone_type        TEXT,
  employees         TEXT,
  revenue           TEXT,
  naics_code        TEXT,
  naics_description TEXT,
  "group"           TEXT,
  notes             TEXT,
  dropped_count     INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ── prospect.leads ────────────────────────────────────────────────────────────
-- Converted leads (the sales pipeline).

CREATE TABLE prospect.leads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  status       TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'Won', 'Lost')),
  phone        TEXT,
  address      TEXT,
  pos_type     TEXT,
  notes        TEXT,
  follow_up    DATE,
  last_contact TIMESTAMPTZ,
  record_id    UUID REFERENCES prospect.records(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ── prospect.canvass_stops ────────────────────────────────────────────────────
-- Daily working queue. Stops move through status transitions during canvassing.

CREATE TABLE prospect.canvass_stops (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  phone          TEXT,
  address        TEXT,
  status         TEXT DEFAULT 'queued',
  area           TEXT,
  day            TEXT,
  follow_up_date DATE,
  last_contact   TIMESTAMPTZ,
  "group"        TEXT,
  record_id      UUID REFERENCES prospect.records(id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- ── prospect.activities ───────────────────────────────────────────────────────
-- Append-only log of calls, SMS, notes, and status changes per stop or lead.

CREATE TABLE prospect.activities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id    UUID REFERENCES prospect.canvass_stops(id),
  lead_id    UUID REFERENCES prospect.leads(id),
  type       TEXT NOT NULL CHECK (type IN ('call', 'sms', 'note', 'status_change')),
  text       TEXT,
  system     BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT activity_has_parent CHECK (
    (stop_id IS NOT NULL) OR (lead_id IS NOT NULL)
  )
);

-- ── prospect.outscraper_tasks ─────────────────────────────────────────────────
-- Tracks Outscraper scrape jobs (status only — result data not stored here).

CREATE TABLE prospect.outscraper_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      TEXT NOT NULL UNIQUE,
  title        TEXT,
  tags         TEXT,
  status       TEXT DEFAULT 'pending',
  record_count INTEGER,
  config       JSONB,
  created_at   TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_records_score    ON prospect.records (score DESC);
CREATE INDEX idx_records_status   ON prospect.records (status);
CREATE INDEX idx_records_area     ON prospect.records (area);
CREATE INDEX idx_records_day      ON prospect.records (day);
CREATE INDEX idx_records_place_id ON prospect.records (place_id);

CREATE INDEX idx_stops_status ON prospect.canvass_stops (status);
CREATE INDEX idx_stops_day    ON prospect.canvass_stops (day);

CREATE INDEX idx_activities_stop_id ON prospect.activities (stop_id);
CREATE INDEX idx_activities_lead_id ON prospect.activities (lead_id);

-- ── updated_at triggers ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prospect.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER records_updated_at
  BEFORE UPDATE ON prospect.records
  FOR EACH ROW EXECUTE FUNCTION prospect.set_updated_at();

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON prospect.leads
  FOR EACH ROW EXECUTE FUNCTION prospect.set_updated_at();

CREATE TRIGGER stops_updated_at
  BEFORE UPDATE ON prospect.canvass_stops
  FOR EACH ROW EXECUTE FUNCTION prospect.set_updated_at();
