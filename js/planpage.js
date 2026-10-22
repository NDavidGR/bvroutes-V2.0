/* Plan del día (página aparte). Pegas las paradas, ORGANIZE las ordena según la ruta (desde la base de datos)
   y todo —lo pegado, el resultado y cómo estaba la ruta— se guarda por fecha y ruta. */
(function () {
  const C = window.BV_CONFIG;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } } };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const toast = (msg, kind) => { const t = $('toast'); t.textContent = msg; t.dataset.kind = kind || ''; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), kind === 'err' ? 5000 : 2200); };

  let date = today(), route = null;
  const plans = new Map();        // route_id -> { input, lines:[{raw, stop_id, status}], snapshot, organizedAt, sug: Map }
  const timers = new Map();
  let mapReady = false;

  const plan = r => { if (!plans.has(r)) plans.set(r, { input: '', lines: [], snapshot: null, organizedAt: null, sug: new Map() }); return plans.get(r); };
  const cur = () => plan(route);

  /* ---------- coincidencia de nombres ---------- */
  function norm(str) {
    let s = String(str || '').toUpperCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* sin normalize */ }
    if (s.indexOf('/') > -1) s = s.split('/')[0];
    return s.replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }
  function bigrams(s) { const t = s.replace(/\s/g, ''); const m = new Map(); for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); } return m; }
  function dice(a, b) {
    if (a === b) return 1; if (a.length < 2 || b.length < 2) return 0;
    const A = bigrams(a), B = bigrams(b); let inter = 0;
    A.forEach((n, k) => { if (B.has(k)) inter += Math.min(n, B.get(k)); });
    return 2 * inter / (a.replace(/\s/g, '').length - 1 + b.replace(/\s/g, '').length - 1);
  }
  function buildIndex() {
    const inRoute = new Set(BV.data.membersOf(route).map(m => m.stop_id));
    const entries = [];
    BV.state.stops.forEach(s => {
      if (!s.active) return;
      const keys = new Set([norm(s.name), ...(s.legacy_names || []).map(norm)]); keys.delete('');
      entries.push({ stop: s, keys: [...keys], inRoute: inRoute.has(s.id) });
    });
    return entries;
  }
  function matchLine(raw, idx) {
    const x = norm(raw); if (!x) return null;
    const first = (pred, scope) => { for (const e of idx) if (e.inRoute === scope && e.keys.some(pred)) return e.stop; return null; };
    for (const scope of [true, false]) { const s = first(k => k === x, scope); if (s) return { stop: s, suggestions: [] }; }
    if (x.length >= 4) for (const scope of [true, false]) { const s = first(k => k.length > 3 && (x.startsWith(k) || k.startsWith(x)), scope); if (s) return { stop: s, suggestions: [] }; }
    if (x.length > 5 && x[0] !== '#') {
      const best = scope => { let b = null, bs = 0; idx.forEach(e => { if (e.inRoute !== scope) return; e.keys.forEach(k => { const d = dice(x, k); if (d > bs) { bs = d; b = e.stop; } }); }); return { b, bs }; };
      const r = best(true); if (r.bs >= 0.78) return { stop: r.b, suggestions: [] };
      const o = best(false); if (o.bs >= 0.85) return { stop: o.b, suggestions: [] };
    }
    const sc = []; idx.forEach(e => { let d = 0; e.keys.forEach(k => { d = Math.max(d, dice(x, k)); }); if (d >= 0.35) sc.push({ stop: e.stop, d: d + (e.inRoute ? 0.02 : 0) }); });
    sc.sort((a, b) => b.d - a.d);
    return { stop: null, suggestions: sc.slice(0, 3).map(r => r.stop) };
  }
  const statusOf = id => !id ? 'unk' : (BV.data.membersOf(route).some(m => m.stop_id === id) ? 'route' : (BV.state.stops.get(id) ? 'other' : 'unk'));
  const posOf = id => { const m = BV.data.membersOf(route).find(x => x.stop_id === id); return m ? m.position : null; };
  const anchorOf = stop => (stop.lat == null ? null : BV.data.nearest(route, stop.lat, stop.lng, stop.id, 1)[0] || null);
  const isOrdered = () => !!BV.data.route(route).ordered;

  /* ---------- organizar ---------- */
  function organize() {
    const p = cur();
    p.input = $('pp-input').value;
    const rawLines = p.input.split('\n').map(x => x.trim()).filter(Boolean);
    if (!rawLines.length) { toast('No hay paradas pegadas', 'err'); return; }
    const idx = buildIndex(), seen = new Set(), lines = []; let dup = 0;
    p.sug = new Map();
    rawLines.forEach(raw => {
      const m = matchLine(raw, idx); if (!m) return;
      if (m.stop) { if (seen.has(m.stop.id)) { dup++; return; } seen.add(m.stop.id); lines.push({ raw, stop_id: m.stop.id, status: statusOf(m.stop.id) }); }
      else { p.sug.set(raw, m.suggestions); lines.push({ raw, stop_id: null, status: 'unk' }); }
    });
    const key = (l, i) => {
      if (l.status === 'unk') return [2, i];
      if (!isOrdered()) return [1, BV.state.stops.get(l.stop_id).name];
      if (l.status === 'route') return [0, posOf(l.stop_id)];
      const a = anchorOf(BV.state.stops.get(l.stop_id)); return [0, a ? a.position + 0.5 : 1e8];
    };
    lines.forEach((l, i) => { l._k = key(l, i); });
    lines.sort((a, b) => a._k[0] - b._k[0] || (typeof a._k[1] === 'string' ? a._k[1].localeCompare(b._k[1]) : a._k[1] - b._k[1]));
    lines.forEach(l => delete l._k);
    p.lines = lines; p.organizedAt = new Date().toISOString();
    p.snapshot = BV.data.membersOf(route).map(m => ({ stop_id: m.stop_id, position: m.position }));
    render(); save(route);
    toast(`Organizadas ${lines.length} paradas` + (dup ? ` · ${dup} repetidas omitidas` : ''));
  }

  /* ---------- pantalla ---------- */
  const rname = id => id === '9' ? 'Ruta 9 · West Palm' : 'Ruta ' + id;
  function renderSide() {
    $('pp-routes').innerHTML = BV.state.routes.map(r => {
      const p = plans.get(r.id), n = p ? (p.lines.length || p.input.split('\n').filter(x => x.trim()).length) : 0;
      return `<button class="pp-r${r.id === route ? ' on' : ''}" data-r="${r.id}" style="--c:${C.ROUTE_COLORS[r.id] || '#888'}"><i></i>Ruta ${esc(r.id)}${r.id === '9' ? ' <small>West Palm</small>' : ''}${r.ordered ? '' : ' <small>sin orden</small>'}${n ? `<em>${n}</em>` : ''}</button>`;
    }).join('');
  }
  const tagCol = r => `--c:${C.ROUTE_COLORS[r] || '#888'};--t:${C.textOn(C.ROUTE_COLORS[r] || '#888888')}`;

  function render() {
    const p = cur();
    $('pp-title').innerHTML = `Ruta <span>${esc(route)}</span>` + (route === '9' ? ' <small class="muted">West Palm Beach</small>' : '');
    $('pp-input').value = p.input;
    const unk = p.lines.filter(l => l.status === 'unk').length, oth = p.lines.filter(l => l.status === 'other').length;
    const pill = $('pp-pill');
    if (!p.lines.length) { pill.textContent = ''; pill.className = 'pill'; }
    else if (unk || oth) { pill.textContent = [unk ? unk + ' sin reconocer' : '', oth ? oth + ' de otra ruta' : ''].filter(Boolean).join(' · '); pill.className = 'pill warn'; }
    else { pill.textContent = 'OK · ' + p.lines.length; pill.className = 'pill ok'; }
    $('pp-out').innerHTML = p.lines.map((l, i) => {
      const s = l.stop_id ? BV.state.stops.get(l.stop_id) : null;
      let meta = '', acts = '';
      if (l.status === 'route') { const q = posOf(l.stop_id); meta = q ? `<span class="meta">#${q} en la ruta</span>` : ''; }
      else if (l.status === 'other') {
        const rs = BV.data.routesOf(l.stop_id).map(m => `<b class="tag" style="${tagCol(m.route_id)}">R${esc(m.route_id)}</b>`).join(' ');
        const a = s && isOrdered() ? anchorOf(s) : null;
        meta = `${rs}${a ? `<span class="meta">cerca de ${esc(a.stop.name)} #${a.position}</span>` : ''}`;
        acts = `<button type="button" class="btn-ghost sm" data-addroute="${i}">Agregar a R${esc(route)}</button>`;
      } else {
        const sg = (p.sug.get(l.raw) || []).map(x => `<button type="button" class="btn-ghost sm" data-is="${i}" data-sid="${x.id}">Es: ${esc(x.name)}</button>`).join('');
        meta = `<span class="meta">sin reconocer</span>`;
        acts = `<span class="sug">${sg}</span><button type="button" class="btn-ghost sm" data-create="${i}">Crear parada</button>`;
      }
      return `<li class="st-${l.status}" data-i="${i}"><b class="grip" title="Arrastra para cambiar el orden de hoy">⠿</b><span class="n">${i + 1}</span>
        <div class="nm"><b>${esc(s ? s.name : l.raw)}</b>${meta}</div>
        <div class="acts">${acts}<button type="button" class="x" data-del="${i}" title="Quitar del plan">✕</button></div></li>`;
    }).join('');
    renderSide();
  }

  /* ---------- guardar / cargar ---------- */
  function setStatus(t, kind) { const e = $('pp-status'); e.textContent = t; e.dataset.kind = kind || ''; }
  function save(r) {
    clearTimeout(timers.get(r)); setStatus('Guardando…');
    const p = plan(r), d = date;
    const row = { plan_date: d, route_id: r, input_text: p.input,
      lines: p.lines.map(l => ({ raw: l.raw, stop_id: l.stop_id, name: l.stop_id ? (BV.state.stops.get(l.stop_id) || {}).name : null, status: l.status })),
      route_snapshot: p.snapshot, organized_at: p.organizedAt };
    timers.set(r, setTimeout(async () => {
      try { await BV.data.savePlan(row); setStatus('Guardado ✓', 'ok'); }
      catch (e) { setStatus('Error al guardar', 'err'); toast('No se guardó el plan: ' + (e.message || e), 'err'); }
    }, 600));
  }

  async function loadDate() {
    plans.clear(); timers.forEach(t => clearTimeout(t)); timers.clear();
    try {
      const rows = await BV.data.loadPlansForDate(date);
      rows.forEach(row => {
        route = row.route_id; const p = plan(row.route_id);
        p.input = row.input_text || ''; p.snapshot = row.route_snapshot; p.organizedAt = row.organized_at;
        p.lines = (row.lines || []).map(l => ({ raw: l.raw, stop_id: l.stop_id && BV.state.stops.get(l.stop_id) ? l.stop_id : null, status: 'unk' }));
        p.lines.forEach(l => { l.status = statusOf(l.stop_id); });
        const idx = buildIndex(); p.lines.filter(l => l.status === 'unk').forEach(l => { const m = matchLine(l.raw, idx); p.sug.set(l.raw, m ? m.suggestions : []); });
      });
      route = BV.state.routes.find(r => r.id === (ls.get('bv_plan_route', null)))?.id || BV.state.routes[0].id;
      setStatus(rows.length ? `${rows.length} plan(es) cargados` : '');
    } catch (e) { setStatus('No se pudo cargar', 'err'); toast('No se cargaron los planes: ' + (e.message || e), 'err'); route = route || BV.state.routes[0].id; }
    render();
  }


  /* ---------- autocompletado al escribir (2 letras, tolera errores de tipeo) ---------- */
  let acList = [], acSel = -1;
  const acLine = ta => {
    const v = ta.value, pos = ta.selectionStart, start = v.lastIndexOf('\n', pos - 1) + 1; let end = v.indexOf('\n', pos); if (end === -1) end = v.length;
    return { text: v.substring(start, end).trim(), start, end, index: v.substring(0, start).split('\n').length - 1 };
  };
  function acSuggest(query) {
    const x = norm(query); if (x.length < 2) return [];
    const taken = new Set($('pp-input').value.split('\n').map(norm).filter(Boolean)); taken.delete(x);
    const idx = buildIndex(), out = [];
    idx.forEach(e => {
      if (e.keys.includes(x) || e.keys.some(k => taken.has(k))) return;         // ya escrita o es justo lo que escribió
      let sc = 9;
      e.keys.forEach(k => { if (k.startsWith(x)) sc = Math.min(sc, 0); else if (k.includes(x)) sc = Math.min(sc, 1); });
      if (sc < 9) out.push({ stop: e.stop, inRoute: e.inRoute, sc });
    });
    out.sort((a, b) => a.sc - b.sc || (b.inRoute - a.inRoute) || a.stop.name.localeCompare(b.stop.name));
    let res = out.slice(0, 8);
    if (res.length < 6 && x.length >= 3) {                                        // errores de tipeo
      const have = new Set(res.map(r => r.stop.id)), fz = [];
      idx.forEach(e => {
        if (have.has(e.stop.id) || e.keys.includes(x) || e.keys.some(k => taken.has(k))) return;
        let d = 0; e.keys.forEach(k => { d = Math.max(d, dice(x, k)); });
        if (d >= 0.5) fz.push({ stop: e.stop, inRoute: e.inRoute, sc: 2, d: d + (e.inRoute ? 0.03 : 0) });
      });
      fz.sort((a, b) => b.d - a.d);
      res = res.concat(fz.slice(0, 8 - res.length));
    }
    return res;
  }
  function acClose() { $('pp-ac').hidden = true; acList = []; acSel = -1; }
  function acOpen() {
    const ta = $('pp-input'), ln = acLine(ta), box = $('pp-ac');
    acList = acSuggest(ln.text); acSel = -1;
    if (!acList.length) { acClose(); return; }
    const q = ln.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    box.innerHTML = acList.map((r, i) => {
      const nm = esc(r.stop.name).replace(new RegExp('(' + esc(q) + ')', 'ig'), '<mark>$1</mark>');
      const rs = r.inRoute ? '' : BV.data.routesOf(r.stop.id).map(m => `<b class="tag" style="${tagCol(m.route_id)}">R${esc(m.route_id)}</b>`).join(' ');
      return `<div class="ac-i" data-i="${i}">${nm}${rs ? ` <span class="ac-r">${rs}</span>` : ''}</div>`;
    }).join('');
    const cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight) || 22, pt = parseFloat(cs.paddingTop) || 14;
    box.style.top = Math.min(pt + (ln.index + 1) * lh - ta.scrollTop, ta.clientHeight - 30) + 'px';
    box.hidden = false;
  }
  function acPick(i) {
    const ta = $('pp-input'), ln = acLine(ta), name = acList[i].stop.name;
    ta.value = ta.value.substring(0, ln.start) + name + ta.value.substring(ln.end);
    const np = ln.start + name.length; ta.setSelectionRange(np, np); ta.focus();
    cur().input = ta.value; renderSide(); save(route); acClose();
  }
  function acMark() { $('pp-ac').querySelectorAll('.ac-i').forEach((el, i) => el.classList.toggle('sel', i === acSel)); }
  function acKey(e) {
    if ($('pp-ac').hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); acSel = Math.min(acSel + 1, acList.length - 1); acMark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); acSel = Math.max(acSel - 1, -1); acMark(); }
    else if (e.key === 'Tab') { e.preventDefault(); acPick(acSel >= 0 ? acSel : 0); }
    else if (e.key === 'Enter') {            // como la app vieja: Enter completa con la primera sugerencia solo si lo escrito NO es ya una parada exacta
      if (acSel >= 0) { e.preventDefault(); acPick(acSel); return; }
      const x = norm(acLine($('pp-input')).text);
      if (buildIndex().some(en => en.keys.includes(x))) acClose(); else { e.preventDefault(); acPick(0); }
    }
    else if (e.key === 'Escape') acClose();
  }

  /* ---------- acciones por línea ---------- */
  async function addToRoute(i) {
    const p = cur(), l = p.lines[i], s = BV.state.stops.get(l.stop_id);
    const a = isOrdered() ? anchorOf(s) : null;
    try {
      await BV.data.addToRoute(s.id, route, a ? a.position + 1 : null);
      p.lines.forEach(x => { x.status = statusOf(x.stop_id); });
      toast(`${s.name} agregada a R${route}` + (a ? ` después de ${a.stop.name}` : '')); render(); save(route);
    } catch (e) { toast('No se agregó: ' + (e.message || e), 'err'); }
  }
  const parseCoords = t => BV.map.parseCoords(t);
  let creating = null;
  function create(i) {
    creating = i; const l = cur().lines[i];
    $('nw-name').value = l.raw; $('nw-addr').value = ''; $('nw-coords').value = ''; $('nw-hint').textContent = 'Sin coordenadas la parada no aparece en el mapa.';
    $('dlg-new').showModal(); $('nw-coords').focus();
  }
  function previewCoords() {
    const c = parseCoords($('nw-coords').value), h = $('nw-hint');
    if (!$('nw-coords').value.trim()) { h.textContent = 'Sin coordenadas la parada no aparece en el mapa.'; return; }
    if (!c) { h.textContent = 'No entiendo esas coordenadas. Formato: lat, lng'; return; }
    const a = isOrdered() ? BV.data.nearest(route, c.lat, c.lng, null, 1)[0] : null;
    h.textContent = a ? `Quedaría después de ${a.stop.name} #${a.position} (a ${a.miles.toFixed(1)} mi).` : 'Coordenadas válidas.';
  }
  async function confirmCreate(e) {
    e.preventDefault();
    const p = cur(), l = p.lines[creating], name = $('nw-name').value.trim();
    if (!name) return;
    const raw = $('nw-coords').value.trim(), c = parseCoords(raw);
    if (raw && !c) { toast('Coordenadas no válidas', 'err'); return; }
    try {
      const s = await BV.data.createStop(name, [], c ? c.lat : null, c ? c.lng : null);
      const a = await BV.data.addAfterNearest(s.id, route, c ? c.lat : null, c ? c.lng : null);
      l.stop_id = s.id; l.status = statusOf(s.id); l.raw = l.raw;
      $('dlg-new').close();
      toast(`${name} creada` + (a ? ` en R${route}, después de ${a.stop.name}` : ` en R${route}` + (c ? '' : ' (sin ubicación)')));
      render(); save(route);
    } catch (err) { toast('No se creó: ' + (err.message || err), 'err'); }
  }

  function resolveAs(i, sid) {
    const p = cur(), l = p.lines[i];
    if (p.lines.some((x, j) => j !== i && x.stop_id === sid)) { toast('Esa parada ya está en el plan', 'err'); return; }
    l.stop_id = sid; l.status = statusOf(sid); render(); save(route);
  }

  /* ---------- arrastrar para reordenar el día (solo desde el asa) ---------- */
  function enableDrag() {
    const ol = $('pp-out'); let drag = null;
    const clear = () => ol.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(l => l.classList.remove('dragging', 'drop-before', 'drop-after'));
    const mark = () => {
      clear(); drag.li.classList.add('dragging'); let t = null, after = false;
      for (const l of ol.querySelectorAll('li')) { if (l === drag.li) continue; const r = l.getBoundingClientRect(); t = l; if (drag.y < r.top + r.height / 2) { after = false; break; } after = true; }
      drag.t = t; drag.after = after; if (t) t.classList.add(after ? 'drop-after' : 'drop-before');
    };
    let raf = 0;
    const loop = () => { if (!drag) return; const r = ol.getBoundingClientRect(); if (drag.y < r.top + 40) ol.scrollTop -= Math.ceil((r.top + 40 - drag.y) / 4); else if (drag.y > r.bottom - 40) ol.scrollTop += Math.ceil((drag.y - (r.bottom - 40)) / 4); mark(); raf = requestAnimationFrame(loop); };
    ol.addEventListener('pointerdown', e => {
      const g = e.target.closest('.grip'); if (!g || e.button > 0) return; e.preventDefault();
      try { g.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
      drag = { li: g.closest('li'), pid: e.pointerId, y: e.clientY, t: null, after: false }; drag.from = Number(drag.li.dataset.i); mark(); raf = requestAnimationFrame(loop);
    });
    ol.addEventListener('pointermove', e => { if (drag && e.pointerId === drag.pid) drag.y = e.clientY; });
    ol.addEventListener('pointercancel', () => { cancelAnimationFrame(raf); clear(); drag = null; });
    ol.addEventListener('pointerup', e => {
      if (!drag || e.pointerId !== drag.pid) return; cancelAnimationFrame(raf); const d = drag; clear(); drag = null;
      if (!d.t) return;
      const p = cur(); let slot = Number(d.t.dataset.i) + (d.after ? 1 : 0); const from = d.from;
      const [moved] = p.lines.splice(from, 1); if (slot > from) slot--; p.lines.splice(slot, 0, moved);
      render(); save(route);
    });
  }

  /* ---------- mapa (modal) ---------- */
  async function openMap() {
    const p = cur();
    const items = p.lines.map((l, i) => ({ stop: l.stop_id ? BV.state.stops.get(l.stop_id) : null, label: i + 1 })).filter(x => x.stop && x.stop.lat != null)
      .map(x => ({ stop: x.stop, label: x.label, routeIds: (BV.data.routesOf(x.stop.id).map(m => m.route_id).length ? BV.data.routesOf(x.stop.id).map(m => m.route_id) : [route]) }));
    if (!items.length) { toast('Organiza primero: no hay paradas con ubicación', 'err'); return; }
    $('pm-title').textContent = `Ruta ${route} · ${items.length} paradas, en el orden del día`;
    $('dlg-map').showModal();
    const msg = $('pm-msg'); msg.hidden = true;
    const key = ls.get('bvMapsApiKey', null);
    if (!key) { msg.hidden = false; msg.textContent = 'Falta la llave de Google Maps. Ábrela primero en la app de Rutas (te la pide ahí) y vuelve aquí.'; return; }
    try {
      if (!mapReady) { await BV.map.init(key, $('pmap')); mapReady = true; }
      BV.map.render(items);
      BV.map.setLine($('pm-line').checked ? items : null, C.ROUTE_COLORS[route] || '#555');
      BV.map.fit(items);
      BV.map._items = items;
    } catch (e) { msg.hidden = false; msg.textContent = 'El mapa no cargó: ' + (e.message || e); }
  }

  /* ---------- arranque ---------- */
  function wire() {
    $('pp-date').value = date;
    $('pp-date').addEventListener('change', async e => { if (!e.target.value) return; date = e.target.value; await loadDate(); });
    $('pp-routes').addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      cur().input = $('pp-input').value; route = b.dataset.r; ls.set('bv_plan_route', route);
      document.body.classList.remove('pp-side-open'); render();
    });
    $('pp-menu').onclick = () => document.body.classList.toggle('pp-side-open');
    $('pp-go').onclick = organize;
    $('pp-clear').onclick = () => { const p = cur(); p.input = ''; p.lines = []; p.snapshot = null; p.organizedAt = null; p.sug = new Map(); render(); save(route); };
    $('pp-copy').onclick = async () => { try { await navigator.clipboard.writeText(cur().lines.map(l => l.raw).join('\n')); toast('Copiado'); } catch (e) { toast('No se pudo copiar', 'err'); } };
    $('pp-input').addEventListener('input', e => { cur().input = e.target.value; renderSide(); save(route); acOpen(); });
    $('pp-input').addEventListener('keydown', acKey);
    $('pp-input').addEventListener('blur', () => setTimeout(acClose, 150));
    $('pp-input').addEventListener('scroll', () => { if (!$('pp-ac').hidden) acOpen(); });
    $('pp-ac').addEventListener('mousedown', e => { const el = e.target.closest('.ac-i'); if (el) { e.preventDefault(); acPick(Number(el.dataset.i)); } });
    $('pp-map').onclick = openMap;
    $('pp-all').onclick = () => { const w = window.open('mapa.html?date=' + date, 'bvLiveMap'); if (!w) toast('El navegador bloqueó la ventana. Permite pop-ups para este sitio.', 'err'); else w.focus(); };
    $('pm-close').onclick = () => $('dlg-map').close();
    $('pm-line').addEventListener('change', () => { if (mapReady && BV.map._items) BV.map.setLine($('pm-line').checked ? BV.map._items : null, C.ROUTE_COLORS[route] || '#555'); });
    $('pp-out').addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.addroute != null) addToRoute(Number(t.dataset.addroute));
      else if (t.dataset.create != null) create(Number(t.dataset.create));
      else if (t.dataset.is != null) resolveAs(Number(t.dataset.is), t.dataset.sid);
      else if (t.dataset.del != null) { cur().lines.splice(Number(t.dataset.del), 1); render(); save(route); }
    });
    $('nw-coords').addEventListener('input', previewCoords);
    $('nw-find').onclick = async () => {
      const q = $('nw-addr').value.trim(); if (!q) return;
      const key = ls.get('bvMapsApiKey', null); if (!key) { $('nw-hint').textContent = 'Falta la llave de Google Maps (se pide en la app de Rutas).'; return; }
      $('nw-hint').textContent = 'Buscando…';
      try { const r = await BV.map.geocode(q, key); $('nw-coords').value = r.lat.toFixed(6) + ', ' + r.lng.toFixed(6); previewCoords(); $('nw-hint').textContent = 'Encontré: ' + r.text + '. ' + $('nw-hint').textContent; }
      catch (e) { $('nw-hint').textContent = e.message; }
    };
    $('nw-addr').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('nw-find').click(); } });
    $('form-new').addEventListener('submit', confirmCreate);
    $('nw-cancel').onclick = () => $('dlg-new').close();
    enableDrag();
  }

  async function start() {
    if (!(await BV.auth.session())) { location.href = 'index.html'; return; }   // el inicio de sesión vive en la app principal
    try { await BV.data.load(); } catch (e) { toast('No cargaron los datos: ' + (e.message || e), 'err'); return; }
    $('pp').hidden = false; wire(); await loadDate();
  }
  document.addEventListener('DOMContentLoaded', start);
})();
