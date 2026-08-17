-- ============================================================
-- IMPI Digital Firearm Permit System — Supabase Schema
-- ============================================================
-- Run this once in Supabase: Project → SQL Editor → New Query → paste → Run
--
-- IMPORTANT (per known IMPI Supabase gotcha): every new table has Row Level
-- Security ON by default with NO policies, which means it will silently
-- return zero rows to the app. This script explicitly disables RLS on
-- each table it creates so the app works immediately. If you later want
-- per-user restrictions, replace the DISABLE lines with proper policies.
-- ============================================================

-- ---------- Issuers (people authorised to issue/manage permits) ----------
create table if not exists issuers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  id_number text,
  role text,                     -- e.g. "Senior Operations Manager"
  auth_user_id uuid,             -- links to Supabase Auth user
  active boolean default true,
  created_at timestamptz default now()
);

-- ---------- Officers (security officers who may be issued firearms) ----------
create table if not exists officers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  id_number text not null,
  psira_number text,
  competency_number text not null,
  competency_expiry date,
  phone_number text not null,     -- WhatsApp number, format 27XXXXXXXXX
  active boolean default true,
  created_at timestamptz default now()
);

-- ---------- Firearms (company-registered firearms available to issue) ----------
create table if not exists firearms (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  calibre text not null,
  serial_number text not null unique,
  licence_reference text,         -- Section 20 licence number this firearm falls under
  status text default 'in_store', -- in_store | issued | maintenance | decommissioned
  created_at timestamptz default now()
);

-- ---------- Permits (the book-out / book-in record) ----------
create table if not exists permits (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,     -- random public verification token, e.g. IMPI-XXXXXX
  officer_id uuid references officers(id) not null,
  firearm_id uuid references firearms(id) not null,
  issuer_id uuid references issuers(id) not null,
  ammunition_qty integer default 0,
  duty_location text,
  purpose text,                   -- purpose/duration text required by Reg 5(5)
  issued_at timestamptz not null default now(),
  valid_until timestamptz not null,
  returned_at timestamptz,        -- null = still booked out
  return_ammunition_qty integer,
  return_notes text,
  status text not null default 'active', -- active | returned | expired | revoked
  whatsapp_sent boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_permits_token on permits(token);
create index if not exists idx_permits_officer on permits(officer_id);
create index if not exists idx_permits_status on permits(status);

-- ---------- Disable RLS so the app can read/write immediately ----------
alter table issuers disable row level security;
alter table officers disable row level security;
alter table firearms disable row level security;
alter table permits disable row level security;
