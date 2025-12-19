"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function Page() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session) router.push("/app");
    })();
  }, [router]);

  async function signIn(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pass.trim(),
    });

    setLoading(false);
    if (error) return setMsg(error.message);
    router.push("/app");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow">
        <h1 className="text-2xl font-bold text-white">PrestamosPY</h1>
        <p className="text-sm text-white/70 mt-1">Iniciá sesión.</p>

        <form onSubmit={signIn} className="mt-6 space-y-3">
          <input
            className="w-full rounded-xl bg-slate-950 border border-white/10 p-3 text-white outline-none"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="w-full rounded-xl bg-slate-950 border border-white/10 p-3 text-white outline-none"
            placeholder="Contraseña"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />

          <button
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 p-3 font-semibold text-white"
          >
            {loading ? "Ingresando..." : "Entrar"}
          </button>

          {msg && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
              {msg}
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
