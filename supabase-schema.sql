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
  round_off numeric default 0,
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
-- (restaurant_tables seeding moved to the v5 migration below, which
-- redefines this table with an `id` column - this original single-column
-- shape and seed are superseded, not re-run.)

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

-- Bills: rounded-total off-by-a-few-paise adjustment, shown on the receipt.
alter table bills add column if not exists round_off numeric not null default 0;

-- Menu: veg/non-veg tag + "86'd" (temporarily out of stock) toggle.
alter table menu add column if not exists veg boolean not null default true;
alter table menu add column if not exists available boolean not null default true;

-- Staff: daily-wage ("dihadi") vs monthly, and advance/peshgi vs regular salary.
alter table staff add column if not exists wage_type text not null default 'monthly';
alter table staff add column if not exists phone text;
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
  opening_cash numeric,
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

-- ============================================================
-- v3 migration: Super Admin / Admin / Captain roles, backed by real
-- Supabase Auth (email+password) + database-level RLS - not just a UI
-- gate. Safe to re-run.
--
-- Hierarchy:
--   super_admin  - owner. Full access to everything, always. Only role
--                  that can grant/revoke Admin's permissions.
--   admin        - manager. Access to each "resource" (billing, menu,
--                  expenses, ...) is only whatever role_permissions grants -
--                  Super Admin ticks checkboxes in the app (PermissionsTab)
--                  to control this, no code change needed.
--   captain      - waiter. Same mechanism as admin, but the checkboxes are
--                  set by an Admin instead of Super Admin (an Admin can only
--                  ever touch role_permissions rows for role='captain', see
--                  policy below - it can never grant itself or another
--                  admin more access).
-- ============================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('super_admin','admin','captain')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- `id` (not a composite `role`+`resource` primary key) so this table fits
-- the app's generic useSupabaseTable hook, which diffs/upserts by a single
-- `id` column like every other table.
create table if not exists role_permissions (
  id text primary key, -- `${role}:${resource}`
  role text not null check (role in ('admin','captain')),
  resource text not null,
  can_write boolean not null default false,
  unique (role, resource)
);

alter table profiles enable row level security;
alter table role_permissions enable row level security;

-- SECURITY DEFINER so RLS policies (including on `profiles` itself) can
-- call this without recursing into profiles' own RLS check.
create or replace function my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active = true
$$;

