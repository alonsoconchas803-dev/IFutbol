import { useState, useEffect } from "react";

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

const db = async (path, token, options = {}) => {
  const method = (options.method || "GET").toUpperCase();
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(method !== "GET" ? { "Prefer": "return=representation" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
};

// Descripciones legibles para cada tipo de acción
const ACCION_LABELS = {
  creo_liga:           { icon: "➕",  verbo: "creó la liga",            tono: "ok" },
  renombro_liga:       { icon: "✏️",  verbo: "renombró la liga",        tono: "info" },
  elimino_liga:        { icon: "🗑️",  verbo: "eliminó la liga",         tono: "err" },
  activo_liga:         { icon: "✅",  verbo: "activó la liga",          tono: "ok" },
  desactivo_liga:      { icon: "⏸️",  verbo: "desactivó la liga",       tono: "warn" },
  creo_equipo:         { icon: "👕",  verbo: "creó el equipo",          tono: "ok" },
  renombro_equipo:     { icon: "✏️",  verbo: "renombró el equipo",      tono: "info" },
  elimino_equipo:      { icon: "🗑️",  verbo: "eliminó el equipo",       tono: "err" },
  inscribio_jugador:   { icon: "➕",  verbo: "inscribió a",             tono: "ok" },
  elimino_jugador:     { icon: "➖",  verbo: "eliminó a",               tono: "err" },
  asigno_capitan:      { icon: "🎖️",  verbo: "asignó capitán a",        tono: "info" },
  quito_capitan:       { icon: "🎖️",  verbo: "quitó capitán a",         tono: "warn" },
  cerro_ficha:         { icon: "🔒",  verbo: "cerró la ficha de",       tono: "info" },
  creo_jornada:        { icon: "📅",  verbo: "creó la",                 tono: "ok" },
  elimino_jornada:     { icon: "🗑️",  verbo: "eliminó la",              tono: "err" },
  confirmo_arbitro:    { icon: "✅",  verbo: "confirmó al árbitro",     tono: "ok" },
  desconfirmo_arbitro: { icon: "⏸️",  verbo: "desconfirmó al árbitro",  tono: "warn" },
  desvinculo_arbitro:  { icon: "🚫",  verbo: "desvinculó al árbitro",   tono: "err" },
};

const ROLE_LABELS = {
  league_admin: { label: "Admin de unidad", color: "#3b82f6" },
  referee:      { label: "Árbitro",         color: "#f59e0b" },
  capitan:      { label: "Capitán",         color: "#a855f7" },
};

const TONOS = {
  ok:   { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  err:  { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
  warn: { bg: "#fffbeb", color: "#a16207", border: "#fde68a" },
  info: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
};

// Filtros por nivel: qué target_type contar como acción del nivel
const NIVEL_FILTROS = {
  unidad: ["liga", "arbitro"],
  liga:   ["equipo", "jornada"],
  equipo: ["jugador_equipo", "ficha_partido"],
};

// Breadcrumb fuera del componente padre para que React no lo remonte en cada render.
function Breadcrumb({ unidadActiva, ligaActiva, equipoActivo, setUnidadActiva, setLigaActiva, setEquipoActivo }) {
  return (
    <div style={s.crumb}>
      <span style={{ ...s.crumbStep, ...(unidadActiva ? s.crumbDone : s.crumbActive) }}
            onClick={() => { setUnidadActiva(null); setLigaActiva(null); setEquipoActivo(null); }}>
        🏟️ Unidades
      </span>
      {unidadActiva && (
        <>
          <span style={s.crumbSep}>›</span>
          <span style={{ ...s.crumbStep, ...(ligaActiva ? s.crumbDone : s.crumbActive) }}
                onClick={() => { setLigaActiva(null); setEquipoActivo(null); }}>
            {unidadActiva.nombre}
          </span>
        </>
      )}
      {ligaActiva && (
        <>
          <span style={s.crumbSep}>›</span>
          <span style={{ ...s.crumbStep, ...(equipoActivo ? s.crumbDone : s.crumbActive) }}
                onClick={() => setEquipoActivo(null)}>
            🏆 {ligaActiva.nombre}
          </span>
        </>
      )}
      {equipoActivo && (
        <>
          <span style={s.crumbSep}>›</span>
          <span style={{ ...s.crumbStep, ...s.crumbActive }}>👕 {equipoActivo.nombre}</span>
        </>
      )}
    </div>
  );
}

export default function Auditoria({ session, setTopbarBack }) {
  const [unidades, setUnidades] = useState([]);
  const [ligas, setLigas]       = useState([]);
  const [equipos, setEquipos]   = useState([]);
  const [acciones, setAcciones] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState(null);

  // Navegación jerárquica
  const [unidadActiva, setUnidadActiva] = useState(null);
  const [ligaActiva, setLigaActiva]     = useState(null);
  const [equipoActivo, setEquipoActivo] = useState(null);

  const token = session?.access_token;

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  // ── CARGAR DATOS BASE + cleanup ──────────────────────────────
  const cargarBase = async () => {
    setLoading(true);
    try {
      // Cleanup automático de registros > 14 días (RPC con validación super_admin interna)
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/cleanup_action_log`, {
          method: "POST",
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
      } catch (_) { /* no crítico */ }

      const [uds, lgs] = await Promise.all([
        db(`/canchas?select=id,nombre,logo_url,color_marca&order=nombre`, token),
        db(`/ligas?select=id,nombre,cancha_id,activa&order=nombre`, token),
      ]);
      setUnidades(uds || []);
      setLigas(lgs || []);
    } catch (e) {
      showToast(e.message, "err");
    }
    setLoading(false);
  };

  useEffect(() => { if (token) cargarBase(); }, [token]);

  // ── CARGAR ACCIONES DEL NIVEL ACTIVO ──────────────────────────
  useEffect(() => {
    if (!token) return;
    const cargar = async () => {
      setLoading(true);
      try {
        let q = "/action_log?select=*&order=created_at.desc";
        let filtros;
        if (equipoActivo) {
          filtros = NIVEL_FILTROS.equipo;
          q += `&equipo_id=eq.${equipoActivo.id}`;
        } else if (ligaActiva) {
          filtros = NIVEL_FILTROS.liga;
          q += `&liga_id=eq.${ligaActiva.id}`;
        } else if (unidadActiva) {
          filtros = NIVEL_FILTROS.unidad;
          q += `&cancha_id=eq.${unidadActiva.id}`;
        } else {
          setAcciones([]);
          setLoading(false);
          return;
        }
        q += `&target_type=in.(${filtros.join(",")})`;
        const data = await db(q, token);
        setAcciones(data || []);
      } catch (e) {
        showToast(e.message, "err");
      }
      setLoading(false);
    };
    cargar();
  }, [token, unidadActiva?.id, ligaActiva?.id, equipoActivo?.id]);

  // Cargar equipos cuando entras a una liga
  useEffect(() => {
    if (!ligaActiva) { setEquipos([]); return; }
    db(`/equipos?liga_id=eq.${ligaActiva.id}&select=id,nombre,color_playera&order=nombre`, token)
      .then(d => setEquipos(d || []))
      .catch(e => showToast(e.message, "err"));
  }, [ligaActiva?.id, token]);

  // ── TOPBAR BACK SEGÚN PROFUNDIDAD ────────────────────────────
  useEffect(() => {
    if (!setTopbarBack) return;
    if (equipoActivo) {
      setTopbarBack({ label: "Volver a equipos", onClick: () => setEquipoActivo(null) });
    } else if (ligaActiva) {
      setTopbarBack({ label: "Volver a ligas", onClick: () => setLigaActiva(null) });
    } else if (unidadActiva) {
      setTopbarBack({ label: "Volver a unidades", onClick: () => setUnidadActiva(null) });
    } else {
      setTopbarBack(null);
    }
    return () => setTopbarBack(null);
  }, [unidadActiva, ligaActiva, equipoActivo, setTopbarBack]);

  // ── FORMATO DE ACCIÓN ────────────────────────────────────────
  const formatearAccion = (a) => {
    const label = ACCION_LABELS[a.action] || { icon: "•", verbo: a.action, tono: "info" };
    // Construir el "qué": para fichas mostramos local vs visitante; para jornadas, "Jornada N"; para resto, target_nombre
    let detalle = a.target_nombre || "";
    if (a.action === "renombro_liga" || a.action === "renombro_equipo") {
      const d = a.detalle || {};
      if (d.anterior && d.nuevo) detalle = `"${d.anterior}" → "${d.nuevo}"`;
    }
    return { ...label, detalle };
  };

  const formatearFecha = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  // ── RENDER ────────────────────────────────────────────────────

  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {toast && <div style={{ ...s.toast, background: toast.tipo === "err" ? "#ef4444" : "#4ade80", color: toast.tipo === "err" ? "#fff" : "#0d0d1a" }}>{toast.msg}</div>}

      <div style={s.hint}>
        Solo se muestran acciones de admins de unidad, árbitros y capitanes. Los registros se borran automáticamente después de 14 días.
      </div>

      <Breadcrumb
        unidadActiva={unidadActiva}
        ligaActiva={ligaActiva}
        equipoActivo={equipoActivo}
        setUnidadActiva={setUnidadActiva}
        setLigaActiva={setLigaActiva}
        setEquipoActivo={setEquipoActivo}
      />

      {/* NIVEL 1: UNIDADES */}
      {!unidadActiva && (
        <div>
          <div style={s.secTitle}>Selecciona una unidad para ver sus acciones</div>
          {unidades.length === 0 ? (
            <div style={s.empty}>No hay unidades registradas</div>
          ) : (
            <div style={s.cards}>
              {unidades.map(u => (
                <div key={u.id} style={{ ...s.card, borderLeft: `4px solid ${u.color_marca || "#4f8f2f"}` }}
                     onClick={() => setUnidadActiva(u)} className="aud-card">
                  {u.logo_url
                    ? <img src={u.logo_url} alt="" style={s.cardLogo}/>
                    : <div style={{ ...s.cardLogo, background: u.color_marca || "#4f8f2f", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800 }}>{u.nombre[0]?.toUpperCase()}</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.cardName}>🏟️ {u.nombre}</div>
                    <div style={s.cardMeta}>{ligas.filter(l => l.cancha_id === u.id).length} torneos</div>
                  </div>
                  <span style={s.chev}>›</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* NIVEL 2: LIGAS DE LA UNIDAD */}
      {unidadActiva && !ligaActiva && (
        <div>
          <ListaAcciones
            titulo={`📋 Acciones a nivel unidad — ${unidadActiva.nombre}`}
            descripcion="Cambios sobre torneos y árbitros de esta unidad"
            acciones={acciones}
            loading={loading}
            formatearAccion={formatearAccion}
            formatearFecha={formatearFecha}
          />

          <div style={s.secTitle}>Selecciona un torneo para profundizar</div>
          {ligas.filter(l => l.cancha_id === unidadActiva.id).length === 0 ? (
            <div style={s.empty}>Sin torneos en esta unidad</div>
          ) : (
            <div style={s.cards}>
              {ligas.filter(l => l.cancha_id === unidadActiva.id).map(l => (
                <div key={l.id} style={{ ...s.card, opacity: l.activa ? 1 : 0.6 }}
                     onClick={() => setLigaActiva(l)} className="aud-card">
                  <div style={{ ...s.cardLogo, background: "#f0fdf4", color: "#4f8f2f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800 }}>🏆</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.cardName}>{l.nombre}</div>
                    <div style={s.cardMeta}>{l.activa ? "Activa" : "Inactiva"}</div>
                  </div>
                  <span style={s.chev}>›</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* NIVEL 3: EQUIPOS DE LA LIGA */}
      {ligaActiva && !equipoActivo && (
        <div>
          <ListaAcciones
            titulo={`📋 Acciones a nivel torneo — ${ligaActiva.nombre}`}
            descripcion="Cambios sobre equipos y jornadas de este torneo"
            acciones={acciones}
            loading={loading}
            formatearAccion={formatearAccion}
            formatearFecha={formatearFecha}
          />

          <div style={s.secTitle}>Selecciona un equipo para profundizar</div>
          {equipos.length === 0 ? (
            <div style={s.empty}>Sin equipos en este torneo</div>
          ) : (
            <div style={s.cards}>
              {equipos.map(eq => (
                <div key={eq.id} style={{ ...s.card, borderLeft: `4px solid ${eq.color_playera || "#666"}` }}
                     onClick={() => setEquipoActivo(eq)} className="aud-card">
                  <div style={{ ...s.cardLogo, background: eq.color_playera || "#666", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800 }}>👕</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.cardName}>{eq.nombre}</div>
                  </div>
                  <span style={s.chev}>›</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* NIVEL 4: ACCIONES DEL EQUIPO */}
      {equipoActivo && (
        <ListaAcciones
          titulo={`📋 Acciones a nivel equipo — ${equipoActivo.nombre}`}
          descripcion="Inscripciones, capitanías y fichas cerradas"
          acciones={acciones}
          loading={loading}
          formatearAccion={formatearAccion}
          formatearFecha={formatearFecha}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// LISTA DE ACCIONES (reutilizable por nivel)
// ─────────────────────────────────────────────────────────────────
function ListaAcciones({ titulo, descripcion, acciones, loading, formatearAccion, formatearFecha }) {
  return (
    <div style={s.accionesBox}>
      <div style={s.accionesHeader}>
        <div style={s.accionesTitulo}>{titulo}</div>
        <div style={s.accionesSub}>{descripcion}</div>
      </div>
      {loading ? (
        <div style={s.empty}><div style={s.spinner}/></div>
      ) : acciones.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div>Sin acciones registradas en los últimos 14 días</div>
        </div>
      ) : (
        <div style={s.accionesList}>
          {acciones.map(a => {
            const { icon, verbo, detalle, tono } = formatearAccion(a);
            const tonoStyle = TONOS[tono] || TONOS.info;
            const rolInfo = ROLE_LABELS[a.actor_role] || { label: a.actor_role, color: "#666" };
            return (
              <div key={a.id} style={s.accionRow}>
                <div style={{ ...s.iconBox, background: tonoStyle.bg, color: tonoStyle.color, border: `1px solid ${tonoStyle.border}` }}>
                  {icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.accionTexto}>
                    <strong>{a.actor_nombre || "Usuario"}</strong> {verbo} <strong>{detalle}</strong>
                  </div>
                  <div style={s.accionMeta}>
                    <span style={{ ...s.rolChip, background: rolInfo.color + "22", color: rolInfo.color, border: `1px solid ${rolInfo.color}55` }}>
                      {rolInfo.label}
                    </span>
                    <span style={s.fecha}>🕒 {formatearFecha(a.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────────
const GREEN = "#4f8f2f";
const BORDER = "#e5e7eb";

const s = {
  wrap: {},
  hint: { background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af", borderRadius: 10, padding: "10px 14px", fontSize: 12, marginBottom: 14, lineHeight: 1.5 },

  crumb: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 16, padding: "8px 12px", background: "#f9fafb", borderRadius: 10 },
  crumbStep: { fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap" },
  crumbDone: { background: "#fff", color: "#4f8f2f", border: "1px solid #c3e6a3" },
  crumbActive: { background: GREEN, color: "#fff", cursor: "default" },
  crumbSep: { color: "#9ca3af", fontSize: 14, fontWeight: 800 },

  secTitle: { fontSize: 13, fontWeight: 700, color: "#374151", margin: "20px 0 10px", letterSpacing: 0.3 },
  cards: { display: "flex", flexDirection: "column", gap: 8 },
  card: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  cardLogo: { width: 38, height: 38, borderRadius: 10, objectFit: "cover", flexShrink: 0 },
  cardName: { fontSize: 14, fontWeight: 800, color: "#111827" },
  cardMeta: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  chev: { fontSize: 20, color: "#9ca3af", fontWeight: 800 },

  empty: { textAlign: "center", padding: "30px 20px", color: "#9ca3af", fontSize: 13 },
  spinner: { width: 28, height: 28, border: `3px solid ${BORDER}`, borderTop: `3px solid ${GREEN}`, borderRadius: "50%", margin: "0 auto", animation: "spin 0.7s linear infinite" },

  accionesBox: { background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px", marginBottom: 8 },
  accionesHeader: { borderBottom: `1px solid ${BORDER}`, paddingBottom: 10, marginBottom: 10 },
  accionesTitulo: { fontSize: 14, fontWeight: 800, color: "#111827" },
  accionesSub: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  accionesList: { display: "flex", flexDirection: "column", gap: 10 },
  accionRow: { display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f3f4f6" },
  iconBox: { width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 },
  accionTexto: { fontSize: 13, color: "#111827", lineHeight: 1.5 },
  accionMeta: { display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" },
  rolChip: { fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99 },
  fecha: { fontSize: 11, color: "#9ca3af" },

  toast: { position: "fixed", bottom: 28, right: 28, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999 },
};

const css = `
  .aud-card { transition: transform 0.15s, box-shadow 0.15s; }
  .aud-card:hover { transform: translateY(-1px); box-shadow: 0 3px 12px rgba(0,0,0,0.08); }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
