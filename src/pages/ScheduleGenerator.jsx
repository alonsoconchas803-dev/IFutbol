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
    throw new Error(err.message || "Error en la base de datos");
  }
  return res.status === 204 ? null : res.json();
};

// ─────────────────────────────────────────────────────────────────
// ALGORITMO: Generar UNA jornada respetando historial
// ─────────────────────────────────────────────────────────────────
function generarUnaJornada(equipos, historial, numJornada) {
  // historial: { "id_a-id_b": true } pares que ya jugaron
  const n = equipos.length;
  const esNon = n % 2 !== 0;
  const lista = [...equipos];
  if (esNon) lista.push({ id: "BYE", nombre: "DESCANSO" });

  const total = lista.length;
  const umbral75 = Math.floor(n * 0.75);

  // Contar cuántos rivales ha tenido cada equipo
  const conteoRivales = {};
  equipos.forEach(e => { conteoRivales[e.id] = 0; });
  Object.keys(historial).forEach(par => {
    const [a, b] = par.split("-");
    if (conteoRivales[a] !== undefined) conteoRivales[a]++;
    if (conteoRivales[b] !== undefined) conteoRivales[b]++;
  });

  // Round-robin: rotación basada en número de jornada
  const indices = lista.map((_, i) => i);
  const fijo = indices[0];
  const rotables = indices.slice(1);
  const rot = (numJornada - 1) % rotables.length;
  const rotados = [...rotables.slice(rot), ...rotables.slice(0, rot)];
  const orden = [fijo, ...rotados];

  const partidos = [];
  const usados = new Set();
  const descansos = [];

  for (let i = 0; i < total / 2; i++) {
    const a = lista[orden[i]];
    const b = lista[orden[total - 1 - i]];

    if (a.id === "BYE") { descansos.push(b); usados.add(b.id); continue; }
    if (b.id === "BYE") { descansos.push(a); usados.add(a.id); continue; }

    const parKey = [a.id, b.id].sort().join("-");
    const yaJugaron = historial[parKey];

    if (yaJugaron) {
      // Solo repetir si ambos ya superaron el 75%
      if (conteoRivales[a.id] < umbral75 || conteoRivales[b.id] < umbral75) {
        // Buscar alternativa para uno de ellos
        const alternativa = lista.find(e =>
          e.id !== "BYE" && !usados.has(e.id) && e.id !== a.id && e.id !== b.id &&
          !historial[[a.id, e.id].sort().join("-")]
        );
        if (alternativa) {
          partidos.push({ local: a, visitante: alternativa });
          usados.add(a.id); usados.add(alternativa.id);
          continue;
        }
      }
    }

    partidos.push({ local: a, visitante: b });
    usados.add(a.id); usados.add(b.id);
  }

  // Agregar equipos no emparejados como descanso
  lista.forEach(e => {
    if (e.id !== "BYE" && !usados.has(e.id)) descansos.push(e);
  });

  return { partidos, descansos };
}

function asignarHorarios(partidos, numCanchas, duracion, intervalo, horaInicio) {
  const [h, m] = horaInicio.split(":").map(Number);
  const tiempoTotal = duracion + intervalo;
  return partidos.map((p, idx) => {
    const cancha = (idx % numCanchas) + 1;
    const turno = Math.floor(idx / numCanchas);
    const mins = h * 60 + m + turno * tiempoTotal;
    const hh = Math.floor(mins / 60) % 24;
    const mm = mins % 60;
    return { ...p, cancha, hora: `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}` };
  });
}

