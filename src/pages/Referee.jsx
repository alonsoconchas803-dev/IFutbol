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
    const err = await res.json();
    throw new Error(err.message || "Error en la base de datos");
  }
  return res.status === 204 ? null : res.json();
};

export default function Referee({ session }) {
  const [partidos, setPartidos] = useState([]);
  const [partidoActivo, setPartidoActivo] = useState(null);
  const [ficha, setFicha] = useState(null);
  const [jugadoresLocal, setJugadoresLocal] = useState([]);
  const [jugadoresVisitante, setJugadoresVisitante] = useState([]);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState(null);

  // Formulario ficha
  const [golesLocal, setGolesLocal] = useState(0);
  const [golesVisitante, setGolesVisitante] = useState(0);
  const [goleadores, setGoleadores] = useState([]);
  const [observaciones, setObservaciones] = useState("");
  const [cerrada, setCerrada] = useState(false);

  const token = session?.access_token;
  const userId = session?.user?.id;

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  // ── CARGAR PARTIDOS DEL ÁRBITRO ───────────────────────────────
  const cargarPartidos = async () => {
    setLoading(true);
    try {
      const data = await db(
        `/partidos?arbitro_id=eq.${userId}&select=*,jornadas(numero,fecha,ligas(nombre)),equipos_local:equipos!partidos_equipo_local_id_fkey(id,nombre,color_playera,escudo_url),equipos_visitante:equipos!partidos_equipo_visitante_id_fkey(id,nombre,color_playera,escudo_url)&order=created_at.desc`,
        token
      );
      setPartidos(data || []);
    } catch (e) {
      showToast(e.message, "err");
    }
    setLoading(false);
  };

  // ── CARGAR FICHA DEL PARTIDO ──────────────────────────────────
  const cargarFicha = async (partido) => {
    setPartidoActivo(partido);
    try {
      const data = await db(`/ficha_partido?partido_id=eq.${partido.id}`, token);
      if (data && data.length > 0) {
        const f = data[0];
        setFicha(f);
        setGolesLocal(f.goles_local || 0);
        setGolesVisitante(f.goles_visitante || 0);
        setGoleadores(f.goleadores || []);
        setObservaciones(f.observaciones || "");
        setCerrada(f.cerrada || false);
      } else {
        setFicha(null);
        setGolesLocal(0); setGolesVisitante(0);
        setGoleadores([]); setObservaciones(""); setCerrada(false);
      }
      await cargarJugadores(partido);
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── CARGAR JUGADORES DE AMBOS EQUIPOS ────────────────────────
  const cargarJugadores = async (partido) => {
    try {
      const [local, visitante] = await Promise.all([
        db(`/jugador_equipo?equipo_id=eq.${partido.equipos_local.id}&liga_id=eq.${partido.jornadas.ligas?.id || ""}&select=*,jugadores(nombre_completo,numero_afiliado)&order=dorsal`, token),
        db(`/jugador_equipo?equipo_id=eq.${partido.equipos_visitante.id}&liga_id=eq.${partido.jornadas.ligas?.id || ""}&select=*,jugadores(nombre_completo,numero_afiliado)&order=dorsal`, token),
      ]);
      setJugadoresLocal(local || []);
      setJugadoresVisitante(visitante || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { if (userId) cargarPartidos(); }, [userId]);

  // ── AGREGAR GOLEADOR ─────────────────────────────────────────
  const agregarGoleador = (jugador, equipo, equipoNombre) => {
    const yaExiste = goleadores.findIndex(g => g.jugador_id === jugador.jugador_id && g.equipo === equipo);
    if (yaExiste >= 0) {
      const updated = [...goleadores];
      updated[yaExiste].goles += 1;
      setGoleadores(updated);
    } else {
      setGoleadores([...goleadores, {
        jugador_id: jugador.jugador_id,
        nombre: jugador.jugadores?.nombre_completo,
        equipo,
        equipo_nombre: equipoNombre,
        dorsal: jugador.dorsal,
        goles: 1,
      }]);
    }
  };

  const quitarGoleador = (jugador_id, equipo) => {
    setGoleadores(goleadores.map(g => {
      if (g.jugador_id === jugador_id && g.equipo === equipo) {
        return { ...g, goles: g.goles - 1 };
      }
      return g;
    }).filter(g => g.goles > 0));
  };

  const golesDeJugador = (jugador_id, equipo) => {
    const g = goleadores.find(g => g.jugador_id === jugador_id && g.equipo === equipo);
    return g ? g.goles : 0;
  };

  // ── GUARDAR FICHA ────────────────────────────────────────────
  const guardarFicha = async (cerrarFicha = false) => {
    if (!partidoActivo) return;
    setGuardando(true);
    try {
      const payload = {
        partido_id: partidoActivo.id,
        goles_local: golesLocal,
        goles_visitante: golesVisitante,
        goleadores,
        observaciones,
        cerrada: cerrarFicha,
      };
      if (ficha) {
        await db(`/ficha_partido?id=eq.${ficha.id}`, token, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await db("/ficha_partido", token, { method: "POST", body: JSON.stringify(payload) });
      }
      if (cerrarFicha) {
        setCerrada(true);
        showToast("Ficha cerrada y guardada ✓");
      } else {
        showToast("Ficha guardada ✓");
      }
      await cargarFicha(partidoActivo);
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {toast && <div style={{ ...s.toast, background: toast.tipo === "err" ? "#ef4444" : "#4ade80", color: toast.tipo === "err" ? "#fff" : "#0d0d1a" }}>{toast.msg}</div>}

      <div style={s.header}>
        <h2 style={s.title}>Panel Árbitro 🟡</h2>
        <p style={s.sub}>Gestiona las fichas de tus partidos asignados</p>
      </div>

      {!partidoActivo ? (
        // ── LISTA DE PARTIDOS ──
        <div>
          <div style={s.secHeader}>
            <span style={s.secCount}>{partidos.length} partidos asignados</span>
          </div>

          {loading ? (
            <div style={s.empty}><div style={s.spinner}/></div>
          ) : partidos.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>🟡</div>
              <div style={s.emptyTxt}>No tienes partidos asignados aún</div>
              <p style={s.emptyHint}>El Admin de Liga te asignará partidos próximamente</p>
            </div>
          ) : (
            <div style={s.partidoList}>
              {partidos.map(p => {
                const tieneficha = p.ficha_partido?.length > 0;
                return (
                  <div key={p.id} style={s.partidoCard} className="ref-card" onClick={() => cargarFicha(p)}>
                    <div style={s.partidoTop}>
                      <div style={s.ligaBadge}>🏆 {p.jornadas?.ligas?.nombre} · Jornada {p.jornadas?.numero}</div>
                      <div style={s.fechaBadge}>{p.jornadas?.fecha || "Fecha por definir"}</div>
                    </div>
                    <div style={s.vsRow}>
                      <div style={s.equipoVs}>
                        <div style={{ ...s.equipoDot, background: p.equipos_local?.color_playera || "#666" }}/>
                        <span style={s.equipoVsNombre}>{p.equipos_local?.nombre}</span>
                      </div>
                      <div style={s.vsLabel}>VS</div>
                      <div style={{ ...s.equipoVs, justifyContent: "flex-end" }}>
                        <span style={s.equipoVsNombre}>{p.equipos_visitante?.nombre}</span>
                        <div style={{ ...s.equipoDot, background: p.equipos_visitante?.color_playera || "#666" }}/>
                      </div>
                    </div>
                    <div style={s.partidoBottom}>
                      <span style={{ ...s.statusBadge, background: tieneficha ? "#0d2a0d" : "#1a1a00", color: tieneficha ? "#4ade80" : "#facc15", border: `1px solid ${tieneficha ? "#1a4a1a" : "#3a3a00"}` }}>
                        {tieneficha ? "✓ Ficha completada" : "⏳ Pendiente"}
                      </span>
                      <span style={s.horaLabel}>⏰ {p.hora || "Hora por definir"} · Cancha {p.cancha_numero || "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // ── FICHA DEL PARTIDO ──
        <div>
          <button style={s.backBtn} onClick={() => setPartidoActivo(null)}>← Volver a mis partidos</button>

          {cerrada && (
            <div style={s.cerradaBanner}>🔒 Esta ficha está cerrada y ya no puede ser editada</div>
          )}

          {/* CABECERA DEL PARTIDO */}
          <div style={s.fichaHeader}>
            <div style={s.fichaLiga}>🏆 {partidoActivo.jornadas?.ligas?.nombre} · Jornada {partidoActivo.jornadas?.numero}</div>
            <div style={s.fichaVsGrande}>
              <div style={s.fichaEquipo}>
                <div style={{ ...s.fichaEscudo, background: partidoActivo.equipos_local?.color_playera }}>
                  {partidoActivo.equipos_local?.escudo_url
                    ? <img src={partidoActivo.equipos_local.escudo_url} style={s.escudoImg} alt="escudo"/>
                    : partidoActivo.equipos_local?.nombre[0]}
                </div>
                <span style={s.fichaEquipoNombre}>{partidoActivo.equipos_local?.nombre}</span>
                <span style={s.fichaEquipoLabel}>Local</span>
              </div>

              {/* MARCADOR */}
              <div style={s.marcadorBox}>
                <div style={s.marcadorRow}>
                  <button style={s.marcadorBtn} onClick={() => !cerrada && setGolesLocal(Math.max(0, golesLocal - 1))} disabled={cerrada}>−</button>
                  <div style={s.marcadorNum}>{golesLocal}</div>
                  <button style={s.marcadorBtn} onClick={() => !cerrada && setGolesLocal(golesLocal + 1)} disabled={cerrada}>+</button>
                  <span style={s.marcadorGuion}>:</span>
                  <button style={s.marcadorBtn} onClick={() => !cerrada && setGolesVisitante(Math.max(0, golesVisitante - 1))} disabled={cerrada}>−</button>
                  <div style={s.marcadorNum}>{golesVisitante}</div>
                  <button style={s.marcadorBtn} onClick={() => !cerrada && setGolesVisitante(golesVisitante + 1)} disabled={cerrada}>+</button>
                </div>
                <div style={s.marcadorLabel}>Marcador final</div>
              </div>

              <div style={s.fichaEquipo}>
                <div style={{ ...s.fichaEscudo, background: partidoActivo.equipos_visitante?.color_playera }}>
                  {partidoActivo.equipos_visitante?.escudo_url
                    ? <img src={partidoActivo.equipos_visitante.escudo_url} style={s.escudoImg} alt="escudo"/>
                    : partidoActivo.equipos_visitante?.nombre[0]}
                </div>
                <span style={s.fichaEquipoNombre}>{partidoActivo.equipos_visitante?.nombre}</span>
                <span style={s.fichaEquipoLabel}>Visitante</span>
              </div>
            </div>
          </div>

          {/* GOLEADORES */}
          <div style={s.seccion}>
            <h3 style={s.seccionTitle}>⚽ Goleadores</h3>
            <div style={s.goleadoresGrid}>
              {/* LOCAL */}
              <div style={s.goleadoresCol}>
                <div style={{ ...s.goleadoresColHeader, borderBottom: `2px solid ${partidoActivo.equipos_local?.color_playera}` }}>
                  {partidoActivo.equipos_local?.nombre}
                </div>
                {jugadoresLocal.length === 0
                  ? <p style={s.sinJugadores}>Sin jugadores registrados</p>
                  : jugadoresLocal.map(j => {
                    const goles = golesDeJugador(j.jugador_id, partidoActivo.equipos_local.id);
                    return (
                      <div key={j.id} style={{ ...s.jugadorGolRow, background: goles > 0 ? "#0d2a0d" : "transparent" }}>
                        <div style={s.jugadorGolInfo}>
                          <span style={{ ...s.dorsalMin, background: partidoActivo.equipos_local?.color_playera }}>{j.dorsal || "—"}</span>
                          <span style={s.jugadorGolNombre}>{j.jugadores?.nombre_completo}</span>
                        </div>
                        {!cerrada && (
                          <div style={s.golBtns}>
                            {goles > 0 && <button style={s.golBtnMinus} onClick={() => quitarGoleador(j.jugador_id, partidoActivo.equipos_local.id)}>−</button>}
                            <button style={s.golBtnPlus} onClick={() => agregarGoleador(j, partidoActivo.equipos_local.id, partidoActivo.equipos_local.nombre)}>⚽</button>
                            {goles > 0 && <span style={s.golCount}>{goles}</span>}
                          </div>
                        )}
                        {cerrada && goles > 0 && <span style={s.golCountCerrada}>{goles} ⚽</span>}
                      </div>
                    );
                  })}
              </div>

              {/* VISITANTE */}
              <div style={s.goleadoresCol}>
                <div style={{ ...s.goleadoresColHeader, borderBottom: `2px solid ${partidoActivo.equipos_visitante?.color_playera}` }}>
                  {partidoActivo.equipos_visitante?.nombre}
                </div>
                {jugadoresVisitante.length === 0
                  ? <p style={s.sinJugadores}>Sin jugadores registrados</p>
                  : jugadoresVisitante.map(j => {
                    const goles = golesDeJugador(j.jugador_id, partidoActivo.equipos_visitante.id);
                    return (
                      <div key={j.id} style={{ ...s.jugadorGolRow, background: goles > 0 ? "#0d2a0d" : "transparent" }}>
                        <div style={s.jugadorGolInfo}>
                          <span style={{ ...s.dorsalMin, background: partidoActivo.equipos_visitante?.color_playera }}>{j.dorsal || "—"}</span>
                          <span style={s.jugadorGolNombre}>{j.jugadores?.nombre_completo}</span>
                        </div>
                        {!cerrada && (
                          <div style={s.golBtns}>
                            {goles > 0 && <button style={s.golBtnMinus} onClick={() => quitarGoleador(j.jugador_id, partidoActivo.equipos_visitante.id)}>−</button>}
                            <button style={s.golBtnPlus} onClick={() => agregarGoleador(j, partidoActivo.equipos_visitante.id, partidoActivo.equipos_visitante.nombre)}>⚽</button>
                            {goles > 0 && <span style={s.golCount}>{goles}</span>}
                          </div>
                        )}
                        {cerrada && goles > 0 && <span style={s.golCountCerrada}>{goles} ⚽</span>}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* OBSERVACIONES */}
          <div style={s.seccion}>
            <h3 style={s.seccionTitle}>📝 Observaciones del partido</h3>
            <textarea
              style={{ ...s.textarea, opacity: cerrada ? 0.5 : 1 }}
              placeholder="Tarjetas amarillas, rojas, incidencias, notas importantes..."
              value={observaciones}
              onChange={e => !cerrada && setObservaciones(e.target.value)}
              rows={4}
              disabled={cerrada}
            />
          </div>

          {/* ACCIONES */}
          {!cerrada && (
            <div style={s.acciones}>
              <button style={s.btnGuardar} onClick={() => guardarFicha(false)} disabled={guardando}>
                {guardando ? "Guardando..." : "💾 Guardar borrador"}
              </button>
              <button style={s.btnCerrar} onClick={() => {
                if (confirm("¿Cerrar la ficha? Ya no podrás editarla después.")) guardarFicha(true);
              }} disabled={guardando}>
                🔒 Cerrar ficha final
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const BASE = "#f9fafb";
const SURFACE = "#ffffff";
const BORDER = "#e5e7eb";
const GREEN = "#4f8f2f";

const s = {
  wrap: {},
  header: { marginBottom: 24 },
  title: { fontSize: 26, fontWeight: 800, color: "#111827", letterSpacing: -0.8, marginBottom: 4 },
  sub: { color: "#6b7280", fontSize: 14 },
  secHeader: { marginBottom: 16 },
  secCount: { color: "#6b7280", fontSize: 13 },
  empty: { textAlign: "center", padding: "60px 20px" },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTxt: { color: "#6b7280", fontSize: 16, marginBottom: 8, fontWeight: 600 },
  emptyHint: { color: "#9ca3af", fontSize: 13 },
  spinner: { width: 32, height: 32, border: `3px solid ${BORDER}`, borderTop: `3px solid ${GREEN}`, borderRadius: "50%", margin: "0 auto", animation: "spin 0.7s linear infinite" },
  partidoList: { display: "flex", flexDirection: "column", gap: 12 },
  partidoCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 22px", cursor: "pointer", boxShadow: "0 2px 8px rgba(79,143,47,0.08)", borderTop: `3px solid ${GREEN}` },
  partidoTop: { display: "flex", justifyContent: "space-between", marginBottom: 14 },
  ligaBadge: { fontSize: 12, color: "#6b7280", fontWeight: 600 },
  fechaBadge: { fontSize: 12, color: "#6b7280" },
  vsRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  equipoVs: { display: "flex", alignItems: "center", gap: 10, flex: 1 },
  equipoDot: { width: 14, height: 14, borderRadius: "50%", flexShrink: 0 },
  equipoVsNombre: { fontSize: 16, fontWeight: 700, color: "#111827" },
  vsLabel: { fontSize: 12, color: "#9ca3af", fontWeight: 700, padding: "0 16px" },
  partidoBottom: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 6 },
  horaLabel: { fontSize: 12, color: "#6b7280" },
  backBtn: { background: "transparent", border: "none", color: GREEN, fontSize: 14, cursor: "pointer", marginBottom: 20, padding: 0, fontWeight: 600 },
  cerradaBanner: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 18px", color: "#ca8a04", fontSize: 13, marginBottom: 20 },
  fichaHeader: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "24px 28px", marginBottom: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  fichaLiga: { fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 20, textAlign: "center" },
  fichaVsGrande: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 },
  fichaEquipo: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1 },
  fichaEscudo: { width: 60, height: 60, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#fff", overflow: "hidden" },
  escudoImg: { width: "100%", height: "100%", objectFit: "cover" },
  fichaEquipoNombre: { fontSize: 16, fontWeight: 700, color: "#111827", textAlign: "center" },
  fichaEquipoLabel: { fontSize: 11, color: "#6b7280" },
  marcadorBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  marcadorRow: { display: "flex", alignItems: "center", gap: 8 },
  marcadorBtn: { width: 32, height: 32, borderRadius: 8, background: "#f3f4f6", border: `1px solid ${BORDER}`, color: "#374151", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  marcadorNum: { width: 56, height: 56, background: BASE, border: `2px solid ${BORDER}`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 900, color: "#111827" },
  marcadorGuion: { fontSize: 24, color: "#9ca3af", padding: "0 4px" },
  marcadorLabel: { fontSize: 11, color: "#6b7280" },
  seccion: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 24px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  seccionTitle: { fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 16 },
  goleadoresGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  goleadoresCol: { display: "flex", flexDirection: "column", gap: 8 },
  goleadoresColHeader: { fontSize: 13, fontWeight: 700, color: "#111827", paddingBottom: 10, marginBottom: 4 },
  jugadorGolRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, transition: "background 0.2s" },
  jugadorGolInfo: { display: "flex", alignItems: "center", gap: 8, flex: 1 },
  dorsalMin: { width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 },
  jugadorGolNombre: { fontSize: 13, color: "#374151", fontWeight: 500 },
  golBtns: { display: "flex", alignItems: "center", gap: 6 },
  golBtnPlus: { background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 6, color: GREEN, fontSize: 14, cursor: "pointer", padding: "3px 8px", fontWeight: 700 },
  golBtnMinus: { background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, color: "#dc2626", fontSize: 14, cursor: "pointer", padding: "3px 8px", fontWeight: 700 },
  golCount: { fontSize: 14, fontWeight: 800, color: GREEN, minWidth: 16, textAlign: "center" },
  golCountCerrada: { fontSize: 13, fontWeight: 700, color: GREEN },
  sinJugadores: { fontSize: 12, color: "#9ca3af", fontStyle: "italic" },
  textarea: { width: "100%", background: BASE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", color: "#111827", fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" },
  acciones: { display: "flex", gap: 12 },
  btnGuardar: { flex: 1, background: "#f3f4f6", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px", color: "#374151", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  btnCerrar: { flex: 1, background: GREEN, border: "none", borderRadius: 12, padding: "14px", color: "#ffffff", fontSize: 14, fontWeight: 800, cursor: "pointer" },
  toast: { position: "fixed", bottom: 28, right: 28, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999 },
};

const css = `
  .ref-card { transition: transform 0.18s, box-shadow 0.18s; }
  .ref-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
  input:focus, textarea:focus { border-color: #4f8f2f !important; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;