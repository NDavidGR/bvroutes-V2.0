/* Reordenar una ruta sobre el mapa: clic en los pines en el orden del recorrido, selección por área, orden por eje, propuesta.
   Nada se guarda hasta pulsar "Guardar orden" (una sola llamada set_route_order y un solo registro en el historial). */
(function () {
  const C = window.BV_CONFIG;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
               set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const toast = (msg, kind) => { const t = $('toast'); t.textContent = msg; t.dataset.kind = kind || ''; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), kind === 'err' ? 5000 : 2500); };

  let route = null, seq = [], orig = [], noCoord = [], coordIds = [];
  let sel = new Set(), undo = [];
  let map = null, mapOk = false, line = null;
  const markers = new Map();            // stopId -> AdvancedMarkerElement
  let areaMode = false, boxA = null, box = null, mapL = [];
  let dragId = null;

  const stop = id => BV.state.stops.get(id);
  const col = () => C.ROUTE_COLORS[route] || '#888';
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const dirty = () => !same(seq, orig);
  const label = r => r === '9' ? 'Ruta 9 (2WPB)' : 'Ruta ' + r;

  /* ---------- cambios de orden ---------- */
  function commit(next) { undo.push(seq.slice()); if (undo.length > 100) undo.shift(); seq = next; render(); }

  /* ---------- carga de la ruta ---------- */
  function clearMarkers() { markers.forEach(m => { m.map = null; }); markers.clear(); if (line) { line.setMap(null); line = null; } }

  function loadRoute(r) {
    route = r; ls.set('bv_reorder_route', r);
    sel = new Set(); undo = []; clearBox();
    const members = BV.data.membersOf(r);
    coordIds = members.filter(m => stop(m.stop_id) && stop(m.stop_id).lat != null).map(m => m.stop_id);
    noCoord = members.filter(m => !stop(m.stop_id) || stop(m.stop_id).lat == null).map(m => m.stop_id);
    seq = coordIds.slice(); orig = seq.slice();
    if (mapOk) {
      clearMarkers();
      const b = new google.maps.LatLngBounds();
      coordIds.forEach(id => {
        const s = stop(id), el = document.createElement('div');
        el.className = 'rpin pend'; el.style.setProperty('--c', col()); el.style.setProperty('--t', C.textOn(col()));
        el.addEventListener('click', e => { e.stopPropagation(); pinClick(id); });
        el.addEventListener('mouseenter', () => showTip(el, id)); el.addEventListener('mouseleave', () => { $('ro-tip').hidden = true; });
        markers.set(id, new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: s.lat, lng: s.lng }, content: el, zIndex: 5 }));
        b.extend({ lat: s.lat, lng: s.lng });
      });
      if (coordIds.length) map.fitBounds(b, 40);
    }
    render();
  }

  function showTip(el, id) {
    const tip = $('ro-tip'), a = el.getBoundingClientRect(), w = $('ro-mapwrap').getBoundingClientRect(), i = seq.indexOf(id);
    tip.textContent = (i > -1 ? '#' + (i + 1) + ' · ' : '') + stop(id).name;
    tip.style.left = (a.left + a.width / 2 - w.left) + 'px'; tip.style.top = (a.top - w.top) + 'px'; tip.hidden = false;
  }

  /* ---------- interacciones en el mapa ---------- */
  function pinClick(id) {
    if (areaMode) { areaClick(stop(id).lat, stop(id).lng); return; }
    if (seq.includes(id)) { focusItem(id); if (mapOk) { map.panTo({ lat: stop(id).lat, lng: stop(id).lng }); map.setZoom && map.setZoom(15); } }
    else commit(seq.concat(id));
  }
  function focusItem(id) {
    const li = document.querySelector(`#ro-list [data-id="${id}"]`); if (!li) return;
    li.scrollIntoView({ block: 'nearest' }); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 900);
  }

  function clearBox() { if (box) { box.setMap(null); box = null; } boxA = null; }
  function areaToggle(on) {
    areaMode = on === undefined ? !areaMode : on;
    $('ro-area').classList.toggle('on', areaMode); $('ro-mapwrap').classList.toggle('area', areaMode);
    $('ro-hint').textContent = areaMode ? 'Clic en una esquina y clic en la esquina opuesta (Esc cancela)' : HINT;
    mapL.forEach(l => l && l.remove && l.remove()); mapL = [];
    clearBox();
    if (areaMode && mapOk) {
      mapL.push(map.addListener('click', e => areaClick(e.latLng.lat(), e.latLng.lng())));
      mapL.push(map.addListener('mousemove', e => { if (boxA && box) box.setBounds(rect(boxA, { lat: e.latLng.lat(), lng: e.latLng.lng() })); }));
    }
  }
  const rect = (a, b) => ({ south: Math.min(a.lat, b.lat), north: Math.max(a.lat, b.lat), west: Math.min(a.lng, b.lng), east: Math.max(a.lng, b.lng) });
  function areaClick(lat, lng) {
    if (!boxA) {
      boxA = { lat, lng };
      box = new google.maps.Rectangle({ map, strokeColor: '#FFC107', strokeWeight: 1.5, strokeOpacity: .9, fillColor: '#FFC107', fillOpacity: .08, bounds: rect(boxA, boxA) });
      return;
    }
    const b = rect(boxA, { lat, lng });
    sel = new Set(seq.filter(id => { const s = stop(id); return s.lat >= b.south && s.lat <= b.north && s.lng >= b.west && s.lng <= b.east; }));
    toast(sel.size ? `${sel.size} seleccionadas` : 'No hay paradas del orden dentro del área');
    areaToggle(false); render();
  }

  /* ---------- operaciones sobre la selección ---------- */
  const selNames = () => seq.filter(id => sel.has(id));
  function need(n) { if (selNames().length < n) { toast(n > 1 ? 'Selecciona al menos dos paradas (▢ Área o las casillas de la lista)' : 'Selecciona paradas (▢ Área o las casillas de la lista)', 'err'); return false; } return true; }
  // Ordena SOLO las seleccionadas entre sí; conservan los mismos huecos que ocupaban: el resto de la ruta no se mueve.
  function sortSel(axis) {
    if (!need(2)) return;
    const slots = []; seq.forEach((id, i) => { if (sel.has(id)) slots.push(i); });
    const pts = selNames().map(id => ({ id, lat: stop(id).lat, lng: stop(id).lng }));
    const f = { WE: (a, b) => a.lng - b.lng, EW: (a, b) => b.lng - a.lng, NS: (a, b) => b.lat - a.lat, SN: (a, b) => a.lat - b.lat }[axis];
    pts.sort(f);
    const next = seq.slice(); slots.forEach((slot, k) => { next[slot] = pts[k].id; });
    commit(next);
  }
  function groupEnd() { if (!need(1)) return; commit(seq.filter(id => !sel.has(id)).concat(selNames())); }
  function groupStart() { if (!need(1)) return; commit(selNames().concat(seq.filter(id => !sel.has(id)))); }
  function groupHere() {
    if (!need(1)) return;
    const first = seq.findIndex(id => sel.has(id));                       // la primera seleccionada marca dónde queda el grupo
    const before = seq.slice(0, first).filter(id => !sel.has(id)), after = seq.slice(first).filter(id => !sel.has(id));
    commit(before.concat(selNames(), after));
  }
  // Propuesta: empieza en el punto más al sur y va siempre al vecino más cercano.
  function propose() {
    if (!coordIds.length) return;
    const pts = coordIds.map(id => ({ id, lat: stop(id).lat, lng: stop(id).lng }));
    let cur = pts.reduce((a, b) => b.lat < a.lat ? b : a), left = pts.filter(p => p.id !== cur.id);
    const out = [cur.id];
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((p, i) => { const d = (p.lat - cur.lat) ** 2 + ((p.lng - cur.lng) * Math.cos(cur.lat * Math.PI / 180)) ** 2; if (d < bd) { bd = d; bi = i; } });
      cur = left[bi]; out.push(cur.id); left.splice(bi, 1);
    }
    commit(out);
  }

  /* ---------- dibujo ---------- */
  const HINT = 'Clic en un pin gris para agregarlo al final · arrastra en la lista para mover';
  function render() {
    // pines
    markers.forEach((m, id) => {
      const el = m.content, i = seq.indexOf(id);
      el.className = 'rpin' + (i > -1 ? '' : ' pend') + (sel.has(id) && i > -1 ? ' sel' : '');
      el.textContent = i > -1 ? String(i + 1) : '';
      m.zIndex = i > -1 ? 20 : 5;
    });
    // línea depósito → orden → depósito
    if (line) { line.setMap(null); line = null; }
    if (mapOk && $('ro-line').checked && seq.length > 1) {
      const dp = BV.state.depot, pts = seq.map(id => ({ lat: stop(id).lat, lng: stop(id).lng }));
      line = new google.maps.Polyline({ path: (dp ? [{ lat: dp.lat, lng: dp.lng }] : []).concat(pts, dp ? [{ lat: dp.lat, lng: dp.lng }] : []), map, strokeColor: col(), strokeOpacity: .7, strokeWeight: 2.5, zIndex: 1 });
    }
    // contador y botones
    const nSel = selNames().length;
    $('ro-counter').innerHTML = `<b>${seq.length}</b> / ${coordIds.length} ubicadas` + (noCoord.length ? ` · ${noCoord.length} sin pin` : '') + (nSel ? ` · <span class="s">${nSel} seleccionadas</span>` : '');
    $('ro-save').disabled = !dirty(); $('ro-undo').disabled = !undo.length;
    $('ro-save').textContent = dirty() ? 'Guardar orden' : 'Sin cambios';
    const w = $('ro-warn');
    w.hidden = !noCoord.length;
    w.textContent = noCoord.length ? `${noCoord.length} parada${noCoord.length > 1 ? 's' : ''} sin coordenada no se pueden clicar en el mapa. Al guardar quedan al final, sin mover.` : '';
    // lista
    let h = seq.map((id, i) => `<div class="ri${sel.has(id) ? ' sel' : ''}" draggable="true" data-id="${id}">
      <input type="checkbox" class="sc" ${sel.has(id) ? 'checked' : ''} title="Seleccionar"><b class="grip" title="Arrastra para mover">⠿</b><span class="n">${i + 1}</span>
      <span class="nm" title="${esc(stop(id).name)}">${esc(stop(id).name)}</span><button class="x" type="button" title="Sacar del orden">✕</button></div>`).join('');
    const pend = coordIds.filter(id => !seq.includes(id));
    if (pend.length) h += `<div class="ro-sec">Sin ubicar en el orden (${pend.length})</div>` + pend.map(id => `<div class="ri pending" data-id="${id}"><span class="n">+</span><span class="nm">${esc(stop(id).name)}</span></div>`).join('');
    if (noCoord.length) h += `<div class="ro-sec">Sin coordenada (${noCoord.length})</div>` + noCoord.map(id => `<div class="ri nocoord"><span class="n">!</span><span class="nm">${esc(stop(id) ? stop(id).name : '?')}</span></div>`).join('');
    $('ro-list').innerHTML = h || '<p class="muted small">Esta ruta no tiene paradas.</p>';
  }

  /* ---------- lista: clics y arrastre ---------- */
  function wireList() {
    const list = $('ro-list');
    list.addEventListener('click', e => {
      const li = e.target.closest('.ri[data-id]'); if (!li) return; const id = li.dataset.id;
      if (e.target.classList.contains('sc')) { sel.has(id) ? sel.delete(id) : sel.add(id); render(); return; }
      if (e.target.classList.contains('x')) { commit(seq.filter(x => x !== id)); return; }
      if (li.classList.contains('pending')) { commit(seq.concat(id)); return; }
      if (mapOk) { map.panTo({ lat: stop(id).lat, lng: stop(id).lng }); map.setZoom && map.setZoom(15); }
    });
    list.addEventListener('dragstart', e => { const li = e.target.closest('.ri[draggable]'); if (!li) return; dragId = li.dataset.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) {} setTimeout(() => li.classList.add('dragging'), 0); });
    list.addEventListener('dragend', () => { dragId = null; list.querySelectorAll('.dragging,.over').forEach(l => l.classList.remove('dragging', 'over')); });
    list.addEventListener('dragover', e => { const li = e.target.closest('.ri[draggable]'); if (!li || !dragId) return; e.preventDefault(); list.querySelectorAll('.over').forEach(l => l.classList.remove('over')); li.classList.add('over'); });
    list.addEventListener('drop', e => {
      const li = e.target.closest('.ri[draggable]'); if (!li || !dragId) return; e.preventDefault();
      const to = seq.indexOf(li.dataset.id), from = seq.indexOf(dragId); if (from < 0 || to < 0 || from === to) return;
      const next = seq.slice(); next.splice(from, 1); next.splice(to, 0, dragId); dragId = null; commit(next);
    });
  }

  /* ---------- guardar / restaurar ---------- */
  async function save() {
    if (!dirty()) return;
    const moved = seq.filter((id, i) => orig[i] !== id).length, tail = coordIds.length - seq.length + noCoord.length;
    let msg = `¿Guardar el nuevo orden de la ${label(route)}?\n\n${seq.length} paradas en el orden nuevo (${moved} cambian de lugar)`;
    if (tail) msg += `\n${tail} quedan al final sin ordenar`;
    msg += '\n\nEl orden anterior queda en el historial y se puede restaurar.';
    if (!confirm(msg)) return;
    $('ro-save').disabled = true;
    try {
      await BV.data.setRouteOrder(route, seq);
      toast('Orden guardado ✓'); loadRoute(route);
    } catch (e) { toast('No se guardó: ' + (e.message || e), 'err'); render(); }
  }

  async function openRestore() {
    $('rs-sub').textContent = label(route) + ' · últimos guardados'; $('rs-list').innerHTML = '<p class="muted">Cargando…</p>'; $('dlg-restore').showModal();
    try {
      const rows = await BV.data.orderSaves(route);
      $('rs-list').innerHTML = rows.map(r => {
        const a = r.after || [], b = r.before || [], n = a.filter((id, i) => b[i] !== id).length, d = new Date(r.at);
        return `<div class="rs-row"><span>${d.toLocaleDateString('es-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit' })} · ${n} cambiaron${r.note ? ' · ' + esc(r.note) : ''}</span><button class="btn-ghost sm" data-rs="${r.id}">Volver a este orden</button></div>`;
      }).join('') || '<p class="muted">Todavía no hay órdenes guardados para esta ruta.</p>';
      $('rs-list').dataset.rows = JSON.stringify(rows.map(r => ({ id: r.id, before: r.before })));
    } catch (e) { $('rs-list').innerHTML = `<p class="err">No se pudo cargar: ${esc(e.message || e)}</p>`; }
  }
  async function restore(id) {
    const row = JSON.parse($('rs-list').dataset.rows || '[]').find(r => String(r.id) === String(id)); if (!row) return;
    if (dirty() && !confirm('Tienes cambios sin guardar en esta pantalla. Se perderán. ¿Continuar?')) return;
    if (!confirm(`¿Volver al orden que tenía la ${label(route)} antes de ese guardado?`)) return;
    try { await BV.data.setRouteOrder(route, row.before, 'restaurado'); $('dlg-restore').close(); toast('Orden restaurado ✓'); loadRoute(route); }
    catch (e) { toast('No se restauró: ' + (e.message || e), 'err'); }
  }

  /* ---------- arranque ---------- */
  function wire() {
    const sorted = BV.state.routes.filter(r => r.ordered);
    $('ro-route').innerHTML = sorted.map(r => `<option value="${r.id}">${label(r.id)} (${BV.data.membersOf(r.id).length} paradas)</option>`).join('');
    $('ro-route').addEventListener('change', e => {
      if (dirty() && !confirm('Tienes cambios sin guardar. Se perderán. ¿Cambiar de ruta?')) { e.target.value = route; return; }
      areaToggle(false); loadRoute(e.target.value);
    });
    $('ro-propose').onclick = propose;
    $('ro-undo').onclick = () => { if (undo.length) { seq = undo.pop(); render(); } };
    $('ro-reset').onclick = () => { if (dirty()) commit(orig.slice()); };
    $('ro-empty').onclick = () => { if (seq.length) commit([]); };
    $('ro-area').onclick = () => areaToggle();
    document.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => sortSel(b.dataset.sort));
    $('ro-start').onclick = groupStart; $('ro-here').onclick = groupHere; $('ro-end').onclick = groupEnd;
    $('ro-clearsel').onclick = () => { sel = new Set(); clearBox(); render(); };
    $('ro-line').addEventListener('change', render);
    $('ro-save').onclick = save; $('ro-restore').onclick = openRestore;
    $('rs-close').onclick = () => $('dlg-restore').close();
    $('rs-list').addEventListener('click', e => { const b = e.target.closest('[data-rs]'); if (b) restore(b.dataset.rs); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && areaMode) areaToggle(false); });
    window.addEventListener('beforeunload', e => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
    wireList();
    return sorted;
  }

  async function start() {
    if (!(await BV.auth.session())) { location.href = 'index.html'; return; }
    try { await BV.data.load(); } catch (e) { toast('No cargaron los datos: ' + (e.message || e), 'err'); return; }
    $('ro').hidden = false;
    const sorted = wire(), want = new URLSearchParams(location.search).get('route') || ls.get('bv_reorder_route', null);
    const first = (sorted.find(r => r.id === want) || sorted[0] || {}).id;
    if (!first) { toast('No hay rutas con orden', 'err'); return; }
    $('ro-route').value = first;
    const key = ls.get('bvMapsApiKey', null), msg = $('ro-msg');
    if (!key) { msg.hidden = false; msg.textContent = 'Falta la llave de Google Maps. Ábrela primero en la app de Rutas (te la pide ahí) y vuelve aquí.'; loadRoute(first); return; }
    try {
      await BV.map.init(key, $('ro-map')); map = BV.map.gmap(); mapOk = true;
    } catch (e) { msg.hidden = false; msg.textContent = 'El mapa no cargó: ' + (e.message || e); }
    loadRoute(first);
  }
  document.addEventListener('DOMContentLoaded', start);
})();
