-- Limpieza de paradas con el mismo nombre (decisiones de David, 22-oct-2026). Se corre UNA sola vez, después de 07.
-- Renombra con la zona, unifica duplicadas y retira las que se eliminan (se desactivan, no se borran: quedan en "Ver inactivas" y en el historial).
-- Si una parada (por su id de origen s####) no existe, el script se detiene y no cambia nada.

create or replace function public._bv_stop(p_legacy text) returns public.stops language plpgsql as $$
declare s public.stops;
begin
  select * into s from public.stops where legacy_id = p_legacy;
  if not found then raise exception 'No existe la parada %', p_legacy; end if;
  return s;
end $$;

create or replace function public._bv_rename(p_legacy text, p_name text) returns void language plpgsql as $$
begin update public.stops set name = p_name where id = (public._bv_stop(p_legacy)).id; end $$;

-- Saca la parada de todas sus rutas (cierra huecos) y la desactiva.
create or replace function public._bv_retire(p_legacy text, p_why text) returns void language plpgsql as $$
declare s public.stops; m record;
begin
  s := public._bv_stop(p_legacy);
  for m in select route_id from public.route_stops where stop_id = s.id loop
    perform public.remove_stop_from_route(s.id, m.route_id);
  end loop;
  update public.stops set active = false, deactivated_at = now(), deactivated_reason = p_why where id = s.id;
end $$;

-- Unifica: la que se queda toma las rutas de la duplicada (en la misma posición) y la duplicada se retira.
create or replace function public._bv_merge(p_keep text, p_dup text) returns void language plpgsql as $$
declare k public.stops; d public.stops; m record;
begin
  k := public._bv_stop(p_keep); d := public._bv_stop(p_dup);
  for m in select route_id, position, zone from public.route_stops where stop_id = d.id loop
    if not exists (select 1 from public.route_stops where stop_id = k.id and route_id = m.route_id) then
      perform public.add_stop_to_route(k.id, m.route_id, m.position, m.zone);   -- entra justo donde estaba la duplicada
    end if;
  end loop;
  perform public._bv_retire(p_dup, 'Duplicada: unificada con ' || k.name);
end $$;

do $$
begin
  -- Renombres (el otro del par se queda como está)
  perform public._bv_rename('s0149', 'BAIS MEDRASH NMB');
  perform public._bv_rename('s0241', 'BAMBU PAN NMB');
  perform public._bv_rename('s0654', 'BAMBU PAN BOCA');
  perform public._bv_rename('s0282', 'BISSLI DELRAY');
  perform public._bv_rename('s0191', 'CAFE LANDWER HLNDL');
  perform public._bv_rename('s0444', 'DIXIE BBQ AVENTURA');
  perform public._bv_rename('s0379', 'ELEGANT CATERING FORT L.');
  perform public._bv_rename('s0122', 'FRUTERIA HLNDL');
  perform public._bv_rename('s0485', 'FRUTERIA AVENTURA');
  perform public._bv_rename('s0447', 'GRAND CAFE NMB');
  perform public._bv_rename('s0240', 'HUMMUS VEGAS NMB');
  perform public._bv_rename('s0538', 'KOSHER BASEBALL HLWD');
  perform public._bv_rename('s0198', 'KOSHER FISH MARKET 801');
  perform public._bv_rename('s0012', 'LEC SOUTH BEACH');
  perform public._bv_rename('s0762', 'MAGEN DAVID SURFSIDE');
  perform public._bv_rename('s0544', 'SAGE CC');
  perform public._bv_rename('s0722', 'SEPHARDIC COMMUNITY MB');
  perform public._bv_rename('s0657', 'SMASH BOCA');
  perform public._bv_rename('s0694', 'STRIKE 10 BOCA');
  perform public._bv_rename('s0603', 'YOSSEF ROASTING HLWD');

  -- Son una sola tienda: se unifican (se queda la primera, hereda las rutas de la segunda)
  perform public._bv_merge('s0003', 's0245');   -- BH GOURMET: R7 y R8 + R1
  perform public._bv_merge('s0334', 's0437');   -- CHABAD ARUBA: R2 y R9 + R3
  perform public._bv_merge('s0395', 's0667');   -- FALAFEL BISTRO: R3 + R6
  perform public._bv_merge('s0331', 's0427');   -- SUNRISE PITA: R2, R9 + R3, R5

  -- Se eliminan (desactivadas, fuera de todas las rutas)
  perform public._bv_retire('s0394', 'Eliminada por David (sin confirmar); se agrega cuando vuelva a aparecer');   -- CHABAD MARTIN COUNTY (R3)
  perform public._bv_retire('s0690', 'Eliminada por David (sin confirmar); se agrega cuando vuelva a aparecer');   -- CHABAD MARTIN COUNTY (R6)
  perform public._bv_retire('s0182', 'Duplicada: es la misma que DUNWELL PIZZA (2) de R2-R3-R9');                  -- DUNWELL PIZZA (R1)
  perform public._bv_retire('s0769', 'Duplicada: es la misma que HARBOUR GRILL de R4');                           -- HARBOUR GRILL (R7)
  perform public._bv_retire('s0168', 'Eliminada por David');                                                      -- IN AND OUT (R1)
  perform public._bv_retire('s0127', 'Duplicada: es la misma que HAPPEAS de R7 y R8');                            -- HAPPEAS (R1)
end $$;

drop function public._bv_merge(text, text);
drop function public._bv_retire(text, text);
drop function public._bv_rename(text, text);
drop function public._bv_stop(text);

-- Ajuste posterior: BISSLI (R5) queda sin el "(2)" porque la otra ya se llama BISSLI DELRAY.
update public.stops set name = 'BISSLI' where legacy_id = 's0601';

-- IN AND OUT (R5) también sin el "(2)": la de R1 se eliminó.
update public.stops set name = 'IN AND OUT' where legacy_id = 's0576';
