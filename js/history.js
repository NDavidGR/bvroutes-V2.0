/* Pantalla de historial: lee la tabla `changes` (solo lectura). */
(function () {
  const C = window.BV_CONFIG;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LABEL = { edit: 'Edición', move: 'Movida', add: 'Agregada', remove: 'Quitada', reorder: 'Reordenada', set_order: 'Orden guardado', deactivate: 'Desactivada', reactivate: 'Reactivada' };
  const FIELD = { name: 'Nombre', note: 'Nota', opens_at: 'Abre', tier: 'Cliente', fixed_position: 'Pos. fija', lat: 'Lat', lng: 'Lng', coord_source: 'Origen coords',
                  type: 'Tipo', plaza_key: 'Plaza', active: 'Activa', deactivated_reason: 'Motivo', deactivated_at: 'Fecha baja', name_key: 'Clave' };
  const TIER = { large: 'Grande', regular: 'Regular' };
  let rows = [], done = false, loading = false;

  const chip = r => r ? `<b class="tag" style="--c:${C.ROUTE_COLORS[r] || '#888'};--t:${C.textOn(C.ROUTE_COLORS[r] || '#888888')}">R${esc(r)}</b>` : '';
  const val = (k, v) => v == null || v === '' ? '—' : k === 'opens_at' ? String(v).slice(0, 5) : k === 'tier' ? (TIER[v] || v) : k === 'fixed_position' || k === 'active' ? (v ? 'sí' : 'no') : (typeof v === 'number' ? v.toFixed(6).replace(/0+$/, '') : esc(v));

  function detail(c) {
    const pos = n => n == null ? '' : ' #' + n;
    switch (c.type) {
      case 'move': return `${chip(c.from_route)}${pos(c.from_pos)} → ${chip(c.to_route)}${pos(c.to_pos)}`;
      case 'add': return `a ${chip(c.to_route || c.route_id)}${pos(c.to_pos)}`;
      case 'remove': return `de ${chip(c.from_route || c.route_id)}${pos(c.from_pos)}`;
      case 'set_order': { const a = c.after || [], b = c.before || [], n = a.filter((id, i) => b[i] !== id).length; return `${chip(c.route_id)} ${a.length} paradas, ${n} cambiaron de lugar${c.note ? ' · ' + esc(c.note) : ''}`; }
      case 'reorder': return `${chip(c.route_id)} posición ${c.from_pos} → ${c.to_pos}`;
      default: {
        const a = c.after || {}, b = c.before || {};
        return Object.keys(a).filter(k => !['deactivated_at'].includes(k)).map(k => `<span class="diff">${esc(FIELD[k] || k)}: <s>${val(k, b[k])}</s> → <b>${val(k, a[k])}</b></span>`).join(' ');
      }
    }
  }

  function render() {
    const q = $('hist-q').value.trim().toLowerCase(), t = $('hist-type').value;
    const list = rows.filter(c => (!t || c.type === t) && (!q || ((BV.state.stops.get(c.stop_id) || {}).name || '').toLowerCase().includes(q)));
    $('hist-body').innerHTML = (list.map(c => {
      const st = BV.state.stops.get(c.stop_id), d = new Date(c.at);
      return `<div class="hrow"><time title="${esc(c.at)}">${d.toLocaleDateString('es-US', { month: 'short', day: 'numeric' })}<small>${d.toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit' })}</small></time>
        <span class="hty hty-${esc(c.type)}">${esc(LABEL[c.type] || c.type)}</span>
        ${c.stop_id ? `<button class="lnk hstop" data-id="${esc(c.stop_id)}">${esc(st ? st.name : '(parada eliminada)')}</button>` : '<span class="muted">Ruta completa</span>'}
        <span class="hdet">${detail(c)}</span></div>`;
    }).join('') || '<p class="muted">Sin cambios para este filtro.</p>')
      + (done ? '' : '<button id="hist-more" class="btn-ghost">Cargar más</button>');
    const m = $('hist-more'); if (m) m.onclick = load;
  }

  async function load() {
    if (loading) return; loading = true;
    try {
      const data = await BV.data.history({ before: rows.length ? rows[rows.length - 1].at : null });
      rows = rows.concat(data); if (data.length < 200) done = true;
      render();
    } catch (e) { $('hist-body').innerHTML = `<p class="err">No se pudo cargar el historial: ${esc(e.message || e)}</p>`; }
    loading = false;
  }

  BV.history = {
    wire() {
      $('btn-hist').onclick = () => { rows = []; done = false; $('hist-body').innerHTML = '<p class="muted">Cargando…</p>'; $('dlg-hist').showModal(); load(); };
      $('hist-close').onclick = () => $('dlg-hist').close();
      $('hist-q').addEventListener('input', render);
      $('hist-type').addEventListener('change', render);
      $('hist-body').addEventListener('click', e => {
        const b = e.target.closest('.hstop'); if (!b || !BV.state.stops.get(b.dataset.id)) return;
        $('dlg-hist').close(); BV.ui.selectStop(b.dataset.id);
      });
    }
  };
})();
