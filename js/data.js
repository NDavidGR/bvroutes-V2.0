/* Capa de datos: carga paginada y operaciones. Todo el estado vive en BV.state. */
(function () {
  const sb = BV.sb;
  const PAGE = 1000; // PostgREST devuelve máx. 1000 filas por consulta: hay que paginar

  async function fetchAll(table, order) {
    let rows = [], from = 0;
    for (;;) {
      let q = sb.from(table).select('*').range(from, from + PAGE - 1);
      order.forEach(o => { q = q.order(o); });
      const { data, error } = await q;
      if (error) throw error;
      rows = rows.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return rows;
  }

  const state = BV.state = { stops: new Map(), routes: [], members: [], depot: null };

  BV.data = {
    async load() {
      const [stops, routes, members, depot] = await Promise.all([
        fetchAll('stops', ['name', 'id']),
        fetchAll('routes', ['id']),
        fetchAll('route_stops', ['route_id', 'stop_id']),
        sb.from('depot').select('*').limit(1)
      ]);
      state.stops = new Map(stops.map(s => [s.id, s]));
      state.routes = routes.sort((a, b) => Number(a.id) - Number(b.id));
      state.members = members;
      state.depot = (depot.data && depot.data[0]) || null;
    },

    routesOf(stopId) { return state.members.filter(m => m.stop_id === stopId); },
    membersOf(routeId) {
      return state.members.filter(m => m.route_id === routeId)
        .sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9));
    },
    route(id) { return state.routes.find(r => r.id === id); },

    // Optimista: la pantalla cambia al instante; si el servidor falla, se restaura.
    async updateStop(id, patch) {
      const stop = state.stops.get(id);
      const prev = {};
      Object.keys(patch).forEach(k => { prev[k] = stop[k]; });
      Object.assign(stop, patch);
      const { error } = await sb.from('stops').update(patch).eq('id', id);
      if (error) { Object.assign(stop, prev); throw error; }
    },

    async createStop(name, routeIds, lat, lng) {
      name = name.trim().toUpperCase();
      const row = { name, name_key: name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim(),
                    lat, lng, coord_source: lat == null ? null : 'manual' };
      const { data, error } = await sb.from('stops').insert(row).select().single();
      if (error) throw error;
      state.stops.set(data.id, data);
      for (const r of routeIds) await BV.data.addToRoute(data.id, r);
      return data;
    },

    // Recarga solo las membresías (las posiciones de otras paradas cambian al insertar/quitar).
    async reloadMembers() {
      state.members = await fetchAll('route_stops', ['route_id', 'stop_id']);
    },

    // pos = posición deseada (1 = al inicio); null = al final. En rutas sin orden se ignora.
    async addToRoute(stopId, routeId, pos = null, zone = null) {
      const { error } = await sb.rpc('add_stop_to_route', { p_stop: stopId, p_route: routeId, p_pos: pos, p_zone: zone });
      if (error) throw error;
      await BV.data.reloadMembers();
    },

    async removeFromRoute(stopId, routeId) {
      const { error } = await sb.rpc('remove_stop_from_route', { p_stop: stopId, p_route: routeId });
      if (error) throw error;
      await BV.data.reloadMembers();
    },

    async moveStop(stopId, fromRoute, toRoute, pos = null) {
      const { error } = await sb.rpc('move_stop', { p_stop: stopId, p_from: fromRoute, p_to: toRoute, p_pos: pos });
      if (error) throw error;
      await BV.data.reloadMembers();
    },

    async reorder(stopId, routeId, pos) {
      const { error } = await sb.rpc('reorder_stop', { p_route: routeId, p_stop: stopId, p_pos: pos });
      if (error) throw error;
      await BV.data.reloadMembers();
    },

    // Historial: los más recientes primero. before = fecha del último ya cargado, para paginar.
    async history({ before = null, limit = 200 } = {}) {
      let q = sb.from('changes').select('*').order('at', { ascending: false }).limit(limit);
      if (before) q = q.lt('at', before);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },

    async loadPlan(date, routeId) {
      const { data, error } = await sb.from('day_plans').select('*').eq('plan_date', date).eq('route_id', routeId).limit(1);
      if (error) throw error;
      return (data && data[0]) || null;
    },
    async loadPlansForDate(date) {
      const { data, error } = await sb.from('day_plans').select('*').eq('plan_date', date);
      if (error) throw error;
      return data || [];
    },
    async savePlan(row) {
      const { error } = await sb.from('day_plans').upsert(row, { onConflict: 'plan_date,route_id' });
      if (error) throw error;
    },

    // Guarda el orden completo de una ruta (SQL 07). Lo que no venga en la lista queda al final.
    async setRouteOrder(routeId, ids, note = null) {
      const { error } = await sb.rpc('set_route_order', { p_route: routeId, p_order: ids, p_note: note });
      if (error) throw error;
      await BV.data.reloadMembers();
    },
    // Últimos guardados de orden de una ruta (para restaurar).
    async orderSaves(routeId, limit = 10) {
      const { data, error } = await sb.from('changes').select('id,at,before,after,note').eq('type', 'set_order').eq('route_id', routeId).order('at', { ascending: false }).limit(limit);
      if (error) throw error;
      return data || [];
    },

    // Agrega la parada a la ruta justo después de la parada más cercana. Devuelve esa vecina (o null).
    async addAfterNearest(stopId, routeId, lat, lng) {
      const a = (BV.data.route(routeId).ordered && lat != null) ? BV.data.nearest(routeId, lat, lng, stopId, 1)[0] || null : null;
      await BV.data.addToRoute(stopId, routeId, a ? a.position + 1 : null);
      return a;
    },

    // Paradas de una ruta ordenadas por cercanía a un punto (millas).
    nearest(routeId, lat, lng, excludeId, n = 4) {
      if (lat == null || lng == null) return [];
      const R = 3958.8, rad = x => x * Math.PI / 180;
      return BV.data.membersOf(routeId).filter(m => m.stop_id !== excludeId).map(m => {
        const st = state.stops.get(m.stop_id);
        if (!st || st.lat == null || !st.active) return null;
        const dLat = rad(st.lat - lat), dLng = rad(st.lng - lng);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(st.lat)) * Math.sin(dLng / 2) ** 2;
        return { stop: st, position: m.position, miles: 2 * R * Math.asin(Math.sqrt(h)) };
      }).filter(Boolean).sort((a, b) => a.miles - b.miles).slice(0, n);
    },

    async setZone(stopId, routeId, zone) {
      const { error } = await sb.from('route_stops').update({ zone }).eq('stop_id', stopId).eq('route_id', routeId);
      if (error) throw error;
      const m = state.members.find(x => x.stop_id === stopId && x.route_id === routeId);
      if (m) m.zone = zone;
    }
  };
})();
