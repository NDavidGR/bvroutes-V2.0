/* Mapa del día: TODAS las rutas organizadas, superpuestas. Solo las paradas de ese día (lo que está en el plan).
   Se actualiza solo mientras organizas en otra pestaña. */
(function () {
  const C = window.BV_CONFIG;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } } };
  const toast = (msg, kind) => { const t = $('toast'); t.textContent = msg; t.dataset.kind = kind || ''; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 4000); };
  const qs = new URLSearchParams(location.search);
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  let date = /^\d{4}-\d{2}-\d{2}$/.test(qs.get('date') || '') ? qs.get('date') : today();
  let data = {};            // route -> { total, plotted:[{stop,order}], missing:[{name,order}] }
  const on = new Set();
  const layers = new Map(); // route -> { markers, line, sig }
  let map = null, info = null, sig = '', fullTick = 0, mapOk = false;

  const col = r => C.ROUTE_COLORS[r] || '#888';
  const label = r => r === '9' ? '2WPB' : 'R' + r;

  function build(rows) {
    const out = {};
    BV.state.routes.forEach(r => { out[r.id] = { total: 0, plotted: [], missing: [] }; });
    rows.forEach(row => {
      const d = out[row.route_id]; if (!d) return;
      (row.lines || []).forEach((l, i) => {
        d.total++;
        const s = l.stop_id ? BV.state.stops.get(l.stop_id) : null;
        if (s && s.lat != null) d.plotted.push({ stop: s, order: i + 1 });
        else d.missing.push({ name: s ? s.name : l.raw, order: i + 1 });
      });
    });
    return out;
  }

  function toolbar() {
    $('mp-routes').innerHTML = BV.state.routes.map(r => {
      const d = data[r.id] || { total: 0, plotted: [] }, empty = !d.total, isOn = on.has(r.id);
      return `<button class="mp-r${isOn ? ' on' : ''}" data-r="${r.id}" ${empty ? 'disabled' : ''} style="--c:${col(r.id)};--t:${C.textOn(col(r.id))}">${label(r.id)}<small>${empty ? '—' : d.plotted.length + '/' + d.total}</small></button>`;
    }).join('');
  }

  function missing() {
    const act = BV.state.routes.map(r => r.id).filter(r => on.has(r));
    if (!act.length) { $('mp-miss-sub').textContent = '—'; $('mp-miss').innerHTML = '<p class="muted small">Prende una o más rutas para ver qué paradas no tienen pin.</p>'; return; }
    let total = 0, h = '';
    act.forEach(r => {
      const d = data[r]; if (!d || !d.missing.length) return; total += d.missing.length;
      h += `<div class="mp-mg" style="--c:${col(r)}">${label(r)} · ${d.missing.length}</div>` + d.missing.map(m => `<div class="mp-mi" style="--c:${col(r)}">#${m.order} ${esc(m.name)}</div>`).join('');
    });
    $('mp-miss-sub').textContent = total ? `${total} parada${total !== 1 ? 's' : ''} sin ubicar` : 'Todas ubicadas';
    $('mp-miss').innerHTML = h || '<p class="muted small">Todas las paradas de este día tienen coordenada.</p>';
  }

  function clearLayer(r) { const L = layers.get(r); if (!L) return; L.markers.forEach(m => { m.map = null; }); if (L.line) L.line.setMap(null); layers.delete(r); }

  function draw(fit) {
    if (!map) return;
    const b = new google.maps.LatLngBounds(); let any = false;
    BV.state.routes.forEach(({ id: r }) => {
      if (!on.has(r)) { clearLayer(r); return; }
      const d = data[r]; if (!d || !d.plotted.length) { clearLayer(r); return; }
      const rsig = JSON.stringify(d.plotted.map(p => [p.stop.id, p.stop.lat, p.stop.lng, p.order])) + ($('mp-line').checked ? 'L' : '');
      const L = layers.get(r);
      if (L && L.sig === rsig) { d.plotted.forEach(p => { b.extend({ lat: p.stop.lat, lng: p.stop.lng }); any = true; }); return; }
      clearLayer(r);
      const markers = d.plotted.map(p => {
        const el = document.createElement('div'); el.className = 'apin'; el.textContent = p.order; el.title = `${label(r)} #${p.order} · ${p.stop.name}`;
        el.style.setProperty('--c', col(r)); el.style.setProperty('--t', C.textOn(col(r)));
        const m = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: p.stop.lat, lng: p.stop.lng }, content: el, zIndex: 10 });
        el.addEventListener('click', e => {
          e.stopPropagation();
          info.setContent(`<div class="iw"><small>Ruta ${esc(r)} · parada #${p.order}</small><b>${esc(p.stop.name)}</b></div>`);
          info.open({ map, anchor: m });
        });
        b.extend({ lat: p.stop.lat, lng: p.stop.lng }); any = true;
        return m;
      });
      let line = null;
      if ($('mp-line').checked) {
        const dp = BV.state.depot, path = (dp ? [{ lat: dp.lat, lng: dp.lng }] : []).concat(d.plotted.map(p => ({ lat: p.stop.lat, lng: p.stop.lng }))).concat(dp ? [{ lat: dp.lat, lng: dp.lng }] : []);
        line = new google.maps.Polyline({ path, map, strokeColor: col(r), strokeOpacity: 0.6, strokeWeight: 2.5, zIndex: 1 });
      }
      layers.set(r, { markers, line, sig: rsig });
    });
    if (fit && any) map.fitBounds(b, 40);
  }

  function refreshAll(fit) { toolbar(); missing(); draw(fit); }

  async function fetchPlans(quiet) {
    try {
      const rows = await BV.data.loadPlansForDate(date);
      const s = JSON.stringify(rows.map(r => [r.route_id, r.lines]));
      const changed = s !== sig; sig = s;
      data = build(rows);
      $('mp-upd').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      if (changed || !quiet) refreshAll(false);
    } catch (e) { $('mp-upd').textContent = 'Sin conexión'; if (!quiet) toast('No se cargaron los planes: ' + (e.message || e), 'err'); }
  }

  async function fullReload() { try { await BV.data.load(); await fetchPlans(false); } catch (e) { /* se reintenta */ } }

  function wire() {
    $('mp-date').value = date;
    $('mp-date').addEventListener('change', e => { if (!e.target.value) return; date = e.target.value; on.clear(); sig = ''; fetchPlans(false); });
    // clic: prende/apaga · doble clic: aísla (se detecta a mano porque los botones se redibujan al hacer clic)
    let lastR = null, lastT = 0;
    $('mp-routes').addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b || b.disabled) return;
      const r = b.dataset.r, now = Date.now();
      if (r === lastR && now - lastT < 400) { on.clear(); on.add(r); lastR = null; refreshAll(true); return; }
      lastR = r; lastT = now;
      on.has(r) ? on.delete(r) : on.add(r); refreshAll(false);
    });
    $('mp-all').onclick = () => { BV.state.routes.forEach(r => { if (data[r.id] && data[r.id].total) on.add(r.id); }); refreshAll(true); };
    $('mp-none').onclick = () => { on.clear(); refreshAll(false); };
    $('mp-line').addEventListener('change', () => { layers.forEach((_, r) => clearLayer(r)); draw(false); });
    $('mp-refresh').onclick = () => fullReload();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) fullReload(); });
    setInterval(() => { if (document.hidden) return; fullTick++; fullTick % 6 === 0 ? fullReload() : fetchPlans(true); }, 10000);
  }

  async function start() {
    if (!(await BV.auth.session())) { location.href = 'index.html'; return; }
    try { await BV.data.load(); } catch (e) { toast('No cargaron los datos: ' + (e.message || e), 'err'); return; }
    $('mp').hidden = false; wire();
    await fetchPlans(false);
    BV.state.routes.forEach(r => { if (data[r.id] && data[r.id].total) on.add(r.id); });   // arranca con lo organizado prendido
    const key = ls.get('bvMapsApiKey', null), msg = $('mp-msg');
    if (!key) { msg.hidden = false; msg.textContent = 'Falta la llave de Google Maps. Ábrela primero en la app de Rutas (te la pide ahí) y vuelve aquí.'; refreshAll(false); return; }
    try {
      await BV.map.init(key, $('mp-map')); map = BV.map.gmap(); info = new google.maps.InfoWindow(); mapOk = true;
      refreshAll(true);
    } catch (e) { msg.hidden = false; msg.textContent = 'El mapa no cargó: ' + (e.message || e); }
  }
  document.addEventListener('DOMContentLoaded', start);
})();
