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
      const row = { name: name.trim(), name_key: name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim(),
                    lat, lng, coord_source: 'manual' };
      const { data, error } = await sb.from('stops').insert(row).select().single();
      if (error) throw error;
      state.stops.set(data.id, data);
      for (const r of routeIds) await BV.data.addToRoute(data.id, r);
      return data;
    },

    async addToRoute(stopId, routeId) {
      const route = BV.data.route(routeId);
      const ms = BV.data.membersOf(routeId);
      const position = route.ordered ? (Math.max(0, ...ms.map(m => m.position || 0)) + 1) : null;
      const row = { route_id: routeId, stop_id: stopId, position, zone: null };
      const { error } = await sb.from('route_stops').insert(row);
      if (error) throw error;
      state.members.push(row);
      return row;
    },

    async removeFromRoute(stopId, routeId) {
      const { error } = await sb.from('route_stops').delete().eq('stop_id', stopId).eq('route_id', routeId);
      if (error) throw error;
      state.members = state.members.filter(m => !(m.stop_id === stopId && m.route_id === routeId));
    },

    async setZone(stopId, routeId, zone) {
      const { error } = await sb.from('route_stops').update({ zone }).eq('stop_id', stopId).eq('route_id', routeId);
      if (error) throw error;
      const m = state.members.find(x => x.stop_id === stopId && x.route_id === routeId);
      if (m) m.zone = zone;
    }
  };
})();
