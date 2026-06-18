import Solicitudes from "./Solicitudes";
import Auditoria from "./Auditoria";
import { useState, useEffect } from "react";
import JerseySVG, { JerseyDesignPicker } from "../components/JerseySVG";
import PersonalizacionUnidadFields from "../components/PersonalizacionUnidadFields";
import { uploadFile } from "../lib/storage";
import ColorPicker from "../components/ColorPicker";

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

// Tope de tarjetas de publicidad en la página principal.
const MAX_PUBLICIDAD = 6;
const PUBLI_TAMANO_MAX_MB = 5;

const db = async (path, token, options = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Error en la base de datos");
  }
  return res.status === 204 ? null : res.json();
};

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const TURNOS = ["Mañana", "Tarde", "Noche"];
const COLORES = ["#e53e3e","#dd6b20","#d69e2e","#38a169","#3182ce","#805ad5","#d53f8c","#2d3748","#319795","#e53e8c"];

export default function SuperAdmin({ session, seccionInicial = "canchas", setTopbarBack }) {
  const [seccion, setSeccion] = useState(seccionInicial);
  const [canchas, setCanchas] = useState([]);
  const [ligas, setLigas] = useState([]);
  const [ligasCanchaFilter, setLigasCanchaFilter] = useState(null); // si está set, ligas se filtra por esta unidad
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // "cancha" | "liga" | "equipo"
  const [reordenando, setReordenando] = useState(false); // muestra las flechas de orden

  // Formulario canchas
  const [canchaForm, setCanchaForm] = useState({ nombre: "", direccion: "", num_canchas: 1, logo_url: "", estilo_tarjeta: "logo_arriba", color_marca: "#4f8f2f", lema: "", portada_url: "", tamano_logo: "mediano", forma_logo: "cuadrado", intensidad_fondo: "medio" });
  const [editCanchaId, setEditCanchaId] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [portadaFile, setPortadaFile] = useState(null);
  const [portadaPreview, setPortadaPreview] = useState(null);

  // Equipos: ahora primero se elige unidad y luego liga
  const [equipos, setEquipos] = useState([]);
  const [canchaEquipos, setCanchaEquipos] = useState(null); // unidad seleccionada en pestaña equipos
  const [ligaEquipos, setLigaEquipos] = useState(null);
  const [equipoForm, setEquipoForm] = useState({ nombre: "", color_playera: "#3182ce", color_camiseta_2: "#ffffff", diseno_camiseta: "solido" });
  const [editEquipoId, setEditEquipoId] = useState(null);

  // Formulario ligas
  const [ligaForm, setLigaForm] = useState({ nombre: "", dia: "Lunes", turno: "Noche", cancha_id: "", temporada: "", color_marca: "#4f8f2f" });
  const [editLigaId, setEditLigaId] = useState(null);

  // Publicidad de la página principal
  const [publicidad, setPublicidad] = useState([]);
  const [publiFile, setPubliFile] = useState(null);
  const [publiPreview, setPubliPreview] = useState(null);
  const [publiEnlace, setPubliEnlace] = useState("");
  const [publiLoading, setPubliLoading] = useState(false);

  // Resultados (fichas cerradas)
  const [resultados, setResultados] = useState([]);
  const [resultadosLoading, setResultadosLoading] = useState(false);
  const [jugadoresInfo, setJugadoresInfo] = useState({ jug: {}, insc: {} });
  const [resultadoExpandido, setResultadoExpandido] = useState(null);
  const [filtroLigaRes, setFiltroLigaRes] = useState("todas");

  const token = session?.access_token;

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  // ── CARGAR DATOS ──────────────────────────────────────────────
  const cargarCanchas = async () => {
    try {
      const data = await db("/canchas?select=*&order=orden,created_at.asc", token);
      setCanchas(data || []);
    } catch (e) { showToast(e.message, "err"); }
  };

  const cargarLigas = async () => {
    try {
      const data = await db("/ligas?select=*,canchas(nombre)&order=orden,created_at.asc", token);
      setLigas(data || []);
    } catch (e) { showToast(e.message, "err"); }
  };

  // Reordenar con flechas: intercambia el valor "orden" de dos vecinos.
  // Actualización optimista; si falla un PATCH se revierte recargando.
  const moverCancha = async (idx, dir) => {
    const nuevoIdx = idx + dir;
    if (nuevoIdx < 0 || nuevoIdx >= canchas.length) return;
    const a = canchas[idx], b = canchas[nuevoIdx];
    const copia = [...canchas];
    copia[idx] = { ...b, orden: a.orden };
    copia[nuevoIdx] = { ...a, orden: b.orden };
    setCanchas(copia);
    try {
      await Promise.all([
        db(`/canchas?id=eq.${a.id}`, token, { method: "PATCH", body: JSON.stringify({ orden: b.orden }) }),
        db(`/canchas?id=eq.${b.id}`, token, { method: "PATCH", body: JSON.stringify({ orden: a.orden }) }),
      ]);
    } catch (e) { showToast(e.message, "err"); cargarCanchas(); }
  };

  // Reordena ligas dentro de la lista mostrada (que ya viene filtrada por unidad
  // cuando ligasCanchaFilter está activo), intercambiando "orden" entre vecinos.
  const moverLiga = async (lista, idx, dir) => {
    const nuevoIdx = idx + dir;
    if (nuevoIdx < 0 || nuevoIdx >= lista.length) return;
    const a = lista[idx], b = lista[nuevoIdx];
    setLigas(prev => prev.map(l =>
      l.id === a.id ? { ...l, orden: b.orden } : l.id === b.id ? { ...l, orden: a.orden } : l
    ));
    try {
      await Promise.all([
        db(`/ligas?id=eq.${a.id}`, token, { method: "PATCH", body: JSON.stringify({ orden: b.orden }) }),
        db(`/ligas?id=eq.${b.id}`, token, { method: "PATCH", body: JSON.stringify({ orden: a.orden }) }),
      ]);
    } catch (e) { showToast(e.message, "err"); cargarLigas(); }
  };

  useEffect(() => { cargarCanchas(); cargarLigas(); }, []);

  // Sincroniza la sección con el cambio de seccionInicial (clicks de la sidebar)
  useEffect(() => {
    if (!seccionInicial) return;
    if (seccionInicial !== seccion) {
      setSeccion(seccionInicial);
      setLigasCanchaFilter(null);
    }
  }, [seccionInicial]);

  // El modo "reordenar" se apaga al cambiar de sección para no dejar flechas sueltas.
  useEffect(() => { setReordenando(false); }, [seccion, ligasCanchaFilter]);

  // Topbar back: solo aparece cuando se está dentro de las ligas de una unidad
  // (la sección "auditoria" maneja su propio topbarBack internamente)
  useEffect(() => {
    if (!setTopbarBack) return;
    if (seccion === "auditoria") return; // delegar a Auditoria.jsx
    if (seccion === "ligas" && ligasCanchaFilter) {
      setTopbarBack({
        label: "Volver a unidades",
        onClick: () => { setLigasCanchaFilter(null); setSeccion("canchas"); },
      });
    } else {
      setTopbarBack(null);
    }
    return () => { if (seccion !== "auditoria") setTopbarBack(null); };
  }, [seccion, ligasCanchaFilter, setTopbarBack]);

  // ── RESULTADOS (FICHAS CERRADAS) ──────────────────────────────
  const cargarResultadosSA = async () => {
    setResultadosLoading(true);
    try {
      const ligasFiltro = filtroLigaRes === "todas" ? "" : `&liga_id=eq.${filtroLigaRes}`;
      const jornadas = await db(`/jornadas?select=id,numero,fecha,liga_id${ligasFiltro}&order=numero`, token);
      const jornadaIds = (jornadas || []).map(j => j.id);
      if (jornadaIds.length === 0) { setResultados([]); setResultadosLoading(false); return; }

      const partidos = await db(
        `/partidos?jornada_id=in.(${jornadaIds.join(",")})&select=id,jornada_id,equipo_local_id,equipo_visitante_id,jornadas(numero,fecha,liga_id),ficha_partido(*)`,
        token
      );

      const cerradas = (partidos || []).filter(p => {
        const f = Array.isArray(p.ficha_partido) ? p.ficha_partido[0] : p.ficha_partido;
        return f?.cerrada;
      });

      const equipoIds = new Set();
      cerradas.forEach(p => { equipoIds.add(p.equipo_local_id); equipoIds.add(p.equipo_visitante_id); });
      const equipos = equipoIds.size > 0
        ? await db(`/equipos?id=in.(${[...equipoIds].join(",")})&select=id,nombre,color_playera,liga_id`, token)
        : [];
      const equiposMap = Object.fromEntries(equipos.map(e => [e.id, e]));
      const ligasMap = Object.fromEntries((ligas || []).map(l => [l.id, l]));

      const jugIds = new Set();
      cerradas.forEach(p => {
        const f = Array.isArray(p.ficha_partido) ? p.ficha_partido[0] : p.ficha_partido;
        (f?.asistencia || []).forEach(id => jugIds.add(id));
        (f?.goleadores || []).forEach(g => g.jugador_id && jugIds.add(g.jugador_id));
      });
      const jugadores = jugIds.size > 0
        ? await db(`/jugadores?id=in.(${[...jugIds].join(",")})&select=id,nombre_completo,numero_afiliado`, token)
        : [];
      const jugadoresMap = Object.fromEntries(jugadores.map(j => [j.id, j]));

      const inscripciones = jugIds.size > 0
        ? await db(`/jugador_equipo?jugador_id=in.(${[...jugIds].join(",")})&select=jugador_id,equipo_id,dorsal`, token)
        : [];
      const inscMap = {};
      inscripciones.forEach(i => { inscMap[`${i.jugador_id}_${i.equipo_id}`] = i; });

      setJugadoresInfo({ jug: jugadoresMap, insc: inscMap });
      setResultados(cerradas.map(p => {
        const ficha = Array.isArray(p.ficha_partido) ? p.ficha_partido[0] : p.ficha_partido;
        const liga = ligasMap[p.jornadas?.liga_id];
        return {
          id: p.id,
          local: equiposMap[p.equipo_local_id],
          visitante: equiposMap[p.equipo_visitante_id],
          jornada: p.jornadas?.numero,
          fecha: p.jornadas?.fecha,
          liga,
          ficha,
        };
      }).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.jornada || 0) - (a.jornada || 0)));
    } catch (e) { showToast(e.message, "err"); }
    setResultadosLoading(false);
  };

  useEffect(() => {
    if (seccion === "resultados") cargarResultadosSA();
    if (seccion === "publicidad") cargarPublicidad();
  }, [seccion, filtroLigaRes]);

  // ── PUBLICIDAD DE LA PÁGINA PRINCIPAL ─────────────────────────
  const cargarPublicidad = async () => {
    try {
      const data = await db("/publicidad_home?select=*&order=orden,created_at", token);
      setPublicidad(data || []);
    } catch (e) { showToast(e.message, "err"); }
  };

  const onPickPubliFile = (f) => {
    if (!f) return;
    if (f.size > PUBLI_TAMANO_MAX_MB * 1024 * 1024) {
      const peso = (f.size / 1024 / 1024).toFixed(1);
      showToast(`La imagen pesa ${peso} MB. Máximo permitido: ${PUBLI_TAMANO_MAX_MB} MB.`, "err");
      return;
    }
    if (publiPreview?.startsWith("blob:")) URL.revokeObjectURL(publiPreview);
    setPubliFile(f);
    setPubliPreview(URL.createObjectURL(f));
  };

  const limpiarPubliForm = () => {
    if (publiPreview?.startsWith("blob:")) URL.revokeObjectURL(publiPreview);
    setPubliFile(null);
    setPubliPreview(null);
    setPubliEnlace("");
  };

  const agregarPublicidad = async () => {
    if (!publiFile) return showToast("Sube una imagen primero", "err");
    if (publicidad.length >= MAX_PUBLICIDAD) {
      return showToast(`Máximo ${MAX_PUBLICIDAD} tarjetas de publicidad`, "err");
    }
    setPubliLoading(true);
    try {
      const ext = (publiFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `publicidad_home/${Date.now()}.${ext}`;
      const imagen_url = await uploadFile("imagenes", path, publiFile, token);
      const maxOrden = publicidad.reduce((m, p) => Math.max(m, p.orden ?? 0), -1);
      const enlace = publiEnlace.trim() || null;
      const creado = await db("/publicidad_home", token, {
        method: "POST",
        body: JSON.stringify({ imagen_url, enlace, orden: maxOrden + 1, activo: true }),
      });
      const fila = Array.isArray(creado) ? creado[0] : creado;
      if (!fila) throw new Error("No se pudo guardar la publicidad.");
      setPublicidad([...publicidad, fila]);
      showToast("Publicidad agregada ✓");
      limpiarPubliForm();
    } catch (e) { showToast(e.message, "err"); }
    setPubliLoading(false);
  };

  const togglePubliActivo = async (p) => {
    try {
      const filas = await db(`/publicidad_home?id=eq.${p.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ activo: !p.activo }),
      });
      if (!Array.isArray(filas) || filas.length === 0) throw new Error("No se pudo actualizar (revisa permisos).");
      setPublicidad(publicidad.map(x => x.id === p.id ? { ...x, activo: !p.activo } : x));
    } catch (e) { showToast(e.message, "err"); }
  };

  const moverPublicidad = async (idx, dir) => {
    const nuevoIdx = idx + dir;
    if (nuevoIdx < 0 || nuevoIdx >= publicidad.length) return;
    const a = publicidad[idx], b = publicidad[nuevoIdx];
    const previo = publicidad;
    const copia = [...publicidad];
    copia[idx] = { ...b, orden: a.orden };
    copia[nuevoIdx] = { ...a, orden: b.orden };
    setPublicidad(copia);
    try {
      await Promise.all([
        db(`/publicidad_home?id=eq.${a.id}`, token, { method: "PATCH", body: JSON.stringify({ orden: b.orden }) }),
        db(`/publicidad_home?id=eq.${b.id}`, token, { method: "PATCH", body: JSON.stringify({ orden: a.orden }) }),
      ]);
    } catch (e) { setPublicidad(previo); showToast(e.message, "err"); }
  };

  const eliminarPublicidad = async (p) => {
    if (!confirm("¿Eliminar esta tarjeta de publicidad?")) return;
    try {
      await db(`/publicidad_home?id=eq.${p.id}`, token, { method: "DELETE" });
      setPublicidad(publicidad.filter(x => x.id !== p.id));
      showToast("Publicidad eliminada");
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── CANCHAS ───────────────────────────────────────────────────
  const guardarCancha = async () => {
    if (!canchaForm.nombre) return showToast("El nombre es obligatorio", "err");
    setLoading(true);
    try {
      let logo_url = canchaForm.logo_url;
      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const path = `logos-unidades/${Date.now()}.${ext}`;
        logo_url = await uploadFile("imagenes", path, logoFile, token);
      }
      let portada_url = canchaForm.portada_url;
      if (portadaFile) {
        const ext = portadaFile.name.split(".").pop();
        const path = `portadas-unidades/${Date.now()}.${ext}`;
        portada_url = await uploadFile("imagenes", path, portadaFile, token, "portada");
      }
      const payload = { ...canchaForm, logo_url, portada_url };
      if (editCanchaId) {
        await db(`/canchas?id=eq.${editCanchaId}`, token, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Unidad deportiva actualizada ✓");
      } else {
        await db("/canchas", token, { method: "POST", body: JSON.stringify(payload) });
        showToast("Unidad deportiva registrada ✓");
      }
      setCanchaForm({ nombre: "", direccion: "", num_canchas: 1, logo_url: "", estilo_tarjeta: "logo_arriba", color_marca: "#4f8f2f", lema: "", portada_url: "", tamano_logo: "mediano", forma_logo: "cuadrado", intensidad_fondo: "medio" });
      setLogoFile(null);
      setLogoPreview(null);
      setPortadaFile(null);
      setPortadaPreview(null);
      setEditCanchaId(null);
      setModal(null);
      cargarCanchas();
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const eliminarCancha = async (id) => {
    if (!confirm("¿Eliminar esta unidad deportiva? Esta acción no se puede deshacer.\n\nSolo se puede eliminar si ya no tiene ligas. Las estadísticas históricas de los jugadores no se ven afectadas.")) return;
    try {
      await db("/rpc/eliminar_unidad", token, { method: "POST", body: JSON.stringify({ p_cancha_id: id }) });
      showToast("Unidad deportiva eliminada");
      cargarCanchas();
    } catch (e) { showToast(e.message, "err"); }
  };

  // Activar / desactivar unidad: una unidad inactiva no aparece en la
  // página principal (igual que una liga inactiva).
  const toggleCancha = async (c) => {
    const activa = c.activa !== false;
    try {
      const filas = await db(`/canchas?id=eq.${c.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ activa: !activa }),
      });
      if (!Array.isArray(filas) || filas.length === 0) throw new Error("No se pudo actualizar (revisa permisos).");
      setCanchas(canchas.map(x => x.id === c.id ? { ...x, activa: !activa } : x));
      showToast(activa ? "Unidad desactivada (oculta del inicio)" : "Unidad activada ✓");
    } catch (e) { showToast(e.message, "err"); }
  };

  const editarCancha = (c) => {
    setCanchaForm({
      nombre: c.nombre,
      direccion: c.direccion || "",
      num_canchas: c.num_canchas,
      logo_url: c.logo_url || "",
      estilo_tarjeta: c.estilo_tarjeta || "logo_arriba",
      color_marca: c.color_marca || "#4f8f2f",
      lema: c.lema || "",
      portada_url: c.portada_url || "",
      tamano_logo: c.tamano_logo || "mediano",
      forma_logo: c.forma_logo || "cuadrado",
      intensidad_fondo: c.intensidad_fondo || "medio"
    });
    setLogoFile(null);
    setLogoPreview(c.logo_url || null);
    setPortadaFile(null);
    setPortadaPreview(c.portada_url || null);
    setEditCanchaId(c.id);
    setModal("cancha");
  };

  // ── LIGAS ─────────────────────────────────────────────────────
  const guardarLiga = async () => {
    if (!ligaForm.nombre || !ligaForm.cancha_id) return showToast("Nombre y unidad deportiva son obligatorios", "err");
    setLoading(true);
    try {
      if (editLigaId) {
        await db(`/ligas?id=eq.${editLigaId}`, token, { method: "PATCH", body: JSON.stringify(ligaForm) });
        showToast("Liga actualizada ✓");
      } else {
        await db("/ligas", token, { method: "POST", body: JSON.stringify({ ...ligaForm, activa: true }) });
        showToast("Liga creada ✓");
      }
      setLigaForm({ nombre: "", dia: "Lunes", turno: "Noche", cancha_id: "", temporada: "", color_marca: "#4f8f2f" });
      setEditLigaId(null);
      setModal(null);
      cargarLigas();
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const eliminarLiga = async (id) => {
    if (!confirm("¿Eliminar esta liga? Esta acción no se puede deshacer.\n\nSe borrarán sus equipos, partidos y fichas, pero las estadísticas de los jugadores quedarán archivadas en su historial.")) return;
    try {
      await db("/rpc/eliminar_liga", token, { method: "POST", body: JSON.stringify({ p_liga_id: id }) });
      showToast("Liga eliminada (estadísticas archivadas)");
      cargarLigas();
    } catch (e) { showToast(e.message, "err"); }
  };

  const editarLiga = (l) => {
    setLigaForm({ nombre: l.nombre, dia: l.dia, turno: l.turno, cancha_id: l.cancha_id, temporada: l.temporada || "", color_marca: l.color_marca || "#4f8f2f" });
    setEditLigaId(l.id);
    setModal("liga");
  };

  const toggleLiga = async (liga) => {
    try {
      await db(`/ligas?id=eq.${liga.id}`, token, { method: "PATCH", body: JSON.stringify({ activa: !liga.activa }) });
      showToast(liga.activa ? "Liga desactivada" : "Liga activada ✓");
      cargarLigas();
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── EQUIPOS ───────────────────────────────────────────────────
  const cargarEquipos = async (ligaId) => {
    if (!ligaId) return;
    try {
      const data = await db(`/equipos?liga_id=eq.${ligaId}&order=nombre`, token);
      setEquipos(data || []);
    } catch (e) { showToast(e.message, "err"); }
  };

  const guardarEquipo = async () => {
    if (!equipoForm.nombre) return showToast("El nombre es obligatorio", "err");
    if (!ligaEquipos) return showToast("Selecciona una liga primero", "err");
    setLoading(true);
    try {
      const payload = { nombre: equipoForm.nombre, color_playera: equipoForm.color_playera, color_camiseta_2: equipoForm.color_camiseta_2, diseno_camiseta: equipoForm.diseno_camiseta, liga_id: ligaEquipos.id };
      if (editEquipoId) {
        await db(`/equipos?id=eq.${editEquipoId}`, token, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Equipo actualizado ✓");
      } else {
        await db("/equipos", token, { method: "POST", body: JSON.stringify(payload) });
        showToast("Equipo registrado ✓");
      }
      setEquipoForm({ nombre: "", color_playera: "#3182ce", color_camiseta_2: "#ffffff", diseno_camiseta: "solido" });
      setEditEquipoId(null);
      setModal(null);
      cargarEquipos(ligaEquipos.id);
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  // Baja lógica: conserva el id del equipo y su historial; solo lo marca inactivo.
  const eliminarEquipo = async (id) => {
    if (!confirm("¿Dar de baja este equipo? Saldrá de la tabla general y del generador, pero sus partidos ya jugados se conservan.")) return;
    try {
      await db(`/equipos?id=eq.${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ activo: false, dado_baja_en: new Date().toISOString() }),
      });
      showToast("Equipo dado de baja");
      cargarEquipos(ligaEquipos.id);
    } catch (e) { showToast(e.message, "err"); }
  };

  const reactivarEquipo = async (id) => {
    try {
      await db(`/equipos?id=eq.${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ activo: true, dado_baja_en: null }),
      });
      showToast("Equipo reactivado ✓");
      cargarEquipos(ligaEquipos.id);
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── RENDER ────────────────────────────────────────────────────
  // Equipos activos (en competencia) vs. dados de baja (fuera de tabla/generador).
  const equiposActivos = equipos.filter(e => e.activo !== false);
  const equiposBaja = equipos.filter(e => e.activo === false);

  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {toast && <div style={{ ...s.toast, background: toast.tipo === "err" ? "#ef4444" : "#4ade80", color: toast.tipo === "err" ? "#fff" : "#0d0d1a" }}>{toast.msg}</div>}

      {/* ENCABEZADO contextual con tarjeta verde gradiente. Cambia según la pestaña. */}
      {(() => {
        const HEADERS = {
          canchas:     { icon: "🏟️", label: "GESTIÓN",       title: "Unidades Deportivas", sub: "Administra las unidades de la plataforma" },
          ligas:       { icon: "🏆", label: "TORNEOS",       title: "Ligas",                sub: "Ligas registradas en la plataforma" },
          equipos:     { icon: "👕", label: "COMPETIDORES",  title: "Equipos",              sub: "Equipos inscritos por torneo" },
          stats:       { icon: "📊", label: "RESUMEN",       title: "Estadísticas",         sub: "Visión general de la plataforma" },
          resultados:  { icon: "⚽", label: "FICHAS",         title: "Resultados",           sub: "Fichas cerradas y marcadores" },
          solicitudes: { icon: "📨", label: "REGISTROS",     title: "Solicitudes",          sub: "Aprobar o rechazar registros" },
          publicidad:  { icon: "📢", label: "PUBLICIDAD",    title: "Publicidad principal", sub: "Tarjetas de anuncios en la página de inicio" },
          auditoria:   { icon: "📜", label: "AUDITORÍA",    title: "Registro de acciones", sub: "Acciones recientes de admins, árbitros y capitanes" },
        };
        const h = HEADERS[seccion] || HEADERS.canchas;
        return (
          <div style={s.heroCard}>
            <div style={s.heroGlow} />
            <div style={s.heroInner}>
              <div style={s.heroIcon}>{h.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.heroLabel}>{h.label}</div>
                <h2 style={s.heroTitle}>{h.title}</h2>
                <p style={s.heroSub}>{h.sub}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── SECCIÓN CANCHAS ── */}
      {seccion === "canchas" && (
        <div>
          <div style={{ ...s.secCount, marginBottom: 10 }}>{canchas.length} unidades deportivas registradas</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <button style={s.btnAdd} onClick={() => { setCanchaForm({ nombre: "", direccion: "", num_canchas: 1, logo_url: "", estilo_tarjeta: "logo_arriba", color_marca: "#4f8f2f", lema: "", portada_url: "", tamano_logo: "mediano", forma_logo: "cuadrado", intensidad_fondo: "medio" }); setLogoFile(null); setLogoPreview(null); setPortadaFile(null); setPortadaPreview(null); setEditCanchaId(null); setModal("cancha"); }}>
              + Nueva unidad deportiva
            </button>
            {canchas.length > 1 && (
              <button style={reordenando ? s.btnReordenarOn : s.btnReordenar} onClick={() => setReordenando(!reordenando)}>
                {reordenando ? "✓ Listo" : "↕ Reordenar"}
              </button>
            )}
          </div>

          {canchas.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>🏟️</div>
              <div style={s.emptyTxt}>No hay unidades deportivas registradas aún</div>
              <button style={s.btnAdd} onClick={() => setModal("cancha")}>Agregar primera unidad deportiva</button>
            </div>
          ) : (
            <div style={s.grid}>
              {canchas.map((c, idx) => {
                const activa = c.activa !== false;
                return (
                <div key={c.id} style={{ ...s.card, opacity: activa ? 1 : 0.55 }} className="sa-card">
                  <div style={s.cardTop}>
                    <div style={s.cardIcon}>
                      {c.logo_url
                        ? <img src={c.logo_url} alt={c.nombre} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
                        : "🏟️"}
                    </div>
                    <div style={s.cardActionsCol}>
                      <div style={s.cardActions}>
                        {reordenando ? (
                          <>
                            <button style={{ ...s.btnEdit, opacity: idx === 0 ? 0.35 : 1 }} disabled={idx === 0} onClick={() => moverCancha(idx, -1)} title="Subir">↑</button>
                            <button style={{ ...s.btnEdit, opacity: idx === canchas.length - 1 ? 0.35 : 1 }} disabled={idx === canchas.length - 1} onClick={() => moverCancha(idx, 1)} title="Bajar">↓</button>
                          </>
                        ) : (
                          <>
                            <button style={s.btnEdit} onClick={() => editarCancha(c)} title="Editar">✏️</button>
                            <button style={s.btnDel} onClick={() => eliminarCancha(c.id)} title="Eliminar">🗑️</button>
                          </>
                        )}
                      </div>
                      <button style={s.btnVerLigas} onClick={() => { setLigasCanchaFilter(c.id); setSeccion("ligas"); }}>
                        🏆 Ver ligas
                      </button>
                    </div>
                  </div>
                  <div style={s.cardName}>{c.nombre}</div>
                  <div style={s.cardMeta}>{c.direccion || "Sin dirección"}</div>
                  <div style={s.cardBadge}>{c.num_canchas} {c.num_canchas === 1 ? "campo" : "campos"}</div>
                  <div style={s.cardLigas}>
                    {ligas.filter(l => l.cancha_id === c.id).length} ligas activas
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                    <span style={{ ...s.statusBadge, background: activa ? "#0d2a0d" : "#1a1a1a", color: activa ? "#4ade80" : "#999", border: `1px solid ${activa ? "#1a4a1a" : "#333"}` }}>
                      {activa ? "Visible en inicio" : "Oculta"}
                    </span>
                    <button style={s.btnToggle} onClick={() => toggleCancha(c)}>{activa ? "Desactivar" : "Activar"}</button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SECCIÓN LIGAS ── */}
      {seccion === "ligas" && (() => {
        const canchaFiltro = ligasCanchaFilter ? canchas.find(c => c.id === ligasCanchaFilter) : null;
        const ligasMostradas = ligasCanchaFilter ? ligas.filter(l => l.cancha_id === ligasCanchaFilter) : ligas;
        return (
        <div>
          <div style={{ ...s.secCount, marginBottom: 10 }}>
            {ligasMostradas.length} {ligasMostradas.length === 1 ? "liga" : "ligas"}
            {canchaFiltro ? ` en ${canchaFiltro.nombre}` : " registradas"}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <button style={s.btnAdd}
              onClick={() => { setLigaForm({ nombre: "", dia: "Lunes", turno: "Noche", cancha_id: canchaFiltro?.id || "", temporada: "", color_marca: "#4f8f2f" }); setEditLigaId(null); setModal("liga"); }}
              disabled={canchas.length === 0}>
              + Nueva liga
            </button>
            {canchaFiltro && ligasMostradas.length > 1 && (
              <button style={reordenando ? s.btnReordenarOn : s.btnReordenar} onClick={() => setReordenando(!reordenando)}>
                {reordenando ? "✓ Listo" : "↕ Reordenar"}
              </button>
            )}
          </div>

          {canchas.length === 0 && (
            <div style={s.warningBox}>⚠️ Primero debes registrar al menos una unidad deportiva para poder crear ligas.</div>
          )}

          {ligasMostradas.length === 0 && canchas.length > 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>🏆</div>
              <div style={s.emptyTxt}>
                {canchaFiltro ? `No hay ligas registradas en ${canchaFiltro.nombre}` : "No hay ligas registradas aún"}
              </div>
              <button style={s.btnAdd}
                onClick={() => { setLigaForm({ nombre: "", dia: "Lunes", turno: "Noche", cancha_id: canchaFiltro?.id || "", temporada: "", color_marca: "#4f8f2f" }); setEditLigaId(null); setModal("liga"); }}>
                Crear primera liga
              </button>
            </div>
          ) : (
            <div style={s.ligaList}>
              {ligasMostradas.map((l, idx) => (
                <div key={l.id} style={{ ...s.ligaRow, opacity: l.activa ? 1 : 0.5 }} className="sa-card">
                  <div style={s.ligaLeft}>
                    {canchaFiltro && reordenando && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <button style={{ ...s.btnEdit, opacity: idx === 0 ? 0.35 : 1 }} disabled={idx === 0} onClick={() => moverLiga(ligasMostradas, idx, -1)} title="Subir">↑</button>
                        <button style={{ ...s.btnEdit, opacity: idx === ligasMostradas.length - 1 ? 0.35 : 1 }} disabled={idx === ligasMostradas.length - 1} onClick={() => moverLiga(ligasMostradas, idx, 1)} title="Bajar">↓</button>
                      </div>
                    )}
                    <div style={{ ...s.ligaDot, background: l.activa ? "#4ade80" : "#666" }} />
                    <div>
                      <div style={s.ligaNombre}>{l.nombre}</div>
                      <div style={s.ligaMeta}>
                        {l.dia} · {l.turno} · {l.canchas?.nombre || "Sin unidad deportiva"}
                        {l.temporada && ` · Temp. ${l.temporada}`}
                      </div>
                    </div>
                  </div>
                  <div style={s.ligaRight}>
                    <span style={{ ...s.statusBadge, background: l.activa ? "#0d2a0d" : "#1a1a1a", color: l.activa ? "#4ade80" : "#666", border: `1px solid ${l.activa ? "#1a4a1a" : "#333"}` }}>
                      {l.activa ? "Activa" : "Inactiva"}
                    </span>
                    <button style={s.btnToggle} onClick={() => toggleLiga(l)}>{l.activa ? "Desactivar" : "Activar"}</button>
                    <button style={s.btnEdit} onClick={() => editarLiga(l)}>✏️</button>
                    <button style={s.btnDel} onClick={() => eliminarLiga(l.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        );
      })()}

      {/* ── SECCIÓN RESUMEN ── */}
      {seccion === "stats" && (
        <div style={s.statsGrid}>
          {[
            ["🏟️", "Unidades Deportivas", canchas.length, "registradas"],
            ["🏆", "Ligas totales", ligas.length, "registradas"],
            ["✅", "Ligas activas", ligas.filter(l => l.activa).length, "en curso"],
            ["⏸️", "Ligas inactivas", ligas.filter(l => !l.activa).length, "pausadas"],
          ].map(([icon, label, val, sub]) => (
            <div key={label} style={s.statCard}>
              <div style={s.statIcon}>{icon}</div>
              <div style={s.statVal}>{val}</div>
              <div style={s.statLabel}>{label}</div>
              <div style={s.statSub}>{sub}</div>
            </div>
          ))}
          <div style={{ ...s.statCard, gridColumn: "1/-1" }}>
            <div style={s.statLabel}>Ligas por unidad deportiva</div>
            {canchas.map(c => (
              <div key={c.id} style={s.barRow}>
                <span style={s.barLabel}>{c.nombre}</span>
                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, width: `${Math.min((ligas.filter(l => l.cancha_id === c.id).length / Math.max(ligas.length, 1)) * 100, 100)}%` }} />
                </div>
                <span style={s.barCount}>{ligas.filter(l => l.cancha_id === c.id).length}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECCIÓN EQUIPOS ── */}
      {seccion === "equipos" && (
        <div>
          {/* Selector 1: Unidad deportiva */}
          <div style={s.field}>
            <label style={s.label}>Unidad deportiva</label>
            <select style={s.input} value={canchaEquipos?.id || ""} onChange={e => {
              const cancha = canchas.find(c => c.id === e.target.value) || null;
              setCanchaEquipos(cancha);
              setLigaEquipos(null);
              setEquipos([]);
            }}>
              <option value="">Selecciona una unidad...</option>
              {canchas.map(c => <option key={c.id} value={c.id}>🏟️ {c.nombre}</option>)}
            </select>
          </div>

          {/* Selector 2: Liga (solo visible si hay unidad seleccionada) */}
          {canchaEquipos && (() => {
            const ligasUnidad = ligas.filter(l => l.cancha_id === canchaEquipos.id);
            return (
              <div style={s.field}>
                <label style={s.label}>Torneo</label>
                <select style={s.input} value={ligaEquipos?.id || ""} onChange={e => {
                  const liga = ligasUnidad.find(l => l.id === e.target.value) || null;
                  setLigaEquipos(liga);
                  if (liga) cargarEquipos(liga.id);
                  else setEquipos([]);
                }}>
                  <option value="">{ligasUnidad.length === 0 ? "Sin torneos en esta unidad" : "Selecciona un torneo..."}</option>
                  {ligasUnidad.map(l => <option key={l.id} value={l.id}>🏆 {l.nombre} · {l.dia} {l.turno}</option>)}
                </select>
              </div>
            );
          })()}

          {!canchaEquipos && (
            <div style={s.empty}>
              <div style={s.emptyIcon}>👆</div>
              <div style={s.emptyTxt}>Selecciona primero una unidad deportiva</div>
            </div>
          )}

          {canchaEquipos && !ligaEquipos && (
            <div style={s.empty}>
              <div style={s.emptyIcon}>👆</div>
              <div style={s.emptyTxt}>Ahora selecciona un torneo para ver o agregar equipos</div>
            </div>
          )}

          {ligaEquipos && (
            <>
              <div style={s.secHeader}>
                <span style={s.secCount}>{equiposActivos.length} equipos en {ligaEquipos.nombre}</span>
                <button style={s.btnAdd} onClick={() => { setEquipoForm({ nombre: "", color_playera: "#3182ce", color_camiseta_2: "#ffffff", diseno_camiseta: "solido" }); setEditEquipoId(null); setModal("equipo"); }}>
                  + Nuevo equipo
                </button>
              </div>

              {equipos.length === 0 ? (
                <div style={s.empty}>
                  <div style={s.emptyIcon}>👕</div>
                  <div style={s.emptyTxt}>No hay equipos en esta liga</div>
                  <button style={s.btnAdd} onClick={() => { setEquipoForm({ nombre: "", color_playera: "#3182ce", color_camiseta_2: "#ffffff", diseno_camiseta: "solido" }); setEditEquipoId(null); setModal("equipo"); }}>
                    Agregar primer equipo
                  </button>
                </div>
              ) : (
                <>
                {equiposActivos.length > 0 && (
                <div style={s.grid}>
                  {equiposActivos.map(eq => (
                    <div key={eq.id} style={{ ...s.card, borderTop: `3px solid ${eq.color_playera}` }} className="sa-card">
                      <div style={s.cardTop}>
                        <JerseySVG
                          diseno={eq.diseno_camiseta || "solido"}
                          color1={eq.color_playera || "#3182ce"}
                          color2={eq.color_camiseta_2 || "#ffffff"}
                          size={44}
                        />
                        <div style={s.cardActions}>
                          <button style={s.btnEdit} onClick={() => { setEquipoForm({ nombre: eq.nombre, color_playera: eq.color_playera || "#3182ce", color_camiseta_2: eq.color_camiseta_2 || "#ffffff", diseno_camiseta: eq.diseno_camiseta || "solido" }); setEditEquipoId(eq.id); setModal("equipo"); }}>✏️</button>
                          <button style={s.btnDel} onClick={() => eliminarEquipo(eq.id)}>🗑️</button>
                        </div>
                      </div>
                      <div style={s.cardName}>{eq.nombre}</div>
                    </div>
                  ))}
                </div>
                )}

                {equiposBaja.length > 0 && (
                  <div style={{ marginTop: 22 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", marginBottom: 10 }}>
                      📁 Equipos dados de baja ({equiposBaja.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {equiposBaja.map(eq => {
                        const fBaja = eq.dado_baja_en
                          ? new Date(eq.dado_baja_en).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
                          : null;
                        return (
                          <div key={eq.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f9fafb", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                            <JerseySVG diseno={eq.diseno_camiseta || "solido"} color1={eq.color_playera || "#9ca3af"} color2={eq.color_camiseta_2 || "#ffffff"} size={34} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: "#374151" }}>{eq.nombre}</div>
                              <div style={{ fontSize: 11.5, color: "#9ca3af" }}>
                                Dado de baja{fBaja ? ` · ${fBaja}` : ""}
                              </div>
                            </div>
                            <button
                              style={{ background: "#ecfdf5", color: "#047857", border: "1px solid #6ee7b7", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                              onClick={() => reactivarEquipo(eq.id)}>
                              Reactivar
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── SECCIÓN PUBLICIDAD (página principal) ── */}
      {seccion === "publicidad" && (
        <div>
          <div style={s.secHeader}>
            <span style={s.secCount}>{publicidad.length} / {MAX_PUBLICIDAD} tarjetas · se muestran en la página de inicio</span>
          </div>

          {publicidad.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>📢</div>
              <div style={s.emptyTxt}>Aún no hay publicidad en la página principal. Agrega la primera abajo.</div>
            </div>
          ) : (
            <div style={s.ligaList}>
              {publicidad.map((p, idx) => (
                <div key={p.id} style={{ ...s.ligaRow, opacity: p.activo ? 1 : 0.5 }} className="sa-card">
                  <div style={s.ligaLeft}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button style={{ ...s.btnEdit, opacity: idx === 0 ? 0.35 : 1 }} disabled={idx === 0} onClick={() => moverPublicidad(idx, -1)} title="Subir">↑</button>
                      <button style={{ ...s.btnEdit, opacity: idx === publicidad.length - 1 ? 0.35 : 1 }} disabled={idx === publicidad.length - 1} onClick={() => moverPublicidad(idx, 1)} title="Bajar">↓</button>
                    </div>
                    <img src={p.imagen_url} alt="Publicidad" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={s.ligaNombre}>{p.enlace ? "Con enlace" : "Sin enlace"}</div>
                      <div style={{ ...s.ligaMeta, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                        {p.enlace || "No clicable (solo imagen)"}
                      </div>
                    </div>
                  </div>
                  <div style={s.ligaRight}>
                    <span style={{ ...s.statusBadge, background: p.activo ? "#0d2a0d" : "#1a1a1a", color: p.activo ? "#4ade80" : "#666", border: `1px solid ${p.activo ? "#1a4a1a" : "#333"}` }}>
                      {p.activo ? "Visible" : "Oculta"}
                    </span>
                    <button style={s.btnToggle} onClick={() => togglePubliActivo(p)}>{p.activo ? "Ocultar" : "Mostrar"}</button>
                    <button style={s.btnDel} onClick={() => eliminarPublicidad(p)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Formulario para agregar */}
          {publicidad.length < MAX_PUBLICIDAD && (
            <div style={{ marginTop: 20, padding: 18, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>+ Agregar tarjeta de publicidad</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                <label style={{ cursor: "pointer", display: "block" }}>
                  <div style={{ width: 120, height: 120, borderRadius: 12, border: "2px dashed #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#f8fafc", color: "#94a3b8", fontSize: 13, textAlign: "center", padding: 8 }}>
                    {publiPreview ? <img src={publiPreview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "📷 Subir imagen"}
                  </div>
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => onPickPubliFile(e.target.files?.[0])} />
                </label>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Enlace (opcional)</label>
                  <input
                    style={s.input}
                    type="url"
                    placeholder="https://… (déjalo vacío si no tienen sitio)"
                    value={publiEnlace}
                    onChange={e => setPubliEnlace(e.target.value)}
                  />
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                    Si agregas un enlace, la tarjeta será clicable y abrirá esa página en una pestaña nueva.
                  </div>
                  <button style={{ ...s.btnAdd, marginTop: 12 }} onClick={agregarPublicidad} disabled={!publiFile || publiLoading}>
                    {publiLoading ? "Subiendo..." : "📢 Agregar publicidad"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {seccion === "solicitudes" && (
        <Solicitudes session={session} />
      )}

      {/* ── SECCIÓN AUDITORÍA ── */}
      {seccion === "auditoria" && (
        <Auditoria session={session} setTopbarBack={setTopbarBack} />
      )}

      {/* ── SECCIÓN RESULTADOS (FICHAS CERRADAS) ── */}
      {seccion === "resultados" && (
        <div>
          {/* Selector de torneo */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18, marginTop: 16, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Torneo:</span>
            <button
              onClick={() => setFiltroLigaRes("todas")}
              style={{
                background: filtroLigaRes === "todas" ? "#f0fdf4" : "#fff",
                border: `1px solid ${filtroLigaRes === "todas" ? "#4f8f2f" : "#e5e7eb"}`,
                color: filtroLigaRes === "todas" ? "#4f8f2f" : "#6b7280",
                borderRadius: 20, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600
              }}>
              ⚡ Todos
            </button>
            {ligas.map(l => (
              <button key={l.id}
                onClick={() => setFiltroLigaRes(l.id)}
                style={{
                  background: filtroLigaRes === l.id ? "#f0fdf4" : "#fff",
                  border: `1px solid ${filtroLigaRes === l.id ? "#4f8f2f" : "#e5e7eb"}`,
                  color: filtroLigaRes === l.id ? "#4f8f2f" : "#6b7280",
                  borderRadius: 20, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600
                }}
                title={l.canchas?.nombre}>
                🏆 {l.nombre}
              </button>
            ))}
            <button
              onClick={cargarResultadosSA}
              style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 12px", color:"#374151", fontSize:12, fontWeight:600, cursor:"pointer", marginLeft:"auto" }}
              disabled={resultadosLoading}>
              ↻ Actualizar
            </button>
          </div>

          {resultadosLoading ? (
            <div style={{ textAlign:"center", padding:60, color:"#6b7280" }}>Cargando…</div>
          ) : resultados.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
              <div style={{ color: "#6b7280", fontSize: 15, fontWeight: 600 }}>No hay partidos con ficha cerrada</div>
              <p style={{ color:"#9ca3af", fontSize:13 }}>
                {filtroLigaRes === "todas" ? "Cuando los árbitros cierren fichas aparecerán aquí." : "Este torneo aún no tiene partidos cerrados."}
              </p>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {resultados.map(r => {
                const expandido = resultadoExpandido === r.id;
                const goleadores = r.ficha?.goleadores || [];
                const asistencia = r.ficha?.asistencia || [];
                const golesLocal = goleadores.filter(g => g.equipo === r.local?.id);
                const golesVisit = goleadores.filter(g => g.equipo === r.visitante?.id);
                const asistLocal = asistencia.map(jid => ({ jid, insc: jugadoresInfo.insc?.[`${jid}_${r.local?.id}`], jug: jugadoresInfo.jug?.[jid] })).filter(x => x.insc);
                const asistVisit = asistencia.map(jid => ({ jid, insc: jugadoresInfo.insc?.[`${jid}_${r.visitante?.id}`], jug: jugadoresInfo.jug?.[jid] })).filter(x => x.insc);
                return (
                  <div key={r.id} style={sR.card}>
                    <div style={sR.top} onClick={() => setResultadoExpandido(expandido ? null : r.id)}>
                      <div style={sR.meta}>
                        <span style={sR.jornada}>J{r.jornada}</span>
                        <span style={sR.fecha}>{r.fecha || "Sin fecha"}</span>
                        <span style={sR.ligaTag}>🏆 {r.liga?.nombre || "—"}</span>
                      </div>
                      <div style={sR.mid}>
                        <div style={{ ...sR.eq, justifyContent:"flex-end" }}>
                          <span style={sR.eqNombre}>{r.local?.nombre || "—"}</span>
                          <span style={{ ...sR.eqColor, background: r.local?.color_playera || "#9ca3af" }} />
                        </div>
                        <div style={sR.marcador}>
                          {r.ficha?.goles_local} - {r.ficha?.goles_visitante}
                        </div>
                        <div style={sR.eq}>
                          <span style={{ ...sR.eqColor, background: r.visitante?.color_playera || "#9ca3af" }} />
                          <span style={sR.eqNombre}>{r.visitante?.nombre || "—"}</span>
                        </div>
                      </div>
                      <div style={sR.expandIcon}>{expandido ? "▲" : "▼"}</div>
                    </div>
                    {expandido && (
                      <div style={sR.detalle}>
                        <div style={sR.detSec}>
                          <div style={sR.detTitle}>⚽ Goleadores</div>
                          {goleadores.length === 0 ? (
                            <div style={sR.detEmpty}>Sin goles registrados</div>
                          ) : (
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                              <div>
                                <div style={sR.detSubT}>{r.local?.nombre}</div>
                                {golesLocal.length === 0 ? <div style={sR.detMini}>—</div> : golesLocal.map((g, i) => (
                                  <div key={i} style={sR.detMini}>
                                    <strong>#{g.dorsal || "?"}</strong> {g.nombre} <span style={{ color: "#4f8f2f", fontWeight: 800 }}>({g.goles})</span>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <div style={sR.detSubT}>{r.visitante?.nombre}</div>
                                {golesVisit.length === 0 ? <div style={sR.detMini}>—</div> : golesVisit.map((g, i) => (
                                  <div key={i} style={sR.detMini}>
                                    <strong>#{g.dorsal || "?"}</strong> {g.nombre} <span style={{ color: "#4f8f2f", fontWeight: 800 }}>({g.goles})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div style={sR.detSec}>
                          <div style={sR.detTitle}>👥 Asistencia ({asistencia.length})</div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                            <div>
                              <div style={sR.detSubT}>{r.local?.nombre} ({asistLocal.length})</div>
                              {asistLocal.length === 0 ? <div style={sR.detMini}>—</div> : asistLocal.map(({jid, insc, jug}) => (
                                <div key={jid} style={sR.detMini}>
                                  <strong>#{insc?.dorsal || "?"}</strong> {jug?.nombre_completo || "—"}
                                </div>
                              ))}
                            </div>
                            <div>
                              <div style={sR.detSubT}>{r.visitante?.nombre} ({asistVisit.length})</div>
                              {asistVisit.length === 0 ? <div style={sR.detMini}>—</div> : asistVisit.map(({jid, insc, jug}) => (
                                <div key={jid} style={sR.detMini}>
                                  <strong>#{insc?.dorsal || "?"}</strong> {jug?.nombre_completo || "—"}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        {(r.ficha?.faltas_local || r.ficha?.faltas_visitante || r.ficha?.observaciones) && (
                          <div style={sR.detSec}>
                            <div style={sR.detTitle}>📝 Otros</div>
                            <div style={sR.detMini}>
                              Faltas: {r.local?.nombre} ({r.ficha.faltas_local || 0}) · {r.visitante?.nombre} ({r.ficha.faltas_visitante || 0})
                            </div>
                            {r.ficha.observaciones && (
                              <div style={{ ...sR.detMini, marginTop: 6, fontStyle:"italic" }}>
                                "{r.ficha.observaciones}"
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL CANCHA ── */}
      {modal === "cancha" && (
        <div style={s.overlay} onClick={() => setModal(null)}>
          <div style={{ ...s.modalBox, maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
              <h3 style={{ ...s.modalTitle, marginBottom: 0 }}>{editCanchaId ? "Editar unidad deportiva" : "Nueva unidad deportiva"}</h3>
              <button onClick={() => setModal(null)} aria-label="Cerrar"
                style={{ background: "#f3f4f6", border: `1px solid ${BORDER}`, borderRadius: 8, width: 32, height: 32, minWidth: 32, cursor: "pointer", fontSize: 16, color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
            </div>

            <div style={s.field}>
              <label style={s.label}>Nombre de la unidad deportiva *</label>
              <input style={s.input} placeholder="ej. Canchas Manzano"
                value={canchaForm.nombre} onChange={e => setCanchaForm({ ...canchaForm, nombre: e.target.value })} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Dirección</label>
              <input style={s.input} placeholder="ej. Calle Reforma #45, Tonalá"
                value={canchaForm.direccion} onChange={e => setCanchaForm({ ...canchaForm, direccion: e.target.value })} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Número de campos disponibles</label>
              <input style={s.input} type="number" min="1" max="20"
                value={canchaForm.num_canchas} onChange={e => setCanchaForm({ ...canchaForm, num_canchas: +e.target.value })} />
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", margin: "8px 0 18px", paddingTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", marginBottom: 14 }}>🎨 Personalización</div>
              <PersonalizacionUnidadFields
                form={canchaForm} setForm={setCanchaForm}
                logoPreview={logoPreview} setLogoFile={setLogoFile} setLogoPreview={setLogoPreview}
                portadaPreview={portadaPreview} setPortadaFile={setPortadaFile} setPortadaPreview={setPortadaPreview}
                showToast={showToast}
              />
            </div>

            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button style={s.btnSave} onClick={guardarCancha} disabled={loading}>
                {loading ? "Guardando..." : editCanchaId ? "Guardar cambios" : "Crear unidad deportiva"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EQUIPO ── */}
      {modal === "equipo" && (
        <div style={s.overlay} onClick={() => setModal(null)}>
          <div style={{ ...s.modalBox, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>{editEquipoId ? "Editar equipo" : "Nuevo equipo"}</h3>

            {/* PREVIEW */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <JerseySVG
                diseno={equipoForm.diseno_camiseta}
                color1={equipoForm.color_playera}
                color2={equipoForm.color_camiseta_2}
                size={72}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Nombre del equipo *</label>
              <input style={s.input} placeholder="ej. Tigres FC"
                value={equipoForm.nombre} onChange={e => setEquipoForm({ ...equipoForm, nombre: e.target.value })} />
            </div>

            <div style={s.field}>
              <label style={s.label}>Diseño de camiseta</label>
              <JerseyDesignPicker
                diseno={equipoForm.diseno_camiseta}
                color1={equipoForm.color_playera}
                color2={equipoForm.color_camiseta_2}
                onChange={({ diseno }) => setEquipoForm({ ...equipoForm, diseno_camiseta: diseno })}
              />
            </div>

            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Color principal</label>
                <div style={{ marginTop: 6 }}>
                  <ColorPicker
                    size={28}
                    gap={6}
                    colores={COLORES}
                    valor={equipoForm.color_playera}
                    onChange={c => setEquipoForm({ ...equipoForm, color_playera: c })}
                  />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Color secundario</label>
                <div style={{ marginTop: 6 }}>
                  <ColorPicker
                    size={28}
                    gap={6}
                    colores={["#ffffff","#000000","#f5f5f5","#fbbf24","#ef4444","#3b82f6","#10b981","#8b5cf6"]}
                    valor={equipoForm.color_camiseta_2}
                    onChange={c => setEquipoForm({ ...equipoForm, color_camiseta_2: c })}
                  />
                </div>
              </div>
            </div>

            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button style={s.btnSave} onClick={guardarEquipo} disabled={loading}>
                {loading ? "Guardando..." : editEquipoId ? "Guardar cambios" : "Crear equipo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL LIGA ── */}
      {modal === "liga" && (
        <div style={s.overlay} onClick={() => setModal(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>{editLigaId ? "Editar liga" : "Nueva liga"}</h3>
            <div style={s.field}>
              <label style={s.label}>Nombre de la liga *</label>
              <input style={s.input} placeholder="ej. Liga Miércoles Noche"
                value={ligaForm.nombre} onChange={e => setLigaForm({ ...ligaForm, nombre: e.target.value })} />
            </div>
            <div style={s.formRow}>
              <div style={s.field}>
                <label style={s.label}>Día</label>
                <select style={s.input} value={ligaForm.dia} onChange={e => setLigaForm({ ...ligaForm, dia: e.target.value })}>
                  {DIAS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div style={s.field}>
                <label style={s.label}>Turno</label>
                <select style={s.input} value={ligaForm.turno} onChange={e => setLigaForm({ ...ligaForm, turno: e.target.value })}>
                  {TURNOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={s.field}>
              <label style={s.label}>Unidad Deportiva *</label>
              <select style={s.input} value={ligaForm.cancha_id} onChange={e => setLigaForm({ ...ligaForm, cancha_id: e.target.value })}>
                <option value="">Selecciona una unidad deportiva</option>
                {canchas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Temporada (opcional)</label>
              <input style={s.input} placeholder="ej. 2025-A"
                value={ligaForm.temporada} onChange={e => setLigaForm({ ...ligaForm, temporada: e.target.value })} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Color del torneo</label>
              <ColorPicker
                colores={["#4f8f2f","#3182ce","#e53e3e","#dd6b20","#d69e2e","#805ad5","#d53f8c","#0ea5e9","#14b8a6","#1f2937"]}
                valor={ligaForm.color_marca}
                onChange={c => setLigaForm({ ...ligaForm, color_marca: c })}
              />
              <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 8 }}>
                🎨 Toca el círculo con paleta para elegir un color a tu gusto.
              </div>
              <div style={{ marginTop: 10, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${ligaForm.color_marca} 0%, ${ligaForm.color_marca}88 100%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>
                Vista previa del header
              </div>
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button style={s.btnSave} onClick={guardarLiga} disabled={loading}>
                {loading ? "Guardando..." : editLigaId ? "Guardar cambios" : "Crear liga"}
              </button>
            </div>
          </div>
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
  wrap: { padding: "0" },
  header: { marginBottom: 18 }, // legacy
  title: { fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: -0.6, marginBottom: 4 }, // legacy
  sub: { color: "#6b7280", fontSize: 13, lineHeight: 1.35 }, // legacy
  // ── HERO CARD del encabezado contextual ──
  heroCard: { position: "relative", overflow: "hidden", background: "linear-gradient(145deg, #4f8f2f 0%, #3a6b22 100%)", borderRadius: 18, padding: "16px 16px 14px", marginBottom: 18, boxShadow: "0 6px 20px rgba(79,143,47,0.28)", color: "#fff" },
  heroGlow: { position: "absolute", top: -40, right: -40, width: 170, height: 170, borderRadius: "50%", background: "radial-gradient(circle, rgba(127,191,77,0.55) 0%, rgba(127,191,77,0) 70%)", pointerEvents: "none" },
  heroInner: { position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 13 },
  heroIcon: { width: 58, height: 58, borderRadius: 14, background: "rgba(255,255,255,0.22)", border: "2px solid rgba(255,255,255,0.42)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0, boxShadow: "0 4px 14px rgba(0,0,0,0.22)" },
  heroLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "rgba(255,255,255,0.82)", textTransform: "uppercase", marginBottom: 3 },
  heroTitle: { fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.5, margin: 0, marginBottom: 4, lineHeight: 1.15, textShadow: "0 1px 2px rgba(0,0,0,0.22)" },
  heroSub: { fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 1.35, margin: 0 },
  // Tabs scrolleables horizontalmente: no wrap, sin cortar palabras.
  tabs: { display: "flex", gap: 2, marginBottom: 18, borderBottom: `1px solid ${BORDER}`, paddingBottom: 0, overflowX: "auto", flexWrap: "nowrap", WebkitOverflowScrolling: "touch" },
  tab: { background: "transparent", border: "none", borderBottom: "2px solid transparent", color: "#6b7280", padding: "10px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "all 0.2s", marginBottom: -1, whiteSpace: "nowrap", flexShrink: 0 },
  tabActive: { color: GREEN, borderBottomColor: GREEN },
  secHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" },
  secCount: { color: "#6b7280", fontSize: 12 },
  btnAdd: { background: GREEN, color: "#ffffff", border: "none", borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", minHeight: 40 },
  btnReordenar: { background: "#ffffff", color: "#374151", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", minHeight: 40 },
  btnReordenarOn: { background: "#0d2a0d", color: "#4ade80", border: "1px solid #1a4a1a", borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", minHeight: 40 },
  grid: { display: "grid", gridTemplateColumns: "1fr", gap: 12 },
  card: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(79,143,47,0.08)", borderTop: `3px solid ${GREEN}` },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 },
  cardIcon: { width: 40, height: 40, background: "linear-gradient(135deg, #4f8f2f, #7fbf4d)", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: "0 3px 8px rgba(79,143,47,0.3)", flexShrink: 0 },
  cardActions: { display: "flex", gap: 4, flexShrink: 0 },
  cardActionsCol: { display: "flex", flexDirection: "column", gap: 5, alignItems: "stretch", flexShrink: 0 },
  btnVerLigas: { background: "#fff", borderWidth: 1.5, borderStyle: "solid", borderColor: "#4f8f2f", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 800, color: "#4f8f2f", cursor: "pointer", whiteSpace: "nowrap", lineHeight: 1.2 },
  cardName: { fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 3, wordBreak: "break-word" },
  cardMeta: { fontSize: 12, color: "#6b7280", marginBottom: 8, wordBreak: "break-word" },
  cardBadge: { display: "inline-block", background: "#f0fdf4", color: GREEN, fontSize: 10.5, padding: "3px 9px", borderRadius: 6, marginBottom: 6, border: "1px solid #c3e6a3" },
  cardLigas: { fontSize: 11.5, color: GREEN, fontWeight: 600 },
  ligaList: { display: "flex", flexDirection: "column", gap: 8 },
  ligaRow: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", gap: 8 },
  ligaLeft: { display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 },
  ligaDot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  ligaNombre: { fontSize: 13.5, fontWeight: 700, color: "#111827", marginBottom: 2, wordBreak: "break-word" },
  ligaMeta: { fontSize: 11, color: "#6b7280" },
  ligaRight: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 },
  statusBadge: { fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" },
  btnToggle: { background: "#f3f4f6", color: "#6b7280", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "5px 10px", fontSize: 11, cursor: "pointer" },
  btnEdit: { background: "#f3f4f6", color: "#6b7280", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 8px", fontSize: 13, cursor: "pointer", minWidth: 32 },
  btnDel: { background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 7, padding: "6px 8px", fontSize: 13, cursor: "pointer", minWidth: 32 },
  warningBox: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 12px", color: "#ca8a04", fontSize: 12, marginBottom: 14 },
  empty: { textAlign: "center", padding: "40px 16px" },
  emptyIcon: { fontSize: 42, marginBottom: 12 },
  emptyTxt: { color: "#6b7280", fontSize: 14, marginBottom: 16 },
  // Stat cards: 2 columnas en mobile. Padding/iconos/fuentes reducidos.
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 },
  statCard: { background: "linear-gradient(135deg, #f0fdf4 0%, #e8f5e1 100%)", border: "1px solid #c3e6a3", borderRadius: 12, padding: 12, boxShadow: "0 2px 8px rgba(79,143,47,0.1)" },
  statIcon: { width: 36, height: 36, background: "linear-gradient(135deg, #4f8f2f, #7fbf4d)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 8, boxShadow: "0 3px 10px rgba(79,143,47,0.3)" },
  statVal: { fontSize: 22, fontWeight: 900, color: GREEN, marginBottom: 2, lineHeight: 1 },
  statLabel: { fontSize: 11.5, fontWeight: 600, color: "#374151", marginBottom: 1, lineHeight: 1.25 },
  statSub: { fontSize: 10, color: "#6b7280" },
  barRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 10 },
  barLabel: { fontSize: 11.5, color: "#6b7280", width: 90, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  barTrack: { flex: 1, height: 7, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", background: GREEN, borderRadius: 4, transition: "width 0.5s ease" },
  barCount: { fontSize: 11.5, fontWeight: 700, color: "#111827", width: 18, textAlign: "right" },
  // El overlay scrollea todo el contenido; el modalBox usa margin:auto para
  // centrarse cuando cabe y, cuando es más alto que la pantalla, mantener el
  // borde superior alcanzable (a diferencia de justify-content:center, que lo
  // recorta). WebkitOverflowScrolling para scroll fluido en iOS.
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", overflowY: "auto", WebkitOverflowScrolling: "touch", zIndex: 1000, padding: 12, boxSizing: "border-box" },
  modalBox: { background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, width: "100%", maxWidth: 440, margin: "auto", boxSizing: "border-box", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", overflowX: "hidden" },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#111827", marginBottom: 18 },
  field: { marginBottom: 14, flex: 1 },
  formRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  input: { width: "100%", background: BASE, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "10px 12px", color: "#111827", fontSize: 14, outline: "none", boxSizing: "border-box" },
  modalActions: { display: "flex", gap: 8, marginTop: 18 },
  btnCancel: { flex: 1, background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "11px 8px", color: "#6b7280", fontSize: 13.5, cursor: "pointer", minHeight: 44 },
  btnSave: { flex: 2, background: GREEN, color: "#ffffff", border: "none", borderRadius: 10, padding: "11px 8px", fontWeight: 800, fontSize: 13.5, cursor: "pointer", minHeight: 44 },
  toast: { position: "fixed", bottom: 20, right: 20, padding: "12px 20px", borderRadius: 12, fontWeight: 700, fontSize: 13, zIndex: 9999 },
};

// Estilos sección de resultados (fichas cerradas)
const sR = {
  card: { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  top: { display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 14, padding: "12px 16px", cursor: "pointer" },
  meta: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, minWidth: 80 },
  jornada: { fontSize: 12, fontWeight: 800, color: "#4f8f2f", padding: "2px 8px", background: "#f0fdf4", borderRadius: 6, border: "1px solid #c3e6a3" },
  fecha: { fontSize: 11, color: "#9ca3af" },
  ligaTag: { fontSize: 10, color: "#6b7280", padding: "1px 6px", background: "#f3f4f6", borderRadius: 5, fontWeight: 600 },
  mid: { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10 },
  eq: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 },
  eqNombre: { fontSize: 13, fontWeight: 700, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  eqColor: { width: 12, height: 12, borderRadius: "50%", flexShrink: 0 },
  marcador: { fontSize: 18, fontWeight: 900, color: "#111827", padding: "4px 10px", background: "#f9fafb", borderRadius: 8 },
  expandIcon: { color: "#9ca3af", fontSize: 11 },
  detalle: { borderTop: "1px solid #e5e7eb", padding: "14px 16px", background: "#f9fafb" },
  detSec: { marginBottom: 14 },
  detTitle: { fontSize: 12, fontWeight: 800, color: "#111827", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  detSubT: { fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  detMini: { fontSize: 12, color: "#374151", padding: "3px 0" },
  detEmpty: { fontSize: 12, color: "#9ca3af", fontStyle: "italic" },
};

const css = `
  .sa-card { transition: transform 0.18s, box-shadow 0.18s; }
  .sa-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
  input:focus, select:focus { border-color: #4f8f2f !important; }
`;
