import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import JerseySVG from "../components/JerseySVG";

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
      // Prefer solo en mutaciones, no en GETs (evita 406 en PostgREST)
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

export default function Referee({ session, setTopbarBack }) {
  const [partidos, setPartidos] = useState([]);
  const [partidoActivo, setPartidoActivo] = useState(null);

  // Sincroniza el botón "← back" con el topbar
  useEffect(() => {
    if (!setTopbarBack) return;
    if (partidoActivo) {
      setTopbarBack({ label: "Mis partidos", onClick: () => setPartidoActivo(null) });
    } else {
      setTopbarBack(null);
    }
    return () => setTopbarBack(null);
  }, [partidoActivo, setTopbarBack]);
  const [ficha, setFicha] = useState(null);
  const [jugadoresLocal, setJugadoresLocal] = useState([]);
  const [jugadoresVisitante, setJugadoresVisitante] = useState([]);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState(null);
  const [modalCerrar, setModalCerrar] = useState(false);

  // Formulario ficha
  const [golesLocal, setGolesLocal] = useState(0);
  const [golesVisitante, setGolesVisitante] = useState(0);
  const [goleadores, setGoleadores] = useState([]);
  const [asistencia, setAsistencia] = useState([]);
  const [faltasLocal, setFaltasLocal] = useState(0);
  const [faltasVisitante, setFaltasVisitante] = useState(0);
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
      // 1. Qué unidades tiene acceso este árbitro
      const accesos = await db(`/arbitro_cancha?user_id=eq.${userId}&select=cancha_id,acceso_total`, token);
      if (!accesos || accesos.length === 0) { setPartidos([]); setLoading(false); return; }

      // 2. Construir lista de liga_ids permitidas
      let ligaIds = [];

      const canchasTotal = accesos.filter(a => a.acceso_total).map(a => a.cancha_id);
      if (canchasTotal.length > 0) {
        const ligasDeUnidad = await db(`/ligas?cancha_id=in.(${canchasTotal.join(",")})&select=id`, token);
        ligaIds.push(...(ligasDeUnidad || []).map(l => l.id));
      }

      // Ligas específicas cuando acceso_total=false (puede estar vacío, no lanzar error)
      try {
        const ligasEsp = await db(`/arbitro_liga?user_id=eq.${userId}&select=liga_id`, token);
        ligaIds.push(...(ligasEsp || []).map(l => l.liga_id));
      } catch (_) { /* si no hay filas en arbitro_liga, continúa */ }
      ligaIds = [...new Set(ligaIds)];

      if (ligaIds.length === 0) { setPartidos([]); setLoading(false); return; }

      // 3. Jornadas de esas ligas
      const jornadas = await db(
        `/jornadas?liga_id=in.(${ligaIds.join(",")})&select=id,numero,fecha,liga_id,ligas(id,nombre)`,
        token
      );
      const jornadaIds = (jornadas || []).map(j => j.id);
      const jornadasMap = Object.fromEntries((jornadas || []).map(j => [j.id, j]));

      if (jornadaIds.length === 0) { setPartidos([]); setLoading(false); return; }

      // 4. Partidos de esas jornadas
      const data = await db(
        `/partidos?jornada_id=in.(${jornadaIds.join(",")})&select=*,equipos_local:equipos!partidos_equipo_local_id_fkey(id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url),equipos_visitante:equipos!partidos_equipo_visitante_id_fkey(id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url),ficha_partido(cerrada)&order=jornada_id`,
        token
      );

      const parts = (data || []).map(p => ({ ...p, jornadas: jornadasMap[p.jornada_id] || null }));
      setPartidos(parts);
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
        setAsistencia(f.asistencia || []);
        setFaltasLocal(f.faltas_local || 0);
        setFaltasVisitante(f.faltas_visitante || 0);
        setObservaciones(f.observaciones || "");
        setCerrada(f.cerrada || false);
      } else {
        setFicha(null);
        setGolesLocal(0); setGolesVisitante(0);
        setGoleadores([]); setAsistencia([]);
        setFaltasLocal(0); setFaltasVisitante(0);
        setObservaciones(""); setCerrada(false);
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

  // ── ASISTENCIA ───────────────────────────────────────────────
  const toggleAsistencia = (jeId) => {
    setAsistencia(prev => prev.includes(jeId) ? prev.filter(id => id !== jeId) : [...prev, jeId]);
  };
  const estaPresente = (jeId) => asistencia.includes(jeId);

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
    if (equipo === partidoActivo?.equipos_local?.id) setGolesLocal(prev => prev + 1);
    else setGolesVisitante(prev => prev + 1);
  };

  const quitarGoleador = (jugador_id, equipo) => {
    setGoleadores(goleadores.map(g => {
      if (g.jugador_id === jugador_id && g.equipo === equipo) {
        return { ...g, goles: g.goles - 1 };
      }
      return g;
    }).filter(g => g.goles > 0));
    if (equipo === partidoActivo?.equipos_local?.id) setGolesLocal(prev => Math.max(0, prev - 1));
    else setGolesVisitante(prev => Math.max(0, prev - 1));
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
        asistencia,
        faltas_local: faltasLocal,
        faltas_visitante: faltasVisitante,
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
                const tieneficha = p.ficha_partido != null;
                return (
                  <div key={p.id} style={s.partidoCard} className="ref-card" onClick={() => cargarFicha(p)}>
                    <div style={s.partidoTop}>
                      <div style={s.ligaBadge}>🏆 {p.jornadas?.ligas?.nombre} · Jornada {p.jornadas?.numero}</div>
                      <div style={s.fechaBadge}>{p.jornadas?.fecha || "Fecha por definir"}</div>
                    </div>
                    <div style={s.vsRow}>
                      <div style={s.equipoVs}>
                        <JerseySVG diseno={p.equipos_local?.diseno_camiseta||"solido"} color1={p.equipos_local?.color_playera||"#666"} color2={p.equipos_local?.color_camiseta_2||"#fff"} escudoUrl={p.equipos_local?.escudo_url||null} size={32}/>
                        <span style={s.equipoVsNombre}>{p.equipos_local?.nombre}</span>
                      </div>
                      <div style={s.vsLabel}>VS</div>
                      <div style={{ ...s.equipoVs, justifyContent: "flex-end" }}>
                        <span style={s.equipoVsNombre}>{p.equipos_visitante?.nombre}</span>
                        <JerseySVG diseno={p.equipos_visitante?.diseno_camiseta||"solido"} color1={p.equipos_visitante?.color_playera||"#666"} color2={p.equipos_visitante?.color_camiseta_2||"#fff"} escudoUrl={p.equipos_visitante?.escudo_url||null} size={32}/>
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
          {cerrada && (
            <div style={s.cerradaBanner}>🔒 Esta ficha está cerrada y ya no puede ser editada</div>
          )}

          {/* CABECERA DEL PARTIDO */}
          <div style={s.fichaHeader}>
            <div style={s.fichaLiga}>
              <span style={{ background:"rgba(0,0,0,0.22)", color:"#fff", padding:"5px 14px", borderRadius:99, fontSize:13, fontWeight:700, letterSpacing:0.3 }}>
                🏆 {partidoActivo.jornadas?.ligas?.nombre} · Jornada {partidoActivo.jornadas?.numero}
              </span>
            </div>
            <div style={s.fichaVsGrande}>
              <div style={s.fichaEquipo}>
                <JerseySVG diseno={partidoActivo.equipos_local?.diseno_camiseta||"solido"} color1={partidoActivo.equipos_local?.color_playera||"#666"} color2={partidoActivo.equipos_local?.color_camiseta_2||"#fff"} escudoUrl={partidoActivo.equipos_local?.escudo_url||null} size={60}/>
                <span style={s.fichaEquipoNombre}>{partidoActivo.equipos_local?.nombre}</span>
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
                <JerseySVG diseno={partidoActivo.equipos_visitante?.diseno_camiseta||"solido"} color1={partidoActivo.equipos_visitante?.color_playera||"#666"} color2={partidoActivo.equipos_visitante?.color_camiseta_2||"#fff"} escudoUrl={partidoActivo.equipos_visitante?.escudo_url||null} size={60}/>
                <span style={s.fichaEquipoNombre}>{partidoActivo.equipos_visitante?.nombre}</span>
              </div>
            </div>
          </div>

          {/* JUGADORES: ASISTENCIA + GOLES UNIFICADOS */}
          <div style={s.seccion}>
            <h3 style={s.seccionTitle}>📋 Jugadores</h3>
            <div style={s.dosCol}>
              {[
                { equipo: partidoActivo.equipos_local, jugadores: jugadoresLocal },
                { equipo: partidoActivo.equipos_visitante, jugadores: jugadoresVisitante },
              ].map(({ equipo, jugadores }) => (
                <div key={equipo.id}>
                  <div style={{ ...s.colHeader, borderColor: equipo.color_playera || GREEN }}>
                    <span>{equipo.nombre}</span>
                    <span style={s.contadorBadge}>
                      {jugadores.filter(j => estaPresente(j.id)).length}/{jugadores.length} presentes
                    </span>
                  </div>
                  {jugadores.length === 0
                    ? <p style={s.sinJugadores}>Sin jugadores registrados</p>
                    : jugadores.map(j => {
                      const presente = estaPresente(j.id);
                      const goles = golesDeJugador(j.jugador_id, equipo.id);
                      return (
                        <div key={j.id} style={{
                          ...s.jugadorRow,
                          background: goles > 0 ? "rgba(22,163,74,0.15)" : presente ? "rgba(22,163,74,0.05)" : "transparent",
                        }}>
                          <span style={{ ...s.dorsalMin, background: equipo.color_playera || GREEN }}>{j.dorsal || "—"}</span>
                          <div style={s.jugadorInfo}>
                            <span style={s.jugadorCamiseta}>{j.nombre_camiseta || j.jugadores?.nombre_completo?.split(" ")[0]?.toUpperCase()}</span>
                            <span style={s.jugadorNombre}>{j.jugadores?.nombre_completo}</span>
                            {j.jugadores?.numero_afiliado && <span style={s.jugadorAfiliado}>#{j.jugadores.numero_afiliado}</span>}
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                            {/* Asistencia */}
                            <span
                              style={{ ...s.checkBox, background: presente ? "#16a34a" : "transparent", borderColor: presente ? "#16a34a" : "#6b7280", cursor: cerrada ? "default" : "pointer" }}
                              onClick={() => !cerrada && toggleAsistencia(j.id)}
                            >{presente ? "✓" : ""}</span>
                            {/* Goles */}
                            {!cerrada ? (
                              <div style={s.golBtns}>
                                {goles > 0 && <button style={s.golBtnMinus} onClick={() => quitarGoleador(j.jugador_id, equipo.id)}>−</button>}
                                <button style={s.golBtnPlus} onClick={() => agregarGoleador(j, equipo.id, equipo.nombre)}>⚽</button>
                                {goles > 0 && <span style={s.golCount}>{goles}</span>}
                              </div>
                            ) : (
                              goles > 0 && <span style={s.golCountCerrada}>{goles}⚽</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>

          {/* FALTAS */}
          <div style={s.seccion}>
            <h3 style={s.seccionTitle}>🟨 Faltas cometidas</h3>
            <div style={s.dosCol}>
              {[
                { nombre: partidoActivo.equipos_local?.nombre, color: partidoActivo.equipos_local?.color_playera, val: faltasLocal, set: setFaltasLocal },
                { nombre: partidoActivo.equipos_visitante?.nombre, color: partidoActivo.equipos_visitante?.color_playera, set: setFaltasVisitante, val: faltasVisitante },
              ].map(({ nombre, color, val, set }) => (
                <div key={nombre} style={{ ...s.faltasCard, borderTop: `3px solid ${color || GREEN}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>{nombre}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <button
                      style={s.faltaBtn}
                      onClick={() => !cerrada && set(prev => Math.max(0, prev - 1))}
                      disabled={cerrada}>−</button>
                    <span style={s.faltaNum}>{val}</span>
                    <button
                      style={s.faltaBtn}
                      onClick={() => !cerrada && set(prev => prev + 1)}
                      disabled={cerrada}>+</button>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>faltas</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* OBSERVACIONES */}
          <div style={s.seccion}>
            <h3 style={s.seccionTitle}>📝 Observaciones del partido</h3>
            <textarea
              style={{ ...s.textarea, opacity: cerrada ? 0.6 : 1 }}
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
              <button style={s.btnCerrar} onClick={() => setModalCerrar(true)} disabled={guardando}>
                🔒 Cerrar ficha final
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODAL CONFIRMAR CIERRE — portal sobre document.body para no verse afectado por scroll del contenedor */}
      {modalCerrar && createPortal(
        <div style={s.overlay} onClick={() => setModalCerrar(false)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign:"center", marginBottom:22 }}>
              <div style={{ fontSize:44, marginBottom:12 }}>🔒</div>
              <h3 style={{ fontSize:18, fontWeight:800, color:"#111827", marginBottom:10 }}>¿Cerrar la ficha?</h3>
              <p style={{ color:"#6b7280", fontSize:14, margin:0, lineHeight:1.6 }}>
                Ya no podrás editarla después.
              </p>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button
                style={{ flex:1, background:"transparent", border:`1px solid ${BORDER}`, borderRadius:10, padding:"11px", color:"#6b7280", fontSize:13, cursor:"pointer", fontWeight:600 }}
                onClick={() => setModalCerrar(false)}>
                Cancelar
              </button>
              <button
                style={{ flex:2, background:GREEN, border:"none", borderRadius:10, padding:"11px", color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer", boxShadow:"0 2px 8px rgba(79,143,47,0.3)" }}
                onClick={() => { setModalCerrar(false); guardarFicha(true); }}
                disabled={guardando}>
                {guardando ? "Cerrando..." : "Sí, cerrar ficha"}
              </button>
            </div>
          </div>
        </div>,
        document.body
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
  header: { marginBottom: 24, padding: "20px 24px", background: `linear-gradient(135deg, ${GREEN} 0%, #7fbf4d 100%)`, borderRadius: 16, boxShadow: "0 4px 16px rgba(79,143,47,0.3)" },
  title: { fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: -0.8, marginBottom: 4 },
  sub: { color: "rgba(255,255,255,0.78)", fontSize: 14, margin: 0 },
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
  backBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: GREEN, border: "none", color: "#fff", fontSize: 13, cursor: "pointer", marginBottom: 20, padding: "9px 18px", borderRadius: 10, fontWeight: 700, boxShadow: "0 2px 8px rgba(79,143,47,0.3)" },
  cerradaBanner: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 18px", color: "#ca8a04", fontSize: 13, marginBottom: 20 },
  fichaHeader: { background: "linear-gradient(135deg, #4f8f2f 0%, #7fbf4d 100%)", borderRadius: 18, padding: "26px 28px", marginBottom: 24, boxShadow: "0 4px 16px rgba(79,143,47,0.35)" },
  fichaLiga: { fontSize: 13, fontWeight: 700, marginBottom: 20, textAlign: "center", display: "flex", justifyContent: "center" },
  fichaVsGrande: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 },
  fichaEquipo: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flex: 1 },
  fichaEscudo: { width: 60, height: 60, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#fff", overflow: "hidden" },
  escudoImg: { width: "100%", height: "100%", objectFit: "cover" },
  fichaEquipoNombre: { fontSize: 14, fontWeight: 800, color: "#fff", textAlign: "center", textShadow: "0 1px 4px rgba(0,0,0,0.4)" },
  marcadorBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  marcadorRow: { display: "flex", alignItems: "center", gap: 8 },
  marcadorBtn: { width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  marcadorNum: { width: 60, height: 60, background: "rgba(255,255,255,0.95)", border: "none", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, color: "#111827", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" },
  marcadorGuion: { fontSize: 26, color: "rgba(255,255,255,0.4)", padding: "0 4px" },
  marcadorLabel: { fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: 0.5 },
  seccion: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 24px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  seccionTitle: { fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 16 },
  dosCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  goleadoresCol: { display: "flex", flexDirection: "column", gap: 4 },
  colHeader: { fontSize: 13, fontWeight: 700, color: "#111827", paddingBottom: 8, marginBottom: 6, borderBottom: "2px solid", display: "flex", justifyContent: "space-between", alignItems: "center" },
  contadorBadge: { fontSize: 11, background: "#f3f4f6", borderRadius: 6, padding: "2px 7px", color: "#6b7280", fontWeight: 700 },
  jugadorRow: { display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, transition: "background 0.15s" },
  jugadorInfo: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 },
  jugadorCamiseta: { fontSize: 12, fontWeight: 800, color: "#111827", letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1.2 },
  jugadorNombre: { fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  jugadorAfiliado: { fontSize: 10, color: "#9ca3af" },
  checkBox: { width: 22, height: 22, borderRadius: 6, border: "2px solid", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", flexShrink: 0, transition: "all 0.15s" },
  dorsalMin: { width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 },
  golBtns: { display: "flex", alignItems: "center", gap: 6 },
  golBtnPlus: { background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 6, color: GREEN, fontSize: 14, cursor: "pointer", padding: "3px 8px", fontWeight: 700 },
  golBtnMinus: { background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, color: "#dc2626", fontSize: 14, cursor: "pointer", padding: "3px 8px", fontWeight: 700 },
  golCount: { fontSize: 14, fontWeight: 800, color: GREEN, minWidth: 16, textAlign: "center" },
  golCountCerrada: { fontSize: 13, fontWeight: 700, color: GREEN },
  sinJugadores: { fontSize: 12, color: "#9ca3af", fontStyle: "italic" },
  faltasCard: { background: BASE, borderRadius: 10, padding: "16px 18px" },
  faltaBtn: { width: 34, height: 34, borderRadius: 8, background: SURFACE, border: `1px solid ${BORDER}`, color: "#374151", fontSize: 20, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" },
  faltaNum: { fontSize: 32, fontWeight: 900, color: "#111827", minWidth: 36, textAlign: "center" },
  textarea: { width: "100%", background: BASE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", color: "#111827", fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" },
  acciones: { display: "flex", gap: 12 },
  btnGuardar: { flex: 1, background: "#f3f4f6", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px", color: "#374151", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  btnCerrar: { flex: 1, background: GREEN, border: "none", borderRadius: 12, padding: "14px", color: "#ffffff", fontSize: 14, fontWeight: 800, cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modalBox: { background: "#fff", borderRadius: 18, padding: "32px 28px", width: "100%", maxWidth: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", border: `1px solid ${BORDER}` },
  toast: { position: "fixed", bottom: 28, right: 28, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999 },
};

const css = `
  .ref-card { transition: transform 0.18s, box-shadow 0.18s; }
  .ref-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
  input:focus, textarea:focus { border-color: #4f8f2f !important; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;