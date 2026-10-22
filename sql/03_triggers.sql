-- Historial automático. Ejecutar DESPUÉS de cargar los datos (02).

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger stops_touch before update on public.stops
  for each row execute function public.touch_updated_at();

-- Cambios en una parada: guarda solo los campos que cambiaron
create or replace function public.log_stop_edit() returns trigger language plpgsql as $$
declare b jsonb := '{}'; a jsonb := '{}'; k text; o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
begin
  for k in select jsonb_object_keys(n) loop
    continue when k in ('updated_at');
    if o -> k is distinct from n -> k then b := b || jsonb_build_object(k, o -> k); a := a || jsonb_build_object(k, n -> k); end if;
  end loop;
  if a = '{}'::jsonb then return new; end if;
  insert into public.changes(type, stop_id, before, after, source)
  values (case when old.active and not new.active then 'deactivate'
               when not old.active and new.active then 'reactivate' else 'edit' end,
          new.id, b, a, 'admin');
  return new;
end $$;
create trigger stops_log after update on public.stops
  for each row execute function public.log_stop_edit();

-- Altas y bajas de una parada en una ruta
create or replace function public.log_membership() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.changes(type, stop_id, route_id, to_route, to_pos, source) values ('add', new.stop_id, new.route_id, new.route_id, new.position, 'admin');
  elsif tg_op = 'DELETE' then
    insert into public.changes(type, stop_id, route_id, from_route, from_pos, source) values ('remove', old.stop_id, old.route_id, old.route_id, old.position, 'admin');
  end if;
  return null;
end $$;
create trigger route_stops_log after insert or delete on public.route_stops
  for each row execute function public.log_membership();
