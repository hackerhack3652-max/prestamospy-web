"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "../../lib/supabase";

export default function AppHome() {
  const supabase = useMemo(() => {
    try {
      return getSupabase();
    } catch {
      return null;
    }
  }, []);

  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      if (!data?.session) window.location.href = "/";
      else setUser(data.session.user);
    });
  }, [supabase]);

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (!supabase) return <p style={{ padding: 20 }}>Faltan env vars en Vercel.</p>;
  if (!user) return <p style={{ padding: 20 }}>Cargando...</p>;

  return (
    <main style={{ padding: 30 }}>
      <h1 style={{ marginTop: 0 }}>PrestamosPY – Panel</h1>
      <p style={{ opacity: 0.7 }}>Usuario: {user.email}</p>
      <button onClick={logout} style={{ padding: 10 }}>Salir</button>
    </main>
  );
}
