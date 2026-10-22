/* Configuración pública. La anon key es pública por diseño: la seguridad la dan las reglas RLS. */
window.BV_CONFIG = {
  SUPABASE_URL: 'https://emgdywcoqetvxdggpxcl.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZ2R5d2NvcWV0dnhkZ2dweGNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2OTQ1OTcsImV4cCI6MjEwODI3MDU5N30.FCrLJjavzTT4lxO7bn-qFosG2i09Dwk6WKC9ypefVbo',
  MAP_ID: 'DEMO_MAP_ID',            // cámbialo por un Map ID propio de Google Cloud cuando lo tengas
  MAP_CENTER: { lat: 25.86, lng: -80.2 },
  MAP_ZOOM: 11,
  ROUTE_COLORS: { '1': '#FF7A1A', '2': '#3B82F6', '3': '#8BC34A', '4': '#12B5A6', '5': '#B3202A',
                  '6': '#D9A400', '7': '#D6249F', '8': '#4B5563', '9': '#1E3A8A' }
};
// Color de texto legible sobre el color de una ruta (negro sobre colores claros, blanco sobre oscuros).
window.BV_CONFIG.textOn = function (hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#14110d' : '#fff';
};