function formatFecha(fecha) {
  if (!fecha) return "—";
  const [y, mo, d] = fecha.split("-");
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${meses[parseInt(mo)-1]} ${y}`;
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────
export default function ScheduleGenerator({ session, liga, cancha }) {
  const [tab, setTab] = useState("jornada"); // jornada | liguilla | bracket
  const [equipos, setEquipos] = useState([]);
  const [historial, setHistorial] = useState({});
  const [jornadasGuardadas, setJornadasGuardadas] = useState([]);
  const [clasificacion, setClasificacion] = useState([]);
  const [liguilla, setLiguilla] = useState(null);
  const [preview, setPreview] = useState(null);
  const [config, setConfig] = useState({
    numCanchas: cancha?.num_canchas || 2,
    duracion: 50,
    intervalo: 10,
    horaInicio: "08:00",
    fecha: "",
  });
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState(null);
  const token = session?.access_token;

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (liga?.id) { cargarTodo(); }
  }, [liga?.id]);

  const cargarTodo = async () => {
    setLoading(true);
    try {
      const [eqs, hist, jors, fichas, liguillaData] = await Promise.all([
        db(`/equipos?liga_id=eq.${liga.id}&select=*&order=nombre`, token),
        db(`/historial_enfrentamientos?liga_id=eq.${liga.id}&select=*`, token),
        db(`/jornadas?liga_id=eq.${liga.id}&select=*&order=numero`, token),
        db(`/ficha_partido?select=*,partidos(jornada_id,equipo_local_id,equipo_visitante_id,jornadas(liga_id))`, token),
        db(`/liguilla_partidos?liga_id=eq.${liga.id}&select=*&order=created_at`, token),
      ]);
      setEquipos(eqs || []);
      setJornadasGuardadas(jors || []);

      // Reconstruir historial
      const h = {};
      (hist || []).forEach(r => {
        const key = [r.equipo_a_id, r.equipo_b_id].sort().join("-");
        h[key] = true;
      });
      setHistorial(h);

      // Calcular clasificación desde fichas
      const fichasFiltradas = (fichas || []).filter(f =>
        f.cerrada && f.partidos?.jornadas?.liga_id === liga.id && !f.es_liguilla
      );
      setClasificacion(calcularClasificacion(eqs || [], fichasFiltradas));

      // Liguilla guardada
      if (liguillaData?.length > 0) setLiguilla(liguillaData);

    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const calcularClasificacion = (eqs, fichas) => {
    const tabla = {};
    eqs.forEach(eq => { tabla[eq.id] = { equipo: eq, pj:0, g:0, e:0, d:0, gf:0, gc:0, pts:0 }; });
    fichas.forEach(f => {
      const lId = f.partidos?.equipo_local_id;
      const vId = f.partidos?.equipo_visitante_id;
      if (!lId || !vId || !tabla[lId] || !tabla[vId]) return;
      tabla[lId].pj++; tabla[vId].pj++;
      tabla[lId].gf += f.goles_local || 0; tabla[lId].gc += f.goles_visitante || 0;
      tabla[vId].gf += f.goles_visitante || 0; tabla[vId].gc += f.goles_local || 0;
      if ((f.goles_local||0) > (f.goles_visitante||0)) { tabla[lId].g++; tabla[lId].pts+=3; tabla[vId].d++; }
      else if ((f.goles_local||0) < (f.goles_visitante||0)) { tabla[vId].g++; tabla[vId].pts+=3; tabla[lId].d++; }
      else { tabla[lId].e++; tabla[lId].pts++; tabla[vId].e++; tabla[vId].pts++; }
    });
    return Object.values(tabla).sort((a,b) => b.pts-a.pts || (b.gf-b.gc)-(a.gf-a.gc));
  };

  // ── GENERAR PREVIEW DE JORNADA ──
  const handlePreviewJornada = () => {
    if (equipos.length < 2) return showToast("Necesitas al menos 2 equipos", "err");
    if (!config.fecha) return showToast("Selecciona la fecha de la jornada", "err");
    const numJornada = jornadasGuardadas.length + 1;
    const { partidos, descansos } = generarUnaJornada(equipos, historial, numJornada);
    const conHorarios = asignarHorarios(partidos, config.numCanchas, config.duracion, config.intervalo, config.horaInicio);
    setPreview({ partidos: conHorarios, descansos, numero: numJornada });
  };

  // ── GUARDAR JORNADA ──
  const handleGuardarJornada = async () => {
    if (!preview) return;
    setGuardando(true);
    try {
      const jornada = await db("/jornadas", token, {
        method: "POST",
        body: JSON.stringify({ liga_id: liga.id, numero: preview.numero, fecha: config.fecha })
      });
      const jornadaId = Array.isArray(jornada) ? jornada[0]?.id : jornada?.id;

      for (const p of preview.partidos) {
        await db("/partidos", token, {
          method: "POST",
          body: JSON.stringify({
            jornada_id: jornadaId,
            equipo_local_id: p.local.id,
            equipo_visitante_id: p.visitante.id,
            cancha_numero: p.cancha,
            hora: p.hora,
          })
        });
        // Guardar en historial
        await db("/historial_enfrentamientos", token, {
          method: "POST",
          body: JSON.stringify({
            liga_id: liga.id,
            equipo_a_id: p.local.id,
            equipo_b_id: p.visitante.id,
            jornada_numero: preview.numero,
          })
        });
      }
      showToast(`Jornada ${preview.numero} guardada ✓`);
      setPreview(null);
      setConfig(c => ({ ...c, fecha: "" }));
      cargarTodo();
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  // ── GENERAR LIGUILLA Y COPA ──
  const handleGenerarLiguilla = async () => {
    if (clasificacion.length < 2) return showToast("No hay suficientes equipos en la tabla", "err");
    if (!config.fecha) return showToast("Selecciona la fecha para la liguilla", "err");
    setGuardando(true);
    try {
      // Crear jornada de cuartos
      const jornada = await db("/jornadas", token, {
        method: "POST",
        body: JSON.stringify({ liga_id: liga.id, numero: jornadasGuardadas.length + 1, fecha: config.fecha })
      });
      const jornadaId = Array.isArray(jornada) ? jornada[0]?.id : jornada?.id;

      const n = clasificacion.length;
      const liguillaPares = [];
      const copaPares = [];
      const amistosos = [];

      // Top 8 → Liguilla
      const top8 = clasificacion.slice(0, Math.min(8, n));
      for (let i = 0; i < Math.floor(top8.length / 2); i++) {
        liguillaPares.push({ local: top8[i], visitante: top8[top8.length - 1 - i], fase: "cuartos", tipo: "liguilla" });
      }

      // 9-16 → Copa
      if (n > 8) {
        const copa = clasificacion.slice(8, Math.min(16, n));
        for (let i = 0; i < Math.floor(copa.length / 2); i++) {
          copaPares.push({ local: copa[i], visitante: copa[copa.length - 1 - i], fase: "cuartos", tipo: "copa" });
        }
      }

      // Más de 16 → Amistosos
      if (n > 16) {
        const resto = clasificacion.slice(16);
        for (let i = 0; i < Math.floor(resto.length / 2); i++) {
          amistosos.push({ local: resto[i*2], visitante: resto[i*2+1], fase: "cuartos", tipo: "amistoso" });
        }
      }

      const todos = [...liguillaPares, ...copaPares, ...amistosos];
      const conHorarios = asignarHorarios(todos, config.numCanchas, config.duracion, config.intervalo, config.horaInicio);

      for (const p of conHorarios) {
        await db("/liguilla_partidos", token, {
          method: "POST",
          body: JSON.stringify({
            liga_id: liga.id,
            jornada_id: jornadaId,
            tipo: p.tipo,
            fase: p.fase,
            equipo_local_id: p.local.equipo.id,
            equipo_visitante_id: p.visitante.equipo.id,
            cancha_numero: p.cancha,
            hora: p.hora,
          })
        });
      }

      showToast("Liguilla y Copa generadas ✓");
      setTab("bracket");
      cargarTodo();
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {toast && <div className={`ifutbol-toast ${toast.tipo==="err"?"toast-err":"toast-ok"}`}>{toast.msg}</div>}

      <div style={s.header}>
        <div>
          <h2 style={s.title}>Calendario y Liguilla 📅</h2>
          <p style={s.sub}>{liga?.nombre} · {equipos.length} equipos · {jornadasGuardadas.length} jornadas generadas</p>
        </div>
      </div>

      {/* TABS */}
      <div className="ifutbol-tabs">
        {[["jornada","📅 Generar jornada"],["liguilla","🏆 Liguilla y Copa"],["bracket","🎯 Bracket"]].map(([key,label])=>(
          <button key={key} className={`ifutbol-tab ${tab===key?"active":""}`} onClick={()=>setTab(key)}>{label}</button>
        ))}
      </div>

      {loading ? <div style={{ padding:60, textAlign:"center" }}><div className="spinner"/></div> : <>

        {/* ── TAB: GENERAR JORNADA ── */}
        {tab==="jornada" && (
          <div style={s.tabContent}>
            <div style={s.twoCol}>
              {/* CONFIGURACIÓN */}
              <div style={s.card}>
                <h3 style={s.cardTitle}>⚙️ Configuración de la jornada</h3>
                <div style={s.field}>
                  <label style={s.label}>Fecha de la jornada *</label>
                  <input type="date" className="form-input" value={config.fecha} onChange={e=>setConfig({...config,fecha:e.target.value})} />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Hora de inicio</label>
                  <input type="time" className="form-input" value={config.horaInicio} onChange={e=>setConfig({...config,horaInicio:e.target.value})} />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Canchas simultáneas</label>
                  <div style={{ display:"flex", gap:8 }}>
                    {[1,2,3,4].map(n=>(
                      <button key={n} className={`num-btn ${config.numCanchas===n?"active":""}`} onClick={()=>setConfig({...config,numCanchas:n})}>{n}</button>
                    ))}
                  </div>
                </div>
                <div style={s.field}>
                  <label style={s.label}>Duración partido: <strong>{config.duracion} min</strong></label>
                  <input type="range" min="20" max="90" step="5" value={config.duracion} onChange={e=>setConfig({...config,duracion:+e.target.value})} style={{ width:"100%", accentColor:"var(--green)" }} />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Tiempo entre partidos: <strong>{config.intervalo} min</strong></label>
                  <input type="range" min="0" max="30" step="5" value={config.intervalo} onChange={e=>setConfig({...config,intervalo:+e.target.value})} style={{ width:"100%", accentColor:"var(--green)" }} />
                </div>
                <button className="btn btn-premium" style={{ width:"100%" }} onClick={handlePreviewJornada}>
                  Vista previa jornada {jornadasGuardadas.length+1} →
                </button>
              </div>

              {/* EQUIPOS Y HISTORIAL */}
              <div style={s.card}>
                <h3 style={s.cardTitle}>👕 Equipos activos ({equipos.length})</h3>
                <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:16 }}>
                  {equipos.map((eq,i)=>(
                    <div key={eq.id} style={s.equipoRow}>
                      <div style={{ ...s.dot, background:eq.color_playera||"var(--green)" }}/>
                      <span style={{ flex:1, fontSize:14, fontWeight:600 }}>{eq.nombre}</span>
                      <span style={{ fontSize:11, color:"var(--text-muted)" }}>
                        {Object.keys(historial).filter(k=>k.includes(eq.id)).length} partidos
                      </span>
                    </div>
                  ))}
                  {equipos.length%2!==0 && (
                    <div style={{ ...s.equipoRow, border:"1px dashed var(--border)", background:"#f9fafb" }}>
                      <div style={{ ...s.dot, background:"#d1d5db" }}/>
                      <span style={{ fontSize:13, color:"var(--text-muted)", fontStyle:"italic" }}>DESCANSO (rotativo)</span>
                    </div>
                  )}
                </div>
                <div style={s.infoBox}>
                  ℹ️ Jornadas generadas: <strong>{jornadasGuardadas.length}</strong> · Enfrentamientos en historial: <strong>{Object.keys(historial).length}</strong>
                </div>
              </div>
            </div>

            {/* PREVIEW */}
            {preview && (
              <div style={{ ...s.card, marginTop:20 }}>
                <div style={s.previewHeader}>
                  <div>
                    <h3 style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>Vista previa — Jornada {preview.numero}</h3>
                    <p style={{ color:"var(--text-muted)", fontSize:13 }}>{formatFecha(config.fecha)} · {preview.partidos.length} partidos</p>
                  </div>
                  <button className="btn btn-ghost" onClick={()=>setPreview(null)}>✕ Descartar</button>
                </div>
                {Array.from({length:config.numCanchas},(_,ci)=>{
                  const pcs = preview.partidos.filter(p=>p.cancha===ci+1);
                  if (!pcs.length) return null;
                  return (
                    <div key={ci} style={{ marginBottom:16 }}>
                      <div style={s.canchaLabel}>🏟️ Cancha {ci+1}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {pcs.map((p,pi)=>(
                          <div key={pi} style={s.partidoRow}>
                            <span style={s.hora}>{p.hora}</span>
                            <div style={s.vsBlock}>
                              <div style={{ display:"flex", alignItems:"center", gap:8, flex:1 }}>
                                <div style={{ ...s.dot, background:p.local.color_playera||"var(--green)" }}/>
                                <span style={{ fontWeight:700, fontSize:14 }}>{p.local.nombre}</span>
                              </div>
                              <span style={s.vsTag}>VS</span>
                              <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, justifyContent:"flex-end" }}>
                                <span style={{ fontWeight:700, fontSize:14 }}>{p.visitante.nombre}</span>
                                <div style={{ ...s.dot, background:p.visitante.color_playera||"#999" }}/>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {preview.descansos.length>0 && (
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", paddingTop:12, borderTop:"1px solid var(--border)" }}>
                    {preview.descansos.map((d,i)=>(
                      <span key={i} style={s.descansoChip}>😴 {d.nombre} descansa</span>
                    ))}
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
                  <button className="btn btn-premium" style={{ padding:"12px 28px" }} onClick={handleGuardarJornada} disabled={guardando}>
                    {guardando ? "Guardando..." : "💾 Guardar jornada"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: LIGUILLA Y COPA ── */}
        {tab==="liguilla" && (
          <div style={s.tabContent}>
            <div style={s.card}>
              <h3 style={s.cardTitle}>🏆 Generar Liguilla y Copa</h3>
              <p style={{ color:"var(--text-muted)", fontSize:13, marginBottom:20 }}>
                Se generará en base a la tabla actual. Los cuartos de final se asignarán automáticamente.
              </p>

              {/* TABLA ACTUAL */}
              <div style={{ marginBottom:20 }}>
                <div style={s.label}>Tabla actual ({clasificacion.length} equipos)</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:320, overflowY:"auto" }}>
                  {clasificacion.map((r,i)=>(
                    <div key={r.equipo.id} style={{ ...s.equipoRow, background: i<8?"#f0fdf4":i<16?"#fffbeb":"#f9fafb" }}>
                      <span style={{ ...s.rankBadge, background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":i<8?"var(--green-light)":i<16?"#fef9c3":"#f3f4f6", color:i<3?"#111":i<8?"var(--green)":i<16?"#854d0e":"#888" }}>{i+1}</span>
                      <div style={{ ...s.dot, background:r.equipo.color_playera||"#999" }}/>
                      <span style={{ flex:1, fontSize:14, fontWeight:600 }}>{r.equipo.nombre}</span>
                      <span style={{ fontSize:12, fontWeight:800, color:"var(--green)" }}>{r.pts} pts</span>
                      {i < 8 && <span style={s.liguillaChip}>Liguilla</span>}
                      {i >= 8 && i < 16 && <span style={s.copaChip}>Copa</span>}
                      {i >= 16 && <span style={s.amistosChip}>Amistoso</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* PREVIEW CRUCES */}
              {clasificacion.length >= 2 && (
                <div style={{ marginBottom:20 }}>
                  <div style={s.label}>Cruces de cuartos de final</div>
                  <div style={s.crucesGrid}>
                    <div>
                      <div style={s.crucesTitle}>🏆 Liguilla</div>
                      {Array.from({length:Math.min(4,Math.floor(Math.min(8,clasificacion.length)/2))},(_,i)=>{
                        const a = clasificacion[i];
                        const b = clasificacion[Math.min(8,clasificacion.length)-1-i];
                        if (!a||!b) return null;
                        return (
                          <div key={i} style={s.cruceRow}>
                            <span style={{ fontWeight:700, color:"var(--green)" }}>#{i+1} {a.equipo.nombre}</span>
                            <span style={s.vsTag}>VS</span>
                            <span style={{ fontWeight:700, color:"var(--green)" }}>#{Math.min(8,clasificacion.length)-i} {b.equipo.nombre}</span>
                          </div>
                        );
                      })}
                    </div>
                    {clasificacion.length > 8 && (
                      <div>
                        <div style={s.crucesTitle}>🥈 Copa</div>
                        {Array.from({length:Math.min(4,Math.floor(Math.min(8,clasificacion.length-8)/2))},(_,i)=>{
                          const a = clasificacion[8+i];
                          const b = clasificacion[Math.min(16,clasificacion.length)-1-i];
                          if (!a||!b) return null;
                          return (
                            <div key={i} style={s.cruceRow}>
                              <span style={{ fontWeight:700, color:"#b45309" }}>#{9+i} {a.equipo.nombre}</span>
                              <span style={s.vsTag}>VS</span>
                              <span style={{ fontWeight:700, color:"#b45309" }}>#{Math.min(16,clasificacion.length)-i} {b.equipo.nombre}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={s.fieldRow}>
                <div style={{ flex:1 }}>
                  <label style={s.label}>Fecha de los cuartos de final *</label>
                  <input type="date" className="form-input" value={config.fecha} onChange={e=>setConfig({...config,fecha:e.target.value})} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={s.label}>Hora de inicio</label>
                  <input type="time" className="form-input" value={config.horaInicio} onChange={e=>setConfig({...config,horaInicio:e.target.value})} />
                </div>
              </div>

              <div style={{ height:16 }}/>
              <button className="btn btn-premium" style={{ width:"100%", fontSize:15 }} onClick={handleGenerarLiguilla} disabled={guardando||clasificacion.length<2||!config.fecha}>
                {guardando ? "Generando..." : "🏆 Generar Liguilla y Copa"}
              </button>
            </div>
          </div>
        )}

        {/* ── TAB: BRACKET ── */}
        {tab==="bracket" && (
          <BracketView liguilla={liguilla} equipos={equipos} token={token} liga={liga} onRefresh={cargarTodo} showToast={showToast} />
        )}
      </>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// BRACKET VIEW
// ─────────────────────────────────────────────────────────────────
function BracketView({ liguilla, equipos, token, liga, onRefresh, showToast }) {
  const [modalPartido, setModalPartido] = useState(null);
  const [ganador, setGanador] = useState("");
  const [guardando, setGuardando] = useState(false);

  if (!liguilla || liguilla.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🎯</div>
        <div className="empty-state-txt">No se ha generado la liguilla aún</div>
        <div className="empty-state-hint">Ve a la pestaña "Liguilla y Copa" para generarla</div>
      </div>
    );
  }

  const getEquipo = id => equipos.find(e => e.id === id);

  const porFaseYTipo = (tipo, fase) => liguilla.filter(p => p.tipo === tipo && p.fase === fase);

  const handleAbrirModal = (partido) => {
    setModalPartido(partido);
    setGanador(partido.equipo_avanza_id || "");
  };

  const handleGuardarAvance = async () => {
    if (!ganador) return showToast("Selecciona el equipo que avanza", "err");
    setGuardando(true);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/liguilla_partidos?id=eq.${modalPartido.id}`, {
        method: "PATCH",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ equipo_avanza_id: ganador, cerrado: true })
      });
      showToast("Resultado guardado ✓");
      setModalPartido(null);
      onRefresh();
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  const renderPartido = (p, colorTipo) => {
    const local = getEquipo(p.equipo_local_id);
    const visitante = getEquipo(p.equipo_visitante_id);
    const ganador = getEquipo(p.equipo_avanza_id);
    return (
      <div key={p.id} style={{ ...s.bracketPartido, borderLeft:`3px solid ${colorTipo}` }} onClick={() => !p.cerrado && handleAbrirModal(p)} className={!p.cerrado ? "bracket-clickable" : ""}>
        <div style={s.bracketEquipo}>
          <div style={{ ...s.dot, background:local?.color_playera||"#999", width:8, height:8 }}/>
          <span style={{ fontSize:12, fontWeight:600, color:p.equipo_avanza_id===local?.id?"var(--green)":"var(--text)" }}>{local?.nombre||"—"}</span>
          {p.goles_local !== null && p.goles_local !== undefined && <span style={s.gol}>{p.goles_local}</span>}
        </div>
        <div style={s.bracketEquipo}>
          <div style={{ ...s.dot, background:visitante?.color_playera||"#999", width:8, height:8 }}/>
          <span style={{ fontSize:12, fontWeight:600, color:p.equipo_avanza_id===visitante?.id?"var(--green)":"var(--text)" }}>{visitante?.nombre||"—"}</span>
          {p.goles_visitante !== null && p.goles_visitante !== undefined && <span style={s.gol}>{p.goles_visitante}</span>}
        </div>
        {p.cerrado ? (
          <div style={s.ganadorChip}>✓ {ganador?.nombre}</div>
        ) : (
          <div style={s.pendienteChip}>Pendiente — clic para registrar</div>
        )}
        {p.hora && <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:4 }}>⏰ {p.hora} · C{p.cancha_numero}</div>}
      </div>
    );
  };

  const renderColumna = (titulo, partidos, color) => (
    <div style={s.bracketCol}>
      <div style={{ ...s.bracketColTitle, color }}>{titulo}</div>
      {partidos.length === 0
        ? <div style={s.bracketPendiente}>Se definirán al avanzar rondas</div>
        : partidos.map(p => renderPartido(p, color))}
    </div>
  );

  const liguillaPartidos = {
    cuartos: porFaseYTipo("liguilla","cuartos"),
    semis: porFaseYTipo("liguilla","semis"),
    final: porFaseYTipo("liguilla","final"),
    tercer: porFaseYTipo("liguilla","3er_lugar"),
  };
  const copaPartidos = {
    cuartos: porFaseYTipo("copa","cuartos"),
    semis: porFaseYTipo("copa","semis"),
    final: porFaseYTipo("copa","final"),
    tercer: porFaseYTipo("copa","3er_lugar"),
  };

  return (
    <div style={s.tabContent}>
      {/* LIGUILLA */}
      {liguillaPartidos.cuartos.length > 0 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>🏆 Liguilla</h3>
          <div style={s.bracketRow}>
            {renderColumna("Cuartos de final", liguillaPartidos.cuartos, "#4f8f2f")}
            {renderColumna("Semifinales", liguillaPartidos.semis, "#3b82f6")}
            <div style={s.bracketCol}>
              <div style={{ ...s.bracketColTitle, color:"#f59e0b" }}>Final</div>
              {liguillaPartidos.final.map(p => renderPartido(p, "#f59e0b"))}
              {liguillaPartidos.tercer.length > 0 && <>
                <div style={{ ...s.bracketColTitle, color:"#cd7f32", marginTop:16, fontSize:11 }}>3er lugar</div>
                {liguillaPartidos.tercer.map(p => renderPartido(p, "#cd7f32"))}
              </>}
            </div>
          </div>
        </div>
      )}

      {/* COPA */}
      {copaPartidos.cuartos.length > 0 && (
        <div style={{ ...s.card, marginTop:20 }}>
          <h3 style={s.cardTitle}>🥈 Copa</h3>
          <div style={s.bracketRow}>
            {renderColumna("Cuartos de final", copaPartidos.cuartos, "#b45309")}
            {renderColumna("Semifinales", copaPartidos.semis, "#7c3aed")}
            <div style={s.bracketCol}>
              <div style={{ ...s.bracketColTitle, color:"#dc2626" }}>Final</div>
              {copaPartidos.final.map(p => renderPartido(p, "#dc2626"))}
              {copaPartidos.tercer.length > 0 && <>
                <div style={{ ...s.bracketColTitle, color:"#cd7f32", marginTop:16, fontSize:11 }}>3er lugar</div>
                {copaPartidos.tercer.map(p => renderPartido(p, "#cd7f32"))}
              </>}
            </div>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR RESULTADO */}
      {modalPartido && (
        <div className="ifutbol-overlay" onClick={()=>setModalPartido(null)}>
          <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:420 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
              <h3 style={{ fontSize:18, fontWeight:800 }}>Registrar resultado</h3>
              <button style={s.closeBtn} onClick={()=>setModalPartido(null)}>✕</button>
            </div>
            <p style={{ color:"var(--text-muted)", fontSize:13, marginBottom:20 }}>
              {modalPartido.tipo === "liguilla" ? "🏆 Liguilla" : "🥈 Copa"} · {modalPartido.fase}
            </p>
            <div style={s.field}>
              <label style={s.label}>¿Quién avanza a la siguiente ronda?</label>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[modalPartido.equipo_local_id, modalPartido.equipo_visitante_id].map(id => {
                  const eq = equipos.find(e => e.id === id);
                  if (!eq) return null;
                  return (
                    <button key={id} onClick={()=>setGanador(id)}
                      style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderRadius:12, border:`2px solid ${ganador===id?"var(--green)":"var(--border)"}`, background:ganador===id?"var(--green-light)":"white", cursor:"pointer", transition:"all 0.2s", fontFamily:"'DM Sans',sans-serif" }}>
                      <div style={{ ...s.dot, background:eq.color_playera||"#999", width:14, height:14 }}/>
                      <span style={{ fontWeight:700, fontSize:15, color:ganador===id?"var(--green)":"var(--text)" }}>{eq.nombre}</span>
                      {ganador===id && <span style={{ marginLeft:"auto", color:"var(--green)", fontWeight:800 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ height:16 }}/>
            <button className="btn btn-premium" style={{ width:"100%" }} onClick={handleGuardarAvance} disabled={guardando||!ganador}>
              {guardando ? "Guardando..." : "Confirmar y guardar →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────
const s = {
  wrap: {},
  header: { marginBottom:20 },
  title: { fontSize:24, fontWeight:800, color:"var(--text)", letterSpacing:-0.8, marginBottom:4 },
  sub: { color:"var(--text-muted)", fontSize:14 },
  tabContent: { paddingTop:4 },
  twoCol: { display:"grid", gridTemplateColumns:"1fr 1.2fr", gap:20 },
  card: { background:"white", borderRadius:"var(--radius-md)", padding:24, boxShadow:"var(--shadow-md)", border:"1px solid var(--border)" },
  cardTitle: { fontSize:15, fontWeight:700, color:"var(--text)", marginBottom:16 },
  field: { marginBottom:16 },
  fieldRow: { display:"flex", gap:16 },
  label: { display:"block", fontSize:11, fontWeight:700, color:"var(--text-sub)", textTransform:"uppercase", letterSpacing:0.7, marginBottom:8 },
  equipoRow: { display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:8, background:"var(--bg)" },
  dot: { width:12, height:12, borderRadius:"50%", flexShrink:0 },
  rankBadge: { width:24, height:24, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, flexShrink:0 },
  infoBox: { background:"var(--green-light)", border:"1px solid #c3e6a3", borderRadius:8, padding:"10px 14px", color:"var(--green-dark)", fontSize:12 },
  previewHeader: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, paddingBottom:16, borderBottom:"1px solid var(--border)" },
  canchaLabel: { fontSize:11, fontWeight:700, color:"var(--text-sub)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:8 },
  partidoRow: { display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, background:"var(--bg)", border:"1px solid var(--border)" },
  hora: { background:"var(--green)", color:"white", fontSize:12, fontWeight:800, padding:"4px 10px", borderRadius:6, flexShrink:0, minWidth:50, textAlign:"center" },
  vsBlock: { flex:1, display:"flex", alignItems:"center", justifyContent:"space-between" },
  vsTag: { fontSize:11, fontWeight:800, color:"var(--text-muted)", padding:"0 10px" },
  descansoChip: { background:"#f3f4f6", color:"var(--text-muted)", fontSize:12, fontWeight:600, padding:"4px 12px", borderRadius:6 },
  crucesGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:16 },
  crucesTitle: { fontSize:13, fontWeight:700, marginBottom:10 },
  cruceRow: { display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:8, background:"var(--bg)", marginBottom:6, fontSize:13 },
  liguillaChip: { background:"var(--green-light)", color:"var(--green)", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4 },
  copaChip: { background:"#fef9c3", color:"#854d0e", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4 },
  amistosChip: { background:"#f3f4f6", color:"#6b7280", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4 },
  bracketRow: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20, overflowX:"auto" },
  bracketCol: { display:"flex", flexDirection:"column", gap:10 },
  bracketColTitle: { fontSize:12, fontWeight:800, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8 },
  bracketPartido: { background:"var(--bg)", borderRadius:10, padding:"12px 14px", cursor:"default", border:"1px solid var(--border)" },
  bracketEquipo: { display:"flex", alignItems:"center", gap:8, marginBottom:6 },
  gol: { marginLeft:"auto", fontWeight:800, fontSize:14, color:"var(--text)" },
  ganadorChip: { background:"var(--green-light)", color:"var(--green)", fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:6, marginTop:4 },
  pendienteChip: { fontSize:11, color:"var(--text-muted)", fontStyle:"italic", marginTop:4 },
  bracketPendiente: { background:"#f9fafb", borderRadius:10, padding:"16px", textAlign:"center", color:"var(--text-muted)", fontSize:12, fontStyle:"italic", border:"1px dashed var(--border)" },
  closeBtn: { background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, width:30, height:30, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-sub)" },
};

const css = `
  .num-btn { width:38px; height:38px; border-radius:9px; border:1.5px solid var(--border); background:white; color:var(--text-sub); font-size:15px; font-weight:700; cursor:pointer; transition:all 0.15s; font-family:'DM Sans',sans-serif; }
  .num-btn:hover { border-color:var(--green); color:var(--green); }
  .num-btn.active { background:var(--green); border-color:var(--green); color:white; }
  .bracket-clickable { cursor:pointer; transition:transform 0.15s, box-shadow 0.15s; }
  .bracket-clickable:hover { transform:translateY(-2px); box-shadow:var(--shadow-md); }
  @media(max-width:768px){ .bracket-row{ grid-template-columns:1fr !important; } }
`;