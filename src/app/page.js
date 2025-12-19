"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "../lib/supabase";

export default function LoginPage() {
  // OJO: no creamos supabase al render en build. Lo creamos lazy:
  const supabase = useMemo(() => {
    try {
      return getSupabase();
    } catch {
      return null;
    }
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) window.location.href = "/app";
    });
  }, [supabase]);

  async function login(e) {
    e.preventDefault();
    if (!supabase) {
      alert("Faltan variables de entorno en Vercel (Supabase URL/Key).");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) alert(error.message);
    else window.location.href = "/app";
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
      <form onSubmit={login} style={{ width: 340 }}>
        <h2 style={{ margin: "0 0 10px" }}>PrestamosPY</h2>
        <p style={{ margin: "0 0 16px", opacity: 0.7 }}>Ingresá con tu cuenta</p>

        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", marginBottom: 10, padding: 10 }}
        />

        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", marginBottom: 10, padding: 10 }}
        />

        <button disabled={loading} style={{ width: "100%", padding: 10 }}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>

        {!supabase && (
          <p style={{ marginTop: 12, color: "#f59e0b" }}>
            ⚠️ Falta configurar env vars en Vercel.
          </p>
        )}
      </form>
    </main>
  );
}
