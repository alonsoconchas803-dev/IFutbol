import { useState, useEffect } from "react";

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

const db = async (path, token, options = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Error");
  }
  return res.status === 204 ? null : res.json();
};

const ROLES_LABEL = {
  referee:      { label: "Árbitro",       icon: "🟡", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
  league_admin: { label: "Admin de Liga", icon: "🏟️", color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
};

const ESTADO_LABEL = {
  pendiente: { label: "Pendiente", color: "#f59e0b", bg: "#fffbeb" },
  aprobado:  { label: "Aprobado",  color: "#16a34a", bg: "#f0fdf4" },
  rechazado: { label: "Rechazado", color: "#dc2626", bg: "#fef2f2" },
};

export default function Solicitudes({ session }) {
  const [solicitudes, setSolicitudes]                   = useState([]);
  const [ligas, setLigas]                               = useState([]);
  const [canchas, setCanchas]                           = useState([]);
  const [filtro, setFiltro]                             = useState("pendiente");
  const [loading, setLoading]                           = useState(true);
  const [toast, setToast]                               = useState(null);
  const [modalSolicitud, setModalSolicitud]             = useState(null);
  const [ligaSeleccionada, setLigaSeleccionada]         = useState("");
  const [canchasSeleccionadas, setCanchasSeleccionadas] = useState([]);
  const [procesando, setProcesando]                     = useState(false);

  const token = session?.access_token;

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [sols, ligs, canchasData] = await Promise.all([
        db("/solicitudes_registro?select=*&order=created_at.desc", token),
        db("/ligas?activa=eq.true&select=*&order=nombre", token),
        db("/canchas?select=*&order=nombre", token),
      ]);
      setSolicitudes(sols || []);
      setLigas(ligs || []);
      setCanchas(canchasData || []);
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  useEffect(() => { cargarDatos(); }, []);

  const filtradas = solicitudes.filter(s => filtro === "todas" ? true : s.estado === filtro);
  const pendientes = solicitudes.filter(s => s.estado === "pendiente").length;

  const abrirModal = (sol) => {
    setModalSolicitud(sol);
    setLigaSeleccionada("");
    setCanchasSeleccionadas([]);
  };

  const toggleCancha = (id) => {
    setCanchasSeleccionadas(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleAprobar = async () => {
    if (!modalSolicitud) return;
    if (modalSolicitud.tipo_rol === "league_admin" && !ligaSeleccionada)
      return showToast("Selecciona la liga que administrará", "err");
    if (modalSolicitud.tipo_rol === "referee" && canchasSeleccionadas.length === 0)
      return showToast("Selecciona al menos una unidad deportiva", "err");

    setProcesando(true);
    try {
      await db("/user_roles", token, {
        method: "POST",
        body: JSON.stringify({
          user_id: modalSolicitud.user_id,
          rol: modalSolicitud.tipo_rol,
          liga_id: modalSolicitud.tipo_rol === "league_admin" ? ligaSeleccionada : null,
        })
      });

      if (modalSolicitud.tipo_rol === "referee") {
        for (const canchaId of canchasSeleccionadas) {
          await fetch(`${SUPABASE_URL}/rest/v1/arbitro_cancha`, {
            method: "POST",
            headers: {
              "apikey": SUPABASE_KEY,
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
              "Prefer": "return=representation"
            },
            body: JSON.stringify({ user_id: modalSolicitud.user_id, cancha_id: canchaId })
          });
        }
      }

      await db(`/solicitudes_registro?id=eq.${modalSolicitud.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ estado: "aprobado", liga_id: ligaSeleccionada || null })
      });

      showToast(`✅ ${modalSolicitud.nombre_completo} aprobado correctamente`);
      setModalSolicitud(null);
      setLigaSeleccionada("");
      setCanchasSeleccionadas([]);
      cargarDatos();
    } catch (e) { showToast(e.message, "err"); }
    setProcesando(false);
  };

  const handleRechazar = async (sol) => {
    if (!confirm(`¿Rechazar la solicitud de ${sol.nombre_completo}?`)) return;
    setProcesando(true);
    try {
      await db(`/solicitudes_registro?id=eq.${sol.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ estado: "rechazado" })
      });
      showToast("Solicitud rechazada");
      cargarDatos();
    } catch (e) { showToast(e.message, "err"); }
    setProcesando(false);
  };

  const formatFecha = (fecha) => {
    if (!fecha) return "—";
    return new Date(fecha).toLocaleDateString("es-MX", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  };

  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {toast && <div className={`ifutbol-toast ${toast.tipo === "err" ? "toast-err" : "toast-ok"}`}>{toast.msg}</div>}

      {/* HEADER */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Solicitudes de registro 📋</h2>
          <p style={s.sub}>Aprueba o rechaza solicitudes de árbitros y admins de liga</p>
        </div>
        {pendientes > 0 && (
          <div style={s.pendienteBadge}>
            {pendientes} {pendientes === 1 ? "pendiente" : "pendientes"}
          </div>
        )}
      </div>

      {/* FILTROS */}
      <div style={s.filtros}>
        {[["pendiente","⏳ Pendientes"],["aprobado","✅ Aprobadas"],["rechazado","❌ Rechazadas"],["todas","📋 Todas"]].map(([key, label]) => (
          <button key={key} className={`filtro-btn ${filtro === key ? "active" : ""}`} onClick={() => setFiltro(key)}>
            {label}
            {key !== "todas" && <span style={s.count}>{solicitudes.filter(s => s.estado === key).length}</span>}
          </button>
        ))}
      </div>

      {/* LISTA */}
      {loading ? (
        <div style={{ padding:60, textAlign:"center" }}><div className="spinner"/></div>
      ) : filtradas.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-txt">No hay solicitudes {filtro !== "todas" ? filtro + "s" : ""}</div>
          <div className="empty-state-hint">Las solicitudes aparecerán aquí cuando alguien se registre como árbitro o admin de liga</div>
        </div>
      ) : (
        <div style={s.lista}>
          {filtradas.map(sol => {
            const rolInfo = ROLES_LABEL[sol.tipo_rol] || {};
            const estadoInfo = ESTADO_LABEL[sol.estado] || {};
            return (
              <div key={sol.id} style={s.card}>
                <div style={s.cardLeft}>
                  <div style={{ ...s.avatar, background: rolInfo.bg, border: `2px solid ${rolInfo.border}` }}>
                    <span style={{ fontSize:22 }}>{rolInfo.icon}</span>
                  </div>
                  <div style={s.info}>
                    <div style={s.nombre}>{sol.nombre_completo}</div>
                    <div style={s.meta}>
                      <span style={{ ...s.rolPill, background: rolInfo.bg, color: rolInfo.color, border: `1px solid ${rolInfo.border}` }}>
                        {rolInfo.icon} {rolInfo.label}
                      </span>
                      <span style={s.fecha}>{formatFecha(sol.created_at)}</span>
                    </div>
                  </div>
                </div>
                <div style={s.cardRight}>
                  <span style={{ ...s.estadoBadge, background: estadoInfo.bg, color: estadoInfo.color }}>
                    {estadoInfo.label}
                  </span>
                  {sol.estado === "pendiente" && (
                    <div style={s.acciones}>
                      <button className="btn btn-primary" style={{ fontSize:13, padding:"8px 16px" }} onClick={() => abrirModal(sol)}>
                        ✅ Aprobar
                      </button>
                      <button className="btn btn-danger" style={{ fontSize:13, padding:"8px 16px" }} onClick={() => handleRechazar(sol)} disabled={procesando}>
                        ❌ Rechazar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL */}
      {modalSolicitud && (
        <div className="ifutbol-overlay" onClick={() => setModalSolicitud(null)}>
          <div onClick={e => e.stopPropagation()} style={s.modal}>

            {/* HEADER COMPACTO */}
            <div style={s.modalHeader}>
              <div style={s.modalHeaderLeft}>
                <span style={{ fontSize:20 }}>{ROLES_LABEL[modalSolicitud.tipo_rol]?.icon}</span>
                <div>
                  <div style={{ fontWeight:800, fontSize:16, color:"var(--text)" }}>{modalSolicitud.nombre_completo}</div>
                  <span style={{ ...s.rolPill, background:ROLES_LABEL[modalSolicitud.tipo_rol]?.bg, color:ROLES_LABEL[modalSolicitud.tipo_rol]?.color, border:`1px solid ${ROLES_LABEL[modalSolicitud.tipo_rol]?.border}`, fontSize:11 }}>
                    {ROLES_LABEL[modalSolicitud.tipo_rol]?.label}
                  </span>
                </div>
              </div>
              <button style={s.closeBtn} onClick={() => setModalSolicitud(null)}>✕</button>
            </div>

            {/* CUERPO SCROLLEABLE */}
            <div style={s.modalBody}>

              {/* ADMIN DE LIGA → selector liga */}
              {modalSolicitud.tipo_rol === "league_admin" && (
                <div style={{ marginBottom:16 }}>
                  <label className="form-label">Asignar a liga *</label>
                  <select className="form-input" value={ligaSeleccionada} onChange={e => setLigaSeleccionada(e.target.value)}>
                    <option value="">Selecciona una liga...</option>
                    {ligas.map(l => <option key={l.id} value={l.id}>🏆 {l.nombre} · {l.dia} {l.turno}</option>)}
                  </select>
                </div>
              )}

              {/* ÁRBITRO → checkboxes canchas */}
              {modalSolicitud.tipo_rol === "referee" && (
                <div>
                  <label className="form-label">Asignar a unidades deportivas *</label>
                  <p style={{ fontSize:12, color:"var(--text-muted)", marginBottom:10 }}>
                    El árbitro podrá registrar fichas en estas unidades
                  </p>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {canchas.map(c => {
                      const sel = canchasSeleccionadas.includes(c.id);
                      return (
                        <div key={c.id} onClick={() => toggleCancha(c.id)} style={{
                          display:"flex", alignItems:"center", gap:10,
                          padding:"10px 14px", borderRadius:10, cursor:"pointer",
                          border:`2px solid ${sel ? "var(--green)" : "var(--border)"}`,
                          background: sel ? "var(--green-light)" : "white",
                          transition:"all 0.15s"
                        }}>
                          <div style={{
                            width:18, height:18, borderRadius:5, flexShrink:0,
                            border:`2px solid ${sel ? "var(--green)" : "var(--border)"}`,
                            background: sel ? "var(--green)" : "white",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            transition:"all 0.15s"
                          }}>
                            {sel && <span style={{ color:"white", fontSize:11, fontWeight:900, lineHeight:1 }}>✓</span>}
                          </div>
                          <div>
                            <div style={{ fontWeight:700, fontSize:13 }}>🏟️ {c.nombre}</div>
                            {c.direccion && <div style={{ fontSize:11, color:"var(--text-muted)" }}>{c.direccion}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {canchasSeleccionadas.length > 0 && (
                    <div style={{ marginTop:8, fontSize:12, color:"var(--green)", fontWeight:600 }}>
                      ✓ {canchasSeleccionadas.length} {canchasSeleccionadas.length === 1 ? "unidad seleccionada" : "unidades seleccionadas"}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* BOTONES FIJOS ABAJO */}
            <div style={s.modalFooter}>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => setModalSolicitud(null)}>
                Cancelar
              </button>
              <button className="btn btn-premium" style={{ flex:2 }} onClick={handleAprobar} disabled={procesando}>
                {procesando ? "Aprobando..." : "✅ Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: {},
  header: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, flexWrap:"wrap", gap:12 },
  title: { fontSize:24, fontWeight:800, color:"var(--text)", letterSpacing:-0.8, marginBottom:4 },
  sub: { color:"var(--text-muted)", fontSize:14 },
  pendienteBadge: { background:"#fef9c3", color:"#854d0e", border:"1px solid #fde68a", borderRadius:"var(--radius-full)", padding:"6px 14px", fontSize:13, fontWeight:700, flexShrink:0 },
  filtros: { display:"flex", gap:8, marginBottom:24, flexWrap:"wrap" },
  count: { background:"rgba(0,0,0,0.1)", borderRadius:20, padding:"1px 7px", fontSize:11, fontWeight:800, marginLeft:5 },
  lista: { display:"flex", flexDirection:"column", gap:12 },
  card: { background:"white", borderRadius:"var(--radius-md)", padding:"16px 20px", boxShadow:"var(--shadow-md)", border:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" },
  cardLeft: { display:"flex", alignItems:"center", gap:14, flex:1, minWidth:0 },
  avatar: { width:48, height:48, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  info: { flex:1, minWidth:0 },
  nombre: { fontSize:15, fontWeight:700, color:"var(--text)", marginBottom:5 },
  meta: { display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" },
  rolPill: { padding:"3px 10px", borderRadius:"var(--radius-full)", fontSize:12, fontWeight:600, display:"inline-flex", alignItems:"center", gap:4 },
  fecha: { fontSize:11, color:"var(--text-muted)" },
  cardRight: { display:"flex", alignItems:"center", gap:10, flexShrink:0, flexWrap:"wrap" },
  estadoBadge: { padding:"4px 12px", borderRadius:"var(--radius-full)", fontSize:12, fontWeight:700 },
  acciones: { display:"flex", gap:8 },
  // MODAL
  modal: {
    background:"white", borderRadius:"var(--radius-xl)",
    width:"calc(100% - 32px)", maxWidth:440,
    maxHeight:"92vh", display:"flex", flexDirection:"column",
    boxShadow:"var(--shadow-lg)", overflow:"hidden",
    margin:"0 16px"
  },
  modalHeader: {
    display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"16px 20px", borderBottom:"1px solid var(--border)",
    flexShrink:0, gap:12
  },
  modalHeaderLeft: { display:"flex", alignItems:"center", gap:12 },
  modalBody: { flex:1, overflowY:"auto", padding:"16px 20px" },
  modalFooter: {
    display:"flex", gap:10, padding:"14px 20px",
    borderTop:"1px solid var(--border)", flexShrink:0,
    background:"white"
  },
  closeBtn: { background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, width:28, height:28, cursor:"pointer", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-sub)", flexShrink:0 },
};

const css = `
  .filtro-btn { display:inline-flex; align-items:center; padding:7px 14px; border-radius:var(--radius-full); border:1.5px solid var(--border); background:white; color:var(--text-sub); font-size:13px; font-weight:600; cursor:pointer; transition:all 0.15s; font-family:'DM Sans',sans-serif; }
  .filtro-btn:hover { border-color:var(--green); color:var(--green); }
  .filtro-btn.active { background:var(--green); border-color:var(--green); color:white; }
`;