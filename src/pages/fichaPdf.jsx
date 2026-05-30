// ─────────────────────────────────────────────────────────────────
// GENERACIÓN DE FICHAS EN PDF (vectorial, con @react-pdf/renderer)
// ─────────────────────────────────────────────────────────────────
// Este módulo se importa de forma DIFERIDA desde FichaGenerator
// (`await import("./fichaPdf.jsx")`) para que react-pdf quede en su propio
// chunk y no engorde la carga inicial de la app.
//
// ¿Por qué generar el PDF nosotros en vez de window.print()?
// iOS Safari (el navegador con el que se usa la app) IGNORA el `@page margin`
// y agrega su propio encabezado/pie (URL, fecha, "Page X of Y"), además de
// reducir el área útil. Eso hacía que las fichas no entraran en una hoja y
// que apareciera el dominio en el pie. Armando el PDF a mano, cada ficha es
// una página Carta EXACTA, sin decoración del navegador y sin desbordes.
/* eslint-disable react-refresh/only-export-components --
   Este módulo mezcla a propósito el componente de vista previa con las
   funciones de generación del PDF; el fast-refresh de HMR no aplica aquí. */
import { useId, useState, useEffect, memo } from "react";
import {
  Document, Page, View, Text, Image,
  Svg, Path, Rect, Line, Circle, G, Polygon, ClipPath, Defs,
  pdf,
} from "@react-pdf/renderer";
// Worker de pdf.js — se usa para rasterizar el PDF en la vista previa.
// `?url` hace que Vite emita el archivo y nos dé su URL.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// react-pdf trabaja en puntos (pt). 1mm = 2.83465pt.
const MM = 2.83465;
const mm = (n) => n * MM;
const GREEN = "#4f8f2f";
const FILAS = 17;

const pad = (arr) => { const r = [...(arr || [])]; while (r.length < FILAS) r.push(null); return r; };
const fmtFecha = (s) => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const fmtHora  = (s) => (s ? s.substring(0, 5) : "—");

// ── Prefetch de imágenes ───────────────────────────────────────────
// Convertimos cada URL (logo de unidad, escudos, fotos) a dataURL ANTES de
// armar el documento. Así, si alguna falla (CORS, 404, etc.), simplemente la
// omitimos y usamos el respaldo, en vez de que react-pdf reviente el PDF
// entero por una sola imagen rota.
async function fetchDataUrl(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function prefetchImages(fichasData, miUnidad) {
  const urls = new Set();
  if (miUnidad?.logo_url) urls.add(miUnidad.logo_url);
  for (const f of fichasData) {
    [f.partido.equipos_local, f.partido.equipos_visitante].forEach((e) => {
      if (e?.escudo_url) urls.add(e.escudo_url);
    });
    [...(f.jugadoresLocal || []), ...(f.jugadoresVisitante || [])].forEach((j) => {
      if (j?.jugadores?.foto_url) urls.add(j.jugadores.foto_url);
    });
  }
  const map = {};
  await Promise.all([...urls].map(async (u) => { map[u] = await fetchDataUrl(u); }));
  return map;
}

// ── Camiseta (port de JerseySVG a primitivas react-pdf) ─────────────
const JERSEY_PATH =
  "M22,10 L0,34 L13,42 L25,34 L25,110 L75,110 L75,34 L87,42 L100,34 L78,10 " +
  "Q66,2 60,9 Q55,16 50,16 Q45,16 40,9 Q34,2 22,10 Z";

function JerseyPatron({ diseno, c1, c2 }) {
  switch (diseno) {
    case "mitad":
      return <><Rect x={0} y={0} width={50} height={120} fill={c1} /><Rect x={50} y={0} width={50} height={120} fill={c2} /></>;
    case "rayas_v":
      return <>{Array.from({ length: 10 }, (_, i) => <Rect key={i} x={i * 10} y={0} width={10} height={120} fill={i % 2 === 0 ? c1 : c2} />)}</>;
    case "franjas_v":
      return <><Rect x={0} y={0} width={100} height={120} fill={c1} /><Rect x={22} y={0} width={18} height={120} fill={c2} /><Rect x={60} y={0} width={18} height={120} fill={c2} /></>;
    case "rayas_h":
      return <>{Array.from({ length: 8 }, (_, i) => <Rect key={i} x={0} y={i * 15} width={100} height={15} fill={i % 2 === 0 ? c1 : c2} />)}</>;
    case "diagonal":
      return <><Rect x={0} y={0} width={100} height={120} fill={c1} /><Polygon points="0,22 100,0 100,58 0,80" fill={c2} /></>;
    case "cuadros":
      return <>{Array.from({ length: 8 }, (_, r) => Array.from({ length: 5 }, (_, c) => <Rect key={`${r}-${c}`} x={c * 20} y={r * 15} width={20} height={15} fill={(r + c) % 2 === 0 ? c1 : c2} />))}</>;
    case "mangas":
      return <><Rect x={0} y={0} width={100} height={120} fill={c2} /><Rect x={25} y={0} width={50} height={120} fill={c1} /></>;
    default:
      return <Rect x={0} y={0} width={100} height={120} fill={c1} />;
  }
}

function Jersey({ diseno = "solido", c1 = "#3182ce", c2 = "#ffffff", size = mm(7) }) {
  const id = "jc" + useId().replace(/:/g, "");
  return (
    <Svg viewBox="0 0 100 120" width={size} height={size * 1.2}>
      <Defs><ClipPath id={id}><Path d={JERSEY_PATH} /></ClipPath></Defs>
      <G clipPath={`url(#${id})`}><JerseyPatron diseno={diseno} c1={c1} c2={c2} /></G>
      <Path d={JERSEY_PATH} fill="none" stroke="#6b7280" strokeWidth={1.5} />
    </Svg>
  );
}

// ── Logo iFutbol (port de IFutbolLogo) ──────────────────────────────
function IFutbolMark({ color = GREEN, height = mm(5), showText = true }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Svg viewBox="0 0 64 40" width={height * 1.6} height={height}>
        <Rect x={2} y={2} width={60} height={36} rx={4.5} ry={4.5} stroke={color} strokeWidth={3} fill="none" />
        <Line x1={32} y1={2} x2={32} y2={38} stroke={color} strokeWidth={2.5} />
        <Circle cx={32} cy={20} r={6} stroke={color} strokeWidth={2.5} fill="none" />
        <Rect x={2} y={13} width={5.5} height={14} stroke={color} strokeWidth={2.5} fill="none" rx={0.5} />
        <Rect x={56.5} y={13} width={5.5} height={14} stroke={color} strokeWidth={2.5} fill="none" rx={0.5} />
      </Svg>
      {showText ? <Text style={{ fontFamily: "Helvetica-Bold", fontSize: height * 0.78, color, marginLeft: height * 0.32 }}>iFutbol</Text> : null}
    </View>
  );
}