create or replace function has_resource(p_resource text, p_write boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when my_role() = 'super_admin' then true
    when my_role() is null then false
    else exists (
      select 1 from role_permissions rp
      where rp.role = my_role() and rp.resource = p_resource
        and (p_write is false or rp.can_write)
    )
  end
$$;

grant execute on function my_role() to authenticated, anon;
grant execute on function has_resource(text, boolean) to authenticated, anon;

-- profiles: everyone can read their own row (needed right after login to
-- learn their own role); super_admin can read/write every row; admin can
-- read/write only captain-tier rows (create/deactivate captains, never
-- touch another admin or super_admin).
drop policy if exists "profiles_select_own" on profiles;
drop policy if exists "profiles_select_managed" on profiles;
drop policy if exists "profiles_write" on profiles;
create policy "profiles_select_own" on profiles for select using (id = auth.uid());
create policy "profiles_select_managed" on profiles for select using (
  my_role() = 'super_admin' or my_role() = 'admin'
);
create policy "profiles_write" on profiles for all using (
  my_role() = 'super_admin' or (my_role() = 'admin' and role = 'captain')
) with check (
  my_role() = 'super_admin' or (my_role() = 'admin' and role = 'captain')
);

-- role_permissions: any logged-in user can read it (the app uses it to
-- decide what to show); only super_admin can write 'admin' rows, and
-- super_admin or admin can write 'captain' rows.
drop policy if exists "role_permissions_select" on role_permissions;
drop policy if exists "role_permissions_write" on role_permissions;
create policy "role_permissions_select" on role_permissions for select using (auth.uid() is not null);
create policy "role_permissions_write" on role_permissions for all using (
  my_role() = 'super_admin' or (my_role() = 'admin' and role = 'captain')
) with check (
  my_role() = 'super_admin' or (my_role() = 'admin' and role = 'captain')
);

-- Sensible starting grants (Super Admin/Admin can change anytime from the
-- Permissions screen - this is just what a fresh install ships with).
insert into role_permissions (id, role, resource, can_write) values
  ('admin:billing','admin','billing',true),
  ('admin:dashboard','admin','dashboard',false),
  ('admin:reports','admin','reports',true),
  ('admin:expenses','admin','expenses',true),
  ('admin:menu','admin','menu',true),
  ('captain:billing','captain','billing',true),
  ('captain:menu','captain','menu',false),
  ('captain:kitchen','captain','kitchen',false)
on conflict (id) do nothing;

-- Menu: GST-inclusive pricing, which service types an item is sold under,
-- "Today's Special" flag, and which kitchen/bar station prints its KOT.
alter table menu add column if not exists gst_included boolean not null default true;
alter table menu add column if not exists service_types jsonb not null default '["dine_in","delivery","parcel"]';
alter table menu add column if not exists is_special boolean not null default false;
alter table menu add column if not exists station text not null default 'kitchen'; -- 'kitchen' | 'bristo'

-- Bills: who's dining (captured by the Captain at the table), and discount
-- (Admin/Super Admin only - enforced in the UI, see BillingTab `restricted`).
alter table bills add column if not exists guest_count integer;
alter table bills add column if not exists guest_name text;
alter table bills add column if not exists discount numeric not null default 0;

-- kot_tickets.status already free text ('active' | 'ready' | 'served') -
-- 'cancelled' is a new value, no column change needed. A cancelled ticket
-- is inserted (not an update to the original) so the original ticket's
-- history stays intact and Kitchen Display can show a distinct alert card.

-- Map each physical table to the permission "resource" that gates it. A
-- table can appear more than once (e.g. kot_tickets is reachable from both
-- the Billing flow and the Kitchen Display screen) - the generator below
-- OR's every matching resource together into that table's policies.
-- Internal only (locked down below); not meant to be queried by the app.
create table if not exists _resource_map (table_name text, resource text);
truncate _resource_map;
insert into _resource_map (table_name, resource) values
  ('menu', 'menu'),
  ('inventory', 'inventory'), ('stock_log', 'inventory'),
  ('restaurant_tables', 'billing'),
  ('bills', 'billing'),
  ('kot_tickets', 'billing'), ('kot_tickets', 'kitchen'),
  ('expenses', 'expenses'),
  ('staff', 'staff'), ('salary_payments', 'staff'), ('attendance', 'staff'),
  ('vendors', 'vendors'), ('vendor_purchases', 'vendors'), ('vendor_payments', 'vendors'),
  ('customers', 'customers'), ('loyalty_log', 'customers'), ('customer_credit', 'customers'),
  ('reservations', 'reservations'),
  ('daily_tips', 'audit'), ('cash_audits', 'audit');
alter table _resource_map enable row level security; -- no policies = locked to everyone except the DB owner

do $$
declare
  tbl text;
  resources text[];
  select_cond text;
  write_cond text;
begin
  for tbl in select distinct table_name from _resource_map loop
    select array_agg(resource) into resources from _resource_map where table_name = tbl;
    select array_to_string(array(select format('has_resource(%L, true)', r) from unnest(resources) r), ' or ') into write_cond;
    select array_to_string(array(select format('has_resource(%L)', r) from unnest(resources) r), ' or ') into select_cond;

    execute format('drop policy if exists "public_all" on %I;', tbl);
    execute format('drop policy if exists "sa_all" on %I;', tbl);
    execute format('drop policy if exists "resource_select" on %I;', tbl);
    execute format('drop policy if exists "resource_insert" on %I;', tbl);
    execute format('drop policy if exists "resource_update" on %I;', tbl);
    execute format('drop policy if exists "resource_delete" on %I;', tbl);

    execute format('create policy "sa_all" on %I for all using (my_role() = ''super_admin'') with check (my_role() = ''super_admin'');', tbl);
    execute format('create policy "resource_select" on %I for select using (%s);', tbl, select_cond);
    execute format('create policy "resource_insert" on %I for insert with check (%s);', tbl, write_cond);
    execute format('create policy "resource_update" on %I for update using (%s) with check (%s);', tbl, write_cond, write_cond);
    execute format('create policy "resource_delete" on %I for delete using (%s);', tbl, write_cond);
  end loop;
end $$;

-- settings: rm_name/rm_details/rm_order_seq etc. Every logged-in role needs
-- to read these (branding, order sequence); only admin/super_admin can
-- change them (a captain shouldn't be able to edit the restaurant's GSTIN).
drop policy if exists "public_all" on settings;
drop policy if exists "settings_select" on settings;
drop policy if exists "settings_write" on settings;
create policy "settings_select" on settings for select using (auth.uid() is not null);
create policy "settings_write" on settings for all using (my_role() in ('admin','super_admin'))
  with check (my_role() in ('admin','super_admin'));

-- Captain's steward picker (in BillingTab) needs staff *names* without
-- exposing salary/phone - this view is what it reads instead of the real
-- `staff` table when a captain hasn't been granted the `staff` resource.
create or replace view staff_public as select id, name, role from staff;
grant select on staff_public to authenticated;

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table profiles';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table role_permissions';
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================
-- v4 migration: yearly subscription/license gate. This app is sold as one
-- dedicated deployment per restaurant (its own Supabase project) rather
-- than a shared multi-tenant database, so this is a single-row table, not
-- per-organization. Nobody in the app (not even Super Admin) can write to
-- it - only the developer, from the Supabase Dashboard/SQL editor, which
-- runs as the project owner and bypasses RLS. That's the "access control
-- stays with me" requirement. Safe to re-run.
-- ============================================================

create table if not exists subscription (
  id text primary key default 'main',
  status text not null default 'active' check (status in ('active','expired','cancelled')),
  started_at date not null default current_date,
  renews_at date not null,
  amount numeric,
  upi_vpa text,
  upi_payee_name text,
  last_reminder_sent_at date,
  notes text
);
alter table subscription enable row level security;
drop policy if exists "subscription_select" on subscription;
create policy "subscription_select" on subscription for select using (auth.uid() is not null);
-- Deliberately no insert/update/delete policy for anon/authenticated.

-- The renewal-reminder email needs somewhere to send it - Super Admin's
-- login email, denormalized here since auth.users isn't queryable from the
-- client (create-user Edge Function fills this in when it makes a user).
alter table profiles add column if not exists email text;

create extension if not exists pg_cron;
create extension if not exists pg_net;
-- The actual `select cron.schedule(...)` call is a one-time manual step
-- (it needs the deployed Edge Function's URL + key, which don't exist yet
-- at schema-authoring time) - see the deploy instructions.

-- ============================================================
-- v5 migration: move the live floor state (which tables exist, what's on
-- each table's order right now, what's already been fired to the kitchen,
-- steward/guest info) from device-local localStorage into Supabase.
--
-- This was fine when only one counter device used the app, but now that
-- Captain runs on their own phone separate from the counter/Admin device,
-- a purely local table list means every device sees a DIFFERENT floor -
-- table-shift, item-shift and even just "is table 6 occupied" need one
-- shared, realtime source of truth. `table_state` replaces the old
-- rm_open_orders/rm_kot_sent/rm_table_meta localStorage blobs with one row
-- per table that's currently in use.
-- ============================================================

-- restaurant_tables existed since v1 but was never actually wired up (the
-- app used localStorage instead) - rebuilding it properly now with an `id`
-- column so it fits the app's generic useSupabaseTable hook (same reason
-- role_permissions got one in v3). No real data depends on the old shape.
drop table if exists restaurant_tables cascade;
create table restaurant_tables (
  id text primary key,
  name text not null unique,
  sort_order int not null default 0
);
alter table restaurant_tables enable row level security;
drop policy if exists "sa_all" on restaurant_tables;
drop policy if exists "resource_select" on restaurant_tables;
drop policy if exists "resource_insert" on restaurant_tables;
drop policy if exists "resource_update" on restaurant_tables;
drop policy if exists "resource_delete" on restaurant_tables;
create policy "sa_all" on restaurant_tables for all using (my_role() = 'super_admin') with check (my_role() = 'super_admin');
create policy "resource_select" on restaurant_tables for select using (has_resource('billing'));
create policy "resource_insert" on restaurant_tables for insert with check (has_resource('billing', true));
create policy "resource_update" on restaurant_tables for update using (has_resource('billing', true)) with check (has_resource('billing', true));
create policy "resource_delete" on restaurant_tables for delete using (has_resource('billing', true));

