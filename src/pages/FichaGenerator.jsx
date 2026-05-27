import { useState, useEffect } from "react";
import JerseySVG from "../components/JerseySVG";
import IFutbolLogo from "../components/IFutbolLogo";
import PanelSanciones from "../components/PanelSanciones";
import {
  cargarSancionesDelPartido,
  cargarBloqueosActivos,
  insertarSancion,
  eliminarSancionDB,
  textoSancionParaObservaciones,
} from "../lib/sanciones";

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

const db = async (path, token, options = {}) => {
  const method = (options.method || "GET").toUpperCase();
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Prefer solo en mutaciones: pide a PostgREST devolver la fila escrita.
      ...(method !== "GET" ? { Prefer: "return=representation" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    // En GET mantenemos el comportamiento tolerante (lista vacía). En
    // mutaciones lanzamos el error para que el editor pueda mostrarlo.
    if (method === "GET") return [];
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
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
    html, body { margin: 0 !important; padding: 0 !important; }
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
      page-break-inside: avoid;
      break-inside: avoid;
      overflow: hidden !important;
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
// Logo del equipo para el marcador. Si no tiene escudo_url, muestra un círculo
// con el color del equipo y la inicial — así nunca queda un hueco vacío.
function EscudoEquipo({ equipo, size = 14 }) {
  const color = equipo?.color_playera || "#6b7280";
  const inicial = (equipo?.nombre || "?").trim().charAt(0).toUpperCase();
  if (equipo?.escudo_url) {
    return (
      <img src={equipo.escudo_url} alt={equipo.nombre}
        style={{ width: `${size}mm`, height: `${size}mm`, borderRadius: "1.5mm", objectFit: "cover", background: "#fff", border: `0.5pt solid ${color}`, flexShrink: 0 }} />
    );
  }
  return (
    <div style={{ width: `${size}mm`, height: `${size}mm`, borderRadius: "1.5mm", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: `${Math.round(size * 0.55)}pt`, flexShrink: 0 }}>
      {inicial}
    </div>
  );
}

function FichaImprimible({ partido, jugadoresLocal, jugadoresVisitante, liga, miUnidad, isLast }) {
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
      // Carta vertical con @page margin: 7mm deja 265.4mm imprimibles.
      // Usamos altura fija (no minHeight) un poco menor para tener holgura
      // ante variaciones de renderizado del PDF, y overflow:hidden como
      // cinturón de seguridad para que la ficha jamás se parta entre páginas.
      height: "258mm",
      overflow: "hidden",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
    }}>

      {/* ── ENCABEZADO ──
          Izquierda: logo de la unidad.
          Centro: nombre de la unidad (destacado) + nombre del torneo (chico).
          Derecha: bloque de jornada/fecha/cancha, pegado al logo de iFutbol. */}
      <div style={{ display: "flex", background: "white", color: "#111827", alignItems: "stretch", borderBottom: "2.5pt solid #4f8f2f" }}>
        {/* Logo de la unidad (con fallback si no tiene logo cargado) */}
        <div style={{ padding: "2mm 4mm", display: "flex", alignItems: "center", justifyContent: "center", borderRight: "0.5pt solid #e5e7eb", flexShrink: 0, width: "16mm" }}>
          {miUnidad?.logo_url ? (
            <img src={miUnidad.logo_url} alt={miUnidad.nombre || "Unidad"}
              style={{ maxWidth: "14mm", maxHeight: "14mm", objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: "12pt" }}>🏟️</span>
          )}
        </div>
        {/* Bloque central: unidad arriba (destacada), torneo abajo */}
        <div style={{ flex: 1, padding: "2.5mm 4mm" }}>
          <div style={{ fontSize: "9.5pt", fontWeight: 900, lineHeight: 1.2, color: "#111827", letterSpacing: -0.2 }}>
            {miUnidad?.nombre || liga?.canchas?.nombre || "Unidad Deportiva"}
          </div>
          <div style={{ fontSize: "7pt", color: "#6b7280", marginTop: "0.8mm", fontWeight: 600 }}>
            🏆 {liga?.nombre}
          </div>
        </div>
        {/* Bloque jornada (pegado al logo iFutbol).
            Sin borderLeft propio: la única línea visible será la que separa
            la jornada del logo iFutbol (el borderLeft del bloque siguiente). */}
        <div style={{ padding: "2.5mm 3mm", textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "8pt", fontWeight: 800, color: "#3B6D11" }}>Jornada {jornada?.numero ?? "—"}</div>
          <div style={{ fontSize: "6.5pt", color: "#6b7280", marginTop: "0.5mm" }}>📅 {fmtFecha(jornada?.fecha)}</div>
          <div style={{ fontSize: "6.5pt", color: "#6b7280" }}>⏰ {fmtHora(partido.hora)}  ·  Campo {partido.cancha_numero ?? "—"}</div>
        </div>
        {/* Logo iFutbol al extremo derecho */}
        <div style={{ padding: "3mm 4mm", display: "flex", alignItems: "center", borderLeft: "0.5pt solid #e5e7eb", flexShrink: 0 }}>
          <IFutbolLogo color="#4f8f2f" height={14} />
        </div>
      </div>

      {/* ── MARCADOR ──
          Logo a los extremos (izquierda y derecha) con el nombre del equipo
          al lado, mirando hacia el centro donde está el marcador. */}
      <div style={{ display: "flex", alignItems: "center", padding: "4mm 6mm", borderBottom: "0.8pt solid #e5e7eb", gap: "3mm", background: "white" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3mm", minWidth: 0 }}>
          <EscudoEquipo equipo={eqL} />
          <span style={{ fontSize: "10pt", fontWeight: 900, color: "#111827" }}>{eqL?.nombre}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5mm", flexShrink: 0 }}>
          <span style={{ border: "1.5pt solid #111827", width: "13mm", height: "13mm", display: "inline-block", borderRadius: "2mm" }} />
          <span style={{ fontSize: "14pt", fontWeight: 900, color: "#111827", lineHeight: 1 }}>:</span>
          <span style={{ border: "1.5pt solid #111827", width: "13mm", height: "13mm", display: "inline-block", borderRadius: "2mm" }} />
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "3mm", minWidth: 0 }}>
          <span style={{ fontSize: "10pt", fontWeight: 900, color: "#111827" }}>{eqV?.nombre}</span>
          <EscudoEquipo equipo={eqV} />
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
export default function FichaGenerator({ session, liga, miUnidad, headerExtra, readOnly = false, modo = "fichas" }) {
  const [jornadas,    setJornadas]   = useState([]);
  const [jornadaSel,  setJornadaSel] = useState(null);
  const [resumen,     setResumen]    = useState([]);   // partidos + ficha (siempre auto-cargados)
  const [fichasData,  setFichasData] = useState([]);   // datos para imprimir templates en blanco
  const [loading,     setLoading]    = useState(false);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [fichaModalPartido, setFichaModalPartido] = useState(null);
  const [equipos,     setEquipos]    = useState([]);   // para el modal de partido manual
  const [nuevoPartidoOpen, setNuevoPartidoOpen] = useState(false);
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

  const cargarJornadas = async () => {
    const data = await db(`/jornadas?liga_id=eq.${liga.id}&order=numero`, token);
    setJornadas(data || []);
    if (data?.length > 0) setJornadaSel(data[0].id);
  };

  // Equipos activos de la liga — necesarios para los selectores del modal
  // "Añadir partido extra". Solo se cargan cuando el admin opera en modo
  // resultados; en el modo de impresión no hacen falta.
  const cargarEquipos = async () => {
    if (readOnly || modo !== "resultados") return;
    const data = await db(
      `/equipos?liga_id=eq.${liga.id}&activo=eq.true&select=id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url&order=nombre`,
      token
    );
    setEquipos(data || []);
  };

  // Elimina un partido manual cuya ficha aún no se haya cerrado.
  // Los partidos del generador (manual=false) o con ficha cerrada no llegan
  // aquí — el botón solo aparece para los manuales sin cerrar.
  const eliminarPartido = async (partido) => {
    if (!partido?.manual) return;
    if (partido?.ficha?.cerrada) {
      return showToast("No se puede eliminar un partido con ficha cerrada", "err");
    }
    const ok = window.confirm(
      `¿Eliminar el partido ${partido.equipos_local?.nombre} vs ${partido.equipos_visitante?.nombre}?`
    );
    if (!ok) return;
    try {
      // Si tenía borrador de ficha, lo borramos primero para no dejar huérfanos.
      if (partido.ficha?.id) {
        await db(`/ficha_partido?id=eq.${partido.ficha.id}`, token, { method: "DELETE" });
      }
      await db(`/partidos?id=eq.${partido.id}`, token, { method: "DELETE" });
      showToast("Partido eliminado ✓");
      cargarResumenJornada();
    } catch (e) { showToast(e.message, "err"); }
  };

  // Carga partidos de la jornada seleccionada con su ficha_partido (si existe)
  const cargarResumenJornada = async () => {
    setCargandoResumen(true);
    setResumen([]);
    try {
      const partidos = await db(
        `/partidos?jornada_id=eq.${jornadaSel}` +
        `&equipo_local_id=not.is.null&equipo_visitante_id=not.is.null` +
        `&select=*,jornadas(id,numero,fecha)` +
        `,equipos_local:equipos!partidos_equipo_local_id_fkey(id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url)` +
        `,equipos_visitante:equipos!partidos_equipo_visitante_id_fkey(id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url)` +
        `,ficha_partido(id,goles_local,goles_visitante,goleadores,asistencia,faltas_local,faltas_visitante,observaciones,cerrada)` +
        `&order=hora,cancha_numero`,
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

  useEffect(() => {
    if (liga?.id) {
      cargarJornadas();
      cargarEquipos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liga?.id]);

  // Al seleccionar una jornada: cargar automáticamente partidos + fichas guardadas
  useEffect(() => {
    if (jornadaSel) cargarResumenJornada();
    else setResumen([]);
    setFichasData([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jornadaSel]);

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
  // "fichas" = listado compacto sin acciones ni camisetas; "resultados" = gestión
  // con botones de registrar/modificar. El árbitro (readOnly) conserva su vista.
  const esMini = modo === "fichas" && !readOnly;

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

        {/* ── HERO COMPACTO ──
            - Fichas: logo de la unidad + título "Generador de fichas".
            - Resultados: logo + nombre de unidad pequeño arriba + "Resultados" grande.
            En ambos casos el nombre de unidad ya no domina visualmente; el
            apartado activo (lo que hace esa pantalla) es lo que se lee grande. */}
        <div style={hs.heroCard}>
          <div style={hs.heroGlow} />
          <div style={hs.heroInner}>
            <div style={hs.heroHeadRow}>
              {miUnidad && (
                <div style={hs.heroLogoSmall}>
                  {miUnidad.logo_url
                    ? <img src={miUnidad.logo_url} alt={miUnidad.nombre} style={hs.heroUnitLogoImg} />
                    : <span style={{ fontSize: 22 }}>🏟️</span>}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {miUnidad && (
                  <div style={hs.heroUnitLabelSmall}>{miUnidad.nombre}</div>
                )}
                <div style={hs.heroTitleRow}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{modo === "resultados" ? "📋" : "📄"}</span>
                  <h2 style={hs.heroTitleBig}>{modo === "resultados" ? "Resultados" : "Generador de fichas"}</h2>
                </div>
              </div>
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
            <div style={{ display: "flex", flexDirection: "column", gap: esMini ? 6 : 10, marginBottom: 18 }}>
              {resumen.map(p => (
                <PartidoCard
                  key={p.id}
                  partido={p}
                  onVerFicha={setFichaModalPartido}
                  onEliminar={modo === "resultados" && !readOnly ? eliminarPartido : null}
                  readOnly={readOnly}
                  mini={esMini}
                />
              ))}
            </div>

            {/* Botón para crear un partido extra dentro de la misma jornada —
                cubre el caso en que dos equipos faltan y los presentes juegan
                entre sí. Solo visible en modo "Resultados". */}
            {modo === "resultados" && !readOnly && (
              <button
                onClick={() => setNuevoPartidoOpen(true)}
                style={{
                  background: "#fff", color: "#4f8f2f", border: "2px dashed #86c46a",
                  borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 800,
                  cursor: "pointer", width: "100%", marginBottom: 18, minHeight: 48,
                }}>
                ＋ Añadir partido extra a esta jornada
              </button>
            )}
          </>
        )}

        {/* Botones de acción — impresión de fichas en blanco (solo en "Fichas") */}
        {modo !== "resultados" && resumen.length > 0 && (
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

        {modo !== "resultados" && fichasData.length > 0 && (
          <p style={{ color: "#ca8a04", fontSize: 11, background: "#fffbeb", border: "1px solid #fde68a", padding: "6px 12px", borderRadius: 6, marginTop: 8, marginBottom: 0, display: "inline-block" }}>
            💡 En el diálogo de impresión activa "Gráficos en segundo plano" para que impriman los colores correctamente.
          </p>
        )}
      </div>

      {/* FICHAS — visibles en pantalla y al imprimir */}
      {modo !== "resultados" && fichasData.length > 0 && (
        <div id="ifb-fichas-root">
          {fichasData.map((f, i) => (
            <FichaImprimible
              key={f.partido.id}
              partido={f.partido}
              jugadoresLocal={f.jugadoresLocal}
              jugadoresVisitante={f.jugadoresVisitante}
              liga={liga}
              miUnidad={miUnidad}
              isLast={i === fichasData.length - 1}
            />
          ))}
        </div>
      )}

      {/* MODAL: crear partido manual dentro de la jornada seleccionada */}
      {nuevoPartidoOpen && (
        <NuevoPartidoModal
          token={token}
          jornada={jornadaActual}
          equipos={equipos}
          showToast={showToast}
          onClose={() => setNuevoPartidoOpen(false)}
          onCreado={() => { setNuevoPartidoOpen(false); cargarResumenJornada(); }}
        />
      )}

      {/* MODAL DE FICHA — admin de unidad edita; árbitro (readOnly) solo consulta */}
      {fichaModalPartido && (
        readOnly ? (
          <FichaDetalleModal
            partido={fichaModalPartido}
            token={token}
            liga={liga}
            onClose={() => setFichaModalPartido(null)}
          />
        ) : (
          <FichaEditorModal
            partido={fichaModalPartido}
            token={token}
            liga={liga}
            showToast={showToast}
            onClose={() => setFichaModalPartido(null)}
            onGuardado={() => { setFichaModalPartido(null); cargarResumenJornada(); }}
          />
        )
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TARJETA DE PARTIDO (resumen breve, estilo "partido")
// ─────────────────────────────────────────────────────────────────
function PartidoCard({ partido, onVerFicha, onEliminar = null, readOnly = false, mini = false }) {
  const f = partido.ficha;
  const cerrada = !!f?.cerrada;
  const eqL = partido.equipos_local;
  const eqV = partido.equipos_visitante;
  const esManual = partido.manual === true;
  const esAmistoso = partido.cuenta_estadisticas === false;
  const puedeEliminar = !!onEliminar && esManual && !cerrada;

  // Versión compacta del apartado "Fichas": solo horario, cancha y equipos.
  if (mini) {
    return (
      <div style={hs.partidoMini}>
        <span style={hs.miniMeta}>⏰ {fmtHora(partido.hora)} · Cancha {partido.cancha_numero ?? "—"}</span>
        <span style={hs.miniEquipos}>
          {eqL?.nombre || "—"} <span style={{ opacity: 0.4, fontWeight: 500 }}>vs</span> {eqV?.nombre || "—"}
        </span>
      </div>
    );
  }

  return (
    <div style={hs.partidoCard(cerrada)}>
      <div style={hs.partidoTopRow}>
        <div style={hs.partidoMeta}>
          ⏰ {fmtHora(partido.hora)} · Cancha {partido.cancha_numero ?? "—"}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
          {esAmistoso && (
            <span style={{ fontSize:9.5, fontWeight:800, letterSpacing:0.4, textTransform:"uppercase", padding:"3px 8px", borderRadius:9999, background:"#f3f4f6", color:"#6b7280", border:"1px solid #e5e7eb" }}>
              Amistoso
            </span>
          )}
          {esManual && (
            <span style={{ fontSize:9.5, fontWeight:800, letterSpacing:0.4, textTransform:"uppercase", padding:"3px 8px", borderRadius:9999, background:"#eef2ff", color:"#4338ca", border:"1px solid #c7d2fe" }}>
              Extra
            </span>
          )}
          <span style={hs.partidoBadge(cerrada)}>{cerrada ? "✓ Cerrada" : "⏳ Pendiente"}</span>
        </div>
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

      {(() => {
        // El árbitro (readOnly) solo consulta fichas ya cerradas desde aquí;
        // las pendientes las llena en su panel "Mis Partidos".
        if (readOnly) {
          return cerrada ? (
            <button style={hs.btnVerFicha} onClick={() => onVerFicha(partido)}>
              👁️ Ver ficha
            </button>
          ) : null;
        }
        // El admin de unidad puede registrar pendientes, continuar borradores
        // o corregir fichas ya cerradas.
        const accion = cerrada
          ? { label: "✏️ Modificar ficha", bg: "#b45309" }
          : f
            ? { label: "✏️ Continuar ficha", bg: "#1d4ed8" }
            : { label: "📝 Registrar ficha", bg: "#4f8f2f" };
        return (
          <div style={{ display:"flex", gap:8, alignItems:"stretch" }}>
            <button style={{ ...hs.btnVerFicha, background: accion.bg, flex: 1 }} onClick={() => onVerFicha(partido)}>
              {accion.label}
            </button>
            {puedeEliminar && (
              <button
                onClick={() => onEliminar(partido)}
                title="Eliminar partido manual"
                style={{ background:"#fff", color:"#dc2626", border:"1px solid #fecaca", borderRadius: 10, padding: "0 14px", fontSize: 16, fontWeight: 700, cursor:"pointer", flexShrink: 0 }}>
                🗑
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MODAL: FICHA COMPLETA DEL PARTIDO (lectura) — exportado para Resultados
// ─────────────────────────────────────────────────────────────────
export function FichaDetalleModal({ partido, token, liga, onClose }) {
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

// ─────────────────────────────────────────────────────────────────
// MODAL: EDITOR DE FICHA — el admin de unidad corrige fichas cerradas
// ─────────────────────────────────────────────────────────────────
function FichaEditorModal({ partido, token, liga, showToast, onClose, onGuardado }) {
  const f = partido.ficha;
  const eqL = partido.equipos_local;
  const eqV = partido.equipos_visitante;

  // Estado de la ficha: inexistente (registrar), borrador (continuar) o cerrada (corregir).
  const existe    = !!f;
  const esCerrada = !!f?.cerrada;
  const titulo    = esCerrada ? "MODIFICAR FICHA" : existe ? "CONTINUAR FICHA" : "REGISTRAR FICHA";

  // Estado local editable, inicializado desde la ficha cerrada
  const [golesLocal, setGolesLocal]         = useState(f?.goles_local ?? 0);
  const [golesVisitante, setGolesVisitante] = useState(f?.goles_visitante ?? 0);
  const [goleadores, setGoleadores]         = useState(f?.goleadores || []);
  const [asistencia, setAsistencia]         = useState(f?.asistencia || []);
  const [faltasLocal, setFaltasLocal]       = useState(f?.faltas_local ?? 0);
  const [faltasVisit, setFaltasVisit]       = useState(f?.faltas_visitante ?? 0);
  const [observaciones, setObservaciones]   = useState(f?.observaciones || "");
  // El flag "cuenta para estadísticas" vive en la tabla partidos (no en la
  // ficha). Solo se puede cambiar mientras la ficha no esté cerrada — al
  // cerrarla queda fijo para que la tabla no cambie retroactivamente.
  const [cuentaEst, setCuentaEst] = useState(partido?.cuenta_estadisticas !== false);
  const flagEditable = !!partido?.manual && !esCerrada;

  const [jugadoresLocal, setJugadoresLocal] = useState([]);
  const [jugadoresVisit, setJugadoresVisit] = useState([]);
  const [cargando, setCargando]             = useState(true);
  const [guardando, setGuardando]           = useState(false);
  const [error, setError]                   = useState(null);
  const [confirmarCierre, setConfirmarCierre] = useState(false);

  // Sanciones de la ficha actual y mapa de bloqueos activos.
  const [sanciones, setSanciones]                 = useState([]);
  const [sancionesActivas, setSancionesActivas]   = useState({});
  const [puedeRevertir, setPuedeRevertir]         = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const ligaId = liga?.id || partido.jornadas?.liga_id;
        const equipoIds = [eqL?.id, eqV?.id].filter(Boolean);
        if (equipoIds.length === 0) { setCargando(false); return; }
        const [data, sancsAqui, bloqueos, userInfo] = await Promise.all([
          db(
            `/jugador_equipo?equipo_id=in.(${equipoIds.join(",")})&liga_id=eq.${ligaId}` +
            `&select=equipo_id,jugador_id,dorsal,nombre_camiseta,jugadores(nombre_completo,numero_afiliado)` +
            `&order=equipo_id,dorsal`,
            token
          ),
          cargarSancionesDelPartido(token, partido.id),
          cargarBloqueosActivos(token, equipoIds, partido.id),
          // Para decidir si puede revertir sanciones (admin/super).
          fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        if (cancelado) return;
        setJugadoresLocal((data || []).filter(j => j.equipo_id === eqL?.id));
        setJugadoresVisit((data || []).filter(j => j.equipo_id === eqV?.id));
        setSanciones((sancsAqui || []).map(s => ({
          id: s.id,
          jugador_id: s.jugador_id,
          equipo_id: s.equipo_id,
          equipo_nombre: s.equipo_id === eqL?.id ? eqL?.nombre : eqV?.nombre,
          nombre: s.jugadores?.nombre_completo || "—",
          partidos: s.partidos_totales,
          motivo: s.motivo,
        })));
        setSancionesActivas(bloqueos || {});
        if (userInfo?.id) {
          try {
            const roles = await db(`/user_roles?user_id=eq.${userInfo.id}&select=rol`, token);
            const r = roles?.[0]?.rol;
            if (!cancelado) setPuedeRevertir(r === "super_admin" || r === "league_admin");
          } catch (_) {}
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [partido?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────
  const estaPresente = (jid) => asistencia.includes(jid);
  const estaSancionado = (jid) => (sancionesActivas[jid] || 0) > 0;
  const toggleAsistencia = (jid) => {
    if (estaSancionado(jid)) {
      showToast && showToast(`Jugador sancionado (${sancionesActivas[jid]} partidos restantes)`, "err");
      return;
    }
    setAsistencia(prev => prev.includes(jid) ? prev.filter(x => x !== jid) : [...prev, jid]);
  };

  const golesDeJugador = (jugadorId, equipoId) => {
    const g = goleadores.find(x => x.jugador_id === jugadorId && x.equipo === equipoId);
    return g?.goles || 0;
  };

  const agregarGoleador = (jugInfo, equipoId, equipoNombre) => {
    if (estaSancionado(jugInfo.jugador_id)) {
      showToast && showToast(`Jugador sancionado (${sancionesActivas[jugInfo.jugador_id]} partidos restantes)`, "err");
      return;
    }
    // Si un jugador anota, lógicamente jugó: lo marcamos presente.
    setAsistencia(prev => prev.includes(jugInfo.jugador_id) ? prev : [...prev, jugInfo.jugador_id]);
    const idx = goleadores.findIndex(g => g.jugador_id === jugInfo.jugador_id && g.equipo === equipoId);
    if (idx >= 0) {
      const updated = [...goleadores];
      updated[idx].goles += 1;
      setGoleadores(updated);
    } else {
      setGoleadores([...goleadores, {
        jugador_id: jugInfo.jugador_id,
        nombre: jugInfo.jugadores?.nombre_completo,
        equipo: equipoId,
        equipo_nombre: equipoNombre,
        dorsal: jugInfo.dorsal,
        goles: 1,
      }]);
    }
    if (equipoId === eqL?.id) setGolesLocal(v => v + 1);
    else setGolesVisitante(v => v + 1);
  };

  const quitarGoleador = (jugadorId, equipoId) => {
    setGoleadores(prev => prev.map(g => {
      if (g.jugador_id === jugadorId && g.equipo === equipoId) return { ...g, goles: g.goles - 1 };
      return g;
    }).filter(g => g.goles > 0));
    if (equipoId === eqL?.id) setGolesLocal(v => Math.max(0, v - 1));
    else setGolesVisitante(v => Math.max(0, v - 1));
  };

  // ── Sanciones ─────────────────────────────────────────────────
  const handleAddSancion = (s) => {
    setSanciones(prev => [...prev, s]);
    setObservaciones(prev => {
      const linea = textoSancionParaObservaciones(s);
      return prev?.trim() ? `${prev.trim()}\n${linea}` : linea;
    });
  };
  const handleRemoveSancion = async (id, esNueva) => {
    if (!esNueva && id) {
      try { await eliminarSancionDB(token, id); }
      catch (e) { showToast && showToast(e.message, "err"); return; }
      showToast && showToast("Sanción eliminada ✓");
    }
    setSanciones(prev => prev.filter(s => (s.id || null) !== (id || null) || (esNueva && s._nueva && s.id === undefined)));
    try {
      const equipoIds = [eqL?.id, eqV?.id].filter(Boolean);
      const bloqueos = await cargarBloqueosActivos(token, equipoIds, partido.id);
      setSancionesActivas(bloqueos || {});
    } catch (_) {}
  };

  // cerrar=true cierra la ficha (cuenta para la tabla); cerrar=false la deja
  // como borrador. Al corregir una ficha ya cerrada se llama con cerrar=true
  // para que conserve su estado.
  const guardar = async (cerrar) => {
    setGuardando(true);
    setError(null);
    try {
      const payload = {
        goles_local: golesLocal,
        goles_visitante: golesVisitante,
        goleadores,
        asistencia,
        faltas_local: faltasLocal,
        faltas_visitante: faltasVisit,
        observaciones,
        cerrada: cerrar,
      };
      // Persistimos sanciones ANTES de cerrar la ficha: el trigger filtra por
      // partido_origen_id las recién creadas para que no se auto-descuenten.
      const ligaIdActual = liga?.id || partido.jornadas?.liga_id;
      const nuevas = sanciones.filter(s => s._nueva);
      for (const s of nuevas) {
        await insertarSancion(token, {
          jugador_id: s.jugador_id,
          equipo_id: s.equipo_id,
          liga_id: ligaIdActual,
          partido_origen_id: partido.id,
          partidos_pendientes: s.partidos,
          partidos_totales: s.partidos,
          motivo: s.motivo,
        });
      }

      if (existe) {
        await db(`/ficha_partido?id=eq.${f.id}`, token, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await db(`/ficha_partido`, token, {
          method: "POST",
          body: JSON.stringify({ ...payload, partido_id: partido.id }),
        });
      }
      // Persistir el flag cuenta_estadisticas solo si es editable (partido
      // manual + ficha no cerrada) y cambió. PostgREST hará no-op si el valor
      // ya coincide, pero igual evitamos el round-trip cuando no toca.
      if (flagEditable && cuentaEst !== (partido.cuenta_estadisticas !== false)) {
        await db(`/partidos?id=eq.${partido.id}`, token, {
          method: "PATCH",
          body: JSON.stringify({ cuenta_estadisticas: cuentaEst }),
        });
      }
      showToast && showToast(
        esCerrada ? "Ficha corregida ✓" : cerrar ? "Ficha cerrada y guardada ✓" : "Borrador guardado ✓"
      );
      onGuardado && onGuardado();
    } catch (e) {
      setError(e.message || "Error al guardar");
    }
    setGuardando(false);
  };

  // ── Render lista de jugadores editable ────────────────────────
  const renderEquipoLista = (jugadores, equipoId, equipoNombre, color) => {
    if (jugadores.length === 0) return <div style={fd.sinJugadores}>Sin jugadores inscritos</div>;
    return (
      <div style={fd.equipoCol}>
        {jugadores.map(j => {
          const presente = estaPresente(j.jugador_id);
          const goles = golesDeJugador(j.jugador_id, equipoId);
          const sancPend = sancionesActivas[j.jugador_id] || 0;
          const sancionado = sancPend > 0;
          return (
            <div key={j.jugador_id} style={{
              ...fd.jugRow,
              background: sancionado ? "rgba(127,29,29,0.06)"
                : goles > 0 ? "rgba(22,163,74,0.12)"
                : presente ? "rgba(22,163,74,0.04)" : "transparent",
              opacity: sancionado ? 0.6 : 1,
            }}>
              <span style={{ ...fd.jugDorsal, background: color }}>{j.dorsal || "—"}</span>
              <span style={{ ...fd.jugNombre, textDecoration: sancionado ? "underline" : "none", textDecorationColor: "#dc2626" }}>
                {j.jugadores?.nombre_completo || "—"}
              </span>
              {sancionado && (
                <span style={{ fontSize: 9.5, fontWeight: 800, color: "#7f1d1d", background: "#fee2e2", padding: "2px 6px", borderRadius: 999, marginRight: 4 }}>
                  🟥 {sancPend}
                </span>
              )}
              {/* Asistencia: oculta con gol > 0 (gol implica asistencia) o si está sancionado. */}
              {goles === 0 && !sancionado && (
                <span
                  style={{ ...fe.checkBox, background: presente ? "#16a34a" : "transparent", borderColor: presente ? "#16a34a" : "#9ca3af", cursor: "pointer" }}
                  onClick={() => toggleAsistencia(j.jugador_id)}
                  title={presente ? "Quitar asistencia" : "Marcar presente"}>
                  {presente ? "✓" : ""}
                </span>
              )}
              {!sancionado && (
                <div style={fe.golBtns}>
                  {goles > 0 && <button style={fe.golMinus} onClick={() => quitarGoleador(j.jugador_id, equipoId)}>−</button>}
                  {goles > 0 && <span style={fe.golCount}>{goles}</span>}
                  <button style={fe.golPlus} onClick={() => agregarGoleador(j, equipoId, equipoNombre)} title="Agregar gol">⚽</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={fd.overlay} onClick={onClose}>
      <div style={fd.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={fd.header}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...fd.headerLabel, color: esCerrada ? "#b45309" : "#4f8f2f" }}>{titulo}</div>
            <div style={fd.headerMeta}>
              Jornada {partido.jornadas?.numero ?? "—"} · ⏰ {fmtHora(partido.hora)} · Cancha {partido.cancha_numero ?? "—"}
            </div>
          </div>
          <button style={fd.closeBtn} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* Aviso — solo al corregir una ficha que ya estaba cerrada */}
        {esCerrada && (
          <div style={fe.warningBox}>
            ⚠️ Estás corrigiendo una ficha ya cerrada. Los cambios se registrarán en el log de auditoría.
          </div>
        )}

        {/* Switch del flag "cuenta para estadísticas" — solo aparece en partidos
            manuales (extra/amistoso) y mientras la ficha no esté cerrada. Al
            cerrarla queda fijo: si era amistoso seguirá fuera de la tabla, y
            viceversa. */}
        {flagEditable && (
          <button type="button" onClick={() => setCuentaEst(v => !v)} style={np.switchRow(cuentaEst)}>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#111827" }}>
                Cuenta para tabla y estadísticas
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                {cuentaEst
                  ? "Al cerrar la ficha sumará puntos a la tabla."
                  : "Se guardará como amistoso (no afecta la tabla)."}
              </div>
            </div>
            <span style={np.switchTrack(cuentaEst)}>
              <span style={np.switchThumb(cuentaEst)} />
            </span>
          </button>
        )}

        {/* Aviso para amistosos ya cerrados: no se puede cambiar el flag */}
        {!flagEditable && partido?.manual && esCerrada && partido?.cuenta_estadisticas === false && (
          <div style={{ ...fe.warningBox, background: "#f3f4f6", borderColor: "#e5e7eb", color: "#6b7280" }}>
            🤝 Este partido se cerró como amistoso: su resultado no impacta la tabla.
          </div>
        )}

        {/* Marcador editable */}
        <div style={fd.marcadorRow}>
          <div style={fd.eqCol}>
            <JerseySVG diseno={eqL?.diseno_camiseta || "solido"} color1={eqL?.color_playera || "#3182ce"} color2={eqL?.color_camiseta_2 || "#fff"} escudoUrl={eqL?.escudo_url || null} size={44}/>
            <span style={fd.eqNombreCol}>{eqL?.nombre}</span>
          </div>
          <div style={fe.marcadorEdit}>
            <div style={fe.marcadorBox}>
              <button style={fe.marcadorBtn} onClick={() => setGolesLocal(v => Math.max(0, v - 1))}>−</button>
              <span style={fe.marcadorNum}>{golesLocal}</span>
              <button style={fe.marcadorBtn} onClick={() => setGolesLocal(v => v + 1)}>+</button>
            </div>
            <span style={{ color: "#9ca3af", fontSize: 18, fontWeight: 800 }}>·</span>
            <div style={fe.marcadorBox}>
              <button style={fe.marcadorBtn} onClick={() => setGolesVisitante(v => Math.max(0, v - 1))}>−</button>
              <span style={fe.marcadorNum}>{golesVisitante}</span>
              <button style={fe.marcadorBtn} onClick={() => setGolesVisitante(v => v + 1)}>+</button>
            </div>
          </div>
          <div style={fd.eqCol}>
            <JerseySVG diseno={eqV?.diseno_camiseta || "solido"} color1={eqV?.color_playera || "#3182ce"} color2={eqV?.color_camiseta_2 || "#fff"} escudoUrl={eqV?.escudo_url || null} size={44}/>
            <span style={fd.eqNombreCol}>{eqV?.nombre}</span>
          </div>
        </div>

        {/* Jugadores con asistencia y goles editables */}
        <div style={fd.sectionLabel}>👥 Asistencia y goles</div>
        {cargando ? (
          <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>Cargando...</div>
        ) : (
          <div style={fd.equiposGrid}>
            <div>
              <div style={fd.equipoCabecera}>
                <JerseySVG diseno={eqL?.diseno_camiseta || "solido"} color1={eqL?.color_playera || "#3182ce"} color2={eqL?.color_camiseta_2 || "#fff"} escudoUrl={eqL?.escudo_url || null} size={22}/>
                <span style={fd.equipoCabeceraNombre}>{eqL?.nombre}</span>
              </div>
              {renderEquipoLista(jugadoresLocal, eqL?.id, eqL?.nombre, eqL?.color_playera || "#3182ce")}
            </div>
            <div>
              <div style={fd.equipoCabecera}>
                <JerseySVG diseno={eqV?.diseno_camiseta || "solido"} color1={eqV?.color_playera || "#3182ce"} color2={eqV?.color_camiseta_2 || "#fff"} escudoUrl={eqV?.escudo_url || null} size={22}/>
                <span style={fd.equipoCabeceraNombre}>{eqV?.nombre}</span>
              </div>
              {renderEquipoLista(jugadoresVisit, eqV?.id, eqV?.nombre, eqV?.color_playera || "#3182ce")}
            </div>
          </div>
        )}

        {/* Faltas editables */}
        <div style={fd.faltasRow}>
          <div style={fd.faltasBox}>
            <div style={fd.faltasLabel}>🟨 Faltas {eqL?.nombre}</div>
            <div style={fe.faltasEditRow}>
              <button style={fe.faltaBtn} onClick={() => setFaltasLocal(v => Math.max(0, v - 1))}>−</button>
              <span style={fd.faltasNum}>{faltasLocal}</span>
              <button style={fe.faltaBtn} onClick={() => setFaltasLocal(v => v + 1)}>+</button>
            </div>
          </div>
          <div style={fd.faltasBox}>
            <div style={fd.faltasLabel}>🟨 Faltas {eqV?.nombre}</div>
            <div style={fe.faltasEditRow}>
              <button style={fe.faltaBtn} onClick={() => setFaltasVisit(v => Math.max(0, v - 1))}>−</button>
              <span style={fd.faltasNum}>{faltasVisit}</span>
              <button style={fe.faltaBtn} onClick={() => setFaltasVisit(v => v + 1)}>+</button>
            </div>
          </div>
        </div>

        {/* Observaciones editables */}
        <div style={fd.obsBox}>
          <div style={fd.obsLabel}>📝 Observaciones del árbitro</div>
          <textarea
            style={fe.textarea}
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
            rows={3}
            placeholder="Tarjetas, incidencias, notas..."
          />
        </div>

        {/* Sanciones disciplinarias */}
        <PanelSanciones
          sanciones={sanciones}
          jugadoresLocal={jugadoresLocal}
          jugadoresVisitante={jugadoresVisit}
          equipoLocal={eqL}
          equipoVisitante={eqV}
          onAdd={handleAddSancion}
          onRemove={handleRemoveSancion}
          cerrada={esCerrada}
          puedeRevertir={puedeRevertir}
        />

        {error && (
          <div style={fe.errorBox}>⚠️ {error}</div>
        )}

        {esCerrada ? (
          /* Ficha ya cerrada: se corrige y conserva su estado de cerrada. */
          <div style={fe.acciones}>
            <button style={fe.btnCancel} onClick={onClose} disabled={guardando}>Cancelar</button>
            <button style={fe.btnGuardar} onClick={() => guardar(true)} disabled={guardando}>
              {guardando ? "Guardando..." : "💾 Guardar cambios"}
            </button>
          </div>
        ) : confirmarCierre ? (
          /* Confirmación previa al cierre de una ficha pendiente. */
          <div>
            <div style={fe.confirmTxt}>
              🔒 Al cerrar la ficha, el resultado cuenta para la tabla de posiciones. Podrás corregirla después si hace falta.
            </div>
            <div style={fe.acciones}>
              <button style={fe.btnCancel} onClick={() => setConfirmarCierre(false)} disabled={guardando}>
                No, volver
              </button>
              <button style={fe.btnGuardar} onClick={() => guardar(true)} disabled={guardando}>
                {guardando ? "Cerrando..." : "Sí, cerrar ficha"}
              </button>
            </div>
          </div>
        ) : (
          /* Ficha nueva o borrador: guardar como borrador o cerrarla. */
          <div style={fe.accionesCol}>
            <div style={fe.acciones}>
              <button style={fe.btnBorrador} onClick={() => guardar(false)} disabled={guardando}>
                {guardando ? "Guardando..." : "💾 Guardar borrador"}
              </button>
              <button style={fe.btnCerrar} onClick={() => setConfirmarCierre(true)} disabled={guardando}>
                🔒 Cerrar ficha
              </button>
            </div>
            <button style={fe.btnCancelFull} onClick={onClose} disabled={guardando}>Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MODAL: NUEVO PARTIDO MANUAL DENTRO DE UNA JORNADA EXISTENTE
// ─────────────────────────────────────────────────────────────────
// Cubre el caso "dos equipos faltaron y los presentes juegan entre sí".
// El partido se inserta en la jornada actualmente seleccionada, con
// manual=true (habilita borrarlo después si no se ha cerrado ficha) y
// cuenta_estadisticas controlado por el switch. El flujo de ficha es
// idéntico al de los partidos del generador.
function NuevoPartidoModal({ token, jornada, equipos, showToast, onClose, onCreado }) {
  const [localId, setLocalId]       = useState("");
  const [visitanteId, setVisitanteId] = useState("");
  const [hora, setHora]             = useState("");
  const [cancha, setCancha]         = useState("");
  const [cuentaEst, setCuentaEst]   = useState(true);
  const [guardando, setGuardando]   = useState(false);
  const [error, setError]           = useState(null);

  const guardar = async () => {
    setError(null);
    if (!localId || !visitanteId)   return setError("Selecciona ambos equipos");
    if (localId === visitanteId)    return setError("El equipo local y el visitante deben ser distintos");
    if (!hora)                      return setError("Indica la hora del partido");
    setGuardando(true);
    try {
      await db(`/partidos`, token, {
        method: "POST",
        body: JSON.stringify({
          jornada_id: jornada.id,
          equipo_local_id: localId,
          equipo_visitante_id: visitanteId,
          hora,
          cancha_numero: cancha ? Number(cancha) : null,
          cuenta_estadisticas: cuentaEst,
          manual: true,
        }),
      });
      showToast(cuentaEst ? "Partido extra agregado ✓" : "Amistoso agregado ✓");
      onCreado();
    } catch (e) {
      setError(e.message || "Error al guardar");
      setGuardando(false);
    }
  };

  // Si el equipo local ya está elegido, el visitante no puede ser el mismo.
  const opcionesVisitante = equipos.filter(e => e.id !== localId);

  return (
    <div style={fd.overlay} onClick={onClose}>
      <div style={fd.modal} onClick={e => e.stopPropagation()}>
        <div style={fd.header}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...fd.headerLabel, color: "#4f8f2f" }}>Añadir partido extra</div>
            <div style={fd.headerMeta}>
              Jornada {jornada?.numero ?? "—"} · {fmtFecha(jornada?.fecha)}
            </div>
          </div>
          <button style={fd.closeBtn} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div style={np.field}>
          <label style={np.label}>Equipo local</label>
          <select style={np.select} value={localId} onChange={e => setLocalId(e.target.value)}>
            <option value="">— Selecciona —</option>
            {equipos.map(eq => <option key={eq.id} value={eq.id}>{eq.nombre}</option>)}
          </select>
        </div>

        <div style={np.field}>
          <label style={np.label}>Equipo visitante</label>
          <select style={np.select} value={visitanteId} onChange={e => setVisitanteId(e.target.value)}>
            <option value="">— Selecciona —</option>
            {opcionesVisitante.map(eq => <option key={eq.id} value={eq.id}>{eq.nombre}</option>)}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={np.field}>
            <label style={np.label}>Hora</label>
            <input type="time" style={np.select} value={hora} onChange={e => setHora(e.target.value)} />
          </div>
          <div style={np.field}>
            <label style={np.label}>Cancha</label>
            <input type="number" min="1" placeholder="1" style={np.select} value={cancha} onChange={e => setCancha(e.target.value)} />
          </div>
        </div>

        {/* Switch: si el admin lo apaga, el partido aparece como Amistoso y
            no impacta tabla ni goleadores. Por defecto cuenta. */}
        <button
          type="button"
          onClick={() => setCuentaEst(v => !v)}
          style={np.switchRow(cuentaEst)}>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#111827" }}>
              Cuenta para tabla y estadísticas
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              {cuentaEst
                ? "Suma puntos, goleadores y faltas como un partido más."
                : "Solo se ve en el calendario como amistoso."}
            </div>
          </div>
          <span style={np.switchTrack(cuentaEst)}>
            <span style={np.switchThumb(cuentaEst)} />
          </span>
        </button>

        {error && <div style={fe.errorBox}>⚠️ {error}</div>}

        <div style={fe.acciones}>
          <button style={fe.btnCancel} onClick={onClose} disabled={guardando}>Cancelar</button>
          <button style={fe.btnGuardar} onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Crear partido"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Estilos del modal de nuevo partido
const np = {
  field: { marginBottom: 12 },
  label: { display: "block", fontSize: 11, fontWeight: 800, color: "#374151", marginBottom: 5, letterSpacing: 0.3, textTransform: "uppercase" },
  select: { width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 9, background: "#fff", color: "#111827", outline: "none", boxSizing: "border-box", minHeight: 42 },
  switchRow: (on) => ({
    width: "100%", display: "flex", alignItems: "center", gap: 10,
    padding: "10px 12px", background: on ? "#f0fdf4" : "#f9fafb",
    border: `1px solid ${on ? "#bbf7d0" : "#e5e7eb"}`, borderRadius: 10,
    cursor: "pointer", marginBottom: 12,
  }),
  switchTrack: (on) => ({
    width: 38, height: 22, borderRadius: 9999,
    background: on ? "#4f8f2f" : "#d1d5db",
    position: "relative", flexShrink: 0, transition: "background 0.18s",
  }),
  switchThumb: (on) => ({
    position: "absolute", top: 2, left: on ? 18 : 2,
    width: 18, height: 18, borderRadius: "50%", background: "#fff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left 0.18s",
  }),
};

// Estilos del editor (complemento de fd)
const fe = {
  warningBox: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 9, padding: "8px 12px", color: "#92400e", fontSize: 11, marginBottom: 12, lineHeight: 1.5 },
  marcadorEdit: { display: "flex", alignItems: "center", gap: 4, padding: "0 4px" },
  marcadorBox: { display: "flex", alignItems: "center", gap: 4 },
  marcadorBtn: { width: 26, height: 26, borderRadius: 7, background: "#f3f4f6", border: "1px solid #e5e7eb", color: "#374151", fontSize: 16, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  marcadorNum: { fontSize: 22, fontWeight: 900, color: "#111827", minWidth: 26, textAlign: "center" },
  checkBox: { width: 20, height: 20, borderRadius: 5, border: "2px solid", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0, transition: "all 0.12s" },
  golBtns: { display: "flex", alignItems: "center", gap: 3, flexShrink: 0 },
  golPlus: { background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 5, color: "#15803d", fontSize: 12, cursor: "pointer", padding: "2px 5px", fontWeight: 700 },
  golMinus: { background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 5, color: "#dc2626", fontSize: 12, cursor: "pointer", padding: "2px 5px", fontWeight: 700 },
  golCount: { fontSize: 11, fontWeight: 800, color: "#15803d", minWidth: 12, textAlign: "center" },
  faltasEditRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  faltaBtn: { width: 24, height: 24, borderRadius: 6, background: "#fff", border: "1px solid #fde68a", color: "#92400e", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: 0 },
  textarea: { width: "100%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#111827", outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: "8px 12px", color: "#b91c1c", fontSize: 12, marginBottom: 10 },
  acciones: { display: "flex", gap: 8, marginTop: 4 },
  accionesCol: { display: "flex", flexDirection: "column", gap: 8, marginTop: 4 },
  btnCancel: { flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", color: "#6b7280", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  btnCancelFull: { background: "transparent", border: "none", padding: "6px", color: "#9ca3af", fontSize: 12.5, fontWeight: 700, cursor: "pointer" },
  btnGuardar: { flex: 2, background: "#4f8f2f", border: "none", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  btnBorrador: { flex: 1, background: "#fff", border: "2px solid #4f8f2f", borderRadius: 10, padding: "10px 12px", color: "#4f8f2f", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  btnCerrar: { flex: 1, background: "#4f8f2f", border: "none", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  confirmTxt: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 9, padding: "9px 12px", color: "#15803d", fontSize: 11.5, lineHeight: 1.5, marginBottom: 8 },
};

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
  // Equipos del editor en una sola columna (apilados): así la fila por jugador
  // tiene espacio horizontal para nombre + check + botones de gol sin amontonarse.
  equiposGrid: { display: "flex", flexDirection: "column", gap: 14, marginBottom: 14 },
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
  heroCard: { position: "relative", overflow: "hidden", background: "linear-gradient(145deg, #4f8f2f 0%, #3a6b22 100%)", borderRadius: "var(--radius-lg, 20px)", padding: "14px 16px", marginBottom: 16, boxShadow: "0 6px 20px rgba(79,143,47,0.28)", color: "#fff" },
  heroGlow: { position: "absolute", top: -30, right: -30, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(127,191,77,0.45) 0%, rgba(127,191,77,0) 70%)", pointerEvents: "none" },
  heroInner: { position: "relative", zIndex: 1 },
  // Cabecera compacta: logo a un lado y, al lado, el título grande del apartado.
  // El nombre de la unidad sólo aparece (pequeño, encima del título) cuando el
  // apartado lo necesita; el peso visual lo lleva siempre el nombre del apartado.
  heroHeadRow: { display: "flex", alignItems: "center", gap: 12 },
  heroLogoSmall: { width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.20)", border: "2px solid rgba(255,255,255,0.42)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, boxShadow: "0 3px 10px rgba(0,0,0,0.20)" },
  heroUnitLogoImg: { width: "100%", height: "100%", objectFit: "cover" },
  heroUnitLabelSmall: { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: "rgba(255,255,255,0.82)", textTransform: "uppercase", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  heroTitleRow: { display: "flex", alignItems: "center", gap: 7 },
  heroTitleBig: { fontSize: 22, fontWeight: 900, letterSpacing: -0.6, color: "#fff", margin: 0, lineHeight: 1.1 },

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
  // Tarjeta compacta del apartado "Fichas" (solo horario, cancha y equipos)
  partidoMini: { display: "flex", alignItems: "center", gap: 10, padding: "7px 11px", background: "#ffffff", border: "1px solid var(--border, #e5e7eb)", borderLeft: "3px solid #d1d5db", borderRadius: 8 },
  miniMeta: { fontSize: 11, fontWeight: 700, color: "var(--text-sub, #6b7280)", whiteSpace: "nowrap", flexShrink: 0 },
  miniEquipos: { fontSize: 13, fontWeight: 600, color: "var(--text, #111827)", flex: 1, minWidth: 0, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
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
