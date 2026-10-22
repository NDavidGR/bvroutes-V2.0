/* Panel de edición de una parada. Autoguardado: cada cambio se envía solo. */
(function () {
  const C = window.BV_CONFIG;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TYPES = [['', 'Sin definir'], ['customer', 'Cliente'], ['vendor', 'Proveedor'], ['freight', 'Carga / forwarder'], ['warehouse', 'Almacén']];
  let current = null, timers = {}, onChange = () => {};

  function status(txt, kind) { const e = $('save-status'); if (!e) return; e.textContent = txt; e.dataset.kind = kind || ''; }

  function save(patch, { immediate = false } = {}) {
    const id = current;
    const run = () => {
      status('Guardando…');
      BV.data.updateStop(id, patch).then(() => { status('Guardado ✓', 'ok'); onChange(id); })
        .catch(e => { status('Error al guardar', 'err'); BV.toast('No se guardó: ' + (e.message || e), 'err'); BV.panel.open(id); onChange(id); });
    };
    if (immediate) return run();
    const key = Object.keys(patch).join(',');
    clearTimeout(timers[key]); timers[key] = setTimeout(run, 500);
  }

  function seg(name, opts, value) {
    return '<div class="seg" data-seg="' + name + '">' + opts.map(([v, l]) =>
      `<button type="button" data-v="${esc(v)}" class="${String(value ?? '') === v ? 'on' : ''}">${esc(l)}</button>`).join('') + '</div>';
  }

  function render() {
    const s = BV.state.stops.get(current);
    if (!s) return;
    const ms = BV.data.routesOf(s.id);
    const opens = s.opens_at ? s.opens_at.slice(0, 5) : '';
    const openOpt = opens && opens !== '06:00' && opens !== '10:00';
    const routeBtns = BV.state.routes.map(r => {
      const m = ms.find(x => x.route_id === r.id);
      const col = C.ROUTE_COLORS[r.id] || '#888';
      return `<button type="button" class="rchip ${m ? 'on' : ''}" data-route="${r.id}" style="--c:${col}">R${r.id}${m && m.position ? `<small>#${m.position}</small>` : ''}</button>`;
    }).join('');
    const zoneRows = ms.filter(m => !BV.data.route(m.route_id).ordered).map(m =>
      `<label class="fld"><span>Zona en R${m.route_id}</span><input data-zone="${m.route_id}" value="${esc(m.zone || '')}" placeholder="Downtown, Brickell, Kendall…"></label>`).join('');
    const lat = s.lat != null ? s.lat.toFixed(6) : '—', lng = s.lng != null ? s.lng.toFixed(6) : '—';

    $('drawer-body').innerHTML = `
      <label class="fld"><span>Nombre</span><input id="f-name" value="${esc(s.name)}"></label>

      <div class="fld"><span>Abre a las</span>
        ${seg('opens', [['', 'Sin definir'], ['06:00', '6 am'], ['10:00', '10 am']], openOpt ? '__' : opens)}
        <input id="f-opens-other" type="time" value="${openOpt ? opens : ''}" title="Otra hora">
      </div>

      <div class="fld"><span>Tipo de cliente</span>
        ${seg('tier', [['', 'Sin definir'], ['large', 'Grande'], ['regular', 'Regular']], s.tier)}
      </div>

      <label class="switch"><input type="checkbox" id="f-fixed" ${s.fixed_position ? 'checked' : ''}><span>Posición fija en la ruta</span></label>

      <label class="fld"><span>Nota</span><input id="f-note" value="${esc(s.note)}" placeholder="No early, from 6, 1st stop…"></label>

      <div class="fld"><span>Rutas</span><div class="rchips">${routeBtns}</div></div>
      ${zoneRows}

      <div class="fld"><span>Coordenadas <em>${lat}, ${lng}</em></span>
        <input id="f-coords" placeholder="Pega aquí: 25.92616, -80.15595">
        <small class="hint">O arrastra el pin en el mapa.</small>
      </div>

      <details class="more"><summary>Más datos</summary>
        <label class="fld"><span>Tipo de punto</span>
          <select id="f-type">${TYPES.map(([v, l]) => `<option value="${v}" ${(s.type || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="fld"><span>Plaza (para agrupar paradas)</span><input id="f-plaza" value="${esc(s.plaza_key)}"></label>
        ${(s.legacy_names || []).length ? `<div class="fld"><span>Nombres anteriores</span><div class="muted">${esc(s.legacy_names.join(' · '))}</div></div>` : ''}
      </details>

      <div class="danger">
        ${s.active ? `<button type="button" id="b-deact" class="btn-ghost">Desactivar parada</button>
          <div id="deact-form" hidden><input id="deact-reason" placeholder="Motivo (cerró, se mudó, …)"><button type="button" id="b-deact-ok" class="btn-danger">Confirmar</button></div>`
        : `<div class="muted">Inactiva${s.deactivated_reason ? ': ' + esc(s.deactivated_reason) : ''}</div><button type="button" id="b-react" class="btn-ghost">Reactivar</button>`}
      </div>`;
    $('drawer-title').textContent = s.name;
    bind(s);
  }

  function bind(s) {
    const b = $('drawer-body');
    $('f-name').addEventListener('input', e => { if (e.target.value.trim()) save({ name: e.target.value.trim() }); });
    $('f-note').addEventListener('input', e => save({ note: e.target.value.trim() || null }));
    $('f-plaza').addEventListener('input', e => save({ plaza_key: e.target.value.trim() || null }));
    $('f-type').addEventListener('change', e => save({ type: e.target.value || null }, { immediate: true }));
    $('f-fixed').addEventListener('change', e => save({ fixed_position: e.target.checked }, { immediate: true }));
    $('f-opens-other').addEventListener('change', e => { save({ opens_at: e.target.value || null }, { immediate: true }); setTimeout(render, 0); });
    b.querySelectorAll('[data-seg] button').forEach(btn => btn.addEventListener('click', () => {
      const kind = btn.parentElement.dataset.seg, v = btn.dataset.v || null;
      save(kind === 'opens' ? { opens_at: v } : { tier: v }, { immediate: true });
      setTimeout(render, 0);
    }));
    $('f-coords').addEventListener('change', e => {
      const m = e.target.value.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/);
      if (!m) { BV.toast('Formato: lat, lng', 'err'); return; }
      const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) { BV.toast('Coordenadas fuera de rango', 'err'); return; }
      save({ lat, lng, coord_source: 'manual' }, { immediate: true });
      BV.map.setPosition(s.id, lat, lng); BV.map.panTo({ lat, lng }); setTimeout(render, 300);
    });
    b.querySelectorAll('[data-route]').forEach(btn => btn.addEventListener('click', async () => {
      const r = btn.dataset.route, has = BV.data.routesOf(s.id).some(m => m.route_id === r);
      try {
        status('Guardando…');
        if (has) { await BV.data.removeFromRoute(s.id, r); BV.toast(`Quitada de la ruta ${r}`); }
        else { await BV.data.addToRoute(s.id, r); BV.toast(`Agregada al final de la ruta ${r}`); }
        status('Guardado ✓', 'ok'); render(); onChange(s.id);
      } catch (e) { status('Error al guardar', 'err'); BV.toast('No se guardó: ' + e.message, 'err'); }
    }));
    b.querySelectorAll('[data-zone]').forEach(inp => inp.addEventListener('input', () => {
      const r = inp.dataset.zone, z = inp.value.trim() || null;
      clearTimeout(timers['z' + r]);
      timers['z' + r] = setTimeout(() => BV.data.setZone(s.id, r, z).then(() => status('Guardado ✓', 'ok')).catch(e => BV.toast(e.message, 'err')), 500);
    }));
    const d = $('b-deact');
    if (d) {
      d.addEventListener('click', () => { $('deact-form').hidden = false; $('deact-reason').focus(); });
      $('b-deact-ok').addEventListener('click', () => {
        save({ active: false, deactivated_at: new Date().toISOString(), deactivated_reason: $('deact-reason').value.trim() || null }, { immediate: true });
        setTimeout(render, 400);
      });
    }
    const r = $('b-react');
    if (r) r.addEventListener('click', () => { save({ active: true, deactivated_at: null, deactivated_reason: null }, { immediate: true }); setTimeout(render, 400); });
  }

  BV.panel = {
    onChange(fn) { onChange = fn; },
    current() { return current; },
    open(id) {
      current = id; $('drawer').hidden = false; document.body.classList.add('drawer-open');
      status(''); render();
    },
    close() { current = null; $('drawer').hidden = true; document.body.classList.remove('drawer-open'); }
  };
})();