insert into restaurant_tables (id, name, sort_order)
select 'T' || n, 'T' || n, n from generate_series(1, 20) n
union all
select 'Parcel-' || n, 'Parcel-' || n, 100 + n from generate_series(1, 4) n
on conflict (id) do nothing;

create table if not exists table_state (
  id text primary key, -- = table name; one row per table that currently has an order
  table_name text not null,
  items jsonb not null default '[]', -- [{menuId,name,price,qty,veg,note,station}]
  kot_sent jsonb not null default '{}', -- {menuId: qtyAlreadySentToKitchen}
  steward_id text,
  guest_count int,
  guest_name text,
  started_at bigint
);
alter table table_state enable row level security;
drop policy if exists "sa_all" on table_state;
drop policy if exists "resource_select" on table_state;
drop policy if exists "resource_insert" on table_state;
drop policy if exists "resource_update" on table_state;
drop policy if exists "resource_delete" on table_state;
create policy "sa_all" on table_state for all using (my_role() = 'super_admin') with check (my_role() = 'super_admin');
create policy "resource_select" on table_state for select using (has_resource('billing'));
create policy "resource_insert" on table_state for insert with check (has_resource('billing', true));
create policy "resource_update" on table_state for update using (has_resource('billing', true)) with check (has_resource('billing', true));
create policy "resource_delete" on table_state for delete using (has_resource('billing', true));

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table restaurant_tables';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table table_state';
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================
-- v6 migration: matches the real PetPooja setup seen at Sabor Cafe -
-- the ticket/bill shows who actually processed it (the logged-in Captain
-- or Admin - "Biller"), not just the assigned steward.
-- ============================================================
alter table kot_tickets add column if not exists biller_name text;
alter table bills add column if not exists billed_by text;

-- ============================================================
-- v7 migration (bug fix): table_state was missing the customer_name/
-- customer_phone columns the app writes on every add-item/steward/guest
-- update - every single write to table_state was failing silently (RLS
-- and the rest of the table were fine, this was just a missing column),
-- which is why orders looked like they "disappeared" on tab switch/reload -
-- nothing was actually being saved to the database at all.
-- ============================================================
alter table table_state add column if not exists customer_name text;
alter table table_state add column if not exists customer_phone text;

-- ============================================================
-- v8 migration: party/event booking packages on reservations - a flat
-- per-plate price + plate count + which menu items are included, so a
-- quote can be generated and shared with the customer.
-- ============================================================
alter table reservations add column if not exists package_items jsonb;
alter table reservations add column if not exists price_per_plate numeric;
alter table reservations add column if not exists plate_count int;

-- ============================================================
-- v9 migration (bug fix): discount was only ever a page-session React
-- state in BillingTab, not saved per table - switching tables kept the
-- old discount value applied to whichever table you switched to. Moving
-- it into table_state fixes that, and lets a party-package booking's
-- bulk-rate adjustment be pre-filled from Reservations.
-- ============================================================
alter table table_state add column if not exists discount numeric not null default 0;

-- ============================================================
-- v10 migration: named, reusable party plates (Gold/Platinum/Diamond
-- style) - set up once with a per-plate price and an included-items list
-- (shown on the quote only), then reused across bookings. The actual
-- bill only ever shows the plate name x plate count - never the
-- individual items - matching how real banquet/catering billing works.
-- ============================================================
create table if not exists menu_packages (
  id text primary key,
  name text not null,
  price_per_plate numeric not null,
  items jsonb not null default '[]' -- [{menuId, name}] - quote display only
);
alter table menu_packages enable row level security;
drop policy if exists "sa_all" on menu_packages;
drop policy if exists "resource_select" on menu_packages;
drop policy if exists "resource_insert" on menu_packages;
drop policy if exists "resource_update" on menu_packages;
drop policy if exists "resource_delete" on menu_packages;
create policy "sa_all" on menu_packages for all using (my_role() = 'super_admin') with check (my_role() = 'super_admin');
create policy "resource_select" on menu_packages for select using (has_resource('reservations') or has_resource('menu'));
create policy "resource_insert" on menu_packages for insert with check (has_resource('reservations', true) or has_resource('menu', true));
create policy "resource_update" on menu_packages for update using (has_resource('reservations', true) or has_resource('menu', true)) with check (has_resource('reservations', true) or has_resource('menu', true));
create policy "resource_delete" on menu_packages for delete using (has_resource('reservations', true) or has_resource('menu', true));

alter table reservations add column if not exists package_name text;

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table menu_packages';
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================
-- v11 migration: QR-code table ordering. A customer scans a per-table QR
-- code (no login) and lands on a public menu/cart page; placing an order
-- writes a `customer_order_requests` row for staff to review and accept
-- into the real table order - it never touches table_state/kot_tickets
-- directly, so an anonymous submission can't manipulate a live bill.
--
-- This is a paid bonus feature, sold separately from the base app - it
-- ships OFF by default (`subscription.qr_ordering_enabled = false`) and is
-- only ever flipped on by the developer per restaurant, the same way the
-- subscription row itself is developer-controlled. Safe to re-run.
-- ============================================================

alter table subscription add column if not exists qr_ordering_enabled boolean not null default false;

