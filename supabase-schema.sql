-- Restro Hisaab — Supabase schema
-- Run this once in Supabase Dashboard → SQL Editor → New query → Run

create table if not exists menu (
  id text primary key,
  name text not null,
  category text not null,
  price numeric not null,
  cost numeric default 0
);

create table if not exists inventory (
  id text primary key,
  name text not null,
  unit text not null,
  qty numeric not null default 0,
  min numeric not null default 0,
  cost numeric default 0
);

create table if not exists stock_log (
  id text primary key,
  item_id text,
  item_name text,
  type text,
  qty numeric,
  vendor text,
  note text,
  date date
);

create table if not exists restaurant_tables (
  name text primary key
);

create table if not exists bills (
  id text primary key,
  order_no int,
  ts bigint,
  table_name text,
  items jsonb,
  subtotal numeric,
  gst_pct numeric,
  gst numeric,
  total numeric,
  payment text,
  staff_id text,
  staff_name text,
  customer_id text
);

create table if not exists expenses (
  id text primary key,
  date date,
  category text,
  note text,
  amount numeric
);

create table if not exists staff (
  id text primary key,
  name text not null,
  role text,
  salary numeric,
  join_date date
);

create table if not exists salary_payments (
  id text primary key,
  staff_id text,
  staff_name text,
  date date,
  amount numeric,
  note text
);

create table if not exists attendance (
  id text primary key,
  staff_id text,
  staff_name text,
  date date,
  status text
);

create table if not exists vendors (
  id text primary key,
  name text not null,
  contact text,
  opening_balance numeric default 0,
  created_date date
);

create table if not exists vendor_purchases (
  id text primary key,
  vendor_id text,
  vendor_name text,
  date date,
  item_name text,
  qty numeric,
  unit text,
  amount numeric,
  note text
);

create table if not exists vendor_payments (
  id text primary key,
  vendor_id text,
  vendor_name text,
  date date,
  amount numeric,
  note text
);

create table if not exists customers (
  id text primary key,
  name text,
  phone text,
  join_date date,
  visits int default 0,
  total_spent numeric default 0,
  points int default 0
);

create table if not exists loyalty_log (
  id text primary key,
  customer_id text,
  customer_name text,
  date date,
  type text,
  points int,
  note text
);

create table if not exists reservations (
  id text primary key,
  name text,
  phone text,
  date date,
  time text,
  party_size int,
  table_name text,
  note text,
  status text,
  created_at bigint
);

create table if not exists settings (
  key text primary key,
  value jsonb
);

-- Row Level Security: open access for now (no login yet - single restaurant, MVP).
-- Tighten this later by adding auth and scoping policies to authenticated users.
alter table menu enable row level security;
alter table inventory enable row level security;
alter table stock_log enable row level security;
alter table restaurant_tables enable row level security;
alter table bills enable row level security;
alter table expenses enable row level security;
alter table staff enable row level security;
alter table salary_payments enable row level security;
alter table attendance enable row level security;
alter table vendors enable row level security;
alter table vendor_purchases enable row level security;
alter table vendor_payments enable row level security;
alter table customers enable row level security;
alter table loyalty_log enable row level security;
alter table reservations enable row level security;
alter table settings enable row level security;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'menu','inventory','stock_log','restaurant_tables','bills','expenses',
      'staff','salary_payments','attendance','vendors','vendor_purchases',
      'vendor_payments','customers','loyalty_log','reservations','settings'
    ])
  loop
    execute format('drop policy if exists "public_all" on %I;', t);
    execute format('create policy "public_all" on %I for all using (true) with check (true);', t);
  end loop;
end $$;

-- Seed default data (safe to re-run, uses fixed ids)
insert into restaurant_tables (name) values ('T1'),('T2'),('T3'),('T4'),('Parcel')
  on conflict (name) do nothing;

