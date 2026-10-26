-- Ajustes de nombres (26-oct-2026). Correr una sola vez, después del 08.
-- 1) Quita el "(2)" de las que ya tienen la hermana con zona (o ya no tienen hermana). SACHO (2) se deja: la otra SACHO sigue igual y quedarían dos idénticas.
-- 2) Todos los nombres en MAYÚSCULAS (había 5 en minúsculas/mixto).
-- Si algún cambio dejara dos paradas activas con el mismo nombre, se cancela todo y no cambia nada.
do $$
declare dup text;
begin
  update public.stops set name = btrim(regexp_replace(name, '\s*\(\d+\)\s*$', ''))
    where legacy_id in ('s0567','s0566','s0707','s0295','s0606','s0523','s0322','s0598');
    -- BAMBU PAN · HUMMUS VEGAS · BAIS MEDRASH · CAFE LANDWER · DIXIE BBQ · LEC · DUNWELL PIZZA · KOSHER FISH MARKET
  update public.stops set name = upper(name) where name <> upper(name);

  select string_agg(name, ', ') into dup from (select name from public.stops where active group by name having count(*) > 1) d;
  if dup is not null then raise exception 'Quedarían nombres repetidos: %', dup; end if;
end $$;
