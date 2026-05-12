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
export default function FichaGenerator({ session, liga }) {
  const [jornadas,    setJornadas]   = useState([]);
  const [jornadaSel,  setJornadaSel] = useState(null);
  const [fichasData,  setFichasData] = useState([]);
  const [loading,     setLoading]    = useState(false);
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

  const cargarJornadas = async () => {
    const data = await db(`/jornadas?liga_id=eq.${liga.id}&order=numero`, token);
    setJornadas(data || []);
    if (data?.length > 0) setJornadaSel(data[0].id);
  };

  const generarFichas = async () => {
    if (!jornadaSel) return showToast("Selecciona una jornada", "err");
    setLoading(true);
    setFichasData([]);
    try {
      const partidos = await db(
        `/partidos?jornada_id=eq.${jornadaSel}` +
        `&select=*,jornadas(id,numero,fecha)` +
        `,equipos_local:equipos!partidos_equipo_local_id_fkey(id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url)` +
        `,equipos_visitante:equipos!partidos_equipo_visitante_id_fkey(id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url)` +
        `&order=cancha_numero`,
        token
      );

      if (!partidos?.length) {
        showToast("Esta jornada no tiene partidos generados aún", "err");
        setLoading(false);
        return;
      }

      const equipoIds = [...new Set(partidos.flatMap(p => [p.equipo_local_id, p.equipo_visitante_id].filter(Boolean)))];

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

      setFichasData(partidos.map(p => ({
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

        {/* Cabecera */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginBottom: 4, letterSpacing: -0.5 }}>
            📄 Generador de fichas
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            {liga.nombre} · Genera e imprime las fichas de cada partido
          </p>
        </div>

        {/* Selector de jornada */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 10 }}>
            Selecciona la jornada
          </label>
          {jornadas.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No hay jornadas generadas aún en esta liga.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {jornadas.map(j => (
                <button key={j.id}
                  onClick={() => { setJornadaSel(j.id); setFichasData([]); }}
                  style={{
                    padding: "8px 16px", cursor: "pointer", fontSize: 13,
                    border: `2px solid ${jornadaSel === j.id ? "#4f8f2f" : "var(--border)"}`,
                    borderRadius: 10,
                    background: jornadaSel === j.id ? "#f0fdf4" : "white",
                    color: jornadaSel === j.id ? "#4f8f2f" : "var(--text)",
                    fontWeight: jornadaSel === j.id ? 700 : 500,
                    transition: "all 0.15s",
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

        {/* Botones de acción */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <button
            onClick={generarFichas}
            disabled={loading || !jornadaSel}
            style={{
              background: loading ? "#9ca3af" : "#4f8f2f",
              color: "white", border: "none", borderRadius: 10,
              padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer",
              minHeight: 44, transition: "background 0.15s",
            }}>
            {loading ? "Cargando datos..." : "📄 Generar fichas"}
          </button>

          {fichasData.length > 0 && (
            <button onClick={imprimir}
              style={{
                background: "#1d4ed8", color: "white", border: "none", borderRadius: 10,
                padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer",
                minHeight: 44, transition: "background 0.15s",
              }}>
              💾 Guardar PDF
            </button>
          )}
        </div>

        {fichasData.length > 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 4 }}>
            {fichasData.length} {fichasData.length === 1 ? "ficha generada" : "fichas generadas"} ·{" "}
            {fichasData.length} {fichasData.length === 1 ? "página" : "páginas"} en el documento ·{" "}
            Jornada {jornadaActual?.numero} · {fmtFecha(jornadaActual?.fecha)}
          </p>
        )}

        {fichasData.length > 0 && (
          <p style={{ color: "#ca8a04", fontSize: 11, background: "#fffbeb", border: "1px solid #fde68a", padding: "6px 12px", borderRadius: 6, marginBottom: 0, display: "inline-block" }}>
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
    </div>
  );
}
