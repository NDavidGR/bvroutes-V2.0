-- Mover / agregar / quitar paradas de una ruta, con renumeración atómica.
-- Ejecutar después de 01, 02 y 03.

-- El trigger de historial se puede silenciar dentro de move_stop (que registra un solo 'move').
create or replace function public.log_membership() returns trigger language plpgsql as $$
begin
  if current_setting('bv.skip_log', true) = 'on' then return null; end if;
  if tg_op = 'INSERT' then
    insert into public.changes(type, stop_id, route_id, to_route, to_pos, source) values ('add', new.stop_id, new.route_id, new.route_id, new.position, 'admin');
  elsif tg_op = 'DELETE' then
    insert into public.changes(type, stop_id, route_id, from_route, from_pos, source) values ('remove', old.stop_id, old.route_id, old.route_id, old.position, 'admin');
  end if;
  return null;
end $$;

-- Agrega una parada a una ruta. p_pos = posición deseada (1 = al inicio); null o mayor que el final = al final.
-- Las paradas desde esa posición se corren una hacia abajo. En rutas sin orden (R8) la posición se ignora.
create or replace function public.add_stop_to_route(p_stop uuid, p_route text, p_pos integer default null, p_zone text default null)
returns void language plpgsql as $$
declare r public.routes; n integer;
begin
  select * into r from public.routes where id = p_route;
  if not found then raise exception 'La ruta % no existe', p_route; end if;
  if exists (select 1 from public.route_stops where route_id = p_route and stop_id = p_stop) then
    raise exception 'La parada ya está en la ruta %', p_route;
  end if;
  if not r.ordered then
    insert into public.route_stops(route_id, stop_id, position, zone) values (p_route, p_stop, null, p_zone);
    return;
  end if;
  select count(*) into n from public.route_stops where route_id = p_route;
  if p_pos is null or p_pos > n + 1 then p_pos := n + 1; end if;
  if p_pos < 1 then p_pos := 1; end if;
  update public.route_stops set position = position + 1 where route_id = p_route and position >= p_pos;
  insert into public.route_stops(route_id, stop_id, position, zone) values (p_route, p_stop, p_pos, p_zone);
end $$;

-- Quita una parada de una ruta y cierra el hueco.
create or replace function public.remove_stop_from_route(p_stop uuid, p_route text)
returns void language plpgsql as $$
declare old_pos integer;
begin
  select position into old_pos from public.route_stops where route_id = p_route and stop_id = p_stop;
  if not found then raise exception 'La parada no está en la ruta %', p_route; end if;
  delete from public.route_stops where route_id = p_route and stop_id = p_stop;
  if old_pos is not null then
    update public.route_stops set position = position - 1 where route_id = p_route and position > old_pos;
  end if;
end $$;

-- Mueve una parada de una ruta a otra (sale de la de origen, entra en la de destino) y registra un solo 'move'.
create or replace function public.move_stop(p_stop uuid, p_from text, p_to text, p_pos integer default null)
returns void language plpgsql as $$
declare from_pos integer; to_final integer;
begin
  if p_from = p_to then raise exception 'El origen y el destino son la misma ruta'; end if;
  select position into from_pos from public.route_stops where route_id = p_from and stop_id = p_stop;
  if not found then raise exception 'La parada no está en la ruta %', p_from; end if;
  perform set_config('bv.skip_log', 'on', true);
  perform public.remove_stop_from_route(p_stop, p_from);
  perform public.add_stop_to_route(p_stop, p_to, p_pos, null);
  perform set_config('bv.skip_log', 'off', true);
  select position into to_final from public.route_stops where route_id = p_to and stop_id = p_stop;
  insert into public.changes(type, stop_id, from_route, to_route, from_pos, to_pos, source)
  values ('move', p_stop, p_from, p_to, from_pos, to_final, 'admin');
end $$;
