-- Cambia la posición de una parada dentro de su ruta (arrastrar y soltar). Renumera el resto y registra un 'reorder'.
-- p_pos = posición final deseada (1 = primera). Ejecutar después de 04.
create or replace function public.reorder_stop(p_route text, p_stop uuid, p_pos integer)
returns void language plpgsql as $$
declare r public.routes; n integer; old_pos integer;
begin
  select * into r from public.routes where id = p_route;
  if not found then raise exception 'La ruta % no existe', p_route; end if;
  if not r.ordered then raise exception 'La ruta % no tiene orden', p_route; end if;
  select position into old_pos from public.route_stops where route_id = p_route and stop_id = p_stop;
  if not found then raise exception 'La parada no está en la ruta %', p_route; end if;
  select count(*) into n from public.route_stops where route_id = p_route;
  if p_pos is null then raise exception 'Falta la posición'; end if;
  p_pos := greatest(1, least(p_pos, n));
  if p_pos = old_pos then return; end if;
  if p_pos < old_pos then
    update public.route_stops set position = position + 1 where route_id = p_route and position >= p_pos and position < old_pos;
  else
    update public.route_stops set position = position - 1 where route_id = p_route and position > old_pos and position <= p_pos;
  end if;
  update public.route_stops set position = p_pos where route_id = p_route and stop_id = p_stop;
  insert into public.changes(type, stop_id, route_id, from_pos, to_pos, source) values ('reorder', p_stop, p_route, old_pos, p_pos, 'admin');
end $$;