function Escudo({ equipo, img, size = mm(11) }) {
  const color = equipo?.color_playera || "#6b7280";
  const inicial = (equipo?.nombre || "?").trim().charAt(0).toUpperCase();
  if (img) {
    return <Image src={img} style={{ width: size, height: size, borderRadius: mm(1.5), objectFit: "cover", borderWidth: 0.5, borderColor: color }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: mm(1.5), backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontFamily: "Helvetica-Bold", fontSize: size * 0.5 }}>{inicial}</Text>
    </View>
  );
}

function FotoCell({ j, color, img }) {
  const size = mm(6.5);
  if (img) {
    return <Image src={img} style={{ width: size, height: size, borderRadius: size / 2, objectFit: "cover" }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#f3f4f6", borderWidth: 0.5, borderColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 5.5, fontFamily: "Helvetica-Bold", color }}>{String(j.dorsal ?? "?")}</Text>
    </View>
  );
}

// ── Estilos ─────────────────────────────────────────────────────────
const s = {
  page: { paddingVertical: mm(9), paddingHorizontal: mm(8), fontFamily: "Helvetica", fontSize: 6, color: "#111827" },

  header: { flexDirection: "row", alignItems: "stretch", borderBottomWidth: 2.5, borderBottomColor: GREEN },
  headerLogo: { width: mm(16), paddingVertical: mm(2), alignItems: "center", justifyContent: "center", borderRightWidth: 0.5, borderRightColor: "#e5e7eb" },
  unidadNombre: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#111827" },
  torneoNombre: { fontSize: 7.5, color: "#6b7280", fontFamily: "Helvetica-Bold", marginTop: mm(0.8) },
  jornadaTxt: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#3B6D11" },
  metaTxt: { fontSize: 7, color: "#6b7280", marginTop: mm(0.4) },

  scoreboard: { flexDirection: "row", alignItems: "center", paddingVertical: mm(3), paddingHorizontal: mm(6), borderBottomWidth: 0.8, borderBottomColor: "#e5e7eb" },
  teamName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#111827", marginHorizontal: mm(2.5) },
  scoreBox: { width: mm(13), height: mm(13), borderWidth: 1.5, borderColor: "#111827", borderRadius: mm(2), marginHorizontal: mm(1.2) },
  colon: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#111827" },

  row: { flexDirection: "row", alignItems: "center", minHeight: mm(8.2), borderBottomWidth: 0.3, borderBottomColor: "#e5e7eb", paddingHorizontal: mm(1.5) },
  rowH: { minHeight: mm(6), backgroundColor: "#f9fafb", borderBottomWidth: 0.8, borderBottomColor: "#d1d5db" },

  cNum:    { width: mm(5),   fontSize: 6, color: "#9ca3af", textAlign: "center" },
  cDorsal: { width: mm(6.5), fontSize: 7.5, fontFamily: "Helvetica-Bold", textAlign: "center" },
  cFoto:   { width: mm(8),   alignItems: "center", justifyContent: "center" },
  cFotoH:  { width: mm(8),   fontSize: 5.5, fontFamily: "Helvetica-Bold", color: "#6b7280", textAlign: "center" },
  cNombre: { flexGrow: 1, flexShrink: 1, paddingHorizontal: mm(1) },
  cNombreH:{ flexGrow: 1, flexShrink: 1, paddingHorizontal: mm(1), fontSize: 5.5, fontFamily: "Helvetica-Bold", color: "#6b7280" },
  cAfil:   { width: mm(15),  fontSize: 5.5, color: "#6b7280" },
  cAfilH:  { width: mm(15),  fontSize: 5.5, fontFamily: "Helvetica-Bold", color: "#6b7280" },
  cChk:    { width: mm(5.5), alignItems: "center", justifyContent: "center" },
  cGol:    { width: mm(6),   alignItems: "center", justifyContent: "center" },

  nombreTxt:   { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#111827" },
  camisetaTxt: { fontSize: 5, color: "#9ca3af", marginTop: mm(0.3) },
  dashLine:    { borderBottomWidth: 0.3, borderBottomColor: "#d1d5db", borderStyle: "dashed", height: mm(0.3), alignSelf: "stretch" },

  boxChk:  { width: mm(4),   height: mm(4),   borderWidth: 0.7, borderColor: "#9ca3af", borderRadius: mm(0.5) },
  boxGol:  { width: mm(4.5), height: mm(4.5), borderWidth: 0.7, borderColor: "#9ca3af", borderRadius: mm(0.5) },
  hSquare: { width: mm(3.5), height: mm(3.5), borderWidth: 0.7, borderColor: "#9ca3af", borderRadius: mm(0.5) },
  hCircle: { width: mm(3.5), height: mm(3.5), borderWidth: 0.7, borderColor: "#9ca3af", borderRadius: mm(1.75) },

  faltasLbl: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#374151", marginRight: mm(3) },
  faltasBox: { width: mm(14), height: mm(6), borderWidth: 0.7, borderColor: "#9ca3af", borderRadius: mm(1) },

  obsLbl: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#374151", marginBottom: mm(1.5) },
};

function FilaHeader() {
  return (
    <View style={[s.row, s.rowH]}>
      <Text style={[s.cNum, { fontFamily: "Helvetica-Bold" }]}>#</Text>
      <Text style={s.cDorsal}>N°</Text>
      <Text style={s.cFotoH}>Foto</Text>
      <Text style={s.cNombreH}>Nombre / Camiseta</Text>
      <Text style={s.cAfilH}>Afiliado</Text>
      <View style={s.cChk}><View style={s.hSquare} /></View>
      <View style={s.cGol}><View style={s.hCircle} /></View>
    </View>
  );
}

function Fila({ j, idx, color, imgs }) {
  const bg = idx % 2 === 0 ? "#ffffff" : "#fafafa";
  return (
    <View style={[s.row, { backgroundColor: bg }]}>
      <Text style={s.cNum}>{String(idx + 1)}</Text>
      <Text style={[s.cDorsal, { color: j ? color : "#d1d5db" }]}>{j ? String(j.dorsal ?? "—") : ""}</Text>
      <View style={s.cFoto}>{j ? <FotoCell j={j} color={color} img={imgs[j.jugadores?.foto_url]} /> : null}</View>
      <View style={s.cNombre}>
        {j ? (
          <>
            <Text style={s.nombreTxt}>{j.jugadores?.nombre_completo ?? "—"}</Text>
            {j.nombre_camiseta ? <Text style={s.camisetaTxt}>{j.nombre_camiseta.toUpperCase()}</Text> : null}
          </>
        ) : <View style={s.dashLine} />}
      </View>
      <Text style={s.cAfil}>{j ? (j.jugadores?.numero_afiliado ?? "—") : ""}</Text>
      <View style={s.cChk}><View style={s.boxChk} /></View>
      <View style={s.cGol}><View style={s.boxGol} /></View>
    </View>
  );
}

function FichaPage({ f, liga, miUnidad, imgs }) {
  const p = f.partido;
  const jornada = p.jornadas;
  const eqL = p.equipos_local, eqV = p.equipos_visitante;
  const jLocal = pad(f.jugadoresLocal), jVisit = pad(f.jugadoresVisitante);
  const colL = eqL?.color_playera || GREEN;
  const colV = eqV?.color_playera || "#6b7280";

  return (
    <Page size="LETTER" style={s.page}>
      {/* ENCABEZADO */}
      <View style={s.header}>
        <View style={s.headerLogo}>
          {miUnidad?.logo_url && imgs[miUnidad.logo_url]
            ? <Image src={imgs[miUnidad.logo_url]} style={{ width: mm(13), height: mm(13), objectFit: "contain" }} />
            : <IFutbolMark height={mm(8)} showText={false} />}
        </View>
        <View style={{ flexGrow: 1, paddingHorizontal: mm(4), justifyContent: "center" }}>
          <Text style={s.unidadNombre}>{miUnidad?.nombre || liga?.canchas?.nombre || "Unidad Deportiva"}</Text>
          <Text style={s.torneoNombre}>{liga?.nombre || ""}</Text>
        </View>
        <View style={{ paddingHorizontal: mm(3), justifyContent: "center", alignItems: "flex-end" }}>
          <Text style={s.jornadaTxt}>Jornada {String(jornada?.numero ?? "—")}</Text>
          <Text style={s.metaTxt}>{fmtFecha(jornada?.fecha)}</Text>
          <Text style={s.metaTxt}>{fmtHora(p.hora)} · Campo {String(p.cancha_numero ?? "—")}</Text>
        </View>
        <View style={{ paddingHorizontal: mm(3), justifyContent: "center", borderLeftWidth: 0.5, borderLeftColor: "#e5e7eb" }}>
          <IFutbolMark height={mm(5)} />
        </View>
      </View>

      {/* MARCADOR */}
      <View style={s.scoreboard}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
          <Text style={s.teamName}>{eqL?.nombre || ""}</Text>
          <Escudo equipo={eqL} img={imgs[eqL?.escudo_url]} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: mm(2) }}>
          <View style={s.scoreBox} />
          <Text style={s.colon}>:</Text>
          <View style={s.scoreBox} />
        </View>
        <View style={{ flexGrow: 1, flexShrink: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-start" }}>
          <Escudo equipo={eqV} img={imgs[eqV?.escudo_url]} />
          <Text style={s.teamName}>{eqV?.nombre || ""}</Text>
        </View>
      </View>

      {/* CABECERAS DE EQUIPO */}
      <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: "#e5e7eb" }}>
        <View style={{ width: "50%", flexDirection: "row", alignItems: "center", padding: mm(2), borderRightWidth: 0.5, borderRightColor: "#e5e7eb", borderTopWidth: 3, borderTopColor: colL }}>
          <Jersey diseno={eqL?.diseno_camiseta} c1={colL} c2={eqL?.color_camiseta_2 || "#fff"} />
          <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", marginLeft: mm(3) }}>{eqL?.nombre || ""}</Text>
        </View>
        <View style={{ width: "50%", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", padding: mm(2), borderTopWidth: 3, borderTopColor: colV }}>
          <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", marginRight: mm(3) }}>{eqV?.nombre || ""}</Text>
          <Jersey diseno={eqV?.diseno_camiseta} c1={colV} c2={eqV?.color_camiseta_2 || "#fff"} />
        </View>
      </View>

      {/* TABLA */}
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: "50%", borderRightWidth: 1, borderRightColor: "#e5e7eb" }}>
          <FilaHeader />
          {jLocal.map((j, i) => <Fila key={i} j={j} idx={i} color={colL} imgs={imgs} />)}
        </View>
        <View style={{ width: "50%" }}>
          <FilaHeader />
          {jVisit.map((j, i) => <Fila key={i} j={j} idx={i} color={colV} imgs={imgs} />)}
        </View>
      </View>

      {/* FALTAS */}
      <View style={{ flexDirection: "row", borderTopWidth: 0.8, borderTopColor: "#e5e7eb" }}>
        <View style={{ width: "50%", flexDirection: "row", alignItems: "center", padding: mm(2), borderRightWidth: 0.5, borderRightColor: "#e5e7eb" }}>
          <Text style={s.faltasLbl}>Faltas cometidas:</Text>
          <View style={s.faltasBox} />
        </View>
        <View style={{ width: "50%", flexDirection: "row", alignItems: "center", padding: mm(2) }}>
          <Text style={s.faltasLbl}>Faltas cometidas:</Text>
          <View style={s.faltasBox} />
        </View>
      </View>

      {/* PIE: OBSERVACIONES + FIRMAS (flexGrow llena lo que resta de la hoja) */}
      <View style={{ flexGrow: 1, padding: mm(3), borderTopWidth: 0.8, borderTopColor: "#e5e7eb" }}>
        <Text style={s.obsLbl}>Observaciones:</Text>
        <View style={{ flexGrow: 1, justifyContent: "space-around", paddingVertical: mm(2) }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={{ borderBottomWidth: 0.4, borderBottomColor: "#c4c4c4" }} />
          ))}
        </View>
        <View style={{ flexDirection: "row", marginTop: mm(2) }}>
          {[["Nombre del árbitro", 2], ["Firma del árbitro", 1.5], ["Firma delegado A", 1.5], ["Firma delegado B", 1.5]].map(([lbl, fg], i) => (
            <View key={i} style={{ flexGrow: fg, marginRight: i < 3 ? mm(6) : 0 }}>
              <View style={{ borderBottomWidth: 0.7, borderBottomColor: "#374151", marginBottom: mm(1) }} />
              <Text style={{ fontSize: 6, color: "#6b7280" }}>{lbl}</Text>
            </View>
          ))}
        </View>
      </View>
    </Page>
  );
}

