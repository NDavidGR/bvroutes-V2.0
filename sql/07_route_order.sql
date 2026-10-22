-- Guarda el orden completo de una ruta de una sola vez (pantalla "Reordenar en el mapa").
-- p_order = paradas en el orden nuevo. Las que falten van al final conservando su orden actual.
-- Los ids que ya no estén en la ruta se ignoran (sirve para restaurar un orden viejo).
-- Registra UN cambio 'set_order' con el orden anterior y el nuevo, para poder restaurarlo. Ejecutar después de 06.
create or replace function public.set_route_order(p_route text, p_order uuid[], p_note text default null)
returns void language plpgsql as $$
declare r public.routes; before_ids uuid[]; after_ids uuid[]; given uuid[];
begin
  select * into r from public.routes where id = p_route;
  if not found then raise exception 'La ruta % no existe', p_route; end if;
  if not r.ordered then raise exception 'La ruta % no tiene orden', p_route; end if;
  select coalesce(array_agg(stop_id order by position), '{}') into before_ids from public.route_stops where route_id = p_route;
  -- solo las que siguen en la ruta, sin repetir, respetando el orden recibido
  select coalesce(array_agg(u order by o), '{}') into given
    from (select u, min(o) as o from unnest(coalesce(p_order, '{}')) with ordinality as t(u, o) where u = any(before_ids) group by u) z;
  select given || coalesce(array_agg(b order by ob) filter (where not b = any(given)), '{}')
    into after_ids from unnest(before_ids) with ordinality as bb(b, ob);
  if after_ids = before_ids then return; end if;
  update public.route_stops rs set position = x.ord::integer
    from (select u, ord from unnest(after_ids) with ordinality as t(u, ord)) x
    where rs.route_id = p_route and rs.stop_id = x.u;
  insert into public.changes(type, route_id, before, after, source, note)
    values ('set_order', p_route, to_jsonb(before_ids), to_jsonb(after_ids), 'admin', p_note);
end $$;
