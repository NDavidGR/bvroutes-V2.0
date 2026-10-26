-- Enlace al mapa de Google My Maps de cada ruta (el que usaba la app anterior). Se puede cambiar desde el Plan del día (Mayús + clic en "My Maps").
alter table public.routes add column if not exists mymaps_url text;
update public.routes set mymaps_url = v.url from (values
  ('1','https://www.google.com/maps/d/edit?mid=1kJc-CbBjeHxe5ibYHtq3GhofS44Hy2U'),
  ('2','https://www.google.com/maps/d/edit?mid=1gVNMKCni7co4dr-e60ghpBjvTv32USk'),
  ('3','https://www.google.com/maps/d/edit?mid=1Q9iSq7zFyNSEBqT80g8_XspfpPkUGtA'),
  ('4','https://www.google.com/maps/d/edit?mid=1CmtCTI0Bsa6D6V0bx541QfIa5T1Z3vc'),
  ('5','https://www.google.com/maps/d/edit?mid=1qB18lWJtkun1L5c8ZhvaP9wBa8kC6qk'),
  ('6','https://www.google.com/maps/d/edit?mid=1L72fwuCxKpSbEhw8wxx-yOUx3xm4TMk'),
  ('7','https://www.google.com/maps/d/edit?mid=1iRna0LBr2_WqVcnFOdwAdH9UgDVDscM'),
  ('8','https://www.google.com/maps/d/edit?mid=1W5m8_OVR59UsrTOJvL0FHUIsODH1pUI')
) as v(id, url) where routes.id = v.id;
