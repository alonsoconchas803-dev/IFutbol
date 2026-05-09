import { useState, useEffect } from "react";

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

const db = async (path) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" }
  });
  if (!res.ok) return [];
  return res.json();
};

export default function Viewer() {
  const [ligas, setLigas] = useState([]);
  const [ligaActiva, setLigaActiva] = useState(null);
  const [equipos, setEquipos] = useState([]);
  const [clasificacion, setClasificacion] = useState([]);
  const [partidos, setPartidos] = useState([]);       // todos (calendario)
  const [resultados, setResultados] = useState([]);   // solo fichas cerradas
  const [goleadores, setGoleadores] = useState([]);
  const [seccion, setSeccion] = useState("calendario");
  const [loading, setLoading] = useState(true);

  // ── CARGAR LIGAS ─────────────────────────────────────────────
  const cargarLigas = async () => {
    setLoading(true);
    try {
      const data = await db("/ligas?activa=eq.true&select=*,canchas(nombre,direccion)&order=nombre");
      setLigas(data || []);
      if (data?.length > 0) {
        setLigaActiva(data[0]);
        await cargarDatosLiga(data[0].id);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // ── CARGAR DATOS DE LIGA ──────────────────────────────────────
  const cargarDatosLiga = async (ligaId) => {
    setLoading(true);
    try {
      // 1. Jornadas de esta liga
      const jornadas = await db(`/jornadas?liga_id=eq.${ligaId}&select=id,numero,fecha&order=numero`);
      const jornadaIds = (jornadas || []).map(j => j.id);
      const jornadasMap = Object.fromEntries((jornadas || []).map(j => [j.id, j]));

      // 2. Equipos + partidos en paralelo
      let partsData = [];
      if (jornadaIds.length > 0) {
        partsData = await db(
          `/partidos?jornada_id=in.(${jornadaIds.join(",")})&select=*,equipos_local:equipos!partidos_equipo_local_id_fkey(id,nombre,color_playera,escudo_url),equipos_visitante:equipos!partidos_equipo_visitante_id_fkey(id,nombre,color_playera,escudo_url),ficha_partido(goles_local,goles_visitante,goleadores,cerrada)&order=jornada_id,cancha_numero`
        );
      }
      const eqs = await db(`/equipos?liga_id=eq.${ligaId}&select=*&order=nombre`);
      setEquipos(eqs || []);

      // Adjuntar jornada a cada partido
      const parts = (partsData || []).map(p => ({ ...p, jornadas: jornadasMap[p.jornada_id] || null }));
      setPartidos(parts);

      // Fichas cerradas → resultados y clasificación
      const fichas = parts.filter(p => p.ficha_partido?.length > 0 && p.ficha_partido[0].cerrada);
      setResultados(fichas);

      const tabla = {};
      (eqs || []).forEach(eq => {
        tabla[eq.id] = { equipo: eq, pj: 0, g: 0, e: 0, d: 0, gf: 0, gc: 0, pts: 0 };
      });
      fichas.forEach(p => {
        const f = p.ficha_partido[0];
        const lid = p.equipo_local_id, vid = p.equipo_visitante_id;
        if (!tabla[lid] || !tabla[vid]) return;
        tabla[lid].pj++; tabla[vid].pj++;
        tabla[lid].gf += f.goles_local;  tabla[lid].gc += f.goles_visitante;
        tabla[vid].gf += f.goles_visitante; tabla[vid].gc += f.goles_local;
        if (f.goles_local > f.goles_visitante)       { tabla[lid].g++; tabla[lid].pts += 3; tabla[vid].d++; }
        else if (f.goles_local < f.goles_visitante)  { tabla[vid].g++; tabla[vid].pts += 3; tabla[lid].d++; }
        else                                          { tabla[lid].e++; tabla[lid].pts++; tabla[vid].e++; tabla[vid].pts++; }
      });
      setClasificacion(Object.values(tabla).sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc)));

      // Goleadores
      const golesMap = {};
      fichas.forEach(p => {
        (p.ficha_partido[0].goleadores || []).forEach(g => {
          if (!golesMap[g.jugador_id]) golesMap[g.jugador_id] = { nombre: g.nombre, equipo_nombre: g.equipo_nombre, goles: 0 };
          golesMap[g.jugador_id].goles += g.goles;
        });
      });
      setGoleadores(Object.values(golesMap).sort((a, b) => b.goles - a.goles).slice(0, 10));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { cargarLigas(); }, []);

  const cambiarLiga = async (liga) => {
    setLigaActiva(liga);
    setSeccion("calendario");
    await cargarDatosLiga(liga.id);
  };

  return (
    <div style={s.wrap}>
      <style>{css}</style>

      <div style={s.header}>
        <h2 style={s.title}>Ligas disponibles 🏆</h2>
        <p style={s.sub}>Consulta clasificaciones y resultados en tiempo real</p>
      </div>

      {/* SELECTOR DE LIGAS */}
      <div style={s.ligasRow}>
        {ligas.map(l => (
          <button key={l.id} onClick={() => cambiarLiga(l)}
            style={{ ...s.ligaBtn, ...(ligaActiva?.id === l.id ? s.ligaBtnActive : {}) }}>
            <span style={s.ligaBtnIcon}>🏆</span>
            <div style={s.ligaBtnInfo}>
              <div style={s.ligaBtnNombre}>{l.nombre}</div>
              <div style={s.ligaBtnMeta}>{l.canchas?.nombre} · {l.dia} {l.turno}</div>
            </div>
          </button>
        ))}
        {ligas.length === 0 && !loading && (
          <div style={s.empty}>
            <div style={s.emptyIcon}>🏟️</div>
            <div style={s.emptyTxt}>No hay ligas activas por el momento</div>
          </div>
        )}
      </div>

      {ligaActiva && (
        <>
          {/* INFO DE LIGA */}
          <div style={s.ligaInfo}>
            <div style={s.ligaInfoLeft}>
              <div style={s.ligaInfoNombre}>{ligaActiva.nombre}</div>
              <div style={s.ligaInfoMeta}>
                📍 {ligaActiva.canchas?.nombre}
                {ligaActiva.canchas?.direccion && ` · ${ligaActiva.canchas.direccion}`}
                · {ligaActiva.dia} · {ligaActiva.turno}
                {ligaActiva.temporada && ` · Temp. ${ligaActiva.temporada}`}
              </div>
            </div>
            <div style={s.ligaInfoStats}>
              <div style={s.ligaInfoStat}><span style={s.ligaInfoStatNum}>{equipos.length}</span><span>equipos</span></div>
              <div style={s.ligaInfoStat}><span style={s.ligaInfoStatNum}>{partidos.length}</span><span>partidos</span></div>
            </div>
          </div>

          {/* TABS */}
          <div style={s.tabs}>
            {[["calendario","📅","Calendario"],["tabla","📊","Tabla"],["resultados","⚽","Resultados"],["goleadores","🥇","Goleadores"],["equipos","👕","Equipos"]].map(([key, icon, label]) => (
              <button key={key} onClick={() => setSeccion(key)}
                style={{ ...s.tab, ...(seccion === key ? s.tabActive : {}) }}>
                {icon} {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 60 }}><div style={s.spinner}/></div>
          ) : (
            <>
              {/* ── CALENDARIO ── */}
              {seccion === "calendario" && (
                <div>
                  {partidos.length === 0 ? (
                    <div style={s.empty}>
                      <div style={s.emptyIcon}>📅</div>
                      <div style={s.emptyTxt}>No hay partidos programados aún</div>
                    </div>
                  ) : (
                    <div style={s.jornadasList}>
                      {Object.values(
                        partidos.reduce((acc, p) => {
                          const jId = p.jornada_id;
                          if (!acc[jId]) acc[jId] = { jornada: p.jornadas, ps: [] };
                          acc[jId].ps.push(p);
                          return acc;
                        }, {})
                      ).sort((a, b) => (a.jornada?.numero || 0) - (b.jornada?.numero || 0))
                      .map(({ jornada, ps }) => (
                        <div key={jornada?.id || Math.random()} style={s.jornadaGroup}>
                          <div style={s.jornadaHeader}>
                            <span style={s.jornadaNum}>Jornada {jornada?.numero}</span>
                            <span style={s.jornadaFecha}>{jornada?.fecha || "Fecha por definir"}</span>
                          </div>
                          <div style={s.jornadaPartidos}>
                            {ps.map(p => {
                              const fichaOk = p.ficha_partido?.length > 0 && p.ficha_partido[0].cerrada;
                              return (
                                <div key={p.id} style={s.calendarioCard}>
                                  <div style={s.calendarioVs}>
                                    <div style={s.calendarioEquipo}>
                                      <div style={{ ...s.calendarioDot, background: p.equipos_local?.color_playera || "#666" }}/>
                                      <span style={s.calendarioNombre}>{p.equipos_local?.nombre}</span>
                                    </div>
                                    {fichaOk ? (
                                      <div style={s.calendarioMarcador}>
                                        <span style={{ color: p.ficha_partido[0].goles_local > p.ficha_partido[0].goles_visitante ? "#4ade80" : "#eee" }}>{p.ficha_partido[0].goles_local}</span>
                                        <span style={{ color:"#6b7280" }}>-</span>
                                        <span style={{ color: p.ficha_partido[0].goles_visitante > p.ficha_partido[0].goles_local ? "#4ade80" : "#eee" }}>{p.ficha_partido[0].goles_visitante}</span>
                                      </div>
                                    ) : (
                                      <div style={s.calendarioVsLabel}>VS</div>
                                    )}
                                    <div style={{ ...s.calendarioEquipo, justifyContent:"flex-end" }}>
                                      <span style={s.calendarioNombre}>{p.equipos_visitante?.nombre}</span>
                                      <div style={{ ...s.calendarioDot, background: p.equipos_visitante?.color_playera || "#666" }}/>
                                    </div>
                                  </div>
                                  <div style={s.calendarioMeta}>
                                    <span>⏰ {p.hora || "Hora s/d"}</span>
                                    <span>· Campo {p.cancha_numero || "—"}</span>
                                    {fichaOk && <span style={s.calendarioFinalBadge}>✓ Jugado</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── TABLA DE POSICIONES ── */}
              {seccion === "tabla" && (
                <div style={s.tableWrap}>
                  {clasificacion.length === 0 ? (
                    <div style={s.empty}>
                      <div style={s.emptyIcon}>📊</div>
                      <div style={s.emptyTxt}>No hay partidos jugados aún en esta liga</div>
                    </div>
                  ) : (
                    <table style={s.table}>
                      <thead>
                        <tr style={s.thead}>
                          {["#","Equipo","PJ","G","E","D","GF","GC","DIF","PTS"].map(h => (
                            <th key={h} style={s.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {clasificacion.map((row, i) => (
                          <tr key={row.equipo.id} className="tr-hover" style={s.tr}>
                            <td style={s.td}>
                              <span style={{ ...s.rank, background: i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"transparent", color: i<3?"#111":"#666" }}>
                                {i+1}
                              </span>
                            </td>
                            <td style={s.td}>
                              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                <div style={{ width:12, height:12, borderRadius:"50%", background: row.equipo.color_playera || "#666", flexShrink:0 }}/>
                                <span style={{ fontWeight:600, color:"#eee" }}>{row.equipo.nombre}</span>
                              </div>
                            </td>
                            <td style={s.tdNum}>{row.pj}</td>
                            <td style={{ ...s.tdNum, color:"#4ade80" }}>{row.g}</td>
                            <td style={{ ...s.tdNum, color:"#facc15" }}>{row.e}</td>
                            <td style={{ ...s.tdNum, color:"#f87171" }}>{row.d}</td>
                            <td style={s.tdNum}>{row.gf}</td>
                            <td style={s.tdNum}>{row.gc}</td>
                            <td style={{ ...s.tdNum, color: (row.gf-row.gc)>0?"#4ade80":(row.gf-row.gc)<0?"#f87171":"#aaa" }}>
                              {row.gf-row.gc > 0 ? `+${row.gf-row.gc}` : row.gf-row.gc}
                            </td>
                            <td style={{ ...s.tdNum, fontWeight:800, fontSize:18, color: row.equipo.color_playera || "#fff" }}>{row.pts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── RESULTADOS ── */}
              {seccion === "resultados" && (
                <div>
                  {resultados.length === 0 ? (
                    <div style={s.empty}>
                      <div style={s.emptyIcon}>⚽</div>
                      <div style={s.emptyTxt}>No hay resultados disponibles aún</div>
                    </div>
                  ) : (
                    <div style={s.resultadosList}>
                      {resultados.map(p => {
                        const f = p.ficha_partido[0];
                        return (
                          <div key={p.id} style={s.resultadoCard}>
                            <div style={s.resultadoTop}>
                              <span style={s.jornBadge}>Jornada {p.jornadas?.numero}</span>
                              <span style={s.fechaBadge}>{p.jornadas?.fecha || "—"}</span>
                            </div>
                            <div style={s.resultadoVs}>
                              <div style={s.resultadoEquipo}>
                                <div style={{ ...s.resultadoDot, background: p.equipos_local?.color_playera || "#666" }}/>
                                <span style={s.resultadoNombre}>{p.equipos_local?.nombre}</span>
                              </div>
                              <div style={s.marcadorFinal}>
                                <span style={{ color: f.goles_local > f.goles_visitante ? "#4ade80" : "#eee" }}>{f.goles_local}</span>
                                <span style={s.marcadorSep}>-</span>
                                <span style={{ color: f.goles_visitante > f.goles_local ? "#4ade80" : "#eee" }}>{f.goles_visitante}</span>
                              </div>
                              <div style={{ ...s.resultadoEquipo, justifyContent:"flex-end" }}>
                                <span style={s.resultadoNombre}>{p.equipos_visitante?.nombre}</span>
                                <div style={{ ...s.resultadoDot, background: p.equipos_visitante?.color_playera || "#666" }}/>
                              </div>
                            </div>
                            {(f.goleadores || []).length > 0 && (
                              <div style={s.goleadoresRow}>
                                {(f.goleadores || []).map((g, i) => (
                                  <span key={i} style={s.goleadorChip}>⚽ {g.nombre} ({g.goles})</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── GOLEADORES ── */}
              {seccion === "goleadores" && (
                <div>
                  {goleadores.length === 0 ? (
                    <div style={s.empty}>
                      <div style={s.emptyIcon}>🥇</div>
                      <div style={s.emptyTxt}>No hay goles registrados aún</div>
                    </div>
                  ) : (
                    <div style={s.goleadoresList}>
                      {goleadores.map((g, i) => (
                        <div key={i} style={s.goleadorRow}>
                          <div style={s.goleadorPos}>
                            <span style={{ ...s.rank, background: i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#f3f4f6", color: i<3?"#111":"#6b7280", width:32,height:32 }}>
                              {i+1}
                            </span>
                          </div>
                          <div style={s.goleadorInfo}>
                            <div style={s.goleadorNombre}>{g.nombre}</div>
                            <div style={s.goleadorEquipo}>{g.equipo_nombre}</div>
                          </div>
                          <div style={s.goleadorGoles}>
                            <span style={s.goleadorGolNum}>{g.goles}</span>
                            <span style={s.goleadorGolLabel}>goles</span>
                          </div>
                          <div style={s.goleadorBar}>
                            <div style={{ ...s.goleadorBarFill, width: `${(g.goles / (goleadores[0]?.goles || 1)) * 100}%` }}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── EQUIPOS ── */}
              {seccion === "equipos" && (
                <div style={s.equiposGrid}>
                  {equipos.length === 0 ? (
                    <div style={{ ...s.empty, gridColumn:"1/-1" }}>
                      <div style={s.emptyIcon}>👕</div>
                      <div style={s.emptyTxt}>No hay equipos registrados en esta liga</div>
                    </div>
                  ) : equipos.map(eq => {
                    const stats = clasificacion.find(c => c.equipo.id === eq.id);
                    return (
                      <div key={eq.id} style={{ ...s.equipoCard, borderTop: `4px solid ${eq.color_playera || "#3182ce"}` }}>
                        <div style={s.equipoCardTop}>
                          {eq.escudo_url
                            ? <img src={eq.escudo_url} alt="escudo" style={s.escudoImg}/>
                            : <div style={{ ...s.escudoPlaceholder, background: eq.color_playera || "#3182ce" }}>{eq.nombre[0]}</div>}
                        </div>
                        <div style={s.equipoNombre}>{eq.nombre}</div>
                        {stats && (
                          <div style={s.equipoStats}>
                            <div style={s.equipoStat}><span style={{ color: eq.color_playera, fontWeight:800 }}>{stats.pts}</span><span style={s.equipoStatLabel}>pts</span></div>
                            <div style={s.equipoStat}><span style={{ color:"#4ade80", fontWeight:700 }}>{stats.g}</span><span style={s.equipoStatLabel}>V</span></div>
                            <div style={s.equipoStat}><span style={{ color:"#facc15", fontWeight:700 }}>{stats.e}</span><span style={s.equipoStatLabel}>E</span></div>
                            <div style={s.equipoStat}><span style={{ color:"#f87171", fontWeight:700 }}>{stats.d}</span><span style={s.equipoStatLabel}>D</span></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
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
  ligasRow: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 },
  ligaBtn: { display: "flex", alignItems: "center", gap: 12, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 18px", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  ligaBtnActive: { background: "#f0fdf4", borderColor: GREEN },
  ligaBtnIcon: { fontSize: 20 },
  ligaBtnInfo: { textAlign: "left" },
  ligaBtnNombre: { fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 2 },
  ligaBtnMeta: { fontSize: 11, color: "#6b7280" },
  ligaInfo: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 22px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  ligaInfoLeft: {},
  ligaInfoNombre: { fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 6 },
  ligaInfoMeta: { fontSize: 13, color: "#6b7280" },
  ligaInfoStats: { display: "flex", gap: 24 },
  ligaInfoStat: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  ligaInfoStatNum: { fontSize: 24, fontWeight: 800, color: GREEN },
  tabs: { display: "flex", gap: 4, marginBottom: 24, borderBottom: `1px solid ${BORDER}` },
  tab: { background: "transparent", border: "none", borderBottom: "2px solid transparent", color: "#6b7280", padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: -1, transition: "all 0.2s" },
  tabActive: { color: GREEN, borderBottomColor: GREEN },
  tableWrap: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  table: { width: "100%", borderCollapse: "collapse" },
  thead: { background: BASE },
  th: { padding: "14px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 },
  tr: { borderTop: `1px solid ${BORDER}` },
  td: { padding: "14px 16px", fontSize: 14 },
  tdNum: { padding: "14px 16px", fontSize: 14, textAlign: "center", color: "#374151" },
  rank: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 6, fontSize: 12, fontWeight: 800 },
  resultadosList: { display: "flex", flexDirection: "column", gap: 12 },
  resultadoCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  resultadoTop: { display: "flex", justifyContent: "space-between", marginBottom: 14 },
  jornBadge: { fontSize: 11, color: "#6b7280", fontWeight: 600 },
  fechaBadge: { fontSize: 11, color: "#6b7280" },
  resultadoVs: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  resultadoEquipo: { display: "flex", alignItems: "center", gap: 10, flex: 1 },
  resultadoDot: { width: 12, height: 12, borderRadius: "50%", flexShrink: 0 },
  resultadoNombre: { fontSize: 15, fontWeight: 700, color: "#111827" },
  marcadorFinal: { display: "flex", alignItems: "center", gap: 8, fontSize: 28, fontWeight: 900, padding: "0 20px" },
  marcadorSep: { color: "#9ca3af", fontSize: 20 },
  goleadoresRow: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 },
  goleadorChip: { background: "#f0fdf4", color: GREEN, fontSize: 11, padding: "3px 10px", borderRadius: 6, fontWeight: 600, border: "1px solid #c3e6a3" },
  goleadoresList: { display: "flex", flexDirection: "column", gap: 10 },
  goleadorRow: { background: "linear-gradient(90deg, #f0fdf4 0%, #ffffff 60%)", border: "1px solid #c3e6a3", borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 1px 4px rgba(79,143,47,0.08)", borderLeft: `4px solid ${GREEN}` },
  goleadorPos: { flexShrink: 0 },
  goleadorInfo: { flex: 1 },
  goleadorNombre: { fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 3 },
  goleadorEquipo: { fontSize: 12, color: "#6b7280" },
  goleadorGoles: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  goleadorGolNum: { fontSize: 24, fontWeight: 900, color: GREEN },
  goleadorGolLabel: { fontSize: 10, color: "#9ca3af" },
  goleadorBar: { width: 80, height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" },
  goleadorBarFill: { height: "100%", background: GREEN, borderRadius: 3, transition: "width 0.5s ease" },
  equiposGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 },
  equipoCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 16px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  equipoCardTop: { display: "flex", justifyContent: "center", marginBottom: 14 },
  escudoImg: { width: 60, height: 60, borderRadius: 12, objectFit: "cover" },
  escudoPlaceholder: { width: 60, height: 60, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#fff" },
  equipoNombre: { fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 14 },
  equipoStats: { display: "flex", justifyContent: "center", gap: 16 },
  equipoStat: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  equipoStatLabel: { fontSize: 10, color: "#9ca3af" },
  jornadasList: { display: "flex", flexDirection: "column", gap: 20 },
  jornadaGroup: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  jornadaHeader: { background: BASE, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${BORDER}` },
  jornadaNum: { fontSize: 13, fontWeight: 700, color: "#111827" },
  jornadaFecha: { fontSize: 12, color: "#6b7280" },
  jornadaPartidos: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 },
  calendarioCard: { padding: "12px 16px", background: BASE, borderRadius: 10, border: `1px solid ${BORDER}` },
  calendarioVs: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  calendarioEquipo: { display: "flex", alignItems: "center", gap: 8, flex: 1 },
  calendarioDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  calendarioNombre: { fontSize: 14, fontWeight: 600, color: "#111827" },
  calendarioVsLabel: { fontSize: 12, color: "#9ca3af", fontWeight: 700, padding: "0 12px" },
  calendarioMarcador: { display: "flex", gap: 6, fontSize: 20, fontWeight: 900, padding: "0 12px" },
  calendarioMeta: { display: "flex", gap: 8, fontSize: 11, color: "#6b7280", alignItems: "center" },
  calendarioFinalBadge: { background: "#f0fdf4", color: GREEN, fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 700, border: `1px solid #c3e6a3` },
  empty: { textAlign: "center", padding: "60px 20px" },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTxt: { color: "#6b7280", fontSize: 15 },
  spinner: { width: 32, height: 32, border: `3px solid ${BORDER}`, borderTop: `3px solid ${GREEN}`, borderRadius: "50%", margin: "0 auto", animation: "spin 0.7s linear infinite" },
};

const css = `
  .tr-hover:hover { background: #f9fafb !important; }
  button:hover { opacity: 0.85; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;