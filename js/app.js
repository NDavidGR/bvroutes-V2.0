/* Orquestación: login, toggles de ruta, lista, búsqueda, nueva parada. */
(function () {
  const C = window.BV_CONFIG;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };
  const NEW_HINT = 'Sin dirección ni coordenadas, se crea en el centro del mapa y arrastras el pin a su lugar.';
  let visible = new Set(), showInactive = false, query = '', noPin = false, mapKey = null, pickCtx = null, lineOn = false;
  const hidden = new Set();   // paradas apagadas en el mapa (solo vista, no se guarda en la base)

  BV.toast = (msg, kind) => {
    const t = $('toast'); t.textContent = msg; t.dataset.kind = kind || ''; t.classList.add('show');
    clearTimeout(BV.toast._t); BV.toast._t = setTimeout(() => t.classList.remove('show'), kind === 'err' ? 5000 : 2200);
  };

  /* ---------- qué se ve ---------- */
  function visibleItems() {
    const items = [];
    const vis = pickCtx ? new Set([pickCtx.to]) : visible;   // eligiendo posición: solo la ruta destino
    const single = vis.size === 1 ? BV.data.route([...vis][0]) : null;
    const numbered = single && single.ordered;
    const byStop = new Map();
    BV.state.members.forEach(m => {
      if (!vis.has(m.route_id)) return;
      if (!byStop.has(m.stop_id)) byStop.set(m.stop_id, []);
      byStop.get(m.stop_id).push(m);
    });
    byStop.forEach((ms, id) => {
      const stop = BV.state.stops.get(id);
      if (!stop || (!stop.active && !showInactive)) return;
      items.push({ stop, routeIds: ms.map(m => m.route_id), label: numbered ? ms[0].position : null, position: ms[0].position });
    });
    if (pickCtx) {   // la parada que se está moviendo siempre se ve (sin número)
      const mv = BV.state.stops.get(pickCtx.stopId);
      if (mv && !byStop.has(mv.id)) items.push({ stop: mv, routeIds: BV.data.routesOf(mv.id).map(m => m.route_id), label: null, position: null });
    }
    return { items, numbered };
  }

  function renderRoutes() {
    $('routes').innerHTML = BV.state.routes.map(r => {
      const n = BV.state.members.filter(m => m.route_id === r.id && BV.state.stops.get(m.stop_id)?.active).length;
      const on = visible.has(r.id);
      return `<button class="route ${on ? 'on' : ''}" data-r="${r.id}" style="--c:${C.ROUTE_COLORS[r.id] || '#888'}" title="${esc(r.destination || '')}">
        <i></i><b>R${r.id}</b><span>${n}</span>${r.ordered ? '' : '<em>sin orden</em>'}</button>`;
    }).join('');
  }

  function renderList(items, numbered) {
    let rows;
    if (noPin) {
      rows = [...BV.state.stops.values()].filter(s => (showInactive || s.active) && s.lat == null && (!query || s.name.toLowerCase().includes(query.toLowerCase())))
        .map(stop => ({ stop, routeIds: BV.data.routesOf(stop.id).map(m => m.route_id) }));
      rows.sort((a, b) => a.stop.name.localeCompare(b.stop.name));
    } else if (query) {
      const q = query.toLowerCase();
      rows = [...BV.state.stops.values()].filter(s => (showInactive || s.active) && (s.name.toLowerCase().includes(q) || (s.legacy_names || []).some(n => n.toLowerCase().includes(q))))
        .map(stop => ({ stop, routeIds: BV.data.routesOf(stop.id).map(m => m.route_id) }));
    } else {
      rows = items.slice();
      rows.sort((a, b) => numbered ? (a.position - b.position) : a.stop.name.localeCompare(b.stop.name));
    }
    const total = rows.length, shown = rows.slice(0, 300);
    $('list').dataset.route = (numbered && !query && !pickCtx) ? [...visible][0] : '';
    $('count').textContent = (noPin ? 'Sin pin: ' : query ? 'Resultados: ' : 'Visibles: ') + total;
    $('list').innerHTML = shown.map(r => {
      const s = r.stop, sel = s.id === BV.panel.current() ? ' sel' : '';
      const dots = (r.routeIds || []).map(id => `<i style="background:${C.ROUTE_COLORS[id] || '#888'}" title="R${id}"></i>`).join('');
      const canDrag = numbered && !query && !pickCtx && !noPin;
      const pos = (numbered && !query && !noPin) ? `<small>${r.position}</small>` : '';
      const hid = hidden.has(s.id) ? ' hid' : '';
      return `<li class="${sel}${s.active ? '' : ' off'}${hid}" data-id="${s.id}" data-pos="${r.position ?? ''}"><b class="eye" data-eye title="${hid ? 'Mostrar en el mapa' : 'Ocultar del mapa'}">${hid ? '◌' : '●'}</b>${canDrag ? '<b class="grip" title="Arrastra para cambiar la posición">⠿</b>' : ''}${pos}<span>${esc(s.name)}</span>
        ${s.lat == null ? '<em class="nopin">SIN PIN</em>' : (s.coord_source === 'manual' ? '' : '')}${s.note ? '<u title="' + esc(s.note) + '">!</u>' : ''}${s.opens_at ? '<code>' + s.opens_at.slice(0, 5) + '</code>' : ''}<div class="dots">${dots}</div></li>`;
    }).join('') + (total > shown.length ? `<li class="more">… ${total - shown.length} más. Afina la búsqueda.</li>` : '');
  }

  function refresh() {
    const { items, numbered } = visibleItems();
    renderRoutes(); renderList(items, numbered);
    const shown = pickCtx ? items : items.filter(i => !hidden.has(i.stop.id));
    BV.map.render(shown);
    const single = !pickCtx && numbered && visible.size === 1;
    BV.map.setLine(single && lineOn ? shown.filter(i => i.position != null).sort((a, b) => a.position - b.position) : null,
      single ? (C.ROUTE_COLORS[[...visible][0]] || '#555') : null);
    const nh = items.length - shown.length;
    $('summary').textContent = shown.length + ' paradas en el mapa' + (nh ? ` · ${nh} ocultas` : '');
    $('v-line').disabled = !single;
    if (BV.panel.current()) BV.map.select(BV.panel.current());
  }
  // Contexto "estoy eligiendo dónde cae la parada": el mapa muestra solo la ruta destino numerada.
  BV.ui = {
    refresh,
    selectStop(id) { select(id); },
    setPick(ctx) {
      const key = ctx ? ctx.stopId + '>' + ctx.to : '';
      if (key === (pickCtx ? pickCtx.stopId + '>' + pickCtx.to : '')) return;
      pickCtx = ctx;
      BV.map.setPickMode(ctx && ctx.ordered ? id => BV.panel.pickRef(id) : null);
      refresh();
      if (ctx && BV.map.available()) {
        const mv = BV.state.stops.get(ctx.stopId);
        const near = BV.data.nearest(ctx.to, mv.lat, mv.lng, mv.id, 4);
        BV.map.fit([{ stop: mv }, ...near.map(n => ({ stop: n.stop }))]);
      }
    }
  };

  function select(id, { pan = true } = {}) {
    if (hidden.delete(id)) refresh();   // si estaba apagada, al abrirla se prende
    document.body.classList.remove('side-open');
    BV.panel.open(id);
    BV.map.select(id);
    const s = BV.state.stops.get(id);
    if (pan && s) BV.map.panTo(s);
    document.querySelectorAll('#list li').forEach(li => li.classList.toggle('sel', li.dataset.id === id));
  }

  /* ---------- reordenar arrastrando (solo desde el asa ⠿, para no romper el scroll del celular) ---------- */
  function enableDrag() {
    const list = $('list');
    let drag = null;
    const clear = () => list.querySelectorAll('.drop-before,.drop-after,.dragging').forEach(l => l.classList.remove('drop-before', 'drop-after', 'dragging'));
    const end = () => { if (drag) { cancelAnimationFrame(drag.raf); clear(); drag = null; } };
    const loop = () => {
      if (!drag) return;
      const r = list.getBoundingClientRect(), y = drag.y;
      if (y < r.top + 40) list.scrollTop -= Math.ceil((r.top + 40 - y) / 4);
      else if (y > r.bottom - 40) list.scrollTop += Math.ceil((y - (r.bottom - 40)) / 4);
      mark(); drag.raf = requestAnimationFrame(loop);
    };
    function mark() {
      clear(); drag.li.classList.add('dragging');
      let target = null, after = false;
      for (const l of list.querySelectorAll('li[data-id]')) {
        if (l === drag.li || !l.dataset.pos) continue;
        const r = l.getBoundingClientRect();
        target = l; if (drag.y < r.top + r.height / 2) { after = false; break; } after = true;
      }
      drag.target = target; drag.after = after;
      if (target) target.classList.add(after ? 'drop-after' : 'drop-before');
    }
    list.addEventListener('pointerdown', e => {
      const g = e.target.closest('.grip'); if (!g || e.button > 0) return;
      e.preventDefault();
      const li = g.closest('li[data-id]');
      try { g.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
      drag = { li, id: li.dataset.id, pid: e.pointerId, y: e.clientY, route: list.dataset.route, old: Number(li.dataset.pos), target: null, after: false, raf: 0 };
      mark(); drag.raf = requestAnimationFrame(loop);
    });
    list.addEventListener('pointermove', e => { if (drag && e.pointerId === drag.pid) drag.y = e.clientY; });
    list.addEventListener('pointercancel', end);
    list.addEventListener('pointerup', async e => {
      if (!drag || e.pointerId !== drag.pid) return;
      const d = drag; end();
      if (!d.target) return;
      const slot = Number(d.target.dataset.pos) + (d.after ? 1 : 0);
      const final = slot > d.old ? slot - 1 : slot;
      if (final === d.old) return;
      try {
        await BV.data.reorder(d.id, d.route, final);
        BV.toast(`${BV.state.stops.get(d.id).name}: posición ${d.old} → ${final}`);
        refresh();
      } catch (err) { BV.toast('No se reordenó: ' + (err.message || err), 'err'); refresh(); }
    });
    list.addEventListener('click', e => { if (e.target.closest('.grip')) e.stopPropagation(); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && drag) end(); });
  }

  /* ---------- eventos ---------- */
  function wire() {
    $('routes').addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      const r = b.dataset.r; visible.has(r) ? visible.delete(r) : visible.add(r);
      ls.set('bv_visible', [...visible]); refresh();
      if (e.shiftKey === false && visible.size === 1) BV.map.fit(visibleItems().items);
    });
    $('list').addEventListener('click', e => {
      const eye = e.target.closest('[data-eye]'); if (!eye) return;
      e.stopPropagation();
      const id = eye.closest('li').dataset.id;
      hidden.has(id) ? hidden.delete(id) : hidden.add(id);
      refresh();
    }, true);
    $('list').addEventListener('mouseover', e => { const li = e.target.closest('li[data-id]'); BV.map.highlight(li ? li.dataset.id : null); });
    $('list').addEventListener('mouseleave', () => BV.map.highlight(null));
    $('v-hide').onclick = () => { visibleItems().items.forEach(i => hidden.add(i.stop.id)); refresh(); };
    $('v-show').onclick = () => { hidden.clear(); refresh(); };
    $('v-line').addEventListener('change', e => { lineOn = e.target.checked; ls.set('bv_line', lineOn); refresh(); });
    $('r-all').onclick = () => { visible = new Set(BV.state.routes.map(r => r.id)); ls.set('bv_visible', [...visible]); refresh(); };
    $('r-none').onclick = () => { visible = new Set(); ls.set('bv_visible', []); refresh(); };
    $('search').addEventListener('input', e => { query = e.target.value.trim(); refresh(); });
    $('list').addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li) select(li.dataset.id); });
    $('nopin').addEventListener('change', e => { noPin = e.target.checked; refresh(); });
    $('btn-exp').onclick = () => $('dlg-exp').showModal();
    $('exp-close').onclick = () => $('dlg-exp').close();
    const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
    const stamp = () => new Date().toISOString().slice(0, 10);
    const exportRows = () => {
      const rows = [];
      for (const s of BV.state.stops.values()) {
        const ms = BV.data.routesOf(s.id);
        if (!ms.length) rows.push({ route: '', position: '', stop: s });
        else ms.forEach(m => rows.push({ route: m.route_id, position: m.position ?? '', zone: m.zone ?? '', stop: s }));
      }
      return rows.sort((a, b) => String(a.route).localeCompare(String(b.route), undefined, { numeric: true }) || (a.position || 1e9) - (b.position || 1e9) || a.stop.name.localeCompare(b.stop.name));
    };
    $('exp-csv').onclick = () => {
      const q = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const head = ['ruta', 'posicion', 'zona', 'parada', 'lat', 'lng', 'activa', 'abre', 'nota'];
      const body = exportRows().map(r => [r.route, r.position, r.zone || '', r.stop.name, r.stop.lat ?? '', r.stop.lng ?? '', r.stop.active ? 'si' : 'no', r.stop.opens_at || '', r.stop.note || ''].map(q).join(','));
      download(`bv-rutas-${stamp()}.csv`, '\ufeff' + [head.join(','), ...body].join('\n'), 'text/csv;charset=utf-8');
    };
    $('exp-json').onclick = () => download(`bv-rutas-${stamp()}.json`, JSON.stringify({ exported_at: new Date().toISOString(), routes: BV.state.routes, depot: BV.state.depot, stops: [...BV.state.stops.values()], members: BV.state.members }, null, 1), 'application/json');
    $('inactive').addEventListener('change', e => { showInactive = e.target.checked; refresh(); });
    $('drawer-close').onclick = () => { BV.panel.close(); BV.map.clearSelection(); refresh(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && BV.panel.current()) $('drawer-close').click(); });
    $('btn-menu').onclick = () => document.body.classList.toggle('side-open');
    $('btn-out').onclick = async () => { await BV.auth.logout(); location.reload(); };
    $('btn-new').onclick = () => { $('new-name').value = ''; $('new-addr').value = ''; $('new-coords').value = ''; $('new-hint').textContent = NEW_HINT; $('new-routes').innerHTML = BV.state.routes.map(r =>
      `<label class="rchip" style="--c:${C.ROUTE_COLORS[r.id]};--t:${C.textOn(C.ROUTE_COLORS[r.id])}"><input type="checkbox" value="${r.id}"><span>R${r.id}</span></label>`).join(''); $('dlg-new').showModal(); $('new-name').focus(); };
    $('new-cancel').onclick = () => $('dlg-new').close();
    const newCoords = () => BV.map.parseCoords($('new-coords').value);
    const newPreview = () => {
      const h = $('new-hint'), txt = $('new-coords').value.trim();
      if (!txt) { h.textContent = NEW_HINT; return; }
      const c = newCoords(); if (!c) { h.textContent = 'No entiendo esas coordenadas. Formato: lat, lng'; return; }
      const near = BV.state.routes.filter(r => document.querySelector(`#new-routes input[value="${r.id}"]:checked`) && r.ordered)
        .map(r => { const a = BV.data.nearest(r.id, c.lat, c.lng, null, 1)[0]; return a ? `R${r.id}: después de ${a.stop.name} #${a.position} (${a.miles.toFixed(1)} mi)` : null; }).filter(Boolean);
      h.textContent = near.length ? near.join(' · ') : 'Coordenadas válidas.';
    };
    $('new-coords').addEventListener('input', newPreview);
    $('new-routes').addEventListener('change', newPreview);
    $('new-find').onclick = async () => {
      const q = $('new-addr').value.trim(); if (!q) return;
      if (!mapKey) { $('new-hint').textContent = 'Falta la llave de Google Maps.'; return; }
      $('new-hint').textContent = 'Buscando…';
      try { const r = await BV.map.geocode(q, mapKey); $('new-coords').value = r.lat.toFixed(6) + ', ' + r.lng.toFixed(6); newPreview(); $('new-hint').textContent = 'Encontré: ' + r.text + '. ' + $('new-hint').textContent; }
      catch (e) { $('new-hint').textContent = e.message; }
    };
    $('new-addr').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('new-find').click(); } });
    $('form-new').addEventListener('submit', async e => {
      e.preventDefault();
      const name = $('new-name').value.trim(); if (!name) return;
      const routes = [...document.querySelectorAll('#new-routes input:checked')].map(i => i.value);
      const given = newCoords() && $('new-coords').value.trim() ? newCoords() : null;
      const c = given || (BV.map.available() ? BV.map.center() : C.MAP_CENTER);
      try {
        const s = await BV.data.createStop(name, [], c.lat, c.lng);
        for (const r of routes) await BV.data.addAfterNearest(s.id, r, given ? c.lat : null, given ? c.lng : null);
        await BV.data.reloadMembers();
        routes.forEach(r => visible.add(r)); $('dlg-new').close(); refresh(); select(s.id, { pan: !!given });
        BV.toast(given ? 'Parada creada ✓' : 'Parada creada en el centro del mapa. Arrastra el pin a su lugar.');
      } catch (err) { BV.toast('No se creó: ' + err.message, 'err'); }
    });
    BV.map.onSelect(id => select(id, { pan: false }));
    BV.map.onHover(id => BV.panel.hoverRow(id));
    BV.map.onMoved(async (id, lat, lng) => {
      try { await BV.data.updateStop(id, { lat, lng, coord_source: 'manual' }); BV.toast('Pin guardado ✓'); if (BV.panel.current() === id) BV.panel.open(id); }
      catch (err) { BV.toast('No se guardó el pin: ' + err.message, 'err'); BV.map.setPosition(id, BV.state.stops.get(id).lat, BV.state.stops.get(id).lng); }
    });
    BV.panel.onChange(() => refresh());
    $('mapkey-form').addEventListener('submit', e => { e.preventDefault(); const k = $('mapkey').value.trim(); if (k) { ls.set('bvMapsApiKey', k); location.reload(); } });
    $('mapkey-skip').onclick = () => { $('nomap').hidden = true; };
  }

  /* ---------- arranque ---------- */
  async function start() {
    $('login').hidden = true; $('app').hidden = false;
    try { await BV.data.load(); } catch (e) { BV.toast('No cargaron los datos: ' + e.message, 'err'); return; }
    if (BV.state.stops.size === 0) {
      $('empty').hidden = false; // sesión válida pero sin permisos: falta el insert en editors
    }
    const saved = ls.get('bv_visible', null);
    visible = new Set(saved ? saved.filter(r => BV.data.route(r)) : BV.state.routes.map(r => r.id));
    lineOn = !!ls.get('bv_line', false); $('v-line').checked = lineOn;
    wire(); enableDrag(); BV.history.wire();
    mapKey = ls.get('bvMapsApiKey', null);
    if (mapKey) {
      try { await BV.map.init(mapKey, $('map')); $('nomap').hidden = true; }
      catch (e) { BV.toast('El mapa no cargó: ' + e.message, 'err'); $('nomap').hidden = false; }
    } else { $('nomap').hidden = false; }
    refresh();
    if (BV.map.available() && visible.size) BV.map.fit(visibleItems().items);
  }

  async function boot() {
    $('login-form').addEventListener('submit', async e => {
      e.preventDefault(); $('login-err').textContent = '';
      try { await BV.auth.login($('email').value.trim(), $('password').value); await start(); }
      catch (err) { $('login-err').textContent = 'No se pudo iniciar sesión: ' + (err.message || err); }
    });
    if (await BV.auth.session()) start();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
