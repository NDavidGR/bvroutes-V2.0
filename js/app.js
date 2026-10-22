/* Orquestación: login, toggles de ruta, lista, búsqueda, nueva parada. */
(function () {
  const C = window.BV_CONFIG;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };
  let visible = new Set(), showInactive = false, query = '', mapKey = null;

  BV.toast = (msg, kind) => {
    const t = $('toast'); t.textContent = msg; t.dataset.kind = kind || ''; t.classList.add('show');
    clearTimeout(BV.toast._t); BV.toast._t = setTimeout(() => t.classList.remove('show'), kind === 'err' ? 5000 : 2200);
  };

  /* ---------- qué se ve ---------- */
  function visibleItems() {
    const items = [];
    const single = visible.size === 1 ? BV.data.route([...visible][0]) : null;
    const numbered = single && single.ordered;
    const byStop = new Map();
    BV.state.members.forEach(m => {
      if (!visible.has(m.route_id)) return;
      if (!byStop.has(m.stop_id)) byStop.set(m.stop_id, []);
      byStop.get(m.stop_id).push(m);
    });
    byStop.forEach((ms, id) => {
      const stop = BV.state.stops.get(id);
      if (!stop || (!stop.active && !showInactive)) return;
      items.push({ stop, routeIds: ms.map(m => m.route_id), label: numbered ? ms[0].position : null, position: ms[0].position });
    });
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
    if (query) {
      const q = query.toLowerCase();
      rows = [...BV.state.stops.values()].filter(s => (showInactive || s.active) && (s.name.toLowerCase().includes(q) || (s.legacy_names || []).some(n => n.toLowerCase().includes(q))))
        .map(stop => ({ stop, routeIds: BV.data.routesOf(stop.id).map(m => m.route_id) }));
    } else {
      rows = items.slice();
      rows.sort((a, b) => numbered ? (a.position - b.position) : a.stop.name.localeCompare(b.stop.name));
    }
    const total = rows.length, shown = rows.slice(0, 300);
    $('count').textContent = (query ? 'Resultados: ' : 'Visibles: ') + total;
    $('list').innerHTML = shown.map(r => {
      const s = r.stop, sel = s.id === BV.panel.current() ? ' sel' : '';
      const dots = (r.routeIds || []).map(id => `<i style="background:${C.ROUTE_COLORS[id] || '#888'}" title="R${id}"></i>`).join('');
      const pos = (numbered && !query) ? `<small>${r.position}</small>` : '';
      return `<li class="${sel}${s.active ? '' : ' off'}" data-id="${s.id}">${pos}<span>${esc(s.name)}</span>
        ${s.note ? '<u title="' + esc(s.note) + '">!</u>' : ''}${s.opens_at ? '<code>' + s.opens_at.slice(0, 5) + '</code>' : ''}<div class="dots">${dots}</div></li>`;
    }).join('') + (total > shown.length ? `<li class="more">… ${total - shown.length} más. Afina la búsqueda.</li>` : '');
  }

  function refresh() {
    const { items, numbered } = visibleItems();
    renderRoutes(); renderList(items, numbered);
    BV.map.render(items);
    $('summary').textContent = items.length + ' paradas en el mapa';
    if (BV.panel.current()) BV.map.select(BV.panel.current());
  }
  BV.ui = { refresh };

  function select(id, { pan = true } = {}) {
    document.body.classList.remove('side-open');
    BV.panel.open(id);
    BV.map.select(id);
    const s = BV.state.stops.get(id);
    if (pan && s) BV.map.panTo(s);
    document.querySelectorAll('#list li').forEach(li => li.classList.toggle('sel', li.dataset.id === id));
  }

  /* ---------- eventos ---------- */
  function wire() {
    $('routes').addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      const r = b.dataset.r; visible.has(r) ? visible.delete(r) : visible.add(r);
      ls.set('bv_visible', [...visible]); refresh();
      if (e.shiftKey === false && visible.size === 1) BV.map.fit(visibleItems().items);
    });
    $('r-all').onclick = () => { visible = new Set(BV.state.routes.map(r => r.id)); ls.set('bv_visible', [...visible]); refresh(); };
    $('r-none').onclick = () => { visible = new Set(); ls.set('bv_visible', []); refresh(); };
    $('search').addEventListener('input', e => { query = e.target.value.trim(); refresh(); });
    $('list').addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li) select(li.dataset.id); });
    $('inactive').addEventListener('change', e => { showInactive = e.target.checked; refresh(); });
    $('drawer-close').onclick = () => { BV.panel.close(); BV.map.clearSelection(); refresh(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && BV.panel.current()) $('drawer-close').click(); });
    $('btn-menu').onclick = () => document.body.classList.toggle('side-open');
    $('btn-out').onclick = async () => { await BV.auth.logout(); location.reload(); };
    $('btn-key').onclick = () => { $('nomap').hidden = false; $('mapkey').value = mapKey || ''; };
    $('btn-new').onclick = () => { $('new-name').value = ''; $('new-routes').innerHTML = BV.state.routes.map(r =>
      `<label class="rchip" style="--c:${C.ROUTE_COLORS[r.id]};--t:${C.textOn(C.ROUTE_COLORS[r.id])}"><input type="checkbox" value="${r.id}"><span>R${r.id}</span></label>`).join(''); $('dlg-new').showModal(); $('new-name').focus(); };
    $('new-cancel').onclick = () => $('dlg-new').close();
    $('form-new').addEventListener('submit', async e => {
      e.preventDefault();
      const name = $('new-name').value.trim(); if (!name) return;
      const routes = [...document.querySelectorAll('#new-routes input:checked')].map(i => i.value);
      const c = BV.map.available() ? BV.map.center() : C.MAP_CENTER;
      try {
        const s = await BV.data.createStop(name, routes, c.lat, c.lng);
        routes.forEach(r => visible.add(r)); $('dlg-new').close(); refresh(); select(s.id, { pan: false });
        BV.toast('Parada creada en el centro del mapa. Arrastra el pin a su lugar.');
      } catch (err) { BV.toast('No se creó: ' + err.message, 'err'); }
    });
    BV.map.onSelect(id => select(id, { pan: false }));
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
    wire();
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
