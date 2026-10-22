/* Cliente de Supabase + inicio de sesión */
(function () {
  const C = window.BV_CONFIG;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  window.BV = window.BV || {};
  BV.sb = sb;
  BV.auth = {
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    async login(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async logout() { await sb.auth.signOut(); }
  };
})();
