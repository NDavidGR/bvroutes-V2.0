/* Mapa (Google Maps). Marcadores DOM: círculo con los colores de las rutas visibles; número si hay una sola ruta con orden. */
(function () {
  const C = window.BV_CONFIG;
  let map = null, ready = null, selectedId = null;
  const markers = new Map();      // stopId -> AdvancedMarkerElement
  let onSelect = () => {}, onMoved = () => {};

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
    if (label) d.textContent = label;
    return d;
  }

  const pos = s => ({ lat: s.lat, lng: s.lng });

  BV.map = {
    available() { return !!map; },
    onSelect(fn) { onSelect = fn; },
    onMoved(fn) { onMoved = fn; },

    async init(key, el) {
      await loadScript(key);
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
        content.addEventListener('click', e => { e.stopPropagation(); onSelect(s.id); });
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