create or replace function qr_ordering_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select qr_ordering_enabled from subscription where id = 'main'), false)
$$;
grant execute on function qr_ordering_enabled() to authenticated, anon;

-- Per-table secret token the QR code encodes. Auto-filled by trigger so
-- every existing/new table gets one without touching app insert code.
alter table restaurant_tables add column if not exists qr_token text;
update restaurant_tables set qr_token = md5(random()::text || clock_timestamp()::text || id) where qr_token is null;
alter table restaurant_tables alter column qr_token set not null;
create unique index if not exists restaurant_tables_qr_token_idx on restaurant_tables (qr_token);

create or replace function set_qr_token() returns trigger
language plpgsql as $$
begin
  if new.qr_token is null then
    new.qr_token := md5(random()::text || clock_timestamp()::text || new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_set_qr_token on restaurant_tables;
create trigger trg_set_qr_token before insert on restaurant_tables for each row execute function set_qr_token();

-- Resolves a scanned token to a table - a SECURITY DEFINER function (not a
-- plain anon SELECT policy on restaurant_tables) so a stranger can't list
-- every table's token by just querying the table; they can only resolve
-- the one token they actually scanned. Also hands back the restaurant name
-- (from `settings`, otherwise anon-unreadable) so the customer page can
-- brand itself without a second query.
create or replace function resolve_qr_table(p_token text) returns table(table_id text, table_name text, restaurant_name text)
language sql stable security definer set search_path = public as $$
  select rt.id, rt.name, coalesce((select value #>> '{}' from settings where key = 'rm_name'), 'Restaurant')
  from restaurant_tables rt
  where rt.qr_token = p_token and qr_ordering_enabled()
$$;
grant execute on function resolve_qr_table(text) to anon;

-- Public menu read: only what a customer needs (available items), only
-- when the feature is switched on for this restaurant.
drop policy if exists "anon_select_menu" on menu;
create policy "anon_select_menu" on menu for select to anon using (qr_ordering_enabled() and available = true);

-- Customer order requests: a staging inbox, not the live bill. Anon can
-- only INSERT (never read/update/delete its own or anyone else's rows) -
-- staff (billing resource) review and accept/reject from BillingTab.
create table if not exists customer_order_requests (
  id text primary key,
  table_id text not null references restaurant_tables(id) on delete cascade,
  table_name text not null,
  items jsonb not null default '[]', -- [{menuId,name,price,qty,veg,note,station}]
  customer_name text,
  customer_phone text,
  note text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now()
);
alter table customer_order_requests enable row level security;
drop policy if exists "anon_insert_order_requests" on customer_order_requests;
drop policy if exists "sa_all" on customer_order_requests;
drop policy if exists "resource_select" on customer_order_requests;
drop policy if exists "resource_update" on customer_order_requests;
drop policy if exists "resource_delete" on customer_order_requests;
create policy "anon_insert_order_requests" on customer_order_requests for insert to anon with check (qr_ordering_enabled());
create policy "sa_all" on customer_order_requests for all using (my_role() = 'super_admin') with check (my_role() = 'super_admin');
create policy "resource_select" on customer_order_requests for select using (has_resource('billing'));
create policy "resource_update" on customer_order_requests for update using (has_resource('billing', true)) with check (has_resource('billing', true));
create policy "resource_delete" on customer_order_requests for delete using (has_resource('billing', true));

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table customer_order_requests';
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================
-- v12 migration: QR ordering now requires name+phone before placing an
-- order (enforced here too, not just in the UI, so a direct API call can't
-- skip it), and that customer gets registered into the same `customers`
-- table the rest of the app uses - so they show up in the Customers tab
-- right away, even before their first bill is completed.
--
-- Anon never gets a SELECT policy on `customers` (that would leak every
-- customer's name/phone/spend to anyone hitting the API) - this narrow
-- SECURITY DEFINER function is the only door in: it can only insert a new
-- customer or fill a blank name, never read the table back.
-- ============================================================

drop policy if exists "anon_insert_order_requests" on customer_order_requests;
create policy "anon_insert_order_requests" on customer_order_requests for insert to anon with check (
  qr_ordering_enabled()
  and customer_name is not null and length(trim(customer_name)) > 0
  and customer_phone is not null and length(trim(customer_phone)) > 0
);

create or replace function _upsert_customer(p_name text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_phone is null or length(trim(p_phone)) = 0 then
    return;
  end if;
  if exists (select 1 from customers where phone = p_phone) then
    if p_name is not null and length(trim(p_name)) > 0 then
      update customers set name = p_name where phone = p_phone and (name is null or length(trim(name)) = 0);
    end if;
  else
    insert into customers (id, name, phone, join_date, visits, total_spent, points)
    values (md5(random()::text || clock_timestamp()::text || p_phone), nullif(trim(p_name), ''), p_phone, current_date, 0, 0, 0);
  end if;
end;
$$;

create or replace function record_qr_customer(p_name text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not qr_ordering_enabled() then
    return;
  end if;
  perform _upsert_customer(p_name, p_phone);
end;
$$;
grant execute on function record_qr_customer(text, text) to anon;

-- ============================================================
-- v13 migration: one identical "register this customer" path no matter
-- where their name/phone gets captured - captain opening a table, a
-- reservation, or the QR order page. A Captain has billing write access
-- by default but often NOT the `customers` resource (Admin decides that
-- from Permissions), so a plain insert/update on `customers` would fail
-- silently under RLS exactly like the old table_state bug. This
-- SECURITY DEFINER function sidesteps that: any authenticated role can
-- register/touch a customer regardless of their `customers` grant, since
-- identifying who's dining is part of order-taking, not full CRM access.
-- It never touches visits/total_spent/points - those still only change
-- when a bill actually completes.
-- ============================================================

create or replace function register_customer(p_name text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _upsert_customer(p_name, p_phone);
end;
$$;
grant execute on function register_customer(text, text) to authenticated;

-- ============================================================
-- v14 migration: the bill/receipt never actually stored the customer's
-- name/phone captured when the table was opened (only `guest_name`, a
-- separate free-text headcount field) - so it never printed on the
-- receipt even though it was sitting right there in table_state. Add the
-- columns; BillingTab.jsx now copies them onto the bill at completion.
-- ============================================================

alter table bills add column if not exists customer_name text;
alter table bills add column if not exists customer_phone text;

-- ============================================================
-- v15 migration: real logo upload (replacing the plain-text restaurant
-- name in the sidebar header). A public Storage bucket - the public URL
-- route bypasses RLS entirely for a public bucket, so no SELECT policy is
-- needed; only INSERT/UPDATE/DELETE are restricted, to admin/super_admin
-- (a Captain never reaches this UI, but locked down at the DB regardless).
-- The chosen public URL is stored as a plain setting (`rm_logo_url`),
-- same pattern as `rm_name`/`rm_details`.
-- ============================================================

insert into storage.buckets (id, name, public) values ('branding', 'branding', true) on conflict (id) do nothing;

drop policy if exists "branding_admin_write" on storage.objects;
create policy "branding_admin_write" on storage.objects for all
  using (bucket_id = 'branding' and my_role() in ('admin', 'super_admin'))
  with check (bucket_id = 'branding' and my_role() in ('admin', 'super_admin'));

-- ============================================================
-- v16 migration: parcel/delivery orders need their own charges (delivery,
-- packaging/container, service) on top of the item total - and a way to
-- record when a bill was settled for less than its exact total (round-down
-- courtesy to the customer) without that gap showing up as a cash
-- shortage in the audit. `table_state` carries the three charges while an
-- order is still open (same pattern as `discount`); `bills` stores the
-- final figures once settled, plus `waived_off`.
-- ============================================================

alter table bills add column if not exists delivery_charge numeric not null default 0;
alter table bills add column if not exists container_charge numeric not null default 0;
alter table bills add column if not exists service_charge numeric not null default 0;
alter table bills add column if not exists waived_off numeric not null default 0;

alter table table_state add column if not exists delivery_charge numeric not null default 0;
alter table table_state add column if not exists container_charge numeric not null default 0;
alter table table_state add column if not exists service_charge numeric not null default 0;

-- ============================================================
-- v17 migration: menu item short codes, so a captain can search/add an
-- item by typing its code and pressing Enter instead of tapping through
-- the grid. Also records each item's gst_included flag onto the order
-- line itself (bills.items is jsonb, no column needed) so a non-GST item
-- (Red Bull, some soft drinks bought without a GST invoice) stops being
-- taxed - BillingTab.jsx now splits the bill into a taxable and a
-- non-taxable subtotal instead of taxing everything uniformly.
-- ============================================================

alter table menu add column if not exists code text;

-- ============================================================
-- v18 migration: KOT already showed who fired it (biller_name) but not
-- whether that was a Captain or Admin/Super Admin - kitchen staff couldn't
-- tell at a glance who to flag an issue to. Add the role alongside it.
-- ============================================================

alter table kot_tickets add column if not exists biller_role text;

-- ============================================================
-- v19 migration: demo mode. The restaurant hasn't confirmed/purchased yet,
-- so the 7-day renewal countdown shouldn't run against placeholder dates.
-- While is_demo is true, SubscriptionGate never blocks access and shows a
-- plain "DEMO" badge instead of the countdown/payment banners. Once the
-- owner sets a real started_at/renews_at and flips is_demo to false (from
-- the Supabase Dashboard - nobody else can write to this table, see the v4
-- migration above), the existing countdown/expiry logic activates on its
-- own, no code changes needed.
-- ============================================================

alter table subscription add column if not exists is_demo boolean not null default true;

-- ============================================================
-- v20 migration: split/part payment - a bill can be settled with more than
-- one payment mode (e.g. part Cash, part UPI). `bills.payment` stays a
-- single label ('Cash'/'UPI'/'Card'/'Split'); these three new columns hold
-- the actual amount collected via each mode so Cash Audit/Dashboard can
-- attribute revenue correctly even for a split bill. Every bill going
-- forward (split or not) populates all three - a single-mode bill just has
-- one of them equal to the total and the other two zero - so downstream
-- reads never need to branch on whether a bill was split.
-- ============================================================

alter table bills add column if not exists cash_amount numeric not null default 0;
alter table bills add column if not exists upi_amount numeric not null default 0;
alter table bills add column if not exists card_amount numeric not null default 0;

-- ============================================================
-- v21 migration: a fourth role, 'inventory' - a dedicated login (created by
-- Admin or Super Admin) that only ever sees the Inventory screen. It can
-- add items, log stock in/out, and remove items, but the app's UI hides
-- the "Edit" action from it (editing name/unit/cost/min stays Admin/Super
-- Admin only) - same UI-level restriction pattern already used for
-- Captain (e.g. discount is hidden, not RLS-blocked). Reuses the existing
-- has_resource()/_resource_map machinery as-is: 'inventory' and
-- 'stock_log' already map to resource 'inventory' (see the v-numberless
-- _resource_map insert above), so granting this role that one resource is
-- all the RLS wiring needed - no new policies.
--
-- Also adds a free-text `category` to inventory items (the inventory
-- role's own request - "let me organize stock however makes sense to me"),
-- and records who logged each stock movement (mirrors kot_tickets'
-- biller_name/biller_role) so Admin can see who did what.
-- ============================================================

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('super_admin','admin','captain','inventory'));

alter table role_permissions drop constraint if exists role_permissions_role_check;
alter table role_permissions add constraint role_permissions_role_check check (role in ('admin','captain','inventory'));

insert into role_permissions (id, role, resource, can_write) values ('inventory:inventory', 'inventory', 'inventory', true)
  on conflict (role, resource) do update set can_write = true;

alter table inventory add column if not exists category text;
alter table stock_log add column if not exists logged_by_name text;
alter table stock_log add column if not exists logged_by_role text;

-- ===============================================================
-- THERMAL PRINTING / KOT REPRINT / BILL REPRINT SYSTEM
-- ===============================================================
-- Physical printing never happens from the browser. A normal KOT/bill
-- print enqueues a row in `print_jobs`; a separate Windows "Print Agent"
-- process (print-agent/, running on the counter PC) polls for pending
-- jobs, sends raw ESC/POS bytes to the actual printer (LAN for the
-- kitchen RTP-80, the Windows spooler/USB for the DCR3 that handles
-- both bristo KOTs and bills), and reports back success/failure.
-- `print_history` is the permanent audit trail (who/when/what/normal-or-
-- reprint); `print_jobs` is the working queue and can be inspected for
-- live status. KOT/bill reprint additionally requires a shared admin
-- password (hashed with pgcrypto, never readable from the frontend) -
-- enforced in the enqueue_reprint_job() RPC itself, not just hidden in
-- the UI, so a Captain can never reprint even via a direct API call.

-- kot_tickets: two columns the print/history system needs that the
-- table didn't have yet - whether this ticket was a reorder (add-on to
-- an already-fired KOT) and a stable creation timestamp for sorting.
alter table kot_tickets add column if not exists is_reorder boolean not null default false;
alter table kot_tickets add column if not exists created_at timestamptz not null default now();

-- ---------------------------------------------------------------
-- Admin reprint password (shared secret gating KOT/bill reprint)
-- ---------------------------------------------------------------
-- Deliberately NOT part of the profiles/role_permissions system - this
-- is one shared password the restaurant sets once, not per-user. Never
-- selectable from the frontend: no SELECT policy, and RLS + revoked
-- grants lock the table to the Postgres owner/service role only. The
-- only way in or out is through the two RPCs below, which never return
-- the hash itself - verify returns a boolean, set returns nothing but
-- success.
create table if not exists admin_reprint_security (
  id integer primary key default 1,
  password_hash text not null,
  updated_at timestamptz not null default now(),
  constraint admin_reprint_security_singleton check (id = 1)
);
alter table admin_reprint_security enable row level security;
revoke all on admin_reprint_security from anon;
revoke all on admin_reprint_security from authenticated;
-- No policies at all - even an authenticated admin/super_admin session
-- cannot SELECT/UPDATE this table directly, only via the RPCs.

create or replace function verify_admin_reprint_password(p_password text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
begin
  if auth.uid() is null then
    return false;
  end if;

  if my_role() not in ('admin', 'super_admin') then
    return false;
  end if;

  if p_password is null or length(p_password) = 0 then
    return false;
  end if;

  select password_hash into v_hash from admin_reprint_security where id = 1;

  if v_hash is null then
    return false;
  end if;

  return crypt(p_password, v_hash) = v_hash;
end;
$$;
revoke all on function verify_admin_reprint_password(text) from public;
grant execute on function verify_admin_reprint_password(text) to authenticated;

create or replace function set_admin_reprint_password(p_password text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if my_role() not in ('admin', 'super_admin') then
    return false;
  end if;

  if p_password is null or length(trim(p_password)) < 4 then
    raise exception 'Password must be at least 4 characters';
  end if;

  insert into admin_reprint_security (id, password_hash, updated_at)
  values (1, crypt(p_password, gen_salt('bf')), now())
  on conflict (id) do update set password_hash = excluded.password_hash, updated_at = now();

  return true;
end;
$$;
revoke all on function set_admin_reprint_password(text) from public;
grant execute on function set_admin_reprint_password(text) to authenticated;

-- ---------------------------------------------------------------
-- Printers - exactly two physical printer records
-- ---------------------------------------------------------------
-- Retsol RTP-80 (kitchen, LAN/ESC-POS-over-TCP) and Retsol DCR3 (bristo
-- KOT + bill, USB via the Windows printer spooler on the admin PC - ONE
-- physical printer, not two separate records, even though it handles
-- two different print types). IP/port/Windows-printer-name are left
-- blank until the owner configures them from Printer Settings - never
-- guessed or hardcoded.
create table if not exists printers (
  id text primary key,
  name text not null,
  type text not null check (type in ('lan', 'windows')),
  station text not null check (station in ('kitchen', 'bistro_bill')),
  ip_address text,
  port integer,
  windows_printer_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table printers enable row level security;
drop policy if exists "printers_select" on printers;
drop policy if exists "printers_write" on printers;
create policy "printers_select" on printers for select using (auth.uid() is not null);
create policy "printers_write" on printers for all
  using (my_role() in ('admin', 'super_admin'))
  with check (my_role() in ('admin', 'super_admin'));

insert into printers (id, name, type, station, port) values
  ('printer-kitchen', 'Retsol RTP-80', 'lan', 'kitchen', 9100),
  ('printer-dcr3', 'Retsol DCR3', 'windows', 'bistro_bill', null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- Print jobs - the working queue the Print Agent polls
-- ---------------------------------------------------------------
create table if not exists print_jobs (
  id text primary key,
  reference_id text not null,
  print_type text not null check (print_type in ('kot_kitchen', 'kot_bristo', 'bill', 'test')),
  station text not null check (station in ('kitchen', 'bristo', 'bistro_bill')),
  printer_id text references printers(id),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'printing', 'printed', 'failed')),
  attempts integer not null default 0,
  error text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  printed_at timestamptz
);
create unique index if not exists idx_print_jobs_idempotency_key on print_jobs(idempotency_key) where idempotency_key is not null;
create index if not exists idx_print_jobs_status_created on print_jobs(status, created_at);
create index if not exists idx_print_jobs_station_status on print_jobs(station, status);
create index if not exists idx_print_jobs_reference on print_jobs(reference_id);
alter table print_jobs enable row level security;
drop policy if exists "print_jobs_select" on print_jobs;
create policy "print_jobs_select" on print_jobs for select using (has_resource('billing'));
-- No insert/update/delete policy for authenticated/anon - every write
-- goes through enqueue_print_job/enqueue_reprint_job (normal users) or
-- claim_print_job/complete_print_job (Print Agent, via service_role,
-- which bypasses RLS entirely).

-- ---------------------------------------------------------------
-- Print history - permanent audit trail, Admin/Super Admin only
-- ---------------------------------------------------------------
create table if not exists print_history (
  id text primary key,
  job_id text references print_jobs(id),
  reference_id text not null,
  print_type text not null check (print_type in ('kot_kitchen', 'kot_bristo', 'bill', 'test')),
  station text not null check (station in ('kitchen', 'bristo', 'bistro_bill')),
  table_name text,
  order_no integer,
  printed_by uuid references auth.users(id),
  printed_at timestamptz not null default now(),
  is_reprint boolean not null default false,
  printer_id text references printers(id),
  status text not null default 'queued' check (status in ('queued', 'printing', 'printed', 'failed'))
);
create index if not exists idx_print_history_printed_at on print_history(printed_at desc);
create index if not exists idx_print_history_reference on print_history(reference_id);
create index if not exists idx_print_history_station on print_history(station);
alter table print_history enable row level security;
drop policy if exists "print_history_select" on print_history;
create policy "print_history_select" on print_history for select using (my_role() in ('admin', 'super_admin'));
-- No insert/update/delete policy - only the SECURITY DEFINER RPCs below
-- (enqueue_print_job/enqueue_reprint_job insert; complete_print_job
-- updates) ever write here.

-- ---------------------------------------------------------------
-- enqueue_print_job - normal (non-reprint) print jobs
-- ---------------------------------------------------------------
-- Idempotent: if idempotency_key collides with an existing job (a React
-- double-click/re-render firing the same "first print" twice), returns
-- the existing job's id instead of erroring or creating a duplicate.
create or replace function enqueue_print_job(
  p_reference_id text,
  p_print_type text,
  p_station text,
  p_printer_id text,
  p_payload jsonb,
  p_is_reprint boolean default false,
  p_table_name text default null,
  p_order_no integer default null,
  p_idempotency_key text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_job_id text;
  v_existing_id text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_print_type not in ('kot_kitchen', 'kot_bristo', 'bill', 'test') then
    raise exception 'Invalid print_type: %', p_print_type;
  end if;
  if p_station not in ('kitchen', 'bristo', 'bistro_bill') then
    raise exception 'Invalid station: %', p_station;
  end if;

  -- Reprints must go through enqueue_reprint_job, which enforces the
  -- admin/super_admin + password gate - this entry point only ever
  -- creates normal, no-password-required jobs.
  if p_is_reprint then
    raise exception 'Use enqueue_reprint_job for reprints';
  end if;

  if not has_resource('billing', true) then
    raise exception 'Not permitted to print';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from print_jobs where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  v_job_id := gen_random_uuid()::text;

  insert into print_jobs (id, reference_id, print_type, station, printer_id, payload, idempotency_key)
  values (v_job_id, p_reference_id, p_print_type, p_station, p_printer_id, p_payload, p_idempotency_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  if not found then
    select id into v_existing_id from print_jobs where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  insert into print_history (id, job_id, reference_id, print_type, station, table_name, order_no, printed_by, is_reprint, printer_id, status)
  values (gen_random_uuid()::text, v_job_id, p_reference_id, p_print_type, p_station, p_table_name, p_order_no, auth.uid(), false, p_printer_id, 'queued');

  return v_job_id;
end;
$$;
revoke all on function enqueue_print_job(text, text, text, text, jsonb, boolean, text, integer, text) from public;
grant execute on function enqueue_print_job(text, text, text, text, jsonb, boolean, text, integer, text) to authenticated;

-- ---------------------------------------------------------------
-- enqueue_reprint_job - the ONLY path that can create is_reprint=true
-- jobs. Admin/Super Admin only, enforced here regardless of what the
-- frontend sends (there is no p_is_reprint parameter at all - it is
-- hardcoded true internally, so it cannot be spoofed to false).
-- ---------------------------------------------------------------
create or replace function enqueue_reprint_job(
  p_reference_id text,
  p_print_type text,
  p_station text,
  p_printer_id text,
  p_payload jsonb,
  p_table_name text default null,
  p_order_no integer default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_job_id text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if my_role() not in ('admin', 'super_admin') then
    raise exception 'Only Admin/Super Admin can reprint';
  end if;

  if p_print_type not in ('kot_kitchen', 'kot_bristo', 'bill') then
    raise exception 'Invalid print_type: %', p_print_type;
  end if;
  if p_station not in ('kitchen', 'bristo', 'bistro_bill') then
    raise exception 'Invalid station: %', p_station;
  end if;

  v_job_id := gen_random_uuid()::text;

  -- Reprints never set idempotency_key - every reprint is intentionally
  -- a brand new job, never deduplicated against a previous one.
  insert into print_jobs (id, reference_id, print_type, station, printer_id, payload, idempotency_key)
  values (v_job_id, p_reference_id, p_print_type, p_station, p_printer_id, p_payload, null);

  insert into print_history (id, job_id, reference_id, print_type, station, table_name, order_no, printed_by, is_reprint, printer_id, status)
  values (gen_random_uuid()::text, v_job_id, p_reference_id, p_print_type, p_station, p_table_name, p_order_no, auth.uid(), true, p_printer_id, 'queued');

  return v_job_id;
end;
$$;
revoke all on function enqueue_reprint_job(text, text, text, text, jsonb, text, integer) from public;
grant execute on function enqueue_reprint_job(text, text, text, text, jsonb, text, integer) to authenticated;

-- ---------------------------------------------------------------
-- claim_print_job / complete_print_job - Print Agent only (called with
-- the service-role key, which authenticates as Postgres role
-- `service_role` and bypasses RLS entirely; these grants additionally
-- lock the RPCs themselves to that role so no authenticated app user
-- can call them even directly).
-- ---------------------------------------------------------------
create or replace function claim_print_job(p_station text) returns print_jobs
language plpgsql security definer set search_path = public as $$
declare
  v_job print_jobs;
begin
  with next_job as (
    select id from print_jobs
    where status = 'pending' and station = p_station
    order by created_at
    for update skip locked
    limit 1
  )
  update print_jobs pj
  set status = 'printing', attempts = pj.attempts + 1
  from next_job
  where pj.id = next_job.id
  returning pj.* into v_job;

  return v_job;
end;
$$;
revoke all on function claim_print_job(text) from public;
revoke all on function claim_print_job(text) from authenticated;
revoke all on function claim_print_job(text) from anon;
grant execute on function claim_print_job(text) to service_role;

create or replace function complete_print_job(
  p_job_id text,
  p_success boolean,
  p_error text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_attempts integer;
  v_max_attempts constant integer := 3;
begin
  if p_success then
    update print_jobs set status = 'printed', printed_at = now(), error = null where id = p_job_id;
    update print_history set status = 'printed' where job_id = p_job_id;
  else
    select attempts into v_attempts from print_jobs where id = p_job_id;
    if v_attempts is not null and v_attempts < v_max_attempts then
      update print_jobs set status = 'pending', error = p_error where id = p_job_id;
      update print_history set status = 'queued' where job_id = p_job_id;
    else
      update print_jobs set status = 'failed', error = p_error where id = p_job_id;
      update print_history set status = 'failed' where job_id = p_job_id;
    end if;
  end if;
end;
$$;
revoke all on function complete_print_job(text, boolean, text) from public;
revoke all on function complete_print_job(text, boolean, text) from authenticated;
revoke all on function complete_print_job(text, boolean, text) from anon;
grant execute on function complete_print_job(text, boolean, text) to service_role;

-- ---------------------------------------------------------------
-- Addendum: Running Bill + Check Items print types. Both route to the
-- same DCR3 printer as bristo KOTs/bills (station bistro_bill), and both
-- are normal operational prints - no admin password, unlike KOT/bill
-- reprint. "Running bill" is a live, not-yet-final total for a table
-- still open; "check items" is a read-only KOT-sourced order summary for
-- cross-checking with the customer.
-- ---------------------------------------------------------------
alter table print_jobs drop constraint if exists print_jobs_print_type_check;
alter table print_jobs add constraint print_jobs_print_type_check
  check (print_type in ('kot_kitchen', 'kot_bristo', 'bill', 'test', 'running_bill', 'check_items'));

alter table print_history drop constraint if exists print_history_print_type_check;
alter table print_history add constraint print_history_print_type_check
  check (print_type in ('kot_kitchen', 'kot_bristo', 'bill', 'test', 'running_bill', 'check_items'));

create or replace function enqueue_print_job(
  p_reference_id text,
  p_print_type text,
  p_station text,
  p_printer_id text,
  p_payload jsonb,
  p_is_reprint boolean default false,
  p_table_name text default null,
  p_order_no integer default null,
  p_idempotency_key text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_job_id text;
  v_existing_id text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_print_type not in ('kot_kitchen', 'kot_bristo', 'bill', 'test', 'running_bill', 'check_items') then
    raise exception 'Invalid print_type: %', p_print_type;
  end if;
  if p_station not in ('kitchen', 'bristo', 'bistro_bill') then
    raise exception 'Invalid station: %', p_station;
  end if;

  if p_is_reprint then
    raise exception 'Use enqueue_reprint_job for reprints';
  end if;

  if not has_resource('billing', true) then
    raise exception 'Not permitted to print';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from print_jobs where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  v_job_id := gen_random_uuid()::text;

  insert into print_jobs (id, reference_id, print_type, station, printer_id, payload, idempotency_key)
  values (v_job_id, p_reference_id, p_print_type, p_station, p_printer_id, p_payload, p_idempotency_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  if not found then
    select id into v_existing_id from print_jobs where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  insert into print_history (id, job_id, reference_id, print_type, station, table_name, order_no, printed_by, is_reprint, printer_id, status)
  values (gen_random_uuid()::text, v_job_id, p_reference_id, p_print_type, p_station, p_table_name, p_order_no, auth.uid(), false, p_printer_id, 'queued');

  return v_job_id;
end;
$$;
revoke all on function enqueue_print_job(text, text, text, text, jsonb, boolean, text, integer, text) from public;
grant execute on function enqueue_print_job(text, text, text, text, jsonb, boolean, text, integer, text) to authenticated;

-- ============================================================
-- Addendum: Check Items print is Admin/Super Admin only AND requires the
-- same shared admin password used for KOT/bill reprint (admin_reprint_
-- security) - unlike a reprint though, print_history.is_reprint stays
-- false here, since this is a normal operational print (staff verifying
-- an order with a customer), not a reprint of an already-printed
-- document. Role check + password check both happen inside this one
-- SECURITY DEFINER call (reusing verify_admin_reprint_password rather
-- than duplicating the crypt() check), and station/printer are hardcoded
-- rather than accepted as parameters, so a Captain - or anyone without
-- the password - can never queue this job even via a direct RPC call
-- from the browser console.
-- ============================================================
create or replace function enqueue_check_items_job(
  p_password text,
  p_reference_id text,
  p_payload jsonb,
  p_table_name text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_job_id text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if my_role() not in ('admin', 'super_admin') then
    raise exception 'Only Admin/Super Admin can print Check Items';
  end if;

  if not verify_admin_reprint_password(p_password) then
    raise exception 'Invalid admin password';
  end if;

  v_job_id := gen_random_uuid()::text;

  insert into print_jobs (id, reference_id, print_type, station, printer_id, payload)
  values (v_job_id, p_reference_id, 'check_items', 'bistro_bill', 'printer-dcr3', p_payload);

  insert into print_history (id, job_id, reference_id, print_type, station, table_name, printed_by, is_reprint, printer_id, status)
  values (gen_random_uuid()::text, v_job_id, p_reference_id, 'check_items', 'bistro_bill', p_table_name, auth.uid(), false, 'printer-dcr3', 'queued');

  return v_job_id;
end;
$$;
revoke all on function enqueue_check_items_job(text, text, jsonb, text) from public;
grant execute on function enqueue_check_items_job(text, text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
