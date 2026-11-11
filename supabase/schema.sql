-- Run once in Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists contractors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company text not null,
  contact text,
  email text not null unique,          -- job alerts go here until texting is added
  mobile text not null,                -- for text alerts later
  business_phone text not null,        -- shown to customers
  license text not null,               -- NJ HVACR license number; verify before approving
  counties text[] not null,
  visit_fee integer not null,
  alert_hours text not null default 'any',   -- any | day | weekday | nights
  status text not null default 'pending',    -- pending | approved | paused
  free_leads_left integer not null default 3,
  consent_at timestamptz not null,
  consent_text text not null
);

create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token text not null unique,          -- homeowner's private status link
  problem text not null,
  zip text not null,
  county text not null,
  timing text not null,
  system text not null,
  note text,
  name text not null,
  phone text not null,
  email text not null,
  address text not null,
  status text not null default 'open', -- open | matched
  chosen_alert_id uuid,
  matched_at timestamptz,
  consent_at timestamptz not null,
  consent_text text not null
);

-- One row per contractor alerted about a request. An accepted alert is an offer.
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid not null references requests(id) on delete cascade,
  contractor_id uuid not null references contractors(id) on delete cascade,
  token text not null unique,          -- contractor's private response link
  response text not null default 'none',   -- none | accepted | declined
  responded_at timestamptz,
  arrival text,
  visit_fee integer,
  outcome text,                        -- chosen | not_chosen
  lead_fee integer,                    -- dollars owed for this lead (0 while free leads remain)
  unique (request_id, contractor_id)
);

create index if not exists alerts_request_idx on alerts(request_id);
create index if not exists contractors_counties_idx on contractors using gin(counties);

-- The site only talks to the database from server functions using the service role key.
-- Row level security with no policies blocks everything else.
alter table contractors enable row level security;
alter table requests enable row level security;
alter table alerts enable row level security;
