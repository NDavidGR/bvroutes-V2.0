/* Mapa (Google Maps). Marcadores DOM: círculo con los colores de las rutas visibles; número si hay una sola ruta con orden. */
(function () {
  const C = window.BV_CONFIG;
  let map = null, ready = null, selectedId = null, hlId = null, line = null, wrap = null, tip = null, pickFn = null;
  const markers = new Map();      // stopId -> AdvancedMarkerElement
  let onSelect = () => {}, onMoved = () => {}, onHover = () => {};

  function loadScript(key) {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      window.__bvMapReady = () => resolve();
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
              '&v=weekly&libraries=marker&callback=__bvMapReady&loading=async';
      s.onerror = () => reject(new Error('No cargó Google Maps'));
      document.head.appendChild(s);
    });
    return ready;
  }

  function pinColor(routeIds) {
    const cols = routeIds.map(r => C.ROUTE_COLORS[r] || '#888');
    if (cols.length === 1) return cols[0];
    const step = 360 / cols.length;
    return 'conic-gradient(' + cols.map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`).join(',') + ')';
  }

  function buildContent(stop, routeIds, label) {
    const d = document.createElement('div');
    d.className = 'pin' + (label ? ' pin-num' : '');
    d.style.background = pinColor(routeIds);
    d.title = stop.name;
    if (label) { d.textContent = label; d.style.setProperty('--t', window.BV_CONFIG.textOn(window.BV_CONFIG.ROUTE_COLORS[routeIds[0]] || '#888888')); }
    return d;
  }

  const pos = s => ({ lat: s.lat, lng: s.lng });

  function showTip(el, stop, label) {
    if (!tip || !wrap) return;
    const a = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    tip.textContent = (label ? '#' + label + ' · ' : '') + stop.name;
    tip.style.left = (a.left + a.width / 2 - w.left) + 'px'; tip.style.top = (a.top - w.top) + 'px';
    tip.hidden = false; onHover(stop.id);
  }
  function hideTip() { if (tip) tip.hidden = true; }

  BV.map = {
    available() { return !!map; },
    onSelect(fn) { onSelect = fn; },
    onMoved(fn) { onMoved = fn; },
    onHover(fn) { onHover = fn; },
    gmap() { return map; },
    load(key) { return loadScript(key); },
    // Coordenadas desde "lat, lng" o desde un enlace de Google Maps (@lat,lng o !3dlat!4dlng).
    parseCoords(txt) {
      const t = String(txt || '');
      const m = t.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) || t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) || t.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/);
      if (!m) return null;
      const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
      return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
    },
    // Dirección -> coordenadas (Google Geocoder, sesgado hacia el sur de Florida).
    async geocode(address, key) {
      await loadScript(key);
      return new Promise((resolve, reject) => {
        new google.maps.Geocoder().geocode({ address, bounds: { south: 25.0, west: -80.9, north: 27.0, east: -79.9 }, region: 'us' }, (r, st) => {
          if (st === 'OK' && r && r.length) resolve({ lat: r[0].geometry.location.lat(), lng: r[0].geometry.location.lng(), text: r[0].formatted_address });
          else reject(new Error(st === 'ZERO_RESULTS' ? 'No encontré esa dirección. Sé más específico (calle, número, ciudad).'
            : st === 'REQUEST_DENIED' ? 'Google rechazó la búsqueda: hay que activar "Geocoding API" en la llave de Google Maps.' : 'Error de búsqueda: ' + st));
        });
      });
    },
    // Con fn, un clic en un pin llama fn(stopId) en vez de abrir la parada (modo "elegir referencia").
    setPickMode(fn) { pickFn = fn; if (wrap) wrap.classList.toggle('picking', !!fn); },
    // Línea que une las paradas en el orden recibido (items ya ordenados). null = sin línea.
    setLine(items, color) {
      if (!map) return;
      if (line) { line.setMap(null); line = null; }
      const pts = (items || []).filter(i => i.stop.lat != null).map(i => pos(i.stop));
      if (pts.length < 2 || !google.maps.Polyline) return;
      line = new google.maps.Polyline({ path: pts, strokeColor: color, strokeOpacity: 0.85, strokeWeight: 3, map, zIndex: 1,
        icons: google.maps.SymbolPath ? [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.6, strokeColor: color, fillColor: color, fillOpacity: 1 }, offset: '50%', repeat: '90px' }] : [] });
    },
    highlight(id) {
      const prev = markers.get(hlId);
      if (prev) { prev.content.classList.remove('pin-hl'); prev.zIndex = hlId === selectedId ? 10 : 0; }
      hlId = id;
      const m = markers.get(id);
      if (m && m.map) { m.content.classList.add('pin-hl'); m.zIndex = 20; }
    },

    async init(key, el) {
      await loadScript(key);
      wrap = el.parentElement;
      tip = document.createElement('div'); tip.className = 'maptip'; tip.hidden = true; wrap.appendChild(tip);
      map = new google.maps.Map(el, {
        center: C.MAP_CENTER, zoom: C.MAP_ZOOM, mapId: C.MAP_ID,
        streetViewControl: false, fullscreenControl: false, mapTypeControl: false, clickableIcons: false,
        gestureHandling: 'greedy'
      });
      if (BV.state.depot) {
        const d = document.createElement('div'); d.className = 'pin pin-depot'; d.textContent = 'BV'; d.title = BV.state.depot.name;
        new google.maps.marker.AdvancedMarkerElement({ map, position: pos(BV.state.depot), content: d, zIndex: 5 });
      }
    },

    /* items: [{stop, routeIds, label}] — lo que debe verse ahora */
    render(items) {
      if (!map) return;
      const keep = new Set();
      for (const it of items) {
        const s = it.stop;
        if (s.lat == null) continue;
        keep.add(s.id);
        let m = markers.get(s.id);
        const content = buildContent(s, it.routeIds, it.label);
        if (it.stop.active === false) content.classList.add('pin-off');
        if (s.id === selectedId) content.classList.add('pin-sel');
        if (!m) {
          m = new google.maps.marker.AdvancedMarkerElement({ map, position: pos(s), content });
          m.addListener('dragend', () => {
            const p = m.position;
            const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
            const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
            onMoved(s.id, lat, lng);
          });
          markers.set(s.id, m);
        } else {
          m.content = content; m.position = pos(s); m.map = map;
        }
        content.addEventListener('click', e => { e.stopPropagation(); pickFn ? pickFn(s.id) : onSelect(s.id); });
        content.addEventListener('mouseenter', () => showTip(content, s, it.label));
        content.addEventListener('mouseleave', () => { hideTip(); onHover(null); });
        if (s.id === hlId) content.classList.add('pin-hl');
      }
      markers.forEach((m, id) => { if (!keep.has(id)) m.map = null; });
    },

    select(id) {
      const prev = markers.get(selectedId);
      if (prev) { prev.gmpDraggable = false; prev.content.classList.remove('pin-sel'); }
      selectedId = id;
      const m = markers.get(id);
      if (m) { m.gmpDraggable = true; m.content.classList.add('pin-sel'); m.zIndex = 10; }
    },
    clearSelection() { this.select(null); },

    panTo(stop) {
      if (!map || stop.lat == null) return;
      const b = map.getBounds();
      const ll = new google.maps.LatLng(stop.lat, stop.lng);
      if (!b || !b.contains(ll)) map.panTo(ll);
    },
    setPosition(id, lat, lng) { const m = markers.get(id); if (m) m.position = { lat, lng }; },
    center() { const c = map.getCenter(); return { lat: c.lat(), lng: c.lng() }; },
    fit(items) {
      if (!map || !items.length) return;
      const b = new google.maps.LatLngBounds();
      items.forEach(i => { if (i.stop.lat != null) b.extend(pos(i.stop)); });
      map.fitBounds(b, 60);
    }
  };
})();
