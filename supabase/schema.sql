-- Run once in Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists contractors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company text not null,
  contact text,
  email text not null unique,          -- job alerts go here until texting is added
  mobile text not null,                -- for text alerts later
  business_phone text,                 -- shown to customers; set in step 2 of sign-up
  license text not null,               -- NJ license number(s) for their trades; verify before approving
  trades text[] not null default '{hvac}',   -- hvac | plumbing | electrical | appliance
  counties text[] not null,
  visit_fee integer,                   -- set in step 2 of sign-up; no alerts until it is
  alert_hours text not null default 'any',   -- any | day | weekday | nights
  status text not null default 'pending',    -- pending | approved | paused (you set this)
  manage_token text unique,            -- contractor's private link to pause alerts and change settings
  paused_until timestamptz,            -- the contractor's own pause; null = taking requests
  free_leads_left integer not null default 3,
  consent_at timestamptz not null,
  consent_text text not null
);

create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token text not null unique,          -- homeowner's private status link
  service text,                        -- heating | cooling | plumbing | water-heater | electrical | appliances
  problem text not null,
  zip text not null,
  county text not null,
  timing text not null,
  system text,                         -- heating and cooling requests only
  note text,
  name text,                           -- can arrive after the request is sent
  phone text not null,
  email text not null,
  address text,
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

-- Where the visitor came from (referral partner code, ad campaign, or referring site).
-- Safe to run again on an existing database.
alter table requests add column if not exists source text;
alter table contractors add column if not exists source text;

-- Contractor self-service (safe to run again on an existing database).
alter table contractors add column if not exists manage_token text unique default replace(gen_random_uuid()::text, '-', '');
alter table contractors add column if not exists paused_until timestamptz;
alter table contractors alter column visit_fee drop not null;
alter table contractors alter column business_phone drop not null;

-- More than heating and cooling (safe to run again on an existing database).
alter table contractors add column if not exists trades text[] not null default '{hvac}';
alter table requests add column if not exists service text;
alter table requests alter column system drop not null;
create index if not exists contractors_trades_idx on contractors using gin(trades);

-- Admin page, reviews, and spam limits (safe to run again on an existing database).
alter table alerts add column if not exists paid_at timestamptz;              -- when you marked this lead fee as paid
alter table requests add column if not exists chosen_contractor_id uuid;      -- who the homeowner picked
alter table requests add column if not exists rating integer;                 -- 1 to 5, from the homeowner after the visit
alter table requests add column if not exists showed_up boolean;
alter table requests add column if not exists review text;
alter table requests add column if not exists reviewed_at timestamptz;
alter table requests add column if not exists phone_digits text;              -- phone with digits only, for the spam limit
alter table requests add column if not exists device text;                    -- scrambled internet address, for the spam limit
create index if not exists requests_created_idx on requests(created_at);
create index if not exists requests_chosen_idx on requests(chosen_contractor_id);

-- Cancel, no-show, on-the-way updates, job results, profiles, photos, extra alert emails (safe to run again).
alter table requests add column if not exists canceled_at timestamptz;
alter table requests add column if not exists cancel_reason text;
alter table requests add column if not exists reopened_at timestamptz;          -- set when the homeowner reports a no-show and we send it out again
alter table requests add column if not exists on_time boolean;                  -- from the review: did they arrive when they said
alter table requests add column if not exists photos text[] not null default '{}';  -- paths in the private "photos" storage bucket
alter table alerts add column if not exists eta_status text;                    -- on_way | late | arrived
alter table alerts add column if not exists eta_min integer;
alter table alerts add column if not exists eta_at timestamptz;
alter table alerts add column if not exists job_result text;                    -- done | canceled | no_contact
alter table alerts add column if not exists job_result_at timestamptz;
alter table alerts add column if not exists fee_review boolean not null default false;  -- you need to decide on this lead fee
alter table contractors add column if not exists about text;
alter table contractors add column if not exists years_in_business integer;
alter table contractors add column if not exists website text;
alter table contractors add column if not exists extra_emails text[] not null default '{}';
create index if not exists alerts_contractor_idx on alerts(contractor_id, created_at desc);
create index if not exists requests_email_idx on requests(email, created_at desc);

-- Book the first pro automatically (safe to run again).
alter table requests add column if not exists auto_pick boolean not null default false;
alter table requests add column if not exists auto_max_fee integer;            -- highest visit fee the homeowner accepts for auto-booking; empty = any
alter table requests alter column name drop not null;                          -- name and address can now come after the request is sent
alter table requests alter column address drop not null;

-- Standby pros, confirmation, widening, daily job, hidden reviews, funnel events (safe to run again).
alter table requests add column if not exists widened_at timestamptz;          -- when we reminded pros and added neighboring counties
alter table requests add column if not exists confirm_nudged_at timestamptz;   -- when we asked the chosen pro to confirm
alter table requests add column if not exists review_reminded_at timestamptz;
alter table requests add column if not exists closed_notified_at timestamptz;  -- told the homeowner nobody could take it
alter table requests add column if not exists review_hidden boolean not null default false;  -- hidden by you on the admin page
alter table alerts add column if not exists confirmed_at timestamptz;          -- chosen pro tapped "I've talked to the customer"
create index if not exists requests_status_idx on requests(status, created_at);
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null, device text, source text
);
create index if not exists events_created_idx on events(created_at);
alter table events enable row level security;

-- "Email me my link" sends, so nobody can flood someone's inbox.
create table if not exists link_sends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text, device text
);
create index if not exists link_sends_created_idx on link_sends(created_at);
alter table link_sends enable row level security;

-- Private bucket for request photos. Only the server can read or write it.
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;

-- The site only talks to the database from server functions using the service role key.
-- Row level security with no policies blocks everything else.
alter table contractors enable row level security;
alter table requests enable row level security;
alter table alerts enable row level security;
