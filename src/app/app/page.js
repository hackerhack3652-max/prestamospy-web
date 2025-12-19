"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

function gs(n) {
  const v = Math.round(Number(n || 0));
  return v.toLocaleString("es-ES") + " Gs";
}
function ymd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export default function AppHome() {
  const [session, setSession] = useState(null);
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(true);

  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [reinv, setReinv] = useState([]);
  const [settings, setSettings] = useState({ capital_inicial: 0, aportes: 0 });

  const [loanForm, setLoanForm] = useState({
    client: "",
    capital: "",
    interest_rate: "0",
    start_date: ymd(new Date()),
    monthly: false,
    pay_day: 2,
    notes: "",
  });

  const [payForm, setPayForm] = useState({
    loan_id: "",
    pay_date: ymd(new Date()),
    amount: "",
    note: "",
  });

  const [reForm, setReForm] = useState({
    kind: "IN",
    event_date: ymd(new Date()),
    amount: "",
    note: "",
  });

  useEffect(() => {
    let unsub = null;

    async function boot() {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        window.location.href = "/";
        return;
      }
      setSession(data.session);

      const uid = data.session.user.id;

      // licencia
      const lic = await supabase
        .from("licenses")
        .select("status")
        .eq("user_id", uid)
        .maybeSingle();

      setLicense(lic.data?.status || null);

      if (lic.data?.status !== "active") {
        setLoading(false);
        return;
      }

      await refreshAll(uid);
      setLoading(false);

      // realtime sync
      const ch = supabase
        .channel("prestamospy-sync-" + uid)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "loans", filter: `user_id=eq.${uid}` },
          () => refreshAll(uid)
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "payments", filter: `user_id=eq.${uid}` },
          () => refreshAll(uid)
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "reinvestments", filter: `user_id=eq.${uid}` },
          () => refreshAll(uid)
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "settings", filter: `user_id=eq.${uid}` },
          () => refreshAll(uid)
        )
        .subscribe();

      unsub = () => supabase.removeChannel(ch);
    }

    boot();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  async function refreshAll(uid) {
    const [l, p, r, s] = await Promise.all([
      supabase.from("loans").select("*").eq("user_id", uid).order("start_date", { ascending: false }),
      supabase
        .from("payments")
        .select("id,loan_id,pay_date,amount,note,loans!inner(client)")
        .eq("user_id", uid)
        .order("pay_date", { ascending: false }),
      supabase.from("reinvestments").select("*").eq("user_id", uid).order("event_date", { ascending: false }),
      supabase.from("settings").select("*").eq("user_id", uid).maybeSingle(),
    ]);

    setLoans(l.data || []);
    setPayments(
      (p.data || []).map((x) => ({
        ...x,
        client: x.loans?.client || "",
      }))
    );
    setReinv(r.data || []);
    setSettings(s.data || { capital_inicial: 0, aportes: 0 });
  }

  const totals = useMemo(() => {
    const capital = loans.reduce((a, x) => a + Number(x.capital || 0), 0);
    const due = loans.reduce((a, x) => a + Number(x.total_due || 0), 0);
    const paid = payments.reduce((a, x) => a + Number(x.amount || 0), 0);
    const pending = due - paid;
    const interest = due - capital;

    const reinIn = reinv.filter((x) => x.kind === "IN").reduce((a, x) => a + Number(x.amount || 0), 0);
    const reinOut = reinv.filter((x) => x.kind === "OUT").reduce((a, x) => a + Number(x.amount || 0), 0);
    const reinAvail = reinIn - reinOut;

    const capIni = Number(settings.capital_inicial || 0);
    const aportes = Number(settings.aportes || 0);
    const capPropio = capIni + aportes;
    const totalFinal = capPropio + interest;
    const rentab = capPropio > 0 ? (interest / capPropio) * 100 : 0;

    return { capital, due, paid, pending, interest, reinIn, reinOut, reinAvail, capIni, aportes, capPropio, totalFinal, rentab };
  }, [loans, payments, reinv, settings]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function createLoan(e) {
    e.preventDefault();
    const c = loanForm.client.trim();
    const cap = Number(String(loanForm.capital).replaceAll(".", "")) || 0;
    const pct = Number(String(loanForm.interest_rate).replace(",", ".")) || 0;

    if (!c) return alert("Cliente obligatorio");
    if (cap <= 0) return alert("Capital inválido");
    if (pct < 0) return alert("Interés inválido");

    const interest_amount = cap * (pct / 100);
    const total_due = cap + interest_amount;

    let next_due_date = null;
    let pay_rule = null;
    let pay_day = null;

    if (loanForm.monthly) {
      pay_rule = "monthly";
      pay_day = Number(loanForm.pay_day) || 2;

      const sd = new Date(loanForm.start_date);
      const dThis = new Date(sd.getFullYear(), sd.getMonth(), Math.min(Math.max(pay_day, 1), 28));
      if (dThis >= sd) next_due_date = ymd(dThis);
      else {
        const nm = sd.getMonth() === 11 ? 0 : sd.getMonth() + 1;
        const ny = sd.getMonth() === 11 ? sd.getFullYear() + 1 : sd.getFullYear();
        next_due_date = ymd(new Date(ny, nm, Math.min(Math.max(pay_day, 1), 28)));
      }
    }

    const uid = session.user.id;
    const { error } = await supabase.from("loans").insert({
      user_id: uid,
      client: c,
      capital: cap,
      interest_rate: pct,
      interest_amount,
      total_due,
      start_date: loanForm.start_date,
      next_due_date,
      pay_rule,
      pay_day,
      notes: loanForm.notes,
      status: "active",
    });

    if (error) return alert(error.message);

    setLoanForm({
      client: "",
      capital: "",
      interest_rate: "0",
      start_date: ymd(new Date()),
      monthly: false,
      pay_day: 2,
      notes: "",
    });
  }

  async function addPayment(e) {
    e.preventDefault();
    const a = Number(String(payForm.amount).replaceAll(".", "")) || 0;
    if (!payForm.loan_id) return alert("Elegí un préstamo");
    if (a <= 0) return alert("Monto inválido");

    const uid = session.user.id;
    const loan = loans.find((x) => x.id === payForm.loan_id);
    if (!loan) return alert("Préstamo no encontrado");

    const { error } = await supabase.from("payments").insert({
      user_id: uid,
      loan_id: payForm.loan_id,
      pay_date: payForm.pay_date,
      amount: a,
      note: payForm.note,
    });
    if (error) return alert(error.message);

    if (loan.pay_rule === "monthly" && loan.pay_day) {
      const d = new Date(payForm.pay_date);
      const nm = d.getMonth() === 11 ? 0 : d.getMonth() + 1;
      const ny = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
      const next = new Date(ny, nm, Math.min(Math.max(loan.pay_day, 1), 28));
      await supabase.from("loans").update({ next_due_date: ymd(next) }).eq("id", loan.id);
    }

    setPayForm({ loan_id: payForm.loan_id, pay_date: ymd(new Date()), amount: "", note: "" });
  }

  async function addReinv(e) {
    e.preventDefault();
    const a = Number(String(reForm.amount).replaceAll(".", "")) || 0;
    if (a <= 0) return alert("Monto inválido");

    const uid = session.user.id;
    const { error } = await supabase.from("reinvestments").insert({
      user_id: uid,
      kind: reForm.kind,
      event_date: reForm.event_date,
      amount: a,
      note: reForm.note,
    });
    if (error) return alert(error.message);

    setReForm({ kind: "IN", event_date: ymd(new Date()), amount: "", note: "" });
  }

  async function saveSettings(e) {
    e.preventDefault();
    const capIni = Number(String(settings.capital_inicial).replaceAll(".", "")) || 0;
    const ap = Number(String(settings.aportes).replaceAll(".", "")) || 0;

    const uid = session.user.id;
    const { error } = await supabase.from("settings").upsert({
      user_id: uid,
      capital_inicial: capIni,
      aportes: ap,
    });
    if (error) return alert(error.message);

    alert("Guardado");
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white">Cargando...</main>;
  }

  if (!session) return null;

  if (license !== "active") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-white">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6">
          <h2 className="text-xl font-bold">Licencia inactiva</h2>
          <p className="text-white/70 mt-2">Estado: <b>{license || "sin registro"}</b></p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => window.location.reload()} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold">
              Reintentar
            </button>
            <button onClick={logout} className="rounded-xl border border-white/15 px-4 py-2">
              Salir
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">PrestamosPY</h1>
            <p className="text-white/60 text-sm">Préstamos • Pagos • Reinversión • Resumen</p>
          </div>
          <button onClick={logout} className="rounded-xl border border-white/15 px-4 py-2 hover:bg-white/5">
            Salir
          </button>
        </header>

        <section className="grid md:grid-cols-3 gap-3 mt-6">
          {[
            ["Capital prestado", gs(totals.capital)],
            ["Total a cobrar", gs(totals.due)],
            ["Cobrado", gs(totals.paid)],
            ["Pendiente", gs(totals.pending)],
            ["Interés proyectado", gs(totals.interest)],
            ["Reinv disponible", gs(totals.reinAvail)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <div className="text-white/60 text-sm">{k}</div>
              <div className="text-lg font-bold mt-1">{v}</div>
            </div>
          ))}
        </section>

        <section className="grid lg:grid-cols-2 gap-4 mt-6">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <h2 className="font-bold text-lg">Nuevo préstamo</h2>
            <form onSubmit={createLoan} className="mt-4 grid gap-3">
              <input className="rounded-xl bg-slate-950 border border-white/10 p-3"
                placeholder="Cliente" value={loanForm.client}
                onChange={(e) => setLoanForm({ ...loanForm, client: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <input className="rounded-xl bg-slate-950 border border-white/10 p-3"
                  placeholder="Capital (Gs)" value={loanForm.capital}
                  onChange={(e) => setLoanForm({ ...loanForm, capital: e.target.value })}
                />
                <input className="rounded-xl bg-slate-950 border border-white/10 p-3"
                  placeholder="Interés (%)" value={loanForm.interest_rate}
                  onChange={(e) => setLoanForm({ ...loanForm, interest_rate: e.target.value })}
                />
              </div>
              <input className="rounded-xl bg-slate-950 border border-white/10 p-3"
                type="date" value={loanForm.start_date}
                onChange={(e) => setLoanForm({ ...loanForm, start_date: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" checked={loanForm.monthly}
                  onChange={(e) => setLoanForm({ ...loanForm, monthly: e.target.checked })}
                />
                Paga el día X de cada mes (auto próximo pago)
              </label>
              {loanForm.monthly && (
                <select className="rounded-xl bg-slate-950 border border-white/10 p-3"
                  value={loanForm.pay_day}
                  onChange={(e) => setLoanForm({ ...loanForm, pay_day: Number(e.target.value) })}
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>Día {d}</option>
                  ))}
                </select>
              )}
              <textarea className="rounded-xl bg-slate-950 border border-white/10 p-3"
                placeholder="Notas (opcional)" value={loanForm.notes}
                onChange={(e) => setLoanForm({ ...loanForm, notes: e.target.value })}
              />
              <button className="rounded-xl bg-blue-600 hover:bg-blue-500 p-3 font-semibold">
                Guardar préstamo
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <h2 className="font-bold text-lg">Registrar pago</h2>
            <form onSubmit={addPayment} className="mt-4 grid gap-3">
              <select className="rounded-xl bg-slate-950 border border-white/10 p-3"
                value={payForm.loan_id}
                onChange={(e) => setPayForm({ ...payForm, loan_id: e.target.value })}
              >
                <option value="">Elegí un préstamo...</option>
                {loans.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.client} • Total {gs(l.total_due)}
                  </option>
                ))}
              </select>
              <input className="rounded-xl bg-slate-950 border border-white/10 p-3"
                type="date" value={payForm.pay_date}
                onChange={(e) => setPayForm({ ...payForm, pay_date: e.target.value })}
              />
              <input className="rounded-xl bg-slate-950 border border-white/10 p-3"
                placeholder="Monto (Gs)" value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              />
              <input className="rounded-xl bg-slate-950 border border-white/10 p-3"
                placeholder="Nota (opcional)" value={payForm.note}
                onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
              />
              <button className="rounded-xl bg-blue-600 hover:bg-blue-500 p-3 font-semibold">
                Guardar pago
              </button>
            </form>

            <div className="mt-5">
              <h3 className="font-semibold">Últimos pagos</h3>
              <div className="mt-2 space-y-2 max-h-64 overflow-auto">
                {payments.map((p) => (
                  <div key={p.id} className="rounded-xl border border-white/10 bg-slate-950 p-3 text-sm">
                    <div className="font-semibold">{p.client} • {gs(p.amount)}</div>
                    <div className="text-white/60">{p.pay_date} • {p.note || "-"}</div>
                  </div>
                ))}
                {payments.length === 0 && <div className="text-white/60 text-sm">Sin pagos todavía</div>}
              </div>
            </div>
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-4 mt-6">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <h2 className="font-bold text-lg">Reinversión</h2>
            <div className="text-sm text-white/70 mt-1">
              IN {gs(totals.reinIn)} • OUT {gs(totals.reinOut)} • Disponible {gs(totals.reinAvail)}
            </div>
            <form onSubmit={addReinv} className="mt-4 grid gap-3">
              <select className="rounded-xl bg-slate-950 border border-white/10 p-3"
                value={reForm.kind}
                onChange={(e) => setReForm({ ...reForm, kind: e.target.value })}
              >
                <option value="IN">Entrada (IN)</option>
                <option value="OUT">Salida (OUT)</option>
              </select>
              <input className="rounded-xl bg-slate-950 border border-white/10 p-3"
                type="date" value={reForm.event_date}
                onChange={(e) => setReForm({ ...reForm, event_date: e.target.value })}
              />
              <input className="rounded-xl bg-slate-950 border border-white/10 p-3"
                placeholder="Monto (Gs)" value={reForm.amount}
                onChange={(e) => setReForm({ ...reForm, amount: e.target.value })}
              />
              <input className="rounded-xl bg-slate-950 border border-white/10 p-3"
                placeholder="Nota (opcional)" value={reForm.note}
                onChange={(e) => setReForm({ ...reform, note: e.target.value })}
              />
              <button className="rounded-xl bg-blue-600 hover:bg-blue-500 p-3 font-semibold">
                Guardar reinversión
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <h2 className="font-bold text-lg">Configuración</h2>
            <form onSubmit={saveSettings} className="mt-4 grid gap-3">
              <input className="rounded-xl bg-slate-950 border border-white/10 p-3"
                placeholder="Capital inicial (Gs)"
                value={settings.capital_inicial}
                onChange={(e) => setSettings({ ...settings, capital_inicial: e.target.value })}
              />
              <input className="rounded-xl bg-slate-950 border border-white/10 p-3"
                placeholder="Aportes (Gs)"
                value={settings.aportes}
                onChange={(e) => setSettings({ ...settings, aportes: e.target.value })}
              />
              <button className="rounded-xl bg-blue-600 hover:bg-blue-500 p-3 font-semibold">
                Guardar
              </button>

              <div className="text-sm text-white/70 mt-2">
                Total final si TODOS pagan: <b className="text-white">{gs(totals.totalFinal)}</b><br/>
                Rentabilidad: <b className="text-white">{totals.rentab.toFixed(2)}%</b>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
