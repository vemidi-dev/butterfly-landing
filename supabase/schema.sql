-- Orders table for VeMiDi crafts checkout (run in Supabase SQL editor)

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  status text default 'new',
  product_name text,
  kit_name text,
  kit_size text,
  coloring text,
  personalization boolean default false,
  child_name text,
  total_price numeric(10,2),
  currency text default 'EUR',
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  courier text,
  delivery_type text,
  city text,
  delivery_details text,
  office_id text,
  office_name text,
  office_address text,
  payment_method text default 'cash_on_delivery',
  note text,
  raw_payload jsonb
);

create index if not exists orders_created_at_idx on orders (created_at desc);
create index if not exists orders_status_idx on orders (status);

alter table orders add column if not exists office_id text;
alter table orders add column if not exists office_name text;
alter table orders add column if not exists office_address text;
