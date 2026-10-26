-- SACHO: se elimina la del camión 3 (s0433) y se queda la del camión 4 (s0440), sin el "(2)". Correr una sola vez, después del 09.
do $$
declare s public.stops; m record;
begin
  select * into s from public.stops where legacy_id = 's0433' and name = 'SACHO' and active;
  if not found then raise exception 'No encontré la SACHO activa del camión 3 (s0433)'; end if;
  for m in select route_id from public.route_stops where stop_id = s.id loop
    perform public.remove_stop_from_route(s.id, m.route_id);
  end loop;
  update public.stops set active = false, deactivated_at = now(), deactivated_reason = 'Eliminada por David; se queda la SACHO del camión 4' where id = s.id;
  update public.stops set name = 'SACHO' where legacy_id = 's0440';
end $$;
