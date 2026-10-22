-- Plan del día: lo que pegas, cómo se organizó y cómo estaba la ruta en ese momento. Ejecutar después de 05.

create table if not exists public.day_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  route_id text not null references public.routes(id),
  input_text text not null default '',          -- lo pegado, tal cual
  lines jsonb not null default '[]'::jsonb,     -- [{raw, stop_id, name, status}] en el orden del día
  route_snapshot jsonb,                         -- [{stop_id, position}] de la ruta al organizar
  organized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  by uuid default auth.uid(),
  unique (plan_date, route_id)
);

-- Cada guardado con cambios queda como una versión (append-only): nunca se pierde un plan anterior.
create table if not exists public.day_plan_versions (
  id bigint generated always as identity primary key,
  plan_id uuid not null,
  plan_date date not null,
  route_id text not null,
  at timestamptz not null default now(),
  input_text text,
  lines jsonb,
  route_snapshot jsonb,
  organized_at timestamptz,
  by uuid default auth.uid()
);
create index if not exists day_plan_versions_plan_idx on public.day_plan_versions (plan_id, at desc);

create or replace function public.day_plans_version() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at = now();
    if old.input_text is not distinct from new.input_text and old.lines is not distinct from new.lines
       and old.route_snapshot is not distinct from new.route_snapshot then
      return new;                                 -- nada cambió: no hay versión nueva
    end if;
  end if;
  insert into public.day_plan_versions(plan_id, plan_date, route_id, input_text, lines, route_snapshot, organized_at)
  values (new.id, new.plan_date, new.route_id, new.input_text, new.lines, new.route_snapshot, new.organized_at);
  return new;
end $$;

drop trigger if exists day_plans_ver on public.day_plans;
create trigger day_plans_ver before insert or update on public.day_plans
  for each row execute function public.day_plans_version();

alter table public.day_plans         enable row level security;
alter table public.day_plan_versions enable row level security;
drop policy if exists editors_all on public.day_plans;
create policy editors_all on public.day_plans for all to authenticated using (public.is_editor()) with check (public.is_editor());
drop policy if exists plan_versions_read on public.day_plan_versions;
create policy plan_versions_read on public.day_plan_versions for select to authenticated using (public.is_editor());
