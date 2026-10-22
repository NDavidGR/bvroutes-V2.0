/* Plan del día: pegas las paradas, ORGANIZE las ordena según la ruta (desde la base de datos),
   y todo (lo pegado, el resultado y cómo estaba la ruta) se guarda por fecha y ruta. */
(function () {
  const C = window.BV_CONFIG;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  // st.lines: [{ raw, stop_id|null, status:'route'|'other'|'unk' }] en el orden del día
  const st = { date: today(), route: null, snapshot: null, organizedAt: null, lines: [], open: false, loadSeq: 0 };
  let saveTimer = null, sugCache = new Map();

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
    const inRoute = new Set(BV.data.membersOf(st.route).map(m => m.stop_id));
    const entries = [];
    BV.state.stops.forEach(s => {
      if (!s.active) return;
      const keys = new Set([norm(s.name), ...(s.legacy_names || []).map(norm)]); keys.delete('');
      entries.push({ stop: s, keys: [...keys], inRoute: inRoute.has(s.id) });
    });
    return entries;
  }

  // Devuelve { stop|null, suggestions:[stop] }
  function matchLine(raw, idx) {
    const x = norm(raw); if (!x) return null;
    const first = (pred, scope) => { for (const e of idx) if ((scope === undefined || e.inRoute === scope) && e.keys.some(pred)) return e.stop; return null; };
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

  const statusOf = id => {
    if (!id) return 'unk';
    return BV.data.membersOf(st.route).some(m => m.stop_id === id) ? 'route' : (BV.state.stops.get(id) ? 'other' : 'unk');
  };
  const posOf = id => { const m = BV.data.membersOf(st.route).find(x => x.stop_id === id); return m ? m.position : null; };
  // Parada de la ruta más cercana a una parada de otro camión (para ubicarla en el orden).
  const anchorOf = stop => { const n = BV.data.nearest(st.route, stop.lat, stop.lng, stop.id, 1)[0]; return n || null; };

  /* ---------- organizar ---------- */
  function organize() {
    const rawLines = $('plan-input').value.split('\n').map(x => x.trim()).filter(Boolean);
    if (!rawLines.length) { BV.toast('No hay paradas pegadas', 'err'); return; }
    const idx = buildIndex(); const seen = new Set(); const lines = []; let dup = 0;
    sugCache = new Map();
    rawLines.forEach(raw => {
      const m = matchLine(raw, idx); if (!m) return;
      if (m.stop) { if (seen.has(m.stop.id)) { dup++; return; } seen.add(m.stop.id); lines.push({ raw, stop_id: m.stop.id, status: statusOf(m.stop.id) }); }
      else { sugCache.set(raw, m.suggestions); lines.push({ raw, stop_id: null, status: 'unk' }); }
    });
    const ordered = BV.data.route(st.route).ordered;
    const key = (l, i) => {
      if (l.status === 'unk') return [2, i];
      if (!ordered) return [1, BV.state.stops.get(l.stop_id).name];
      if (l.status === 'route') return [0, posOf(l.stop_id)];
      const a = anchorOf(BV.state.stops.get(l.stop_id)); return [0, a ? a.position + 0.5 : 1e8];
    };
    lines.forEach((l, i) => { l._k = key(l, i); });
    lines.sort((a, b) => a._k[0] - b._k[0] || (typeof a._k[1] === 'string' ? a._k[1].localeCompare(b._k[1]) : a._k[1] - b._k[1]));
    lines.forEach(l => delete l._k);
    st.lines = lines; st.organizedAt = new Date().toISOString();
    st.snapshot = BV.data.membersOf(st.route).map(m => ({ stop_id: m.stop_id, position: m.position }));
    render(true); save();
    BV.toast(`Organizadas ${lines.length} paradas` + (dup ? ` · ${dup} repetidas omitidas` : ''));
  }

  /* ---------- pantalla ---------- */
  function render(fit) {
    const unk = st.lines.filter(l => l.status === 'unk').length, oth = st.lines.filter(l => l.status === 'other').length;
    $('plan-summary').textContent = st.lines.length ? `${st.lines.length} paradas` + (oth ? ` · ${oth} de otra ruta` : '') + (unk ? ` · ${unk} sin reconocer` : '') : '';
    $('plan-out').innerHTML = st.lines.map((l, i) => {
      const s = l.stop_id ? BV.state.stops.get(l.stop_id) : null;
      const col = r => `--c:${C.ROUTE_COLORS[r] || '#888'};--t:${C.textOn(C.ROUTE_COLORS[r] || '#888888')}`;
      let sub = '', acts = '';
      if (l.status === 'route') { const p = posOf(l.stop_id); sub = p ? `<span>posición en la ruta #${p}</span>` : ''; }
      else if (l.status === 'other') {
        const rs = BV.data.routesOf(l.stop_id).map(m => `<b class="tag" style="${col(m.route_id)}">R${esc(m.route_id)}</b>`).join(' ');
        const a = s && BV.data.route(st.route).ordered ? anchorOf(s) : null;
        sub = `${rs}${a ? `<span>cerca de ${esc(a.stop.name)} #${a.position}</span>` : ''}`;
        acts = `<button type="button" class="btn-ghost sm" data-addroute="${i}">Agregar a R${esc(st.route)}</button>`;
      } else {
        const sg = (sugCache.get(l.raw) || []).map(x => `<button type="button" class="btn-ghost sm" data-is="${i}" data-sid="${x.id}">Es: ${esc(x.name)}</button>`).join('');
        sub = `<span>Sin reconocer</span><span class="sug">${sg}</span>`;
        acts = `<button type="button" class="btn-ghost sm" data-create="${i}">Crear parada</button>`;
      }
      return `<li class="st-${l.status}" data-i="${i}" ${l.stop_id ? `data-sid="${l.stop_id}"` : ''}><b class="grip" title="Arrastra para cambiar el orden de hoy">⠿</b><span class="n">${i + 1}</span>
        <div class="nm" ${l.stop_id ? 'data-focus' : ''}><b>${esc(s ? s.name : l.raw)}</b><div class="sub">${sub}</div></div>
        <div class="acts">${acts}${l.stop_id ? `<button type="button" class="btn-ghost sm" data-open="${l.stop_id}" title="Abrir ficha">Ficha</button>` : ''}<button type="button" class="btn-ghost sm" data-del="${i}" title="Quitar del plan">✕</button></div></li>`;
    }).join('');
    pushMap(fit);
  }

  function pushMap(fit) {
    const items = st.lines.map((l, i) => ({ stop: l.stop_id ? BV.state.stops.get(l.stop_id) : null, label: i + 1 })).filter(x => x.stop && x.stop.lat != null);
    BV.ui.setPlan(items.length ? { route: st.route, items } : null, !!fit);
  }

  /* ---------- guardar / cargar ---------- */
  function status(t, kind) { const e = $('plan-status'); e.textContent = t; e.dataset.kind = kind || ''; }
  function save() {
    clearTimeout(saveTimer);
    status('Guardando…');
    const snap = { plan_date: st.date, route_id: st.route, input_text: $('plan-input').value,
      lines: st.lines.map(l => ({ raw: l.raw, stop_id: l.stop_id, name: l.stop_id ? (BV.state.stops.get(l.stop_id) || {}).name : null, status: l.status })),
      route_snapshot: st.snapshot, organized_at: st.organizedAt };
    saveTimer = setTimeout(async () => {
      try { await BV.data.savePlan(snap); status('Guardado ✓', 'ok'); }
      catch (e) { status('Error al guardar', 'err'); BV.toast('No se guardó el plan: ' + (e.message || e), 'err'); }
    }, 600);
  }

  async function load() {
    const seq = ++st.loadSeq;
    st.lines = []; st.snapshot = null; st.organizedAt = null; $('plan-input').value = ''; sugCache = new Map(); render(false);
    try {
      const row = await BV.data.loadPlan(st.date, st.route);
      if (seq !== st.loadSeq) return;
      if (row) {
        $('plan-input').value = row.input_text || '';
        st.snapshot = row.route_snapshot; st.organizedAt = row.organized_at;
        st.lines = (row.lines || []).map(l => ({ raw: l.raw, stop_id: l.stop_id && BV.state.stops.get(l.stop_id) ? l.stop_id : null, status: 'unk' }));
        st.lines.forEach(l => { l.status = statusOf(l.stop_id); });
        const idx = buildIndex(); st.lines.filter(l => l.status === 'unk').forEach(l => { const m = matchLine(l.raw, idx); sugCache.set(l.raw, m ? m.suggestions : []); });
        status('Plan cargado', 'ok');
      } else status('');
      render(true);
    } catch (e) { status('No se pudo cargar', 'err'); BV.toast('No se cargó el plan: ' + (e.message || e), 'err'); }
  }

  /* ---------- acciones por línea ---------- */
  async function addToRoute(i) {
    const l = st.lines[i], s = BV.state.stops.get(l.stop_id);
    const a = BV.data.route(st.route).ordered ? anchorOf(s) : null;
    try {
      await BV.data.addToRoute(s.id, st.route, a ? a.position + 1 : null);
      st.lines.forEach(x => { x.status = statusOf(x.stop_id); });
      BV.toast(`${s.name} agregada a R${st.route}` + (a ? ` después de ${a.stop.name}` : '')); render(false); save(); BV.ui.refresh();
    } catch (e) { BV.toast('No se agregó: ' + (e.message || e), 'err'); }
  }
  async function create(i) {
    const l = st.lines[i];
    try {
      const c = BV.map.available() ? BV.map.center() : C.MAP_CENTER;
      const s = await BV.data.createStop(l.raw, [st.route], c.lat, c.lng);
      l.stop_id = s.id; l.status = 'route';
      BV.toast('Parada creada en el centro del mapa. Ábrela con "Ficha" para ubicar el pin.'); render(false); save(); BV.ui.refresh();
    } catch (e) { BV.toast('No se creó: ' + (e.message || e), 'err'); }
  }
  function resolveAs(i, sid) {
    const l = st.lines[i];
    if (st.lines.some((x, j) => j !== i && x.stop_id === sid)) { BV.toast('Esa parada ya está en el plan', 'err'); return; }
    l.stop_id = sid; l.status = statusOf(sid); render(false); save();
  }

  /* ---------- arrastrar para reordenar el día (solo desde el asa) ---------- */
  function enableDrag() {
    const ol = $('plan-out'); let drag = null;
    const clear = () => ol.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(l => l.classList.remove('dragging', 'drop-before', 'drop-after'));
    const mark = () => {
      clear(); drag.li.classList.add('dragging'); let t = null, after = false;
      for (const l of ol.querySelectorAll('li')) { if (l === drag.li) continue; const r = l.getBoundingClientRect(); t = l; if (drag.y < r.top + r.height / 2) { after = false; break; } after = true; }
      drag.t = t; drag.after = after; if (t) t.classList.add(after ? 'drop-after' : 'drop-before');
    };
    ol.addEventListener('pointerdown', e => {
      const g = e.target.closest('.grip'); if (!g || e.button > 0) return; e.preventDefault();
      try { g.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
      drag = { li: g.closest('li'), pid: e.pointerId, y: e.clientY, t: null, after: false }; drag.from = Number(drag.li.dataset.i); mark();
    });
    ol.addEventListener('pointermove', e => { if (drag && e.pointerId === drag.pid) { drag.y = e.clientY; mark(); } });
    ol.addEventListener('pointercancel', () => { clear(); drag = null; });
    ol.addEventListener('pointerup', e => {
      if (!drag || e.pointerId !== drag.pid) return; const d = drag; clear(); drag = null;
      if (!d.t) return;
      let slot = Number(d.t.dataset.i) + (d.after ? 1 : 0); const from = d.from;
      const [moved] = st.lines.splice(from, 1); if (slot > from) slot--; st.lines.splice(slot, 0, moved);
      render(false); save();
    });
  }

  /* ---------- eventos ---------- */
  function setOpen(v) { st.open = v; $('plan').hidden = !v; document.body.classList.toggle('plan-open', v); }

  BV.plan = {
    wire() {
      $('plan-route').innerHTML = BV.state.routes.map(r => `<option value="${r.id}">Ruta ${r.id}${r.ordered ? '' : ' (sin orden)'}</option>`).join('');
      $('plan-date').value = st.date;
      $('btn-plan').onclick = () => (st.open ? BV.plan.close() : BV.plan.open());
      $('plan-close').onclick = () => BV.plan.close();
      $('planbar-exit').onclick = () => BV.plan.exit();
      $('plan-go').onclick = organize;
      $('plan-clear').onclick = () => { $('plan-input').value = ''; st.lines = []; st.snapshot = null; st.organizedAt = null; render(false); save(); };
      $('plan-copy').onclick = async () => { try { await navigator.clipboard.writeText(st.lines.map(l => l.raw).join('\n')); BV.toast('Copiado'); } catch (e) { BV.toast('No se pudo copiar', 'err'); } };
      $('plan-input').addEventListener('input', () => save());
      $('plan-date').addEventListener('change', e => { if (e.target.value) { st.date = e.target.value; load(); } });
      $('plan-route').addEventListener('change', e => { st.route = e.target.value; load(); });
      $('plan-out').addEventListener('click', e => {
        const t = e.target.closest('button, [data-focus]'); if (!t) return;
        if (t.dataset.addroute != null) addToRoute(Number(t.dataset.addroute));
        else if (t.dataset.create != null) create(Number(t.dataset.create));
        else if (t.dataset.is != null) resolveAs(Number(t.dataset.is), t.dataset.sid);
        else if (t.dataset.del != null) { st.lines.splice(Number(t.dataset.del), 1); render(false); save(); }
        else if (t.dataset.open) BV.ui.selectStop(t.dataset.open);
        else if (t.hasAttribute('data-focus')) { const li = t.closest('li'); const s = BV.state.stops.get(li.dataset.sid); if (s) { BV.map.panTo(s); BV.map.highlight(s.id); } }
      });
      $('plan-out').addEventListener('mouseover', e => { const li = e.target.closest('li[data-sid]'); BV.map.highlight(li ? li.dataset.sid : null); });
      $('plan-out').addEventListener('mouseleave', () => BV.map.highlight(null));
      enableDrag();
    },
    open() {
      if (!st.route) { st.route = BV.state.routes[0].id; $('plan-route').value = st.route; }
      if (BV.panel.current()) { BV.panel.close(); BV.map.clearSelection(); }
      setOpen(true); load();
    },
    hide() { if (st.open) setOpen(false); },   // se oculta (p. ej. al abrir una ficha) pero el plan sigue en el mapa
    close() { setOpen(false); },
    exit() { setOpen(false); st.lines = []; BV.ui.setPlan(null); }
  };
})();
