"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "../../lib/supabase";

export default function AppHome() {
  const supabase = getSupabase();
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/";
      } else {
        setUser(data.session.user);
      }
    });
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (!user) return <p>Cargando...</p>;

  return (
    <main style={{ padding: 30 }}>
      <h1>PrestamosPY – Panel</h1>
      <p>Usuario: {user.email}</p>

      <button onClick={logout}>Salir</button>
    </main>
  );
}
