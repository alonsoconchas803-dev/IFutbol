import { useState, useEffect } from "react";
import JerseySVG from "../components/JerseySVG";
import IFutbolLogo from "../components/IFutbolLogo";

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

const db = async (path, token) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) return [];
  return res.json();
};

const FILAS = 17;
const pad = (arr) => { const r = [...(arr || [])]; while (r.length < FILAS) r.push(null); return r; };
const fmtFecha = (s) => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const fmtHora  = (s) => s ? s.substring(0, 5) : "—";

// ─────────────────────────────────────────────────────────────────
// CSS DE IMPRESIÓN — inyectado globalmente
// ─────────────────────────────────────────────────────────────────
const PRINT_CSS = `
  @page { size: letter portrait; margin: 7mm; }

  @media print {
    body * { visibility: hidden !important; }
    #ifb-fichas-root, #ifb-fichas-root * {
      visibility: visible !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    #ifb-fichas-root {
      position: absolute !important;
      top: 0 !important; left: 0 !important; right: 0 !important;
      background: white !important;
    }
    .ifb-ficha-pagina {
      page-break-after: always;
      box-shadow: none !important;
      border: none !important;
      border-radius: 0 !important;
      margin: 0 !important;
    }
    .ifb-ficha-pagina:last-child { page-break-after: avoid; }
  }

  @media screen {
    #ifb-fichas-root { margin-top: 24px; }
    .ifb-ficha-pagina {
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.10);
      margin: 0 auto 32px;
      max-width: 820px;
      overflow: hidden;
    }
  }
`;