export function FichasDocument({ fichasData, liga, miUnidad, imgs }) {
  return (
    <Document title="Fichas iFutbol">
      {fichasData.map((f) => (
        <FichaPage key={f.partido.id} f={f} liga={liga} miUnidad={miUnidad} imgs={imgs} />
      ))}
    </Document>
  );
}

// API pública: genera el Blob del PDF con todas las fichas de la jornada.
export async function generarFichasBlob({ fichasData, liga, miUnidad }) {
  const imgs = await prefetchImages(fichasData, miUnidad);
  return await pdf(
    <FichasDocument fichasData={fichasData} liga={liga} miUnidad={miUnidad} imgs={imgs} />
  ).toBlob();
}

// ── Vista previa en pantalla ────────────────────────────────────────
// Genera el MISMO PDF que descarga el botón y lo rasteriza con pdf.js a una
// imagen por página. ¿Por qué imágenes y no un visor embebido (<iframe>/
// PDFViewer)? Porque iOS Safari renderiza los PDF embebidos mal escalados y
// sin poder navegar entre páginas (solo se ve la primera). Como imágenes
// ajustadas al ancho se ven TODAS las fichas, scrolleables y sin cortes.
// Va envuelto en memo: el padre re-renderiza con cada toast y no queremos
// regenerar el PDF salvo que cambien los datos.
function FichaPdfPreview({ fichasData, liga, miUnidad }) {
  // Estado keyed por `data`: guardamos el resultado junto a los datos que lo
  // produjeron. Mientras `estado.data !== fichasData` mostramos "cargando",
  // sin resetear estado de forma síncrona dentro del efecto.
  const [estado, setEstado] = useState(null); // { data, paginas? , error? }

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const blob = await generarFichasBlob({ fichasData, liga, miUnidad });
        const buf = await blob.arrayBuffer();
        if (!vivo) return;
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        const paginas = [];
        for (let i = 1; i <= doc.numPages; i++) {
          if (!vivo) return;
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 }); // nitidez en retina
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
          paginas.push(canvas.toDataURL("image/png"));
          canvas.width = canvas.height = 0; // liberar memoria en móvil
        }
        if (vivo) setEstado({ data: fichasData, paginas });
      } catch (e) {
        if (vivo) setEstado({ data: fichasData, error: e?.message || String(e) });
      }
    })();
    return () => { vivo = false; };
  }, [fichasData, liga, miUnidad]);

  const actual = estado && estado.data === fichasData ? estado : null;

  if (!actual) {
    return (
      <div style={{ marginTop: 24, padding: 32, textAlign: "center", color: "#6b7280", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb" }}>
        Generando vista previa…
      </div>
    );
  }
  if (actual.error) {
    return (
      <div style={{ marginTop: 24, padding: 20, textAlign: "center", color: "#dc2626", fontSize: 13, border: "1px solid #fecaca", borderRadius: 8, background: "#fef2f2" }}>
        No se pudo generar la vista previa ({actual.error}). Usa el botón “Descargar PDF”.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      {actual.paginas.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`Ficha ${i + 1}`}
          style={{ width: "100%", maxWidth: 820, height: "auto", display: "block", border: "1px solid #d1d5db", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.10)", background: "#fff" }}
        />
      ))}
    </div>
  );
}

export default memo(FichaPdfPreview);
