-- BV Route Control Center 2.0 — esquema (Supabase / Postgres)
-- Ejecutar 01, luego 02 (datos), luego 03 (historial automático).

create table public.editors (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.editors enable row level security;  -- sin políticas: solo se toca desde el SQL Editor

create or replace function public.is_editor()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.editors where user_id = auth.uid()) $$;

create table public.depot (
  id smallint primary key default 1 check (id = 1),   -- una sola fila
  name text not null,
  lat double precision not null,
  lng double precision not null
);

create table public.stops (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,                 -- id del dry-run (s0001...), solo para trazabilidad
  name text not null,
  name_key text not null,                -- nombre normalizado (compatibilidad con overrides viejos)
  lat double precision,
  lng double precision,
  coord_source text check (coord_source in ('kml','manual')),
  opens_at time,                         -- 06:00 / 10:00
  tier text check (tier in ('large','regular')),
  fixed_position boolean not null default false,
  note text,
  type text check (type in ('customer','vendor','freight','warehouse')),
  plaza_key text,
  legacy_names text[] not null default '{}',
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index stops_name_key_idx on public.stops (name_key);
create index stops_latlng_idx on public.stops (lat, lng);

create table public.routes (
  id text primary key,                   -- '1'..'9'
  name text not null,
  destination text,
  ordered boolean not null default true, -- false = R8 (conjunto sin orden)
  base_route text references public.routes(id),  -- R9 -> R2
  days smallint[],                       -- 0=dom..6=sáb; null = sin definir
  color text,
  active boolean not null default true
);

create table public.route_stops (
  route_id text not null references public.routes(id) on update cascade,
  stop_id uuid not null references public.stops(id),
  position integer check (position > 0), -- null en rutas sin orden
  zone text,                             -- para R8: Downtown, Brickell, etc.
  primary key (route_id, stop_id),
  constraint route_stops_position_uniq unique (route_id, position) deferrable initially deferred
);
create index route_stops_stop_idx on public.route_stops (stop_id);

create table public.changes (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  type text not null,                    -- add | remove | edit | deactivate | reactivate | reorder | move
  stop_id uuid references public.stops(id),
  route_id text,
  from_route text,
  to_route text,
  from_pos integer,
  to_pos integer,
  before jsonb,
  after jsonb,
  source text not null default 'admin',
  note text,
  by uuid default auth.uid()
);
create index changes_stop_idx on public.changes (stop_id, at desc);

-- Seguridad: solo quien esté en public.editors puede leer y escribir.
alter table public.depot       enable row level security;
alter table public.stops       enable row level security;
alter table public.routes      enable row level security;
alter table public.route_stops enable row level security;
alter table public.changes     enable row level security;

create policy editors_all on public.depot       for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy editors_all on public.stops       for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy editors_all on public.routes      for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy editors_all on public.route_stops for all to authenticated using (public.is_editor()) with check (public.is_editor());
-- el historial es append-only: se lee e inserta, nunca se edita ni se borra
create policy changes_read   on public.changes for select to authenticated using (public.is_editor());
create policy changes_insert on public.changes for insert to authenticated with check (public.is_editor());