// ─────────────────────────────────────────────────────────────────
// FICHA INDIVIDUAL
// ─────────────────────────────────────────────────────────────────
function FichaImprimible({ partido, jugadoresLocal, jugadoresVisitante, liga, isLast }) {
  const jornada = partido.jornadas;
  const eqL = partido.equipos_local;
  const eqV = partido.equipos_visitante;
  const jLocal = pad(jugadoresLocal);
  const jVisit = pad(jugadoresVisitante);

  const COL  = "5mm 6.5mm 8mm 1fr 17mm 5.5mm 6mm";
  const FILA = {
    display: "grid", gridTemplateColumns: COL,
    alignItems: "center", gap: "0 1mm",
    borderBottom: "0.3pt solid #e5e7eb",
    minHeight: "7mm", padding: "0.4mm 1.5mm",
    boxSizing: "border-box",
  };
  const FILA_H = {
    ...FILA, fontWeight: 700, fontSize: "5.5pt",
    color: "#6b7280", background: "#f9fafb",
    minHeight: "5.5mm", borderBottom: "0.8pt solid #d1d5db",
  };

  const Fila = ({ j, idx, color }) => {
    const bg = idx % 2 === 0 ? "white" : "#fafafa";
    if (!j) return (
      <div style={{ ...FILA, background: bg, fontSize: "6pt" }}>
        <span style={{ color: "#d1d5db", textAlign: "center" }}>{idx + 1}</span>
        <span /><span />
        <span style={{ borderBottom: "0.3pt dashed #d1d5db", height: "0.3mm", display: "block", alignSelf: "center" }} />
        <span /><span />
        <span style={{ border: "0.7pt solid #c4c4c4", width: "4.5mm", height: "4.5mm", display: "block", borderRadius: "1mm" }} />
      </div>
    );
    return (
      <div style={{ ...FILA, background: bg, fontSize: "6pt" }}>
        <span style={{ color: "#9ca3af", textAlign: "center" }}>{idx + 1}</span>
        <span style={{ fontWeight: 800, color: color, textAlign: "center", fontSize: "7pt" }}>{j.dorsal ?? "—"}</span>
        <span style={{ display: "flex", justifyContent: "center" }}>
          {j.jugadores?.foto_url
            ? <img src={j.jugadores.foto_url} style={{ width: "6.5mm", height: "6.5mm", borderRadius: "50%", objectFit: "cover", display: "block" }} alt="" loading="lazy" />
            : <span style={{ width: "6.5mm", height: "6.5mm", borderRadius: "50%", background: color + "28", border: `0.5pt solid ${color}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5.5pt", fontWeight: 800, color }}>
                {j.dorsal ?? "?"}
              </span>
          }
        </span>
        <span style={{ overflow: "hidden", lineHeight: 1.2 }}>
          <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {j.jugadores?.nombre_completo ?? "—"}
          </div>
          {j.nombre_camiseta && (
            <div style={{ fontSize: "5pt", color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {j.nombre_camiseta.toUpperCase()}
            </div>
          )}
        </span>
        <span style={{ fontSize: "5.5pt", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {j.jugadores?.numero_afiliado ?? "—"}
        </span>
        <span style={{ border: "0.7pt solid #9ca3af", width: "4mm", height: "4mm", display: "block", margin: "0 auto", borderRadius: "0.5mm" }} />
        <span style={{ border: "0.7pt solid #9ca3af", width: "4.5mm", height: "4.5mm", display: "block", margin: "0 auto", borderRadius: "0.5mm" }} />
      </div>
    );
  };

  const columnaHeader = (color) => (
    <div style={FILA_H}>
      <span style={{ textAlign: "center" }}>#</span>
      <span style={{ textAlign: "center" }}>N°</span>
      <span style={{ textAlign: "center" }}>Foto</span>
      <span>Nombre / Camiseta</span>
      <span>Afiliado</span>
      <span style={{ textAlign: "center" }}>☐</span>
      <span style={{ textAlign: "center" }}>⚽</span>
    </div>
  );

  return (
    <div className="ifb-ficha-pagina" style={{
      fontFamily: "Arial, sans-serif",
      pageBreakAfter: isLast ? "avoid" : "always",
      minHeight: "262mm",
      display: "flex",
      flexDirection: "column",
    }}>

      {/* ── ENCABEZADO ── */}
      <div style={{ display: "flex", background: "white", color: "#111827", alignItems: "stretch", borderBottom: "2.5pt solid #4f8f2f" }}>
        <div style={{ padding: "3mm 4mm", display: "flex", alignItems: "center", gap: "2mm", borderRight: "0.5pt solid #e5e7eb", flexShrink: 0 }}>
          <IFutbolLogo color="#4f8f2f" height={14} />
        </div>
        <div style={{ flex: 1, padding: "2.5mm 4mm" }}>
          <div style={{ fontSize: "8.5pt", fontWeight: 800, lineHeight: 1.2, color: "#111827" }}>{liga?.nombre}</div>
          <div style={{ fontSize: "7pt", color: "#6b7280", marginTop: "0.5mm" }}>
            {liga?.canchas?.nombre || "Unidad Deportiva"}
          </div>
        </div>
        <div style={{ padding: "2.5mm 4mm", textAlign: "right", borderLeft: "0.5pt solid #e5e7eb", flexShrink: 0 }}>
          <div style={{ fontSize: "8pt", fontWeight: 800, color: "#3B6D11" }}>Jornada {jornada?.numero ?? "—"}</div>
          <div style={{ fontSize: "6.5pt", color: "#6b7280", marginTop: "0.5mm" }}>📅 {fmtFecha(jornada?.fecha)}</div>
          <div style={{ fontSize: "6.5pt", color: "#6b7280" }}>⏰ {fmtHora(partido.hora)}  ·  Campo {partido.cancha_numero ?? "—"}</div>
        </div>
      </div>

      {/* ── MARCADOR ── */}
      <div style={{ display: "flex", alignItems: "center", padding: "4mm 6mm", borderBottom: "0.8pt solid #e5e7eb", gap: "3mm", background: "white" }}>
        <div style={{ flex: 1, textAlign: "right" }}>
          <span style={{ fontSize: "10pt", fontWeight: 900, color: "#111827" }}>{eqL?.nombre}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5mm", flexShrink: 0 }}>
          <span style={{ border: "1.5pt solid #111827", width: "13mm", height: "13mm", display: "inline-block", borderRadius: "2mm" }} />
          <span style={{ fontSize: "14pt", fontWeight: 900, color: "#111827", lineHeight: 1 }}>:</span>
          <span style={{ border: "1.5pt solid #111827", width: "13mm", height: "13mm", display: "inline-block", borderRadius: "2mm" }} />
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <span style={{ fontSize: "10pt", fontWeight: 900, color: "#111827" }}>{eqV?.nombre}</span>
        </div>
      </div>

      {/* ── CABECERAS DE EQUIPO ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "0.8pt solid #e5e7eb" }}>
        <div style={{ padding: "2mm 3mm", display: "flex", alignItems: "center", gap: "3mm", borderRight: "0.5pt solid #e5e7eb", borderTop: `3pt solid ${eqL?.color_playera || "#4f8f2f"}` }}>
          <JerseySVG diseno={eqL?.diseno_camiseta || "solido"} color1={eqL?.color_playera || "#4f8f2f"} color2={eqL?.color_camiseta_2 || "#fff"} size={22} />
          <span style={{ fontSize: "8pt", fontWeight: 800, color: "#111827" }}>{eqL?.nombre}</span>
        </div>
        <div style={{ padding: "2mm 3mm", display: "flex", alignItems: "center", gap: "3mm", justifyContent: "flex-end", borderTop: `3pt solid ${eqV?.color_playera || "#6b7280"}` }}>
          <span style={{ fontSize: "8pt", fontWeight: 800, color: "#111827" }}>{eqV?.nombre}</span>
          <JerseySVG diseno={eqV?.diseno_camiseta || "solido"} color1={eqV?.color_playera || "#6b7280"} color2={eqV?.color_camiseta_2 || "#fff"} size={22} />
        </div>
      </div>

      {/* ── TABLA DE JUGADORES ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ borderRight: "1pt solid #e5e7eb" }}>
          {columnaHeader(eqL?.color_playera || "#4f8f2f")}
          {jLocal.map((j, i) => <Fila key={i} j={j} idx={i} color={eqL?.color_playera || "#4f8f2f"} />)}
        </div>
        <div>
          {columnaHeader(eqV?.color_playera || "#6b7280")}
          {jVisit.map((j, i) => <Fila key={i} j={j} idx={i} color={eqV?.color_playera || "#6b7280"} />)}
        </div>
      </div>

      {/* ── FALTAS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "0.8pt solid #e5e7eb" }}>
        <div style={{ padding: "2mm 3mm", display: "flex", alignItems: "center", gap: "3mm", borderRight: "0.5pt solid #e5e7eb" }}>
          <span style={{ fontSize: "6.5pt", fontWeight: 600, color: "#374151" }}>Faltas cometidas:</span>
          <span style={{ border: "0.7pt solid #9ca3af", width: "14mm", height: "6mm", display: "inline-block", borderRadius: "1mm" }} />
        </div>
        <div style={{ padding: "2mm 3mm", display: "flex", alignItems: "center", gap: "3mm" }}>
          <span style={{ fontSize: "6.5pt", fontWeight: 600, color: "#374151" }}>Faltas cometidas:</span>
          <span style={{ border: "0.7pt solid #9ca3af", width: "14mm", height: "6mm", display: "inline-block", borderRadius: "1mm" }} />
        </div>
      </div>

      {/* ── PIE: OBSERVACIONES + FIRMA ── */}
      <div style={{ padding: "2.5mm 4mm", borderTop: "0.8pt solid #e5e7eb", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: "6.5pt", fontWeight: 700, color: "#374151", marginBottom: "2mm" }}>Observaciones:</div>

        {/* Renglones que se estiran para llenar el espacio disponible */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-around", paddingBottom: "2mm" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ borderBottom: "0.4pt solid #c4c4c4" }} />
          ))}
        </div>

        <div style={{ display: "flex", gap: "8mm", marginTop: "2mm" }}>
          <div style={{ flex: 2 }}>
            <div style={{ borderBottom: "0.7pt solid #374151", marginBottom: "1mm" }} />
            <span style={{ fontSize: "6pt", color: "#6b7280" }}>Nombre del árbitro</span>
          </div>
          <div style={{ flex: 1.5 }}>
            <div style={{ borderBottom: "0.7pt solid #374151", marginBottom: "1mm" }} />
            <span style={{ fontSize: "6pt", color: "#6b7280" }}>Firma del árbitro</span>
          </div>
          <div style={{ flex: 1.5 }}>
            <div style={{ borderBottom: "0.7pt solid #374151", marginBottom: "1mm" }} />
            <span style={{ fontSize: "6pt", color: "#6b7280" }}>Firma delegado A</span>
          </div>
          <div style={{ flex: 1.5 }}>
            <div style={{ borderBottom: "0.7pt solid #374151", marginBottom: "1mm" }} />
            <span style={{ fontSize: "6pt", color: "#6b7280" }}>Firma delegado B</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────
export default function FichaGenerator({ session, liga, miUnidad, headerExtra }) {
  const [jornadas,    setJornadas]   = useState([]);
  const [jornadaSel,  setJornadaSel] = useState(null);
  const [resumen,     setResumen]    = useState([]);   // partidos + ficha (siempre auto-cargados)
  const [fichasData,  setFichasData] = useState([]);   // datos para imprimir templates en blanco
  const [loading,     setLoading]    = useState(false);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [fichaModalPartido, setFichaModalPartido] = useState(null);
  const [toast,       setToast]      = useState(null);
  const token = session?.access_token;

  const showToast = (msg, tipo = "ok") => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    // Inyectar CSS de impresión al montar
    const el = document.createElement("style");
    el.id = "ifb-print-css";
    el.innerHTML = PRINT_CSS;
    document.head.appendChild(el);
    return () => document.getElementById("ifb-print-css")?.remove();
  }, []);

  useEffect(() => { if (liga?.id) cargarJornadas(); }, [liga?.id]);

  // Al seleccionar una jornada: cargar automáticamente partidos + fichas guardadas
  useEffect(() => {
    if (jornadaSel) cargarResumenJornada();
    else setResumen([]);
    setFichasData([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jornadaSel]);

  const cargarJornadas = async () => {
    const data = await db(`/jornadas?liga_id=eq.${liga.id}&order=numero`, token);
    setJornadas(data || []);
    if (data?.length > 0) setJornadaSel(data[0].id);
  };

  // Carga partidos de la jornada seleccionada con su ficha_partido (si existe)
  const cargarResumenJornada = async () => {
    setCargandoResumen(true);
    setResumen([]);
    try {
      const partidos = await db(
        `/partidos?jornada_id=eq.${jornadaSel}` +
        `&select=*,jornadas(id,numero,fecha)` +
        `,equipos_local:equipos!partidos_equipo_local_id_fkey(id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url)` +
        `,equipos_visitante:equipos!partidos_equipo_visitante_id_fkey(id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url)` +
        `,ficha_partido(id,goles_local,goles_visitante,goleadores,asistencia,faltas_local,faltas_visitante,observaciones,cerrada)` +
        `&order=cancha_numero,hora`,
        token
      );
      // PostgREST puede devolver ficha_partido como objeto o array según relación.
      const conFicha = (partidos || []).map(p => ({
        ...p,
        ficha: Array.isArray(p.ficha_partido) ? (p.ficha_partido[0] || null) : (p.ficha_partido || null),
      }));
      setResumen(conFicha);
    } catch (e) { showToast(e.message, "err"); }
    setCargandoResumen(false);
  };

  const generarFichas = async () => {
    if (!jornadaSel) return showToast("Selecciona una jornada", "err");
    setLoading(true);
    setFichasData([]);
    try {
      if (!resumen.length) {
        showToast("Esta jornada no tiene partidos generados aún", "err");
        setLoading(false);
        return;
      }

      const equipoIds = [...new Set(resumen.flatMap(p => [p.equipo_local_id, p.equipo_visitante_id].filter(Boolean)))];

      const jugadores = await db(
        `/jugador_equipo?equipo_id=in.(${equipoIds.join(",")})&liga_id=eq.${liga.id}` +
        `&select=equipo_id,dorsal,nombre_camiseta,jugadores(nombre_completo,foto_url,numero_afiliado)` +
        `&order=equipo_id,dorsal`,
        token
      );

      const porEquipo = {};
      (jugadores || []).forEach(j => {
        if (!porEquipo[j.equipo_id]) porEquipo[j.equipo_id] = [];
        porEquipo[j.equipo_id].push(j);
      });

      setFichasData(resumen.map(p => ({
        partido: p,
        jugadoresLocal:     porEquipo[p.equipo_local_id]     || [],
        jugadoresVisitante: porEquipo[p.equipo_visitante_id] || [],
      })));
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const imprimir = () => {
    setTimeout(() => window.print(), 150);
  };

  const jornadaActual = jornadas.find(j => j.id === jornadaSel);
  const totalCerradas = resumen.filter(p => p.ficha?.cerrada).length;
  const totalPartidos = resumen.length;

  if (!liga) return (
    <div style={{ color: "var(--text-muted)", padding: 32, textAlign: "center" }}>
      Selecciona una liga para generar fichas.
    </div>
  );

  return (
    <div>
      {/* CONTROLES — se ocultan al imprimir */}
      <div className="ifb-no-print">
        {toast && (
          <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: toast.tipo === "err" ? "#fef2f2" : "#f0fdf4", color: toast.tipo === "err" ? "#dc2626" : "#16a34a", border: `1px solid ${toast.tipo === "err" ? "#fecaca" : "#bbf7d0"}` }}>
            {toast.msg}
          </div>
        )}

        {/* ── HERO COMBINADO: unidad + título "Generador de fichas" ── */}
        <div style={hs.heroCard}>
          <div style={hs.heroGlow} />
          <div style={hs.heroInner}>
            {miUnidad && (
              <div style={hs.heroUnitRow}>
                <div style={hs.heroUnitLogo}>
                  {miUnidad.logo_url
                    ? <img src={miUnidad.logo_url} alt={miUnidad.nombre} style={hs.heroUnitLogoImg} />
                    : <span style={{ fontSize: 36 }}>🏟️</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={hs.heroUnitLabel}>UNIDAD DEPORTIVA</div>
                  <div style={hs.heroUnitName}>{miUnidad.nombre}</div>
                </div>
              </div>
            )}
            {miUnidad && <div style={hs.heroDivider} />}
            <div style={hs.heroTitleRow}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>📄</span>
              <h2 style={hs.heroTitle}>Generador de fichas</h2>
            </div>
          </div>
        </div>

        {/* Selector de torneos: aparece bajo el hero (intercambio de orden con la pestaña Fichas) */}
        {headerExtra}

        {/* Selector de jornada */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-sub)", display: "block", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.7 }}>
            Selecciona la jornada
          </label>
          {jornadas.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No hay jornadas generadas aún en esta liga.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {jornadas.map(j => (
                <button key={j.id}
                  onClick={() => setJornadaSel(j.id)}
                  style={{
                    padding: "8px 14px", cursor: "pointer", fontSize: 13,
                    border: `2px solid ${jornadaSel === j.id ? "#4f8f2f" : "var(--border)"}`,
                    borderRadius: 10,
                    background: jornadaSel === j.id ? "#f0fdf4" : "white",
                    color: jornadaSel === j.id ? "#4f8f2f" : "var(--text)",
                    fontWeight: jornadaSel === j.id ? 700 : 500,
                    minHeight: 44,
                  }}>
                  Jornada {j.numero}
                  {j.fecha && <span style={{ fontSize: 11, marginLeft: 6, color: jornadaSel === j.id ? "#4f8f2f99" : "var(--text-muted)" }}>
                    {fmtFecha(j.fecha)}
                  </span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── RESUMEN DE LA JORNADA: muestra fichas cerradas como se guardaron ── */}
        {cargandoResumen && (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Cargando partidos…</div>
        )}

        {!cargandoResumen && jornadaSel && resumen.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13, background: "#f9fafb", border: "1px solid var(--border)", borderRadius: 12 }}>
            Esta jornada aún no tiene partidos.
          </div>
        )}

        {!cargandoResumen && resumen.length > 0 && (
          <>
            {/* Tira de estado */}
            <div style={hs.statusBar}>
              <span style={hs.statusBadge(totalCerradas === totalPartidos && totalCerradas > 0)}>
                {totalCerradas === totalPartidos && totalCerradas > 0 ? "✓ Jornada cerrada" : `${totalCerradas} / ${totalPartidos} fichas cerradas`}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                Jornada {jornadaActual?.numero} · {fmtFecha(jornadaActual?.fecha)}
              </span>
            </div>

            {/* Lista de partidos */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              {resumen.map(p => <PartidoCard key={p.id} partido={p} onVerFicha={setFichaModalPartido} />)}
            </div>
          </>
        )}

        {/* Botones de acción */}
        {resumen.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <button
              onClick={generarFichas}
              disabled={loading || !jornadaSel}
              style={{
                background: loading ? "#9ca3af" : "#4f8f2f",
                color: "white", border: "none", borderRadius: 10,
                padding: "11px 18px", fontSize: 13, fontWeight: 700, cursor: loading ? "default" : "pointer",
                minHeight: 44,
              }}>
              {loading ? "Cargando datos..." : "🖨️ Imprimir fichas en blanco"}
            </button>

            {fichasData.length > 0 && (
              <button onClick={imprimir}
                style={{
                  background: "#1d4ed8", color: "white", border: "none", borderRadius: 10,
                  padding: "11px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                  minHeight: 44,
                }}>
                💾 Guardar PDF
              </button>
            )}
          </div>
        )}

        {fichasData.length > 0 && (
          <p style={{ color: "#ca8a04", fontSize: 11, background: "#fffbeb", border: "1px solid #fde68a", padding: "6px 12px", borderRadius: 6, marginTop: 8, marginBottom: 0, display: "inline-block" }}>
            💡 En el diálogo de impresión activa "Gráficos en segundo plano" para que impriman los colores correctamente.
          </p>
        )}
      </div>

      {/* FICHAS — visibles en pantalla y al imprimir */}
      {fichasData.length > 0 && (
        <div id="ifb-fichas-root">
          {fichasData.map((f, i) => (
            <FichaImprimible
              key={f.partido.id}
              partido={f.partido}
              jugadoresLocal={f.jugadoresLocal}
              jugadoresVisitante={f.jugadoresVisitante}
              liga={liga}
              isLast={i === fichasData.length - 1}
            />
          ))}
        </div>
      )}

      {/* MODAL DE FICHA COMPLETA (asistencia, goles, faltas, observaciones) */}
      {fichaModalPartido && (
        <FichaDetalleModal
          partido={fichaModalPartido}
          token={token}
          liga={liga}
          onClose={() => setFichaModalPartido(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TARJETA DE PARTIDO (resumen breve, estilo "partido")
// ─────────────────────────────────────────────────────────────────
function PartidoCard({ partido, onVerFicha }) {
  const f = partido.ficha;
  const cerrada = !!f?.cerrada;
  const eqL = partido.equipos_local;
  const eqV = partido.equipos_visitante;

  return (
    <div style={hs.partidoCard(cerrada)}>
      <div style={hs.partidoTopRow}>
        <div style={hs.partidoMeta}>
          ⏰ {fmtHora(partido.hora)} · Cancha {partido.cancha_numero ?? "—"}
        </div>
        <span style={hs.partidoBadge(cerrada)}>{cerrada ? "✓ Cerrada" : "⏳ Pendiente"}</span>
      </div>

      <div style={hs.marcadorRow}>
        <div style={hs.equipoCol}>
          <JerseySVG
            diseno={eqL?.diseno_camiseta || "solido"}
            color1={eqL?.color_playera || "#3182ce"}
            color2={eqL?.color_camiseta_2 || "#ffffff"}
            escudoUrl={eqL?.escudo_url || null}
            size={44}
          />
          <span style={hs.equipoNombreCol}>{eqL?.nombre || "—"}</span>
        </div>
        <div style={hs.marcadorCentro}>
          {cerrada ? (
            <span style={hs.marcadorTxt}>{f.goles_local ?? 0} <span style={{ opacity: 0.55, margin: "0 4px" }}>·</span> {f.goles_visitante ?? 0}</span>
          ) : (
            <span style={hs.vsTxt}>VS</span>
          )}
        </div>
        <div style={hs.equipoCol}>
          <JerseySVG
            diseno={eqV?.diseno_camiseta || "solido"}
            color1={eqV?.color_playera || "#3182ce"}
            color2={eqV?.color_camiseta_2 || "#ffffff"}
            escudoUrl={eqV?.escudo_url || null}
            size={44}
          />
          <span style={hs.equipoNombreCol}>{eqV?.nombre || "—"}</span>
        </div>
      </div>

      {cerrada && (
        <button style={hs.btnVerFicha} onClick={() => onVerFicha(partido)}>
          📝 Ver ficha
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MODAL: FICHA COMPLETA DEL PARTIDO (lectura)
// ─────────────────────────────────────────────────────────────────
function FichaDetalleModal({ partido, token, liga, onClose }) {
  const [jugadoresLocal, setJugadoresLocal] = useState([]);
  const [jugadoresVisit, setJugadoresVisit] = useState([]);
  const [cargando, setCargando]             = useState(true);

  const f = partido.ficha;
  const eqL = partido.equipos_local;
  const eqV = partido.equipos_visitante;

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const ligaId = liga?.id || partido.jornadas?.liga_id;
        const equipoIds = [eqL?.id, eqV?.id].filter(Boolean);
        if (equipoIds.length === 0) { setCargando(false); return; }
        const data = await db(
          `/jugador_equipo?equipo_id=in.(${equipoIds.join(",")})&liga_id=eq.${ligaId}` +
          `&select=equipo_id,jugador_id,dorsal,nombre_camiseta,jugadores(nombre_completo,numero_afiliado,foto_url)` +
          `&order=equipo_id,dorsal`,
          token
        );
        if (cancelado) return;
        setJugadoresLocal((data || []).filter(j => j.equipo_id === eqL?.id));
        setJugadoresVisit((data || []).filter(j => j.equipo_id === eqV?.id));
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [partido?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const asistenciaSet = new Set(f?.asistencia || []);
  const golesPorJugador = (jugadorId, equipoId) => {
    const g = (f?.goleadores || []).find(x => x.jugador_id === jugadorId && x.equipo === equipoId);
    return g?.goles || 0;
  };

  const renderEquipoLista = (jugadores, equipoId, color) => {
    const presentes = jugadores.filter(j => asistenciaSet.has(j.jugador_id));
    const ausentes  = jugadores.filter(j => !asistenciaSet.has(j.jugador_id));
    return (
      <div style={fd.equipoCol}>
        {presentes.length === 0 && ausentes.length === 0 && (
          <div style={fd.sinJugadores}>Sin jugadores inscritos</div>
        )}
        {presentes.map(j => {
          const goles = golesPorJugador(j.jugador_id, equipoId);
          return (
            <div key={j.jugador_id} style={fd.jugRow}>
              <span style={{ ...fd.jugDorsal, background: color }}>{j.dorsal || "—"}</span>
              <span style={fd.jugNombre}>{j.jugadores?.nombre_completo || "—"}</span>
              <span style={fd.jugAsist} title="Presente">✓</span>
              {goles > 0 && <span style={fd.jugGoles}>⚽ {goles}</span>}
            </div>
          );
        })}
        {ausentes.map(j => (
          <div key={j.jugador_id} style={{ ...fd.jugRow, opacity: 0.55 }}>
            <span style={{ ...fd.jugDorsal, background: "#d1d5db" }}>{j.dorsal || "—"}</span>
            <span style={{ ...fd.jugNombre, color: "#9ca3af" }}>{j.jugadores?.nombre_completo || "—"}</span>
            <span style={{ ...fd.jugAsist, color: "#d1d5db" }} title="Ausente">○</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={fd.overlay} onClick={onClose}>
      <div style={fd.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={fd.header}>
          <div style={{ minWidth: 0 }}>
            <div style={fd.headerLabel}>FICHA DE PARTIDO</div>
            <div style={fd.headerMeta}>
              Jornada {partido.jornadas?.numero ?? "—"} · ⏰ {fmtHora(partido.hora)} · Cancha {partido.cancha_numero ?? "—"}
            </div>
          </div>
          <button style={fd.closeBtn} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* Marcador grande */}
        <div style={fd.marcadorRow}>
          <div style={fd.eqCol}>
            <JerseySVG
              diseno={eqL?.diseno_camiseta || "solido"}
              color1={eqL?.color_playera || "#3182ce"}
              color2={eqL?.color_camiseta_2 || "#ffffff"}
              escudoUrl={eqL?.escudo_url || null}
              size={52}
            />
            <span style={fd.eqNombreCol}>{eqL?.nombre}</span>
          </div>
          <div style={fd.marcadorBig}>
            <span style={{ color: (f?.goles_local ?? 0) > (f?.goles_visitante ?? 0) ? "#4f8f2f" : "#111827" }}>{f?.goles_local ?? 0}</span>
            <span style={{ color: "#9ca3af", margin: "0 8px" }}>·</span>
            <span style={{ color: (f?.goles_visitante ?? 0) > (f?.goles_local ?? 0) ? "#4f8f2f" : "#111827" }}>{f?.goles_visitante ?? 0}</span>
          </div>
          <div style={fd.eqCol}>
            <JerseySVG
              diseno={eqV?.diseno_camiseta || "solido"}
              color1={eqV?.color_playera || "#3182ce"}
              color2={eqV?.color_camiseta_2 || "#ffffff"}
              escudoUrl={eqV?.escudo_url || null}
              size={52}
            />
            <span style={fd.eqNombreCol}>{eqV?.nombre}</span>
          </div>
        </div>

        {/* Listas de jugadores con asistencia y goles */}
        <div style={fd.sectionLabel}>👥 Asistencia y goles</div>
        {cargando ? (
          <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>Cargando...</div>
        ) : (
          <div style={fd.equiposGrid}>
            <div>
              <div style={fd.equipoCabecera}>
                <JerseySVG
                  diseno={eqL?.diseno_camiseta || "solido"}
                  color1={eqL?.color_playera || "#3182ce"}
                  color2={eqL?.color_camiseta_2 || "#ffffff"}
                  escudoUrl={eqL?.escudo_url || null}
                  size={22}
                />
                <span style={fd.equipoCabeceraNombre}>{eqL?.nombre}</span>
              </div>
              {renderEquipoLista(jugadoresLocal, eqL?.id, eqL?.color_playera || "#3182ce")}
            </div>
            <div>
              <div style={fd.equipoCabecera}>
                <JerseySVG
                  diseno={eqV?.diseno_camiseta || "solido"}
                  color1={eqV?.color_playera || "#3182ce"}
                  color2={eqV?.color_camiseta_2 || "#ffffff"}
                  escudoUrl={eqV?.escudo_url || null}
                  size={22}
                />
                <span style={fd.equipoCabeceraNombre}>{eqV?.nombre}</span>
              </div>
              {renderEquipoLista(jugadoresVisit, eqV?.id, eqV?.color_playera || "#3182ce")}
            </div>
          </div>
        )}

        {/* Faltas */}
        <div style={fd.faltasRow}>
          <div style={fd.faltasBox}>
            <div style={fd.faltasLabel}>🟨 Faltas {eqL?.nombre}</div>
            <div style={fd.faltasNum}>{f?.faltas_local ?? 0}</div>
          </div>
          <div style={fd.faltasBox}>
            <div style={fd.faltasLabel}>🟨 Faltas {eqV?.nombre}</div>
            <div style={fd.faltasNum}>{f?.faltas_visitante ?? 0}</div>
          </div>
        </div>

        {/* Observaciones */}
        {f?.observaciones && (
          <div style={fd.obsBox}>
            <div style={fd.obsLabel}>📝 Observaciones del árbitro</div>
            <div style={fd.obsTxt}>{f.observaciones}</div>
          </div>
        )}

        <button style={fd.btnCerrar} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

// Estilos del modal de ficha detallada
const fd = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, overflowY: "auto", backdropFilter: "blur(4px)" },
  modal: { background: "#fff", borderRadius: 16, padding: 18, width: "100%", maxWidth: 440, maxHeight: "calc(100vh - 32px)", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.16)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: "2px solid #eaf4e0" },
  headerLabel: { fontSize: 10, fontWeight: 800, color: "#4f8f2f", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 },
  headerMeta: { fontSize: 12, color: "#6b7280" },
  closeBtn: { background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 14, color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  marcadorRow: { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #f3f4f6" },
  eqBlock: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 }, // legacy
  eqDot: { width: 11, height: 11, borderRadius: "50%", flexShrink: 0 },     // legacy
  eqNombre: { fontSize: 13, fontWeight: 800, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }, // legacy
  // Columna jersey + nombre (centrados, modal)
  eqCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 0 },
  eqNombreCol: { fontSize: 12, fontWeight: 800, color: "#111827", textAlign: "center", maxWidth: "100%", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word", lineHeight: 1.2 },
  marcadorBig: { fontSize: 28, fontWeight: 900, letterSpacing: -1, lineHeight: 1, flexShrink: 0, padding: "0 6px" },
  sectionLabel: { fontSize: 11, fontWeight: 800, color: "#4f8f2f", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
  equiposGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 },
  equipoCabecera: { display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 6, background: "#f9fafb", marginBottom: 6 },
  equipoCabeceraNombre: { fontSize: 11, fontWeight: 800, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  equipoCol: { display: "flex", flexDirection: "column", gap: 4 },
  jugRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "4px 6px", borderRadius: 6, background: "#fff", border: "1px solid #f3f4f6", minWidth: 0 },
  jugDorsal: { width: 20, height: 20, borderRadius: 5, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  jugNombre: { fontSize: 11, fontWeight: 600, color: "#111827", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  jugAsist: { fontSize: 13, color: "#4f8f2f", fontWeight: 900, flexShrink: 0 },
  jugGoles: { fontSize: 10, fontWeight: 800, color: "#4f8f2f", flexShrink: 0 },
  sinJugadores: { fontSize: 11, color: "#9ca3af", fontStyle: "italic", textAlign: "center", padding: 6 },
  faltasRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 },
  faltasBox: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 9, padding: "8px 10px", textAlign: "center" },
  faltasLabel: { fontSize: 10, fontWeight: 700, color: "#92400e", letterSpacing: 0.4, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  faltasNum: { fontSize: 18, fontWeight: 900, color: "#92400e", lineHeight: 1 },
  obsBox: { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", marginBottom: 14 },
  obsLabel: { fontSize: 10, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 },
  obsTxt: { fontSize: 12, color: "#111827", lineHeight: 1.4, whiteSpace: "pre-wrap" },
  btnCerrar: { width: "100%", background: "#4f8f2f", color: "#fff", border: "none", borderRadius: 10, padding: "11px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer" },
};

// ─────────────────────────────────────────────────────────────────
// ESTILOS DEL HERO Y TARJETAS DE RESUMEN
// ─────────────────────────────────────────────────────────────────
const hs = {
  // Hero combinado
  heroCard: { position: "relative", overflow: "hidden", background: "linear-gradient(145deg, #4f8f2f 0%, #3a6b22 100%)", borderRadius: "var(--radius-lg, 20px)", padding: "16px 16px 14px", marginBottom: 16, boxShadow: "0 6px 20px rgba(79,143,47,0.28)", color: "#fff" },
  heroGlow: { position: "absolute", top: -30, right: -30, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(127,191,77,0.45) 0%, rgba(127,191,77,0) 70%)", pointerEvents: "none" },
  heroInner: { position: "relative", zIndex: 1 },
  heroUnitRow: { display: "flex", alignItems: "center", gap: 13, marginBottom: 12 },
  heroUnitLogo: { width: 68, height: 68, borderRadius: 15, background: "rgba(255,255,255,0.20)", border: "2px solid rgba(255,255,255,0.42)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, boxShadow: "0 4px 14px rgba(0,0,0,0.22)" },
  heroUnitLogoImg: { width: "100%", height: "100%", objectFit: "cover" },
  heroUnitLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 1.1, color: "rgba(255,255,255,0.82)", textTransform: "uppercase", marginBottom: 3 },
  heroUnitName: { fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: -0.5, lineHeight: 1.15, textShadow: "0 1px 2px rgba(0,0,0,0.22)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  heroDivider: { height: 1, background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.40) 50%, rgba(255,255,255,0) 100%)", margin: "4px 0 12px" },
  heroTitleRow: { display: "flex", alignItems: "center", gap: 7 },
  heroTitle: { fontSize: 14, fontWeight: 800, letterSpacing: -0.3, color: "#fff", margin: 0, lineHeight: 1.15 },

  // Status bar
  statusBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  statusBadge: (allClosed) => ({
    fontSize: 11.5, fontWeight: 800, padding: "5px 12px", borderRadius: 9999,
    background: allClosed ? "#dcfce7" : "#fef3c7",
    color: allClosed ? "#15803d" : "#92400e",
    border: `1px solid ${allClosed ? "#86efac" : "#fde68a"}`,
  }),

  // Tarjeta de partido
  partidoCard: (cerrada) => ({
    background: cerrada ? "linear-gradient(180deg, #f0fdf4 0%, #ffffff 60%)" : "#ffffff",
    border: `1px solid ${cerrada ? "#c3e6a3" : "var(--border, #e5e7eb)"}`,
    borderLeft: `4px solid ${cerrada ? "#4f8f2f" : "#d1d5db"}`,
    borderRadius: 12, padding: "12px 14px",
    boxShadow: cerrada ? "0 2px 8px rgba(79,143,47,0.10)" : "0 1px 3px rgba(0,0,0,0.04)",
  }),
  partidoTopRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  partidoMeta: { fontSize: 11, fontWeight: 600, color: "var(--text-sub, #6b7280)" },
  partidoBadge: (cerrada) => ({
    fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 9999,
    background: cerrada ? "#4f8f2f" : "#fef3c7",
    color: cerrada ? "#fff" : "#92400e",
    border: cerrada ? "none" : "1px solid #fde68a",
  }),
  marcadorRow: { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 },
  equipoBlock: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 }, // legacy
  equipoDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },     // legacy
  equipoNombre: { fontSize: 13, fontWeight: 700, color: "var(--text, #111827)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }, // legacy
  // Columna jersey + nombre (centrados)
  equipoCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 },
  equipoNombreCol: { fontSize: 11.5, fontWeight: 700, color: "var(--text, #111827)", textAlign: "center", maxWidth: "100%", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word", lineHeight: 1.2 },
  marcadorCentro: { flexShrink: 0, padding: "0 10px", minWidth: 70, textAlign: "center" },
  marcadorTxt: { fontSize: 20, fontWeight: 900, color: "#1a1a2e", letterSpacing: -0.5, lineHeight: 1 },
  vsTxt: { fontSize: 11, fontWeight: 800, color: "var(--text-muted, #9ca3af)" },

  // Detalle de ficha cerrada
  detalleBox: { marginTop: 10, paddingTop: 10, borderTop: "1px dashed #c3e6a3" },
  golesGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 },
  golesCol: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
  goleadorRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, minWidth: 0 },
  goleadorGoles: { fontWeight: 800, color: "#4f8f2f", flexShrink: 0 },
  goleadorNombre: { color: "var(--text, #111827)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 },
  sinDatos: { fontSize: 10.5, color: "var(--text-muted, #9ca3af)", fontStyle: "italic" },
  statsRow: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  statChip: { fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 9999, background: "#fff", color: "var(--text-sub, #6b7280)", border: "1px solid #e5e7eb" },
  observacionesBox: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 9, padding: "8px 11px" },
  observacionesLabel: { fontSize: 10, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  observacionesTxt: { fontSize: 11.5, color: "var(--text, #111827)", lineHeight: 1.35, whiteSpace: "pre-wrap" },
  // Botón "Ver ficha" en la tarjeta resumen
  btnVerFicha: { marginTop: 10, width: "100%", background: "#4f8f2f", color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", letterSpacing: 0.2 },
};