insert into menu (id, name, category, price, cost) values
  ('seed-menu-1','Paneer Butter Masala','Main Course',220,90),
  ('seed-menu-2','Dal Makhani','Main Course',180,60),
  ('seed-menu-3','Veg Biryani','Rice',190,75),
  ('seed-menu-4','Butter Naan','Bread',40,12),
  ('seed-menu-5','Masala Dosa','South Indian',110,35),
  ('seed-menu-6','Cold Coffee','Beverages',90,25),
  ('seed-menu-7','Gulab Jamun','Dessert',70,20),
  ('seed-menu-8','Veg Spring Roll','Starters',150,55)
  on conflict (id) do nothing;

insert into inventory (id, name, unit, qty, min) values
  ('seed-inv-1','Paneer','kg',8,5),
  ('seed-inv-2','Basmati Rice','kg',25,10),
  ('seed-inv-3','LPG Cylinder','pcs',2,2),
  ('seed-inv-4','Cooking Oil','ltr',6,8)
  on conflict (id) do nothing;

insert into settings (key, value) values
  ('rm_name', '"My Restaurant"'),
  ('rm_order_seq', '1000')
  on conflict (key) do nothing;

-- Enable realtime (instant cross-device sync) on every table.
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'menu','inventory','stock_log','restaurant_tables','bills','expenses',
      'staff','salary_payments','attendance','vendors','vendor_purchases',
      'vendor_payments','customers','loyalty_log','reservations','settings'
    ])
  loop
    begin
      execute format('alter publication supabase_realtime add table %I;', t);
    exception when duplicate_object then
      null; -- already added, fine
    end;
  end loop;
end $$;

-- ============================================================
-- v2 migration (Stitch redesign): veg tags, staff advances/tips,
-- customer udhar (credit) khata, daily cash audit, Kitchen Display.
-- Safe to re-run.
-- ============================================================

-- Menu: veg/non-veg tag + "86'd" (temporarily out of stock) toggle.
alter table menu add column if not exists veg boolean not null default true;
alter table menu add column if not exists available boolean not null default true;

-- Staff: daily-wage ("dihadi") vs monthly, and advance/peshgi vs regular salary.
alter table staff add column if not exists wage_type text not null default 'monthly';
alter table salary_payments add column if not exists type text not null default 'salary';

-- Reservations: advance/token deposit amount (waitlist itself just reuses status='waitlist').
alter table reservations add column if not exists advance_amount numeric not null default 0;

-- Customer credit ("udhar") ledger - same shape as loyalty_log/vendor_payments.
create table if not exists customer_credit (
  id text primary key,
  customer_id text,
  customer_name text,
  date date,
  type text, -- 'charge' (udhar diya) | 'payment' (udhar wasooli)
  amount numeric,
  note text
);

-- Daily tips pool collected at the counter, split among staff.
create table if not exists daily_tips (
  id text primary key,
  date date,
  amount numeric,
  note text
);

-- End-of-day cash drawer count, to reconcile against expected cash sales.
create table if not exists cash_audits (
  id text primary key,
  date date,
  counted_cash numeric,
  note text,
  created_at bigint
);

-- Kitchen Display System: one row per fired KOT ticket, so a separate
-- kitchen-facing screen can show live orders across devices in real time.
create table if not exists kot_tickets (
  id text primary key,
  table_name text,
  order_no int,
  items jsonb,
  status text, -- 'active' | 'ready' | 'served'
  fired_at bigint
);

alter table customer_credit enable row level security;
alter table daily_tips enable row level security;
alter table cash_audits enable row level security;
alter table kot_tickets enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['customer_credit','daily_tips','cash_audits','kot_tickets'])
  loop
    execute format('drop policy if exists "public_all" on %I;', t);
    execute format('create policy "public_all" on %I for all using (true) with check (true);', t);
  end loop;
end $$;

do $$
declare
  t text;
begin
  for t in select unnest(array['customer_credit','daily_tips','cash_audits','kot_tickets'])
  loop
    begin
      execute format('alter publication supabase_realtime add table %I;', t);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
