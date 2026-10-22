/* Configuración pública. La anon key es pública por diseño: la seguridad la dan las reglas RLS. */
window.BV_CONFIG = {
  SUPABASE_URL: 'https://emgdywcoqetvxdggpxcl.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZ2R5d2NvcWV0dnhkZ2dweGNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2OTQ1OTcsImV4cCI6MjEwODI3MDU5N30.FCrLJjavzTT4lxO7bn-qFosG2i09Dwk6WKC9ypefVbo',
  MAP_ID: 'DEMO_MAP_ID',            // cámbialo por un Map ID propio de Google Cloud cuando lo tengas
  MAP_CENTER: { lat: 25.86, lng: -80.2 },
  MAP_ZOOM: 11,
  ROUTE_COLORS: { '1': '#E69F00', '2': '#2E86DE', '3': '#00A878', '4': '#F2C200', '5': '#0B3C8C',
                  '6': '#D55E00', '7': '#CC4C9A', '8': '#555555', '9': '#8A63D2' }
};
