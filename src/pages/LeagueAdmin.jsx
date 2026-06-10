import ScheduleGenerator from "./ScheduleGenerator";
import FichaGenerator from "./FichaGenerator";
import { useState, useEffect } from "react";
import JerseySVG, { JerseyDesignPicker } from "../components/JerseySVG";
import PersonalizacionUnidadFields from "../components/PersonalizacionUnidadFields";
import { uploadFile } from "../lib/storage";
import ColorPicker from "../components/ColorPicker";

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

const COLORES = ["#e53e3e","#dd6b20","#d69e2e","#38a169","#3182ce","#805ad5","#d53f8c","#2d3748"];
const DIAS_LIGA = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const TURNOS_LIGA = ["Mañana","Tarde","Noche"];
const COLORES_LIGA = ["#4f8f2f","#3182ce","#e53e3e","#dd6b20","#d69e2e","#805ad5","#d53f8c","#0ea5e9","#14b8a6","#1f2937"];

// Patrocinadores: límites compartidos con la vista pública.
const MAX_PATROCINADORES = 6;
const PATRO_TAMANO_MAX_MB = 5;
const PATRO_ASPECT = { cuadrado: "1 / 1", horizontal: "16 / 9", vertical: "3 / 4" };
const PATRO_FORMATO_LABEL = { cuadrado: "Cuadrado", horizontal: "Horizontal", vertical: "Vertical" };
const PATRO_FORMATOS = [
  { val: "cuadrado",   titulo: "Cuadrado",   desc: "1:1" },
  { val: "horizontal", titulo: "Horizontal", desc: "16:9" },
  { val: "vertical",   titulo: "Vertical",   desc: "3:4" },
];

// Normaliza "1", "00001", "af-1", "AF-00001" → "AF-1" (sin ceros de relleno)
const normalizarAfiliado = (input) => {
  const limpio = String(input || "").trim().toUpperCase().replace(/^AF-?/, "");
  if (!limpio) return "";
  if (/^\d+$/.test(limpio)) return `AF-${parseInt(limpio, 10)}`;
  return `AF-${limpio}`;
};

// Devuelve { dorsal, cambiado } usando el preferido si está libre,
// o el primer libre disponible (1..999). Si todos están ocupados → null.
// Los dorsales son texto ("0", "00" y "000" son opciones distintas válidas).
const calcularDorsal = (preferido, ocupados) => {
  const set = new Set([...(ocupados || [])].map(String));
  const pref = preferido != null && preferido !== "" ? String(preferido) : null;
  if (pref && !set.has(pref)) return { dorsal: pref, cambiado: false };
  for (let i = 1; i <= 999; i++) {
    if (!set.has(String(i))) return { dorsal: String(i), cambiado: !!pref };
  }
  return { dorsal: null, cambiado: false };
};

export default function LeagueAdmin({ session, userRole, seccionInicial = "equipos", setTopbarBack }) {
  const [seccion, setSeccion] = useState(seccionInicial);
  const [ligas, setLigas] = useState([]);
  const [ligaSeleccionada, setLigaSeleccionada] = useState(null);
  const [equipos, setEquipos] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [equipoDetalle, setEquipoDetalle] = useState(null);
  const [jugadoresEquipo, setJugadoresEquipo] = useState([]);
  // Mapa jugador_id → partidos pendientes (subrayar y bloquear eliminación).
  const [sancionesEquipo, setSancionesEquipo] = useState({});
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Formulario equipo
  const [equipoForm, setEquipoForm] = useState({ nombre: "", color_playera: "#3182ce", color_camiseta_2: "#ffffff", diseno_camiseta: "solido", escudo_url: "" });
  const [escudoFile, setEscudoFile] = useState(null);
  const [escudoPreview, setEscudoPreview] = useState(null);
  const [editEquipoId, setEditEquipoId] = useState(null);

  // Árbitros
  const [arbitros, setArbitros] = useState([]);
  // Modal de confirmar árbitro: decide acceso total o por torneos específicos.
  const [confirmarArbTarget, setConfirmarArbTarget] = useState(null);
  const [confirmarAccesoTotal, setConfirmarAccesoTotal] = useState(true);
  const [confirmarLigasSel, setConfirmarLigasSel] = useState([]);

  // Personalización de la unidad
  const [miUnidad, setMiUnidad] = useState(null);
  const [personalizarForm, setPersonalizarForm] = useState({ logo_url: "", estilo_tarjeta: "logo_arriba", color_marca: "#4f8f2f", lema: "", portada_url: "", tamano_logo: "mediano", forma_logo: "cuadrado", intensidad_fondo: "medio" });
  const [personalizarLogoFile, setPersonalizarLogoFile] = useState(null);
  const [personalizarLogoPreview, setPersonalizarLogoPreview] = useState(null);
  const [personalizarPortadaFile, setPersonalizarPortadaFile] = useState(null);
  const [personalizarPortadaPreview, setPersonalizarPortadaPreview] = useState(null);

  // Patrocinadores de la unidad (publicidad)
  const [patrocinadores, setPatrocinadores] = useState([]);
  const [patroFormato, setPatroFormato] = useState("horizontal");
  const [patroFile, setPatroFile] = useState(null);
  const [patroPreview, setPatroPreview] = useState(null);
  const [patroLoading, setPatroLoading] = useState(false);

  // Color del torneo activo
  const [colorLigaForm, setColorLigaForm] = useState("#4f8f2f");

  // CRUD de torneos (alta/edición desde el panel del admin de unidad)
  const [ligaForm, setLigaForm] = useState({ nombre: "", dia: "Lunes", turno: "Noche", temporada: "", color_marca: "#4f8f2f" });
  const [editLigaId, setEditLigaId] = useState(null);
  const [eliminarLigaTarget, setEliminarLigaTarget] = useState(null);

  const token = session?.access_token;

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  // ── CARGAR LIGAS ─────────────────────────────────────────────
  const cargarLigas = async () => {
    try {
      const ligaFiltro = userRole?.cancha_id ? `&cancha_id=eq.${userRole.cancha_id}` : "";
      const data = await db(`/ligas?select=*,canchas(nombre)&activa=eq.true${ligaFiltro}&order=nombre`, token);
      setLigas(data || []);
      if (data?.length > 0 && !ligaSeleccionada) {
        setLigaSeleccionada(data[0]);
      }
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── CARGAR EQUIPOS ────────────────────────────────────────────
  const cargarEquipos = async (ligaId) => {
    if (!ligaId) return;
    try {
      const data = await db(`/equipos?liga_id=eq.${ligaId}&order=nombre`, token);
      setEquipos(data || []);
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── CARGAR JUGADORES DE LIGA ──────────────────────────────────
  const cargarJugadores = async (ligaId) => {
    if (!ligaId) return;
    try {
      const data = await db(
        `/jugador_equipo?liga_id=eq.${ligaId}&select=*,jugadores(nombre_completo,foto_url,posicion_preferida,numero_afiliado),equipos(nombre,color_playera)&order=created_at.desc`,
        token
      );
      setJugadores(data || []);
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── CARGAR JUGADORES DE UN EQUIPO ─────────────────────────────
  const cargarJugadoresEquipo = async (equipoId, ligaId) => {
    try {
      const data = await db(
        `/jugador_equipo?equipo_id=eq.${equipoId}&liga_id=eq.${ligaId}&select=*,jugadores(nombre_completo,foto_url,posicion_preferida,numero_afiliado)&order=dorsal`,
        token
      );
      // dorsal es texto: PostgREST lo ordena alfabéticamente ("10" < "2"), se reordena numérico.
      (data || []).sort((a, b) => (parseInt(a.dorsal, 10) || 0) - (parseInt(b.dorsal, 10) || 0));
      setJugadoresEquipo(data || []);
      // Carga sanciones activas del equipo para subrayar y bloquear eliminación.
      try {
        const sancs = await db(
          `/sanciones?equipo_id=eq.${equipoId}&partidos_pendientes=gt.0&select=jugador_id,partidos_pendientes`,
          token
        );
        const m = {};
        for (const s of (sancs || [])) m[s.jugador_id] = (m[s.jugador_id] || 0) + s.partidos_pendientes;
        setSancionesEquipo(m);
      } catch (_) { setSancionesEquipo({}); }
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── CAPITÁN: asignar / quitar / confirmar ─────────────────────
  const [modalCapitan, setModalCapitan] = useState(null); // null | "input" | "confirm"
  const [capitanForm, setCapitanForm] = useState({ numero_afiliado: "", dorsal: "" });
  const [capitanCandidato, setCapitanCandidato] = useState(null); // { jugador, yaInscrito }
  const [confirmQuitarCap, setConfirmQuitarCap] = useState(null); // { inscripcionId, nombre }
  const [eliminarEquipoTarget, setEliminarEquipoTarget] = useState(null); // equipo a eliminar (modal)
  const [desvincularArbTarget, setDesvincularArbTarget] = useState(null); // árbitro a desvincular (modal)

  // Gestión de jugadores (admin)
  const [modalJugadores, setModalJugadores] = useState(null); // "anadir_input" | "anadir_confirm" | "eliminar"
  const [anadirAfiliados, setAnadirAfiliados] = useState("");
  const [anadirCandidatos, setAnadirCandidatos] = useState([]);
  const [eliminarJugTarget, setEliminarJugTarget] = useState(null);

  const buscarCandidatoCapitan = async () => {
    const af = normalizarAfiliado(capitanForm.numero_afiliado);
    if (!af) return showToast("Ingresa un número de afiliado", "err");
    if (!equipoDetalle) return;
    setLoading(true);
    try {
      // Buscar jugador por número de afiliado
      const [jug] = await db(`/jugadores?numero_afiliado=eq.${af}&select=id,nombre_completo,foto_url,numero_afiliado,posicion_preferida,numero_preferido,nombre_camiseta_preferido`, token);
      if (!jug) {
        showToast("No existe un jugador con ese número de afiliado", "err");
        setLoading(false);
        return;
      }
      // Verificar si ya está inscrito en este equipo+liga
      const inscripciones = await db(
        `/jugador_equipo?jugador_id=eq.${jug.id}&liga_id=eq.${ligaSeleccionada.id}&select=id,equipo_id,dorsal,nombre_camiseta`,
        token
      );
      const enEsteEquipo = (inscripciones || []).find(i => i.equipo_id === equipoDetalle.id);
      const enOtroEquipoLiga = (inscripciones || []).find(i => i.equipo_id !== equipoDetalle.id);
      if (enOtroEquipoLiga) {
        showToast("Ese jugador ya pertenece a otro equipo de esta liga", "err");
        setLoading(false);
        return;
      }
      setCapitanCandidato({ jugador: jug, yaInscrito: enEsteEquipo || null });
      setModalCapitan("confirm");
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const confirmarCapitan = async () => {
    if (!capitanCandidato || !equipoDetalle) return;
    setLoading(true);
    try {
      const { jugador, yaInscrito } = capitanCandidato;
      if (yaInscrito) {
        // Solo marcar es_capitan=true en la inscripción existente
        await db(`/jugador_equipo?id=eq.${yaInscrito.id}`, token, {
          method: "PATCH",
          body: JSON.stringify({ es_capitan: true })
        });
      } else {
        // Crear inscripción con es_capitan=true
        const ocupados = new Set(jugadoresEquipo.map(je => je.dorsal).filter(Boolean));
        let dorsalFinal = null;
        let avisoDorsal = "";
        if (capitanForm.dorsal) {
          const dManual = String(capitanForm.dorsal).trim();
          if (ocupados.has(dManual)) {
            showToast(`El dorsal ${dManual} ya está en uso en este equipo`, "err");
            setLoading(false);
            return;
          }
          dorsalFinal = dManual;
        } else {
          const { dorsal, cambiado } = calcularDorsal(jugador.numero_preferido, ocupados);
          if (!dorsal) {
            showToast("No quedan dorsales libres en el equipo", "err");
            setLoading(false);
            return;
          }
          dorsalFinal = dorsal;
          if (cambiado) {
            avisoDorsal = ` Su preferido (#${jugador.numero_preferido}) estaba ocupado, se asignó #${dorsal}.`;
          }
        }
        const nombreCamiseta = (jugador.nombre_camiseta_preferido?.trim() || jugador.nombre_completo.split(" ").slice(-1)[0] || jugador.nombre_completo).toUpperCase();
        await db("/jugador_equipo", token, {
          method: "POST",
          body: JSON.stringify({
            jugador_id: jugador.id,
            equipo_id: equipoDetalle.id,
            liga_id: ligaSeleccionada.id,
            dorsal: dorsalFinal,
            nombre_camiseta: nombreCamiseta,
            es_capitan: true,
            activo: true,
          })
        });
        showToast(`👑 Capitán asignado.${avisoDorsal}`);
        setModalCapitan(null);
        setCapitanForm({ numero_afiliado: "", dorsal: "" });
        setCapitanCandidato(null);
        await cargarJugadoresEquipo(equipoDetalle.id, ligaSeleccionada.id);
        setLoading(false);
        return;
      }
      showToast("👑 Capitán asignado");
      setModalCapitan(null);
      setCapitanForm({ numero_afiliado: "", dorsal: "" });
      setCapitanCandidato(null);
      await cargarJugadoresEquipo(equipoDetalle.id, ligaSeleccionada.id);
    } catch (e) {
      const msg = String(e.message || "");
      if (msg.includes("jugador_equipo_unico_capitan_por_equipo")) {
        showToast("Este equipo ya tiene un capitán asignado", "err");
      } else {
        showToast(e.message, "err");
      }
    }
    setLoading(false);
  };

  // ── AÑADIR JUGADORES (ADMIN) ──────────────────────────────────
  const buscarCandidatosAdmin = async () => {
    if (!equipoDetalle || !ligaSeleccionada) return;
    const afs = anadirAfiliados
      .split(/[,\s\n]+/)
      .map(normalizarAfiliado)
      .filter(Boolean);
    if (afs.length === 0) return showToast("Ingresa al menos un número de afiliado", "err");
    if (jugadoresEquipo.length + afs.length > 17)
      return showToast(`Máximo 17 jugadores por equipo. Quedan ${17 - jugadoresEquipo.length} cupos.`, "err");

    setLoading(true);
    try {
      const idsActuales = new Set(jugadoresEquipo.map(j => j.jugadores?.numero_afiliado));
      const enLiga = await db(
        `/jugador_equipo?liga_id=eq.${ligaSeleccionada.id}&select=jugador_id,equipo_id`,
        token
      );
      const idsEnLiga = new Set((enLiga || []).map(e => e.jugador_id));

      const dorsalesOcupados = new Set(jugadoresEquipo.map(j => j.dorsal).filter(Boolean));

      const candidatos = [];
      const errores = [];
      for (const af of afs) {
        if (idsActuales.has(af)) { errores.push(`${af}: ya está en este equipo`); continue; }
        const [jug] = await db(
          `/jugadores?numero_afiliado=eq.${af}&select=id,nombre_completo,foto_url,numero_afiliado,posicion_preferida,numero_preferido,nombre_camiseta_preferido`,
          token
        );
        if (!jug) { errores.push(`${af}: no existe`); continue; }
        if (idsEnLiga.has(jug.id)) { errores.push(`${af} (${jug.nombre_completo}): ya inscrito en otro equipo de la liga`); continue; }
        const { dorsal, cambiado } = calcularDorsal(jug.numero_preferido, dorsalesOcupados);
        if (!dorsal) { errores.push(`${af}: no quedan dorsales libres en el equipo`); continue; }
        dorsalesOcupados.add(dorsal);
        const nombreCam = (jug.nombre_camiseta_preferido?.trim() || jug.nombre_completo.split(" ").slice(-1)[0] || jug.nombre_completo).toUpperCase();
        candidatos.push({
          ...jug,
          nombre_camiseta_sugerido: nombreCam,
          dorsal_asignado: dorsal,
          dorsal_cambiado: cambiado,
        });
      }

      if (errores.length > 0) showToast(errores.join(" · "), "err");
      if (candidatos.length === 0) { setLoading(false); return; }

      setAnadirCandidatos(candidatos);
      setModalJugadores("anadir_confirm");
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const confirmarAnadirAdmin = async () => {
    if (!equipoDetalle || anadirCandidatos.length === 0) return;
    setLoading(true);
    try {
      const payload = anadirCandidatos.map(c => ({
        jugador_id: c.id,
        equipo_id: equipoDetalle.id,
        liga_id: ligaSeleccionada.id,
        dorsal: c.dorsal_asignado,
        nombre_camiseta: c.nombre_camiseta_sugerido,
        es_capitan: false,
        activo: true,
      }));
      await db("/jugador_equipo", token, { method: "POST", body: JSON.stringify(payload) });
      const cambios = anadirCandidatos.filter(c => c.dorsal_cambiado).length;
      const baseMsg = `✓ ${anadirCandidatos.length} jugador${anadirCandidatos.length === 1 ? "" : "es"} añadido${anadirCandidatos.length === 1 ? "" : "s"}`;
      showToast(cambios > 0 ? `${baseMsg}. ${cambios} con dorsal alternativo.` : baseMsg);
      setModalJugadores(null);
      setAnadirAfiliados("");
      setAnadirCandidatos([]);
      await cargarJugadoresEquipo(equipoDetalle.id, ligaSeleccionada.id);
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  // ── ELIMINAR JUGADOR (ADMIN) ──────────────────────────────────
  const eliminarJugadorAdmin = async () => {
    if (!eliminarJugTarget || !equipoDetalle || !ligaSeleccionada) return;
    // Bloqueo si el jugador tiene sanción activa en este equipo.
    try {
      const sancs = await db(
        `/sanciones?jugador_id=eq.${eliminarJugTarget.jugador_id}&equipo_id=eq.${equipoDetalle.id}&partidos_pendientes=gt.0&select=partidos_pendientes`,
        token
      );
      const pendientes = (sancs || []).reduce((acc, s) => acc + s.partidos_pendientes, 0);
      if (pendientes > 0) {
        showToast(`No se puede eliminar: jugador con sanción activa (${pendientes} partidos)`, "err");
        setEliminarJugTarget(null);
        return;
      }
    } catch (_) { /* si falla la consulta, permitir continuar */ }
    setLoading(true);
    try {
      const jugadorId = eliminarJugTarget.jugador_id;
      const jornadas = await db(`/jornadas?liga_id=eq.${ligaSeleccionada.id}&select=id`, token);
      const jornadaIds = (jornadas || []).map(j => j.id);
      if (jornadaIds.length > 0) {
        const partidos = await db(
          `/partidos?jornada_id=in.(${jornadaIds.join(",")})&select=id`,
          token
        );
        const partidoIds = (partidos || []).map(p => p.id);
        if (partidoIds.length > 0) {
          const fichas = await db(
            `/ficha_partido?partido_id=in.(${partidoIds.join(",")})&cerrada=eq.false&select=id,goleadores,asistencia`,
            token
          );
          for (const f of fichas || []) {
            const goleadores = Array.isArray(f.goleadores) ? f.goleadores.filter(g => g.jugador_id !== jugadorId) : [];
            const asistencia = Array.isArray(f.asistencia) ? f.asistencia.filter(a => a !== jugadorId) : [];
            await db(`/ficha_partido?id=eq.${f.id}`, token, {
              method: "PATCH",
              body: JSON.stringify({ goleadores, asistencia })
            });
          }
        }
      }
      await db(`/jugador_equipo?id=eq.${eliminarJugTarget.id}`, token, { method: "DELETE" });
      showToast("Jugador eliminado del equipo");
      setModalJugadores(null);
      setEliminarJugTarget(null);
      await cargarJugadoresEquipo(equipoDetalle.id, ligaSeleccionada.id);
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const quitarCapitan = (inscripcionId, nombre) => {
    setConfirmQuitarCap({ inscripcionId, nombre });
  };

  const confirmarQuitarCapitan = async () => {
    if (!confirmQuitarCap) return;
    setLoading(true);
    try {
      await db(`/jugador_equipo?id=eq.${confirmQuitarCap.inscripcionId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ es_capitan: false })
      });
      showToast("Capitanía retirada");
      setConfirmQuitarCap(null);
      await cargarJugadoresEquipo(equipoDetalle.id, ligaSeleccionada.id);
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  // ── CARGAR ÁRBITROS ───────────────────────────────────────────
  const cargarArbitros = async () => {
    if (!ligaSeleccionada) return;
    try {
      const canchaId = ligaSeleccionada.cancha_id;
      // La RPC nombres_arbitros_unidad bypassa RLS y devuelve nombre + email
      // verificando que el caller sea league_admin de esta cancha o super_admin
      const [arbsCanchaData, arbsLigaData, nombresData] = await Promise.all([
        db(`/arbitro_cancha?cancha_id=eq.${canchaId}&select=user_id,acceso_total,confirmado`, token),
        db(`/arbitro_liga?liga_id=eq.${ligaSeleccionada.id}&select=user_id`, token),
        db(`/rpc/nombres_arbitros_unidad`, token, {
          method: "POST",
          body: JSON.stringify({ p_cancha_id: canchaId }),
        }),
      ]);
      const arbsLigaSet = new Set((arbsLigaData || []).map(a => a.user_id));
      const nombresMap = Object.fromEntries((nombresData || []).map(n => [n.user_id, { nombre: n.nombre, email: n.email }]));
      setArbitros((arbsCanchaData || []).map(arb => {
        const info = nombresMap[arb.user_id] || {};
        return {
          user_id: arb.user_id,
          nombre: info.nombre || "Árbitro",
          email: info.email || "",
          acceso_total: arb.acceso_total,
          confirmado: arb.confirmado,
          tiene_acceso_liga: arb.acceso_total || arbsLigaSet.has(arb.user_id),
        };
      }));
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── Confirmar / editar acceso de un árbitro ──────────────────────
  // Sirve tanto para confirmar un pendiente (sin accesos previos) como para
  // editar a uno ya confirmado. Si ya está confirmado precargamos su acceso
  // actual: total marcado o, si es por torneos, los torneos donde está.
  const abrirConfirmarArbitro = async (arbitro) => {
    setConfirmarArbTarget(arbitro);
    if (arbitro.confirmado && !arbitro.acceso_total) {
      // Cargar torneos de esta unidad donde tiene acceso, para precargar la lista.
      try {
        const canchaId = ligaSeleccionada?.cancha_id;
        const ligasUni = await db(`/ligas?cancha_id=eq.${canchaId}&select=id`, token);
        const ligaIds = (ligasUni || []).map(l => l.id);
        if (ligaIds.length > 0) {
          const accesos = await db(`/arbitro_liga?user_id=eq.${arbitro.user_id}&liga_id=in.(${ligaIds.join(",")})&select=liga_id`, token);
          setConfirmarLigasSel((accesos || []).map(r => r.liga_id));
        } else {
          setConfirmarLigasSel([]);
        }
      } catch {
        setConfirmarLigasSel([]);
      }
      setConfirmarAccesoTotal(false);
    } else if (arbitro.confirmado && arbitro.acceso_total) {
      // Ya tiene acceso total: mantenerlo seleccionado.
      setConfirmarAccesoTotal(true);
      setConfirmarLigasSel([]);
    } else {
      // Pendiente: por defecto acceso total (lo más común al confirmar).
      setConfirmarAccesoTotal(true);
      setConfirmarLigasSel([]);
    }
  };

  const cerrarConfirmarArbitro = () => {
    setConfirmarArbTarget(null);
    setConfirmarLigasSel([]);
  };

  const aplicarConfirmacion = async () => {
    if (!confirmarArbTarget || !ligaSeleccionada) return;
    if (!confirmarAccesoTotal && confirmarLigasSel.length === 0) {
      return showToast("Selecciona al menos un torneo o marca acceso total", "err");
    }
    setLoading(true);
    try {
      const canchaId = ligaSeleccionada.cancha_id;
      // 1) Marcar como confirmado + setear acceso_total según elección.
      await db(`/arbitro_cancha?user_id=eq.${confirmarArbTarget.user_id}&cancha_id=eq.${canchaId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ confirmado: true, acceso_total: !!confirmarAccesoTotal }),
      });
      // 2) Si eligió torneos específicos, insertar accesos en arbitro_liga.
      if (!confirmarAccesoTotal && confirmarLigasSel.length > 0) {
        // Borrar accesos previos a torneos de esta unidad (limpieza idempotente)
        const ligasUni = await db(`/ligas?cancha_id=eq.${canchaId}&select=id`, token);
        const ligaIds = (ligasUni || []).map(l => l.id);
        if (ligaIds.length > 0) {
          await db(`/arbitro_liga?user_id=eq.${confirmarArbTarget.user_id}&liga_id=in.(${ligaIds.join(",")})`, token, { method: "DELETE" });
        }
        for (const ligaId of confirmarLigasSel) {
          await db("/arbitro_liga", token, {
            method: "POST",
            body: JSON.stringify({ user_id: confirmarArbTarget.user_id, liga_id: ligaId }),
          });
        }
      }
      const detalle = confirmarAccesoTotal
        ? "con acceso a todos los torneos"
        : `con acceso a ${confirmarLigasSel.length} torneo${confirmarLigasSel.length === 1 ? "" : "s"}`;
      showToast(`${confirmarArbTarget.nombre} confirmado ✓ ${detalle}`);
      cerrarConfirmarArbitro();
      cargarArbitros();
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const toggleLigaConfirm = (ligaId) => {
    setConfirmarLigasSel(prev =>
      prev.includes(ligaId) ? prev.filter(x => x !== ligaId) : [...prev, ligaId]
    );
  };

  // ── Desvincular árbitro de la unidad (rechazar o despedir) ──────
  const desvincularArbitro = async (arbitro) => {
    try {
      const canchaId = ligaSeleccionada.cancha_id;
      // 1) borrar acceso a todos los torneos de esta unidad
      const ligasUni = await db(`/ligas?cancha_id=eq.${canchaId}&select=id`, token);
      const ligaIds = (ligasUni || []).map(l => l.id);
      if (ligaIds.length > 0) {
        await db(`/arbitro_liga?user_id=eq.${arbitro.user_id}&liga_id=in.(${ligaIds.join(",")})`, token, { method: "DELETE" });
      }
      // 2) sacarlo de la unidad
      await db(`/arbitro_cancha?user_id=eq.${arbitro.user_id}&cancha_id=eq.${canchaId}`, token, { method: "DELETE" });
      showToast(`${arbitro.nombre} desvinculado de la unidad`);
      setDesvincularArbTarget(null);
      cargarArbitros();
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── CARGAR MI UNIDAD ─────────────────────────────────────────
  const cargarMiUnidad = async () => {
    if (!userRole?.cancha_id) return;
    try {
      const data = await db(`/canchas?id=eq.${userRole.cancha_id}&select=*`, token);
      if (data?.[0]) setMiUnidad(data[0]);
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── GUARDAR PERSONALIZACIÓN ──────────────────────────────────
  const guardarPersonalizacion = async () => {
    if (!miUnidad) return;
    setLoading(true);
    try {
      let logo_url = personalizarForm.logo_url;
      if (personalizarLogoFile) {
        const ext = personalizarLogoFile.name.split(".").pop();
        const path = `logos-unidades/${Date.now()}.${ext}`;
        logo_url = await uploadFile("imagenes", path, personalizarLogoFile, token);
      }
      let portada_url = personalizarForm.portada_url;
      if (personalizarPortadaFile) {
        const ext = personalizarPortadaFile.name.split(".").pop();
        const path = `portadas-unidades/${Date.now()}.${ext}`;
        portada_url = await uploadFile("imagenes", path, personalizarPortadaFile, token, "portada");
      }
      const payload = { ...personalizarForm, logo_url, portada_url };
      const filas = await db(`/canchas?id=eq.${miUnidad.id}`, token, { method: "PATCH", body: JSON.stringify(payload) });
      // Si RLS bloquea la escritura, PostgREST responde 200 con [] (0 filas).
      // Sin esta comprobación el guardado fallaría en silencio y mentiría con "guardado ✓".
      if (!Array.isArray(filas) || filas.length === 0) {
        throw new Error("No se pudo guardar la personalización. No se actualizó ningún dato.");
      }
      showToast("Personalización guardada ✓");
      setMiUnidad({ ...miUnidad, ...payload });
      setPersonalizarLogoFile(null);
      setPersonalizarPortadaFile(null);
      setPersonalizarForm(f => ({ ...f, logo_url, portada_url }));
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  // ── PATROCINADORES (publicidad de la unidad) ─────────────────
  // Cada unidad maneja sus propios patrocinadores; se muestran al pie de las
  // secciones públicas de torneos (lista, tabla, partidos, eliminatoria),
  // excepto en "Goleadores" donde compiten visualmente con los rankings.
  const cargarPatrocinadores = async () => {
    if (!miUnidad) return;
    try {
      const data = await db(`/patrocinadores?cancha_id=eq.${miUnidad.id}&select=*&order=orden,created_at`, token);
      setPatrocinadores(data || []);
    } catch (e) { showToast(e.message, "err"); }
  };

  const onPickPatroFile = (f) => {
    if (!f) return;
    // Tope duro de 5 MB: storage.js comprime en 4.5-5 MB pero arriba de eso
    // mejor rechazar y avisar, así el admin sabe qué pasó con su foto.
    if (f.size > PATRO_TAMANO_MAX_MB * 1024 * 1024) {
      const peso = (f.size / 1024 / 1024).toFixed(1);
      showToast(`La imagen pesa ${peso} MB. Máximo permitido: ${PATRO_TAMANO_MAX_MB} MB. Comprímela y vuelve a intentar.`, "err");
      return;
    }
    if (patroPreview?.startsWith("blob:")) URL.revokeObjectURL(patroPreview);
    setPatroFile(f);
    setPatroPreview(URL.createObjectURL(f));
  };

  const limpiarPatroForm = () => {
    if (patroPreview?.startsWith("blob:")) URL.revokeObjectURL(patroPreview);
    setPatroFile(null);
    setPatroPreview(null);
    setPatroFormato("horizontal");
  };

  const agregarPatrocinador = async () => {
    if (!miUnidad) return;
    if (!patroFile) return showToast("Sube una imagen primero", "err");
    if (patrocinadores.length >= MAX_PATROCINADORES) {
      return showToast(`Máximo ${MAX_PATROCINADORES} patrocinadores por unidad`, "err");
    }
    setPatroLoading(true);
    try {
      const ext = (patroFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `patrocinadores/${miUnidad.id}/${Date.now()}.${ext}`;
      const imagen_url = await uploadFile("imagenes", path, patroFile, token);
      const maxOrden = patrocinadores.reduce((m, p) => Math.max(m, p.orden ?? 0), -1);
      const creado = await db("/patrocinadores", token, {
        method: "POST",
        body: JSON.stringify({
          cancha_id: miUnidad.id,
          imagen_url,
          formato: patroFormato,
          orden: maxOrden + 1,
          activo: true,
        }),
      });
      const fila = Array.isArray(creado) ? creado[0] : creado;
      if (!fila) throw new Error("No se pudo guardar el patrocinador.");
      setPatrocinadores([...patrocinadores, fila]);
      showToast("Patrocinador agregado ✓");
      limpiarPatroForm();
    } catch (e) { showToast(e.message, "err"); }
    setPatroLoading(false);
  };

  const togglePatroActivo = async (p) => {
    try {
      const filas = await db(`/patrocinadores?id=eq.${p.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ activo: !p.activo }),
      });
      if (!Array.isArray(filas) || filas.length === 0) throw new Error("No se pudo actualizar (revisa permisos).");
      setPatrocinadores(patrocinadores.map(x => x.id === p.id ? { ...x, activo: !p.activo } : x));
    } catch (e) { showToast(e.message, "err"); }
  };

  // Mover con flechas: intercambia el valor "orden" de dos vecinos en la lista
  // actual (no reasigna toda la secuencia para evitar N escrituras).
  const moverPatrocinador = async (idx, dir) => {
    const nuevoIdx = idx + dir;
    if (nuevoIdx < 0 || nuevoIdx >= patrocinadores.length) return;
    const a = patrocinadores[idx];
    const b = patrocinadores[nuevoIdx];
    const previo = patrocinadores;
    const copia = [...patrocinadores];
    copia[idx] = { ...b, orden: a.orden };
    copia[nuevoIdx] = { ...a, orden: b.orden };
    setPatrocinadores(copia);
    try {
      await Promise.all([
        db(`/patrocinadores?id=eq.${a.id}`, token, { method: "PATCH", body: JSON.stringify({ orden: b.orden }) }),
        db(`/patrocinadores?id=eq.${b.id}`, token, { method: "PATCH", body: JSON.stringify({ orden: a.orden }) }),
      ]);
    } catch (e) {
      setPatrocinadores(previo);
      showToast(e.message, "err");
    }
  };

  const eliminarPatrocinador = async (p) => {
    try {
      await db(`/patrocinadores?id=eq.${p.id}`, token, { method: "DELETE" });
      setPatrocinadores(patrocinadores.filter(x => x.id !== p.id));
      showToast("Patrocinador eliminado");
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── CRUD TORNEOS (admin de unidad) ──────────────────────────
  // El admin solo puede crear/editar torneos dentro de su propia unidad,
  // así que el cancha_id se fija desde userRole y no se expone en el form.
  const abrirNuevoTorneo = () => {
    setLigaForm({ nombre: "", dia: "Lunes", turno: "Noche", temporada: "", color_marca: "#4f8f2f" });
    setEditLigaId(null);
    setModal("liga");
  };

  const abrirEditarTorneo = (l) => {
    setLigaForm({
      nombre: l.nombre || "",
      dia: l.dia || "Lunes",
      turno: l.turno || "Noche",
      temporada: l.temporada || "",
      color_marca: l.color_marca || "#4f8f2f",
    });
    setEditLigaId(l.id);
    setModal("liga");
  };

  const guardarLiga = async () => {
    if (!ligaForm.nombre.trim()) return showToast("El nombre del torneo es obligatorio", "err");
    if (!userRole?.cancha_id) return showToast("No se pudo determinar tu unidad deportiva", "err");
    setLoading(true);
    try {
      const payload = {
        nombre: ligaForm.nombre.trim(),
        dia: ligaForm.dia,
        turno: ligaForm.turno,
        temporada: ligaForm.temporada || null,
        color_marca: ligaForm.color_marca,
      };
      if (editLigaId) {
        await db(`/ligas?id=eq.${editLigaId}`, token, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Torneo actualizado ✓");
      } else {
        const creada = await db("/ligas", token, {
          method: "POST",
          body: JSON.stringify({ ...payload, cancha_id: userRole.cancha_id, activa: true }),
        });
        showToast("Torneo creado ✓");
        // Si PostgREST devuelve la fila creada, la dejamos seleccionada de una.
        const nueva = Array.isArray(creada) ? creada[0] : creada;
        if (nueva?.id) setLigaSeleccionada(nueva);
      }
      setModal(null);
      setEditLigaId(null);
      await cargarLigas();
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const eliminarLiga = async () => {
    if (!eliminarLigaTarget) return;
    setLoading(true);
    try {
      await db(`/ligas?id=eq.${eliminarLigaTarget.id}`, token, { method: "DELETE" });
      showToast("Torneo eliminado");
      if (ligaSeleccionada?.id === eliminarLigaTarget.id) setLigaSeleccionada(null);
      setEliminarLigaTarget(null);
      await cargarLigas();
    } catch (e) {
      // Lo más común: hay equipos/jornadas/fichas atadas y la FK lo bloquea.
      showToast(e.message || "No se pudo eliminar (puede tener equipos o partidos)", "err");
    }
    setLoading(false);
  };

  // ── GUARDAR COLOR DE LIGA ────────────────────────────────────
  const guardarColorLiga = async () => {
    if (!ligaSeleccionada) return;
    setLoading(true);
    try {
      await db(`/ligas?id=eq.${ligaSeleccionada.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ color_marca: colorLigaForm })
      });
      showToast("Color del torneo actualizado ✓");
      const actualizada = { ...ligaSeleccionada, color_marca: colorLigaForm };
      setLigaSeleccionada(actualizada);
      setLigas(ligas.map(l => l.id === actualizada.id ? actualizada : l));
      setModal(null);
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  useEffect(() => { cargarLigas(); cargarMiUnidad(); }, []);
  useEffect(() => {
    if (ligaSeleccionada) {
      cargarEquipos(ligaSeleccionada.id);
      cargarJugadores(ligaSeleccionada.id);
    }
  }, [ligaSeleccionada]);

  useEffect(() => {
    if (seccion === "arbitros" && ligaSeleccionada) cargarArbitros();
  }, [seccion, ligaSeleccionada]);

  // Al entrar a la sección "Personalizar mi unidad", precargar el form con los valores actuales.
  useEffect(() => {
    if (seccion === "personalizar" && miUnidad) {
      setPersonalizarForm({
        logo_url: miUnidad.logo_url || "",
        estilo_tarjeta: miUnidad.estilo_tarjeta || "logo_arriba",
        color_marca: miUnidad.color_marca || "#4f8f2f",
        lema: miUnidad.lema || "",
        portada_url: miUnidad.portada_url || "",
        tamano_logo: miUnidad.tamano_logo || "mediano",
        forma_logo: miUnidad.forma_logo || "cuadrado",
        intensidad_fondo: miUnidad.intensidad_fondo || "medio",
      });
      setPersonalizarLogoFile(null);
      setPersonalizarLogoPreview(miUnidad.logo_url || null);
      setPersonalizarPortadaFile(null);
      setPersonalizarPortadaPreview(miUnidad.portada_url || null);
      cargarPatrocinadores();
    }
  }, [seccion, miUnidad?.id]);

  // Back button del topbar cuando hay un equipo abierto en detalle
  useEffect(() => {
    if (!setTopbarBack) return;
    if (seccion === "detalle" && equipoDetalle) {
      setTopbarBack({ label: "Equipos", onClick: () => { setSeccion("equipos"); setEquipoDetalle(null); } });
    } else {
      setTopbarBack(null);
    }
    return () => setTopbarBack(null);
  }, [seccion, equipoDetalle, setTopbarBack]);

  // ── GUARDAR EQUIPO ────────────────────────────────────────────
  const guardarEquipo = async () => {
    if (!equipoForm.nombre) return showToast("El nombre es obligatorio", "err");
    if (!ligaSeleccionada) return showToast("Selecciona una liga primero", "err");
    setLoading(true);
    try {
      let escudo_url = equipoForm.escudo_url;

      if (escudoFile) {
        const ext = escudoFile.name.split(".").pop();
        const path = `escudos/${Date.now()}.${ext}`;
        escudo_url = await uploadFile("imagenes", path, escudoFile, token, "escudo");
      }

      const payload = { nombre: equipoForm.nombre, color_playera: equipoForm.color_playera, color_camiseta_2: equipoForm.color_camiseta_2, diseno_camiseta: equipoForm.diseno_camiseta, escudo_url, liga_id: ligaSeleccionada.id };

      // Mensaje diferenciado si subimos logo, para que el usuario vea la confirmación.
      const conLogo = !!escudoFile;
      if (editEquipoId) {
        await db(`/equipos?id=eq.${editEquipoId}`, token, { method: "PATCH", body: JSON.stringify(payload) });
        showToast(conLogo ? "Equipo y logo actualizados ✓" : "Equipo actualizado ✓");
      } else {
        await db("/equipos", token, { method: "POST", body: JSON.stringify(payload) });
        showToast(conLogo ? "Equipo registrado con logo ✓" : "Equipo registrado ✓");
      }
      setEquipoForm({ nombre: "", color_playera: "#3182ce", color_camiseta_2: "#ffffff", diseno_camiseta: "solido", escudo_url: "" });
      setEscudoFile(null); setEscudoPreview(null); setEditEquipoId(null);
      setModal(null);
      cargarEquipos(ligaSeleccionada.id);
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  // Abre el modal de confirmación (en vez del confirm nativo del navegador)
  const eliminarEquipo = (eq) => setEliminarEquipoTarget(eq);

  // Baja lógica: el equipo no se borra, se marca inactivo. Así conserva su id
  // y las fichas ya cerradas (propias y de los rivales) quedan intactas.
  const confirmarEliminarEquipo = async () => {
    if (!eliminarEquipoTarget) return;
    setLoading(true);
    try {
      await db(`/equipos?id=eq.${eliminarEquipoTarget.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ activo: false, dado_baja_en: new Date().toISOString() }),
      });
      showToast("Equipo dado de baja");
      if (equipoDetalle?.id === eliminarEquipoTarget.id) setEquipoDetalle(null);
      setEliminarEquipoTarget(null);
      cargarEquipos(ligaSeleccionada.id);
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  // Reincorpora un equipo dado de baja a la competencia.
  const reactivarEquipo = async (eq) => {
    setLoading(true);
    try {
      await db(`/equipos?id=eq.${eq.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ activo: true, dado_baja_en: null }),
      });
      showToast("Equipo reactivado ✓");
      cargarEquipos(ligaSeleccionada.id);
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const editarEquipo = (e) => {
    setEquipoForm({ nombre: e.nombre, color_playera: e.color_playera || "#3182ce", color_camiseta_2: e.color_camiseta_2 || "#ffffff", diseno_camiseta: e.diseno_camiseta || "solido", escudo_url: e.escudo_url || "" });
    setEscudoPreview(e.escudo_url || null);
    setEditEquipoId(e.id);
    setModal("equipo");
  };

  const verEquipo = async (equipo) => {
    setEquipoDetalle(equipo);
    await cargarJugadoresEquipo(equipo.id, ligaSeleccionada.id);
    setSeccion("detalle");
  };

  const handleEscudoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Revoca el preview anterior para no dejar URLs colgadas en memoria.
    if (escudoPreview && escudoPreview.startsWith("blob:")) URL.revokeObjectURL(escudoPreview);
    setEscudoFile(file);
    setEscudoPreview(URL.createObjectURL(file));
    showToast(`Logo "${file.name}" cargado ✓ se guardará con el equipo`);
  };

  const quitarEscudo = () => {
    if (escudoPreview && escudoPreview.startsWith("blob:")) URL.revokeObjectURL(escudoPreview);
    setEscudoFile(null);
    setEscudoPreview(null);
  };

  // ── RENDER ────────────────────────────────────────────────────
  // Equipos activos (en competencia) vs. dados de baja (fuera de tabla/generador).
  const equiposActivos = equipos.filter(e => e.activo !== false);
  const equiposBaja = equipos.filter(e => e.activo === false);

  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {toast && <div style={{ ...s.toast, background: toast.tipo === "err" ? "#ef4444" : "#4ade80", color: toast.tipo === "err" ? "#fff" : "#0d0d1a" }}>{toast.msg}</div>}

      {/* ENCABEZADO — hero con gradiente verde compartido. Se oculta en
          "calendario", "fichas" y "resultados": esas secciones renderizan
          su propio hero. Aquí el texto grande es el nombre del apartado
          (igual al de la sidebar) y la unidad va como etiqueta pequeña
          encima — antes era al revés. */}
      {seccion !== "calendario" && seccion !== "fichas" && seccion !== "resultados" && (() => {
        const TITULOS = {
          torneos:      { icon:"🏆", label:"Torneos" },
          equipos:      { icon:"👕", label:"Equipos" },
          jugadores:    { icon:"👥", label:"Jugadores" },
          arbitros:     { icon:"🟡", label:"Árbitros" },
          personalizar: { icon:"🎨", label:"Personalizar mi unidad" },
          detalle:      { icon:"👕", label:"Detalle de equipo" },
        };
        const t = TITULOS[seccion] || { icon:"🏟️", label:"Panel Admin" };
        return (
          <div style={s.unitHero}>
            <div style={s.unitHeroGlow} />
            <div style={s.unitHeroRow}>
              <div style={s.unitHeroLogoWrap}>
                {miUnidad?.logo_url
                  ? <img src={miUnidad.logo_url} alt={miUnidad.nombre} style={s.unitHeroLogoImg} />
                  : <span style={{ fontSize:24 }}>🏟️</span>}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                {miUnidad?.nombre && <div style={s.unitHeroLabelSmall}>{miUnidad.nombre}</div>}
                <h2 style={s.unitHeroTitleBig}>{t.icon} {t.label}</h2>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SELECTOR DE LIGA — oculto en "Torneos" (vista dedicada), "Personalizar"
          (aplica a la unidad), "Calendario", "Fichas" y "Resultados" (cada uno
          renderiza su propio selector vía headerExtra debajo del hero), y
          "detalle" de equipo (volver atrás para verlos). Aquí solo se elige
          torneo activo; alta/edición vive en la sección "Torneos". */}
      {seccion !== "torneos" && seccion !== "personalizar" && seccion !== "calendario" && seccion !== "fichas" && seccion !== "resultados" && seccion !== "detalle" && (
        <div style={s.ligaSelector}>
          <span style={s.ligaLabel}>Torneos:</span>
          <div style={s.ligaTabs}>
            {ligas.map(l => (
              <button key={l.id}
                onClick={() => { setLigaSeleccionada(l); setEquipoDetalle(null); if (seccion === "detalle") setSeccion("equipos"); }}
                style={{ ...s.ligaTab, ...(ligaSeleccionada?.id === l.id ? s.ligaTabActive : {}), borderLeft: `4px solid ${l.color_marca || "#4f8f2f"}` }}>
                🏆 {l.nombre}
              </button>
            ))}
            {ligas.length === 0 && (
              <span style={{ color: "#666", fontSize: 13 }}>
                Aún no tienes torneos. Créalos desde la sección "🏆 Torneos".
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── SECCIÓN TORNEOS — alta/edición/eliminación de torneos de la unidad ── */}
      {seccion === "torneos" && (
        <div>
          {/* El título y el logo ya viven en el unitHero de arriba. */}

          {/* Acción principal */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10 }}>
            <span style={{ fontSize:13, color:"#6b7280", fontWeight:600 }}>
              {ligas.length} {ligas.length === 1 ? "torneo activo" : "torneos activos"}
            </span>
            <button style={s.btnAdd} onClick={abrirNuevoTorneo}>+ Nuevo torneo</button>
          </div>

          {ligas.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>🏆</div>
              <div style={s.emptyTxt}>Aún no tienes torneos creados</div>
              <p style={{ color:"#9ca3af", fontSize:13, marginBottom:14 }}>
                Crea tu primer torneo para empezar a registrar equipos, jugadores y jornadas.
              </p>
              <button style={s.btnAdd} onClick={abrirNuevoTorneo}>+ Crear primer torneo</button>
            </div>
          ) : (
            <div style={s.torneosGrid}>
              {ligas.map(l => {
                const color = l.color_marca || "#4f8f2f";
                const dia = l.dia || "—";
                const turno = l.turno || "—";
                return (
                  <div key={l.id} style={{ ...s.torneoCard, borderTop:`4px solid ${color}` }} className="la-card">
                    <div style={s.torneoCardHeader}>
                      <div style={{ ...s.torneoBadge, background:`${color}1a`, color }}>🏆</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={s.torneoNombre} title={l.nombre}>{l.nombre}</div>
                        {l.temporada && (
                          <div style={s.torneoTemporada}>Temporada {l.temporada}</div>
                        )}
                      </div>
                    </div>

                    <div style={s.torneoMetaRow}>
                      <span style={s.torneoMetaPill}>📅 {dia}</span>
                      <span style={s.torneoMetaPill}>⏰ {turno}</span>
                    </div>

                    <div style={s.torneoActions}>
                      <button style={{ ...s.btnVer, borderColor:color, color }}
                        onClick={() => { setLigaSeleccionada(l); setSeccion("equipos"); }}
                        title="Ver equipos y jornadas de este torneo">
                        Abrir →
                      </button>
                      <button style={s.btnEdit} onClick={() => abrirEditarTorneo(l)} title="Editar torneo">✏️</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SECCIÓN PERSONALIZAR — fuera del bloque de ligaSeleccionada, no necesita liga ── */}
      {seccion === "personalizar" && (
        <div>
          <div style={s.persHero}>
            <div style={s.persHeroIcon}>🎨</div>
            <div style={{ flex:1, minWidth:0 }}>
              <h3 style={s.persHeroTitle}>Personalizar mi unidad</h3>
              <p style={s.persHeroSub}>Cambia el logo, color de marca, frase, estilo de tarjeta y el color de cada torneo.</p>
            </div>
          </div>

          {/* Tarjeta 1: Apariencia de la unidad */}
          <div style={s.persCard}>
            <div style={s.persCardHead}>
              <span style={s.persCardEmoji}>🏟️</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={s.persCardTitle}>Apariencia de tu unidad</div>
                <div style={s.persCardDesc}>Estos cambios se ven en la portada pública de tu unidad.</div>
              </div>
            </div>
            {miUnidad ? (
              <>
                <PersonalizacionUnidadFields
                  form={personalizarForm} setForm={setPersonalizarForm}
                  logoPreview={personalizarLogoPreview} setLogoFile={setPersonalizarLogoFile} setLogoPreview={setPersonalizarLogoPreview}
                  portadaPreview={personalizarPortadaPreview} setPortadaFile={setPersonalizarPortadaFile} setPortadaPreview={setPersonalizarPortadaPreview}
                  showToast={showToast}
                />
                <button style={{ ...s.btnSave, width:"100%", marginTop:8 }}
                  onClick={guardarPersonalizacion} disabled={loading}>
                  {loading ? "Guardando..." : "💾 Guardar apariencia"}
                </button>
              </>
            ) : (
              <div style={{ fontSize:13, color:"#6b7280" }}>Cargando datos de la unidad...</div>
            )}
          </div>

          {/* Tarjeta 3: Publicidad de patrocinadores */}
          <div style={{ ...s.persCard, marginTop:16 }}>
            <div style={s.persCardHead}>
              <span style={{ ...s.persCardEmoji, background:"linear-gradient(135deg, #faf5ff 0%, #fdf4ff 100%)", border:"1px solid #e9d5ff" }}>📢</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={s.persCardTitle}>Publicidad de patrocinadores</div>
                <div style={s.persCardDesc}>
                  Sube hasta {MAX_PATROCINADORES} tarjetas. Se muestran al pie de los torneos, la tabla, partidos y eliminatoria.
                  Máximo {PATRO_TAMANO_MAX_MB} MB por imagen.
                </div>
              </div>
            </div>

            {patrocinadores.length === 0 ? (
              <div style={{ fontSize:13, color:"#6b7280", marginBottom:14, padding:"12px 0", textAlign:"center" }}>
                Aún no has subido patrocinadores. Agrega el primero abajo. 📢
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
                {patrocinadores.map((p, idx) => (
                  <div key={p.id} style={s.patroRow}>
                    <div style={{ ...s.patroThumb, aspectRatio: PATRO_ASPECT[p.formato] || "16 / 9", opacity: p.activo ? 1 : 0.45 }}>
                      <img src={p.imagen_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <span style={s.patroFormatoPill}>{PATRO_FORMATO_LABEL[p.formato] || p.formato}</span>
                      <div style={{ fontSize:11, color: p.activo ? "#16a34a" : "#9ca3af", fontWeight:700, marginTop:5 }}>
                        {p.activo ? "● Activo" : "○ Pausado"}
                      </div>
                    </div>
                    <div style={s.patroActions}>
                      <button style={{ ...s.patroArrowBtn, opacity: idx === 0 ? 0.35 : 1 }}
                        disabled={idx === 0} onClick={() => moverPatrocinador(idx, -1)} title="Subir">↑</button>
                      <button style={{ ...s.patroArrowBtn, opacity: idx === patrocinadores.length - 1 ? 0.35 : 1 }}
                        disabled={idx === patrocinadores.length - 1} onClick={() => moverPatrocinador(idx, 1)} title="Bajar">↓</button>
                      <button
                        style={{
                          ...s.patroToggleBtn,
                          background: p.activo ? "#fef3c7" : "#dcfce7",
                          color: p.activo ? "#92400e" : "#15803d",
                          borderColor: p.activo ? "#fde68a" : "#bbf7d0",
                        }}
                        onClick={() => togglePatroActivo(p)}
                        title={p.activo ? "Pausar" : "Activar"}>
                        {p.activo ? "⏸" : "▶"}
                      </button>
                      <button style={s.patroDelBtn} onClick={() => eliminarPatrocinador(p)} title="Eliminar">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {patrocinadores.length < MAX_PATROCINADORES ? (
              <div style={s.patroAddBox}>
                <div style={{ fontSize:11, fontWeight:800, color:"#581c87", textTransform:"uppercase", letterSpacing:0.7, marginBottom:10 }}>
                  + Agregar patrocinador ({patrocinadores.length} / {MAX_PATROCINADORES})
                </div>

                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:0.6, marginBottom:7 }}>Formato</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8 }}>
                    {PATRO_FORMATOS.map(op => (
                      <div key={op.val} onClick={() => setPatroFormato(op.val)}
                        style={{
                          cursor:"pointer", padding:10, borderRadius:10,
                          border: patroFormato === op.val ? "2px solid #8b5cf6" : "1px solid #e5e7eb",
                          background: patroFormato === op.val ? "linear-gradient(135deg, #f5f3ff 0%, #fdf4ff 100%)" : "#fff",
                          textAlign:"center", transition:"all 0.15s",
                        }}>
                        <div style={{ fontSize:12, fontWeight:700, color: patroFormato === op.val ? "#7c3aed" : "#111827" }}>{op.titulo}</div>
                        <div style={{ fontSize:10, color:"#6b7280", marginTop:2 }}>{op.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", borderRadius:10, padding:10, border:"1px solid #e5e7eb" }}>
                  <div style={{ width:64, borderRadius:10, background:"#f3f4f6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, overflow:"hidden", flexShrink:0, aspectRatio: PATRO_ASPECT[patroFormato] }}>
                    {patroPreview
                      ? <img src={patroPreview} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                      : "📢"}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <label style={{ display:"inline-block", background:"#fff", border:"1px solid #d1d5db", borderRadius:8, padding:"7px 12px", color:"#374151", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                      {patroPreview ? "Cambiar imagen" : "Subir imagen"}
                      <input type="file" accept="image/*" style={{ display:"none" }}
                        onChange={e => onPickPatroFile(e.target.files?.[0])} />
                    </label>
                    {patroPreview && (
                      <button type="button"
                        style={{ background:"transparent", border:"1px solid #fecaca", color:"#dc2626", borderRadius:8, padding:"5px 10px", fontSize:11, cursor:"pointer", fontWeight:600, marginLeft:6 }}
                        onClick={limpiarPatroForm}>✕ Quitar</button>
                    )}
                    <div style={{ fontSize:10.5, color:"#6b7280", marginTop:5 }}>Máx {PATRO_TAMANO_MAX_MB} MB. PNG o JPG.</div>
                  </div>
                </div>

                <button
                  style={{
                    ...s.btnSave,
                    width:"100%", marginTop:12,
                    background:"linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)",
                    boxShadow:"0 4px 14px rgba(139,92,246,0.30)",
                    opacity: (!patroFile || patroLoading) ? 0.6 : 1,
                  }}
                  onClick={agregarPatrocinador} disabled={!patroFile || patroLoading}>
                  {patroLoading ? "Subiendo..." : "📢 Agregar patrocinador"}
                </button>
              </div>
            ) : (
              <div style={{ fontSize:12, color:"#92400e", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"10px 12px", fontWeight:600 }}>
                Has alcanzado el máximo de {MAX_PATROCINADORES} patrocinadores. Elimina o pausa uno para liberar espacio.
              </div>
            )}
          </div>

          {/* Tarjeta 2: Color por torneo */}
          <div style={{ ...s.persCard, marginTop:16 }}>
            <div style={s.persCardHead}>
              <span style={s.persCardEmoji}>🏆</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={s.persCardTitle}>Color de cada torneo</div>
                <div style={s.persCardDesc}>Asigna un color a cada torneo para identificarlo en calendarios y tarjetas.</div>
              </div>
            </div>
            {ligas.length === 0 ? (
              <div style={{ fontSize:13, color:"#6b7280" }}>No hay torneos creados aún.</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {ligas.map(l => {
                  const color = l.color_marca || "#4f8f2f";
                  return (
                    <div key={l.id} style={s.torneoColorRow}>
                      <div style={{ ...s.torneoColorSwatch, background:`linear-gradient(135deg, ${color} 0%, ${color}b3 100%)` }}>🏆</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={s.torneoColorName}>{l.nombre}</div>
                        <div style={s.torneoColorHex}>{color.toUpperCase()}</div>
                      </div>
                      <button style={s.torneoColorBtn}
                        onClick={() => { setLigaSeleccionada(l); setColorLigaForm(color); setModal("color_liga"); }}>
                        Cambiar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {ligaSeleccionada && (
        <>
          {/* ── SECCIÓN EQUIPOS ── */}
          {(seccion === "equipos") && (
            <div>
              <div style={s.secHeader}>
                <span style={s.secCount}>{equiposActivos.length} equipos en {ligaSeleccionada.nombre}</span>
                <button style={s.btnAdd} onClick={() => { setEquipoForm({ nombre: "", color_playera: "#3182ce", color_camiseta_2: "#ffffff", diseno_camiseta: "solido", escudo_url: "" }); setEscudoPreview(null); setEscudoFile(null); setEditEquipoId(null); setModal("equipo"); }}>
                  + Nuevo equipo
                </button>
              </div>

              {equipos.length === 0 ? (
                <div style={s.empty}>
                  <div style={s.emptyIcon}>👕</div>
                  <div style={s.emptyTxt}>No hay equipos en esta liga aún</div>
                  <button style={s.btnAdd} onClick={() => setModal("equipo")}>Registrar primer equipo</button>
                </div>
              ) : (
                <>
                {equiposActivos.length > 0 && (
                <div style={s.equipoGrid}>
                  {equiposActivos.map(eq => {
                    const color = eq.color_playera || "#3182ce";
                    const numJug = jugadores.filter(j => j.equipo_id === eq.id).length;
                    const inicial = (eq.nombre || "?").trim().charAt(0).toUpperCase();
                    return (
                      <div key={eq.id} style={{ ...s.equipoCard, borderTop: `3px solid ${color}` }} className="la-card">
                        <div style={s.equipoCardRow}>
                          {/* Izquierda: logo del equipo (o inicial sobre el color del equipo si no hay) + nombre */}
                          <div style={s.equipoCardLeft}>
                            {eq.escudo_url ? (
                              <img src={eq.escudo_url} alt={eq.nombre}
                                style={{ width: 60, height: 60, borderRadius: 12, objectFit: "cover", background: "#fff", border: `2px solid ${color}`, flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 60, height: 60, borderRadius: 12, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 26, flexShrink: 0, border: `2px solid ${color}` }}>
                                {inicial}
                              </div>
                            )}
                            <div style={s.equipoNombre}>{eq.nombre}</div>
                          </div>
                          {/* Derecha: acciones + jugadores inscritos */}
                          <div style={s.equipoCardRight}>
                            <div style={s.equipoActionsRow}>
                              <button style={s.btnEdit} onClick={() => editarEquipo(eq)} title="Editar">✏️</button>
                              <button style={s.btnDel} onClick={() => eliminarEquipo(eq)} title="Dar de baja">🗑️</button>
                            </div>
                            <div style={s.equipoMetaRight}>
                              {numJug} {numJug === 1 ? "jug. inscrito" : "jug. inscritos"}
                            </div>
                            <button style={{ ...s.btnVer, borderColor: color, color }}
                              onClick={() => verEquipo(eq)}>
                              Ver equipo →
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}

                {equiposBaja.length > 0 && (
                  <div style={{ marginTop: 22 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", marginBottom: 10 }}>
                      📁 Equipos dados de baja ({equiposBaja.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {equiposBaja.map(eq => {
                        const cBaja = eq.color_playera || "#9ca3af";
                        const fBaja = eq.dado_baja_en
                          ? new Date(eq.dado_baja_en).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
                          : null;
                        return (
                          <div key={eq.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f9fafb", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ width: 38, height: 38, borderRadius: 9, background: cBaja, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17, flexShrink: 0, filter: "grayscale(0.45)" }}>
                              {(eq.nombre || "?").trim().charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: "#374151" }}>{eq.nombre}</div>
                              <div style={{ fontSize: 11.5, color: "#9ca3af" }}>
                                Dado de baja{fBaja ? ` · ${fBaja}` : ""}
                              </div>
                            </div>
                            <button
                              style={{ background: "#ecfdf5", color: "#047857", border: "1px solid #6ee7b7", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                              onClick={() => reactivarEquipo(eq)} disabled={loading}>
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
            </div>
          )}

          {/* ── DETALLE EQUIPO ── */}
          {seccion === "detalle" && equipoDetalle && (() => {
            const capitanActual = jugadoresEquipo.find(j => j.es_capitan);
            // Capitán siempre primero en el listado; resto en su orden original.
            const jugadoresOrdenados = [...jugadoresEquipo].sort((a, b) => {
              if (a.es_capitan && !b.es_capitan) return -1;
              if (!a.es_capitan && b.es_capitan) return 1;
              return 0;
            });
            return (
            <div>
              <div style={{ ...s.detalleHeader, borderLeft: `5px solid ${equipoDetalle.color_playera || "#3182ce"}` }}>
                <div style={s.escudoWrapLg}>
                  {equipoDetalle.escudo_url
                    ? <img src={equipoDetalle.escudo_url} alt="escudo" style={s.escudoImgLg} />
                    : <div style={{ ...s.escudoPlaceholderLg, background: equipoDetalle.color_playera || "#3182ce" }}>{equipoDetalle.nombre[0]}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={s.detalleNombre}>{equipoDetalle.nombre}</h3>
                  <p style={s.detalleMeta}>{ligaSeleccionada.nombre} · {jugadoresEquipo.length} jugadores</p>
                </div>
              </div>

              <div style={s.secHeader}>
                <span style={s.secCount}>{jugadoresEquipo.length} / 17 jugadores</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {!capitanActual && (
                    <button style={s.btnAsignarCap}
                      onClick={() => { setCapitanForm({ numero_afiliado: "", dorsal: "" }); setCapitanCandidato(null); setModalCapitan("input"); }}>
                      👑 Asignar capitán
                    </button>
                  )}
                  <button style={s.btnAdd}
                    onClick={() => { setAnadirAfiliados(""); setAnadirCandidatos([]); setModalJugadores("anadir_input"); }}
                    disabled={jugadoresEquipo.length >= 17}>
                    + Añadir jugadores
                  </button>
                </div>
              </div>

              {jugadoresEquipo.length === 0 ? (
                <div style={s.empty}>
                  <div style={s.emptyIcon}>🏃</div>
                  <div style={s.emptyTxt}>No hay jugadores inscritos en este equipo aún</div>
                  <p style={{ color: "#555", fontSize: 13 }}>Añádelos con su número de afiliado</p>
                </div>
              ) : (
                <div style={s.jugadorList}>
                  {jugadoresOrdenados.map(je => {
                    const sancPend = sancionesEquipo[je.jugador_id] || 0;
                    const sancionado = sancPend > 0;
                    return (
                    <div key={je.id} style={{
                      ...s.jugadorRow,
                      ...(je.es_capitan ? s.jugadorRowCap : {}),
                      ...(sancionado ? { background: "rgba(127,29,29,0.05)", opacity: 0.75 } : {}),
                    }}>
                      <div style={s.jugadorAvatar}>
                        {je.jugadores?.foto_url
                          ? <img src={je.jugadores.foto_url} alt="foto" style={s.jugadorFoto} />
                          : <div style={s.jugadorFotoPlaceholder}>🏃</div>}
                      </div>
                      <div style={s.jugadorInfo}>
                        <div style={s.jugadorNombre}>
                          {je.es_capitan && <span style={{ marginRight: 5 }}>👑</span>}
                          <span style={{ ...s.jugadorNombreTxt, textDecoration: sancionado ? "underline" : "none", textDecorationColor: "#dc2626" }}>
                            {je.jugadores?.nombre_completo}
                          </span>
                        </div>
                        <div style={s.jugadorMetaLinea}>{je.jugadores?.posicion_preferida || "—"}</div>
                        <div style={s.jugadorMetaLinea}>#{je.jugadores?.numero_afiliado}</div>
                        {sancionado && (
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#7f1d1d", marginTop: 3 }}>
                            🟥 Sancionado · {sancPend} {sancPend === 1 ? "partido" : "partidos"} restantes
                          </div>
                        )}
                        {je.es_capitan && (
                          <button
                            onClick={() => quitarCapitan(je.id, je.jugadores?.nombre_completo)}
                            style={s.btnQuitarCapInline}
                            title="Quitar capitanía">
                            Quitar capitán
                          </button>
                        )}
                      </div>
                      <div style={s.jugadorDorsal}>
                        <span style={{ ...s.dorsalBadge, background: equipoDetalle.color_playera || "#3182ce" }}>
                          {je.dorsal || "—"}
                        </span>
                        <span style={s.dorsalLabel}>dorsal</span>
                      </div>
                      <div style={s.jugadorCamiseta}>
                        <span style={s.camisetaNombre}>{je.nombre_camiseta || je.jugadores?.nombre_completo?.split(" ")[0]}</span>
                        <span style={s.camisetaLabel}>camiseta</span>
                      </div>
                      <button style={{ ...s.btnEliminarJug, ...(sancionado ? { opacity: 0.45, cursor: "not-allowed" } : {}) }}
                        onClick={() => {
                          if (sancionado) {
                            showToast(`Jugador con sanción activa (${sancPend} partidos restantes)`, "err");
                            return;
                          }
                          setEliminarJugTarget(je);
                          setModalJugadores("eliminar");
                        }}
                        title={sancionado ? `Sancionado: ${sancPend} partidos restantes` : "Eliminar del equipo"}>
                        🗑️
                      </button>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })()}

          {/* ── SECCIÓN JUGADORES ── */}
          {seccion === "jugadores" && (
            <div>
              <div style={s.secHeader}>
                <span style={s.secCount}>{jugadores.length} jugadores en {ligaSeleccionada.nombre}</span>
              </div>
              {jugadores.length === 0 ? (
                <div style={s.empty}>
                  <div style={s.emptyIcon}>👥</div>
                  <div style={s.emptyTxt}>No hay jugadores inscritos en esta liga aún</div>
                </div>
              ) : (
                <div style={s.jugadorList}>
                  {jugadores.map(je => (
                    <div key={je.id} style={s.jugadorRow}>
                      <div style={s.jugadorAvatar}>
                        {je.jugadores?.foto_url
                          ? <img src={je.jugadores.foto_url} alt="foto" style={s.jugadorFoto} />
                          : <div style={s.jugadorFotoPlaceholder}>🏃</div>}
                      </div>
                      <div style={s.jugadorInfo}>
                        <div style={s.jugadorNombre}>{je.jugadores?.nombre_completo}</div>
                        <div style={s.jugadorMeta}>{je.jugadores?.posicion_preferida} · #{je.jugadores?.numero_afiliado}</div>
                      </div>
                      <div style={{ ...s.equipoBadge, background: je.equipos?.color_playera + "22", color: je.equipos?.color_playera, border: `1px solid ${je.equipos?.color_playera}44` }}>
                        👕 {je.equipos?.nombre}
                      </div>
                      <div style={s.jugadorDorsal}>
                        <span style={{ ...s.dorsalBadge, background: je.equipos?.color_playera || "#3182ce" }}>
                          {je.dorsal || "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

{seccion === "calendario" && (
  <ScheduleGenerator
    session={session}
    liga={ligaSeleccionada}
    cancha={null}
    miUnidad={miUnidad}
    headerExtra={
      <div style={s.ligaSelector}>
        <span style={s.ligaLabel}>Torneos:</span>
        <div style={s.ligaTabs}>
          {ligas.map(l => (
            <button key={l.id}
              onClick={() => { setLigaSeleccionada(l); setEquipoDetalle(null); }}
              style={{ ...s.ligaTab, ...(ligaSeleccionada?.id === l.id ? s.ligaTabActive : {}), borderLeft: `4px solid ${l.color_marca || "#4f8f2f"}` }}>
              🏆 {l.nombre}
            </button>
          ))}
          {ligas.length === 0 && <span style={{ color: "#666", fontSize: 13 }}>No hay ligas activas.</span>}
        </div>
      </div>
    }
  />
)}

          {/* ── SECCIÓN ÁRBITROS ── */}
          {seccion === "arbitros" && (() => {
            const pendientes  = arbitros.filter(a => !a.confirmado);
            const confirmados = arbitros.filter(a => a.confirmado);
            return (
            <div>
              {/* Contador + botón de recarga. El título y el icono del apartado
                  ya viven en el hero unificado del LeagueAdmin. */}
              <div style={s.arbCountRow}>
                <span style={s.arbCountTxt}>
                  {confirmados.length} confirmados · {pendientes.length} pendientes
                </span>
                <button style={s.arbReloadBtn} onClick={cargarArbitros} title="Recargar">
                  ↻ Actualizar
                </button>
              </div>

              {arbitros.length === 0 && (
                <div style={s.empty}>
                  <div style={s.emptyIcon}>🟡</div>
                  <div style={s.emptyTxt}>No hay árbitros asignados a esta unidad deportiva</div>
                  <div style={{ fontSize:13, color:"#6b7280" }}>El super admin debe enviarte árbitros para que los confirmes</div>
                </div>
              )}

              {/* ── PENDIENTES DE CONFIRMACIÓN ── */}
              {pendientes.length > 0 && (
                <div style={{ marginBottom: confirmados.length > 0 ? 20 : 0 }}>
                  <div style={s.arbSectionHead}>
                    <span style={s.arbSectionDot} />
                    <span style={s.arbSectionTitle}>Pendientes de confirmación</span>
                    <span style={s.arbSectionCount}>{pendientes.length}</span>
                  </div>
                  <div style={s.arbPendingHint}>
                    El super admin envió a estos árbitros a tu unidad. Confírmalos para que puedan trabajar, o rechaza la asignación.
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {pendientes.map(arb => (
                      <div key={arb.user_id} style={{ ...s.arbRow, borderLeft:"4px solid #f59e0b", background:"linear-gradient(90deg, #fff7ed 0%, #ffffff 70%)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0, flex:1 }}>
                          <div style={s.arbAvatar}>🟡</div>
                          <div style={{ minWidth:0 }}>
                            <div style={s.arbName}>{arb.nombre}</div>
                            {arb.email && (
                              <div style={{ fontSize:11, color:"#9ca3af", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{arb.email}</div>
                            )}
                            <div style={s.arbMeta}>Esperando tu confirmación</div>
                          </div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end" }}>
                          <button onClick={() => abrirConfirmarArbitro(arb)}
                            style={{ ...s.arbBtnAcceso, background:"#dcfce7", color:"#15803d", boxShadow:"0 1px 4px rgba(21,128,61,0.18)" }}>
                            ✓ Confirmar
                          </button>
                          <button onClick={() => setDesvincularArbTarget(arb)}
                            style={{ ...s.arbBtnAcceso, background:"#fee2e2", color:"#dc2626", boxShadow:"0 1px 4px rgba(220,38,38,0.18)" }}>
                            ✕ Rechazar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── CONFIRMADOS ── */}
              {confirmados.length > 0 && (
                <div>
                  <div style={s.arbSectionHead}>
                    <span style={{ ...s.arbSectionDot, background:"#4f8f2f" }} />
                    <span style={s.arbSectionTitle}>Árbitros confirmados</span>
                    <span style={{ ...s.arbSectionCount, background:"#dcfce7", color:"#15803d" }}>{confirmados.length}</span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {confirmados.map(arb => (
                      <div key={arb.user_id} style={s.arbRow}>
                        <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0, flex:1 }}>
                          <div style={s.arbAvatar}>🟡</div>
                          <div style={{ minWidth:0 }}>
                            <div style={s.arbName}>{arb.nombre}</div>
                            {arb.email && (
                              <div style={{ fontSize:11, color:"#9ca3af", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{arb.email}</div>
                            )}
                            <div style={s.arbMeta}>
                              {arb.acceso_total
                                ? "Acceso total a todos los torneos"
                                : arb.tiene_acceso_liga
                                  ? `Con acceso a ${ligaSeleccionada.nombre}`
                                  : `Sin acceso a ${ligaSeleccionada.nombre}`}
                            </div>
                          </div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end" }}>
                          {/* Un solo botón para gestionar el acceso: reabre el mismo
                              modal de confirmación, precargando si tiene acceso
                              total o los torneos específicos donde está. */}
                          <button onClick={() => abrirConfirmarArbitro(arb)}
                            style={{ ...s.arbBtnAcceso, background:"#eff6ff", color:"#1d4ed8", border:"1px solid #bfdbfe", boxShadow:"0 1px 4px rgba(29,78,216,0.18)" }}>
                            ✏️ Editar acceso
                          </button>
                          <button onClick={() => setDesvincularArbTarget(arb)}
                            style={{ ...s.arbBtnAcceso, background:"#fff", color:"#6b7280", border:"1px solid #e5e7eb" }}>
                            🚪 Desvincular
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop:20, padding:"12px 16px", borderRadius:10, background:"#fffbeb", border:"1px solid #fde68a", fontSize:12, color:"#92400e" }}>
                ⚠️ Para invitar a un árbitro nuevo a tu unidad, pídeselo al super admin. Tú decides aquí si lo confirmas, a qué torneos lo asignas o si lo desvinculas.
              </div>
            </div>
            );
          })()}

          {/* ── SECCIÓN FICHAS ── */}
          {seccion === "fichas" && (
            <FichaGenerator
              session={session}
              liga={ligaSeleccionada}
              miUnidad={miUnidad}
              modo="fichas"
              headerExtra={
                <div style={s.ligaSelector}>
                  <span style={s.ligaLabel}>Torneos:</span>
                  <div style={s.ligaTabs}>
                    {ligas.map(l => (
                      <button key={l.id}
                        onClick={() => { setLigaSeleccionada(l); setEquipoDetalle(null); }}
                        style={{ ...s.ligaTab, ...(ligaSeleccionada?.id === l.id ? s.ligaTabActive : {}), borderLeft: `4px solid ${l.color_marca || "#4f8f2f"}` }}>
                        🏆 {l.nombre}
                      </button>
                    ))}
                    {ligas.length === 0 && <span style={{ color: "#666", fontSize: 13 }}>No hay ligas activas.</span>}
                  </div>
                </div>
              }
            />
          )}

          {/* ── SECCIÓN RESULTADOS — generador de fichas en modo gestión ── */}
          {seccion === "resultados" && (
            <FichaGenerator
              session={session}
              liga={ligaSeleccionada}
              miUnidad={miUnidad}
              modo="resultados"
              headerExtra={
                <div style={s.ligaSelector}>
                  <span style={s.ligaLabel}>Torneos:</span>
                  <div style={s.ligaTabs}>
                    {ligas.map(l => (
                      <button key={l.id}
                        onClick={() => { setLigaSeleccionada(l); setEquipoDetalle(null); }}
                        style={{ ...s.ligaTab, ...(ligaSeleccionada?.id === l.id ? s.ligaTabActive : {}), borderLeft: `4px solid ${l.color_marca || "#4f8f2f"}` }}>
                        🏆 {l.nombre}
                      </button>
                    ))}
                    {ligas.length === 0 && <span style={{ color: "#666", fontSize: 13 }}>No hay ligas activas.</span>}
                  </div>
                </div>
              }
            />
          )}
        </>
      )}

      {/* ── MODAL TORNEO (alta/edición) ── */}
      {modal === "liga" && (
        <div style={s.overlay} onClick={() => setModal(null)}>
          <div style={{ ...s.modalBox, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>🏆 {editLigaId ? "Editar torneo" : "Nuevo torneo"}</h3>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: -12, marginBottom: 18 }}>
              {editLigaId
                ? "Actualiza los datos generales del torneo."
                : `El torneo se creará dentro de ${miUnidad?.nombre || "tu unidad"}.`}
            </p>

            <div style={s.field}>
              <label style={s.label}>Nombre del torneo *</label>
              <input style={s.input} placeholder="ej. Liga Miércoles Noche"
                value={ligaForm.nombre}
                onChange={e => setLigaForm({ ...ligaForm, nombre: e.target.value })} />
            </div>

            <div style={s.formRow}>
              <div style={s.field}>
                <label style={s.label}>Día</label>
                <select style={s.input} value={ligaForm.dia}
                  onChange={e => setLigaForm({ ...ligaForm, dia: e.target.value })}>
                  {DIAS_LIGA.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div style={s.field}>
                <label style={s.label}>Turno</label>
                <select style={s.input} value={ligaForm.turno}
                  onChange={e => setLigaForm({ ...ligaForm, turno: e.target.value })}>
                  {TURNOS_LIGA.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Temporada (opcional)</label>
              <input style={s.input} placeholder="ej. 2026-A"
                value={ligaForm.temporada}
                onChange={e => setLigaForm({ ...ligaForm, temporada: e.target.value })} />
            </div>

            <div style={s.field}>
              <label style={s.label}>Color del torneo</label>
              <ColorPicker
                colores={COLORES_LIGA}
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
              {editLigaId && (
                <button
                  style={{ ...s.btnCancel, color:"#dc2626", borderColor:"#fecaca", marginRight:"auto" }}
                  onClick={() => { const target = ligas.find(l => l.id === editLigaId); setModal(null); setEliminarLigaTarget(target || null); }}>
                  🗑️ Eliminar
                </button>
              )}
              <button style={s.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button style={s.btnSave} onClick={guardarLiga} disabled={loading}>
                {loading ? "Guardando..." : editLigaId ? "Guardar cambios" : "Crear torneo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONFIRMAR / EDITAR ACCESO DE ÁRBITRO ── */}
      {confirmarArbTarget && (
        <div style={s.overlay} onClick={cerrarConfirmarArbitro}>
          <div style={{ ...s.modalBox, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>
              {confirmarArbTarget.confirmado
                ? `✏️ Editar acceso de ${confirmarArbTarget.nombre}`
                : `🟡 Confirmar a ${confirmarArbTarget.nombre}`}
            </h3>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: -10, marginBottom: 16, lineHeight: 1.5 }}>
              Elige a qué torneos podrá arbitrar dentro de tu unidad.
            </p>

            {/* Opción 1: Acceso total */}
            <div
              onClick={() => setConfirmarAccesoTotal(true)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 12, cursor: "pointer",
                border: `2px solid ${confirmarAccesoTotal ? "#4f8f2f" : "#e5e7eb"}`,
                background: confirmarAccesoTotal ? "#f0fdf4" : "#fff",
                marginBottom: 10, transition: "all 0.15s",
              }}>
              <div style={{
                flexShrink: 0, width: 20, height: 20, borderRadius: "50%", marginTop: 1,
                border: `2px solid ${confirmarAccesoTotal ? "#4f8f2f" : "#cbd5e1"}`,
                background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {confirmarAccesoTotal && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#4f8f2f" }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 3 }}>🌐 Acceso total</div>
                <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
                  Podrá arbitrar en todos los torneos actuales y futuros de esta unidad.
                </div>
              </div>
            </div>

            {/* Opción 2: Torneos específicos */}
            <div
              onClick={() => setConfirmarAccesoTotal(false)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 12, cursor: "pointer",
                border: `2px solid ${!confirmarAccesoTotal ? "#4f8f2f" : "#e5e7eb"}`,
                background: !confirmarAccesoTotal ? "#f0fdf4" : "#fff",
                marginBottom: 14, transition: "all 0.15s",
              }}>
              <div style={{
                flexShrink: 0, width: 20, height: 20, borderRadius: "50%", marginTop: 1,
                border: `2px solid ${!confirmarAccesoTotal ? "#4f8f2f" : "#cbd5e1"}`,
                background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {!confirmarAccesoTotal && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#4f8f2f" }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 3 }}>🏆 Torneos específicos</div>
                <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
                  Tú eliges en qué torneos puede arbitrar.
                </div>
              </div>
            </div>

            {/* Lista de torneos (solo si eligió específicos) */}
            {!confirmarAccesoTotal && (
              <div style={{ marginBottom: 14, paddingLeft: 4 }}>
                {ligas.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#9ca3af", padding: "12px 14px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10 }}>
                    Aún no tienes torneos creados en esta unidad. Crea uno primero o marca "acceso total".
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                      Selecciona los torneos
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {ligas.map(l => {
                        const sel = confirmarLigasSel.includes(l.id);
                        return (
                          <div key={l.id} onClick={() => toggleLigaConfirm(l.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                              border: `2px solid ${sel ? "#4f8f2f" : "#e5e7eb"}`,
                              background: sel ? "#f0fdf4" : "#fff",
                              borderLeft: `4px solid ${l.color_marca || "#4f8f2f"}`,
                              transition: "all 0.15s",
                            }}>
                            <div style={{
                              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                              border: `2px solid ${sel ? "#4f8f2f" : "#cbd5e1"}`,
                              background: sel ? "#4f8f2f" : "#fff",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              {sel && <span style={{ color: "#fff", fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>🏆 {l.nombre}</div>
                              {(l.dia || l.turno) && (
                                <div style={{ fontSize: 11, color: "#6b7280" }}>{[l.dia, l.turno].filter(Boolean).join(" · ")}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={cerrarConfirmarArbitro} disabled={loading}>Cancelar</button>
              <button style={s.btnSave} onClick={aplicarConfirmacion} disabled={loading}>
                {loading
                  ? "Guardando..."
                  : confirmarArbTarget.confirmado
                    ? "💾 Guardar cambios"
                    : "✓ Confirmar árbitro"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONFIRMAR ELIMINAR TORNEO ── */}
      {eliminarLigaTarget && (
        <div style={s.overlay} onClick={() => setEliminarLigaTarget(null)}>
          <div style={{ ...s.modalBox, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>🗑️ Eliminar torneo</h3>
            <p style={{ fontSize: 13.5, color:"#374151", lineHeight: 1.55 }}>
              ¿Eliminar <strong>{eliminarLigaTarget.nombre}</strong>? Esta acción no se puede deshacer.
            </p>
            <p style={{ fontSize: 12.5, color:"#92400e", background:"#fffbeb", border:"1px solid #fde68a", padding:"8px 12px", borderRadius:8, marginTop:8 }}>
              ⚠️ Si el torneo tiene equipos, jornadas o fichas, la base de datos puede impedir la eliminación.
            </p>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setEliminarLigaTarget(null)}>Cancelar</button>
              <button style={{ ...s.btnSave, background:"#dc2626" }} onClick={eliminarLiga} disabled={loading}>
                {loading ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL PERSONALIZAR UNIDAD ── */}
      {/* ── MODAL COLOR DE LIGA ── */}
      {modal === "color_liga" && ligaSeleccionada && (
        <div style={s.overlay} onClick={() => setModal(null)}>
          <div style={{ ...s.modalBox, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>🎨 Color de {ligaSeleccionada.nombre}</h3>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: -12, marginBottom: 18 }}>
              Aparece como gradiente en el header cuando entras al torneo.
            </p>

            <div style={s.field}>
              <label style={s.label}>Elige un color</label>
              <ColorPicker
                size={32}
                colores={COLORES_LIGA}
                valor={colorLigaForm}
                onChange={setColorLigaForm}
              />
              <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 8 }}>
                🎨 Toca el círculo con paleta para elegir cualquier otro color.
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={s.label}>Vista previa</label>
              <div style={{ height: 80, borderRadius: 14, background: `linear-gradient(135deg, ${colorLigaForm} 0%, ${colorLigaForm}88 100%)`, display: "flex", alignItems: "center", padding: "0 22px", gap: 14, color: "#fff", boxShadow: `0 4px 14px ${colorLigaForm}55` }}>
                <div style={{ fontSize: 30, width: 48, height: 48, background: "rgba(255,255,255,0.18)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>🏆</div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{miUnidad?.nombre || "Unidad"}</div>
                  <div style={{ fontSize: 17, fontWeight: 900, textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>{ligaSeleccionada.nombre}</div>
                </div>
              </div>
            </div>

            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button style={s.btnSave} onClick={guardarColorLiga} disabled={loading}>
                {loading ? "Guardando..." : "Guardar color"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EQUIPO ── */}
      {modal === "equipo" && (
        <div style={s.overlay} onClick={() => setModal(null)}>
          <div style={{ ...s.modalBox, maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>{editEquipoId ? "Editar equipo" : "Nuevo equipo"}</h3>

            {/* PREVIEW CAMISETA + ESCUDO */}
            <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 18 }}>
              <div style={{ flexShrink: 0 }}>
                <JerseySVG
                  diseno={equipoForm.diseno_camiseta}
                  color1={equipoForm.color_playera}
                  color2={equipoForm.color_camiseta_2}
                  escudoUrl={escudoPreview || null}
                  size={72}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={s.uploadLabel}>
                    📁 {escudoPreview ? "Cambiar logo" : "Subir logo del equipo"}
                    <input type="file" accept="image/*" onChange={handleEscudoChange} style={{ display: "none" }} />
                  </label>
                  {escudoPreview && (
                    <>
                      {/* Miniatura visible del archivo seleccionado, encima un check verde
                          para que se entienda a simple vista que la foto está cargada. */}
                      <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
                        <img src={escudoPreview} alt="logo cargado"
                          style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "2px solid #4f8f2f", background: "#fff" }} />
                        <span style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: "#16a34a", color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>✓</span>
                      </div>
                      <button type="button" onClick={quitarEscudo}
                        style={{ background: "transparent", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        title="Quitar este logo">
                        ✕ Quitar
                      </button>
                    </>
                  )}
                </div>
                {escudoPreview ? (
                  <p style={{ color: "#16a34a", fontSize: 11.5, marginTop: 6, fontWeight: 600 }}>
                    ✓ Logo listo. Se subirá al guardar el equipo.
                  </p>
                ) : (
                  <p style={{ color: "#888", fontSize: 11, marginTop: 6 }}>Aparece en la camiseta. PNG o JPG.</p>
                )}
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Nombre del equipo *</label>
              <input style={s.input} placeholder="ej. Águilas FC"
                value={equipoForm.nombre} onChange={e => setEquipoForm({ ...equipoForm, nombre: e.target.value })} />
            </div>

            {/* DISEÑO DE CAMISETA */}
            <div style={s.field}>
              <label style={s.label}>Diseño de camiseta</label>
              <JerseyDesignPicker
                diseno={equipoForm.diseno_camiseta}
                color1={equipoForm.color_playera}
                color2={equipoForm.color_camiseta_2}
                onChange={({ diseno }) => setEquipoForm({ ...equipoForm, diseno_camiseta: diseno })}
              />
            </div>

            {/* COLORES */}
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ ...s.field, flex: 1 }}>
                <label style={s.label}>Color principal</label>
                <ColorPicker
                  colores={COLORES}
                  valor={equipoForm.color_playera}
                  onChange={c => setEquipoForm({ ...equipoForm, color_playera: c })}
                />
              </div>
              <div style={{ ...s.field, flex: 1 }}>
                <label style={s.label}>Color secundario</label>
                <ColorPicker
                  colores={["#ffffff","#000000","#f5f5f5","#fbbf24","#ef4444","#3b82f6","#10b981","#8b5cf6"]}
                  valor={equipoForm.color_camiseta_2}
                  onChange={c => setEquipoForm({ ...equipoForm, color_camiseta_2: c })}
                />
              </div>
            </div>

            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button style={s.btnSave} onClick={guardarEquipo} disabled={loading}>
                {loading ? "Guardando..." : editEquipoId ? "Guardar cambios" : "Registrar equipo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ASIGNAR CAPITÁN: paso 1 (input) ── */}
      {modalCapitan === "input" && equipoDetalle && (
        <div style={s.overlay} onClick={() => setModalCapitan(null)}>
          <div style={{ ...s.modalBox, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>👑 Asignar capitán</h3>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: -14, marginBottom: 18 }}>
              Ingresa el número de afiliado del jugador que será capitán de <strong>{equipoDetalle.nombre}</strong>.
            </p>
            <div style={s.field}>
              <label style={s.label}>Número de afiliado *</label>
              <div style={{ display: "flex", alignItems: "stretch", border: `1px solid ${BORDER}`, borderRadius: 9, background: BASE, overflow: "hidden" }}>
                <span style={{ display: "flex", alignItems: "center", padding: "0 14px", background: "#f3f4f6", color: "#6b7280", fontSize: 14, fontWeight: 700, borderRight: `1px solid ${BORDER}` }}>AF-</span>
                <input
                  style={{ ...s.input, border: "none", borderRadius: 0, background: "transparent", flex: 1 }}
                  placeholder="63"
                  inputMode="numeric"
                  value={capitanForm.numero_afiliado}
                  onChange={e => setCapitanForm({ ...capitanForm, numero_afiliado: e.target.value })}
                  autoFocus
                />
              </div>
            </div>
            <div style={s.field}>
              <label style={s.label}>Dorsal (opcional)</label>
              <input
                style={s.input}
                type="text"
                inputMode="numeric"
                maxLength={3}
                placeholder="Si aún no está inscrito"
                value={capitanForm.dorsal}
                onChange={e => setCapitanForm({ ...capitanForm, dorsal: e.target.value })}
              />
              <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                Solo se usa si el jugador no está inscrito en este equipo.
              </p>
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModalCapitan(null)}>Cancelar</button>
              <button style={s.btnSave} onClick={buscarCandidatoCapitan} disabled={loading}>
                {loading ? "Buscando..." : "Buscar jugador"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ASIGNAR CAPITÁN: paso 2 (confirmación) ── */}
      {modalCapitan === "confirm" && capitanCandidato && equipoDetalle && (
        <div style={s.overlay} onClick={() => setModalCapitan(null)}>
          <div style={{ ...s.modalBox, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>Confirmar capitán</h3>
            <div style={s.confirmCard}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", overflow: "hidden", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {capitanCandidato.jugador.foto_url
                  ? <img src={capitanCandidato.jugador.foto_url} alt="foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 26 }}>🏃</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 3 }}>
                  {capitanCandidato.jugador.nombre_completo}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  #{capitanCandidato.jugador.numero_afiliado}
                </div>
                {capitanCandidato.yaInscrito && (
                  <div style={{ marginTop: 6, fontSize: 11, color: GREEN, fontWeight: 700 }}>
                    Ya inscrito · dorsal {capitanCandidato.yaInscrito.dorsal || "—"}
                  </div>
                )}
              </div>
            </div>
            <p style={{ fontSize: 13, color: "#374151", marginBottom: 22 }}>
              {capitanCandidato.yaInscrito
                ? `Se le otorgará el rol de capitán y podrá gestionar la lista de jugadores y la tarjeta del equipo.`
                : `Se inscribirá en ${equipoDetalle.nombre} con el rol de capitán.`}
            </p>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModalCapitan("input")}>← Volver</button>
              <button style={s.btnSave} onClick={confirmarCapitan} disabled={loading}>
                {loading ? "Asignando..." : "👑 Confirmar capitán"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL AÑADIR JUGADORES: paso 1 (input) ── */}
      {modalJugadores === "anadir_input" && equipoDetalle && (
        <div style={s.overlay} onClick={() => setModalJugadores(null)}>
          <div style={{ ...s.modalBox, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>+ Añadir jugadores a {equipoDetalle.nombre}</h3>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: -14, marginBottom: 16 }}>
              Ingresa uno o varios números de afiliado (sin "AF-"). Sepáralos con coma, espacio o salto de línea.
            </p>
            <div style={s.field}>
              <label style={s.label}>Números de afiliado</label>
              <textarea
                style={{ ...s.input, minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
                placeholder={"61\n62\n63"}
                inputMode="numeric"
                value={anadirAfiliados}
                onChange={e => setAnadirAfiliados(e.target.value)}
                autoFocus
              />
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>
              Cupos disponibles: <strong>{17 - jugadoresEquipo.length}</strong> / 17
            </p>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModalJugadores(null)}>Cancelar</button>
              <button style={s.btnSave} onClick={buscarCandidatosAdmin} disabled={loading}>
                {loading ? "Buscando..." : "Verificar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL AÑADIR JUGADORES: paso 2 (confirmar) ── */}
      {modalJugadores === "anadir_confirm" && equipoDetalle && (
        <div style={s.overlay} onClick={() => setModalJugadores(null)}>
          <div style={{ ...s.modalBox, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>Confirmar inscripción</h3>
            <p style={{ fontSize: 13, color: "#374151", marginBottom: 16 }}>
              Estos {anadirCandidatos.length} jugador{anadirCandidatos.length === 1 ? "" : "es"} se inscribirán en <strong>{equipoDetalle.nombre}</strong>:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 300, overflowY: "auto", marginBottom: 18 }}>
              {anadirCandidatos.map(c => (
                <div key={c.id} style={s.confirmCard}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                    {c.foto_url
                      ? <img src={c.foto_url} alt="foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 20 }}>🏃</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{c.nombre_completo}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>#{c.numero_afiliado} · {c.nombre_camiseta_sugerido}</div>
                    {c.dorsal_cambiado && (
                      <div style={{ fontSize: 10, color: "#92400e", marginTop: 3, fontWeight: 600 }}>
                        ⚠️ Su preferido (#{c.numero_preferido}) ya está ocupado
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, minWidth: 44 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: c.dorsal_cambiado ? "#f59e0b" : (equipoDetalle.color_playera || "#3182ce"), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900 }}>
                      {c.dorsal_asignado}
                    </div>
                    <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 700, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>Dorsal</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModalJugadores("anadir_input")}>← Volver</button>
              <button style={s.btnSave} onClick={confirmarAnadirAdmin} disabled={loading}>
                {loading ? "Inscribiendo..." : `✓ Inscribir ${anadirCandidatos.length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ELIMINAR JUGADOR ── */}
      {modalJugadores === "eliminar" && eliminarJugTarget && (
        <div style={s.overlay} onClick={() => setModalJugadores(null)}>
          <div style={{ ...s.modalBox, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>⚠️</div>
              <h3 style={{ ...s.modalTitle, marginBottom: 10 }}>¿Eliminar a este jugador?</h3>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6 }}>
                {eliminarJugTarget.jugadores?.nombre_completo}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>#{eliminarJugTarget.jugadores?.numero_afiliado}</div>
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#991b1b", lineHeight: 1.45, marginBottom: 18 }}>
              <strong>Aviso:</strong> Saldrá de la lista del equipo y se borrarán todos sus datos en partidos pendientes (asistencia y goles en fichas no cerradas). Las fichas ya cerradas se conservan.
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModalJugadores(null)}>Cancelar</button>
              <button style={{ ...s.btnSave, background: "#dc2626" }} onClick={eliminarJugadorAdmin} disabled={loading}>
                {loading ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DESVINCULAR ÁRBITRO ── */}
      {desvincularArbTarget && (
        <div style={s.overlay} onClick={() => setDesvincularArbTarget(null)}>
          <div style={{ ...s.modalBox, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>🟡</div>
              <h3 style={{ ...s.modalTitle, marginBottom: 10 }}>
                {desvincularArbTarget.confirmado ? "¿Desvincular a este árbitro?" : "¿Rechazar esta asignación?"}
              </h3>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6 }}>
                {desvincularArbTarget.nombre}
              </div>
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#991b1b", lineHeight: 1.45, marginBottom: 18 }}>
              <strong>Aviso:</strong> Saldrá de tu unidad deportiva y perderá acceso a todos los torneos.
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setDesvincularArbTarget(null)}>Cancelar</button>
              <button style={{ ...s.btnSave, background: "#dc2626" }} onClick={() => desvincularArbitro(desvincularArbTarget)}>
                Sí, desvincular
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DAR DE BAJA EQUIPO ── */}
      {eliminarEquipoTarget && (
        <div style={s.overlay} onClick={() => !loading && setEliminarEquipoTarget(null)}>
          <div style={{ ...s.modalBox, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>🚪</div>
              <h3 style={{ ...s.modalTitle, marginBottom: 10 }}>¿Dar de baja este equipo?</h3>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6 }}>
                {eliminarEquipoTarget.nombre}
              </div>
            </div>
            <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#92400e", lineHeight: 1.45, marginBottom: 18 }}>
              El equipo saldrá de la tabla general y dejará de aparecer en el generador de jornadas. Sus partidos ya jugados se conservan y no afectan a los demás equipos. Podrás reactivarlo más adelante.
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setEliminarEquipoTarget(null)} disabled={loading}>Cancelar</button>
              <button style={{ ...s.btnSave, background: "#dc2626" }} onClick={confirmarEliminarEquipo} disabled={loading}>
                {loading ? "Dando de baja..." : "Sí, dar de baja"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL QUITAR CAPITANÍA ── */}
      {confirmQuitarCap && (
        <div style={s.overlay} onClick={() => setConfirmQuitarCap(null)}>
          <div style={{ ...s.modalBox, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>👑</div>
              <h3 style={{ ...s.modalTitle, marginBottom: 10 }}>¿Quitar capitanía?</h3>
              {confirmQuitarCap.nombre && (
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6 }}>
                  {confirmQuitarCap.nombre}
                </div>
              )}
              <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>
                Dejará de ser capitán pero seguirá inscrito en el equipo. Otro jugador podrá ser asignado como capitán.
              </p>
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setConfirmQuitarCap(null)}>Cancelar</button>
              <button style={{ ...s.btnSave, background: "#dc2626" }} onClick={confirmarQuitarCapitan} disabled={loading}>
                {loading ? "Quitando..." : "Sí, quitar capitanía"}
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
  wrap: {},
  // ── HERO DE UNIDAD (gradiente verde) ── Mismo patrón que el hero de Resultados
  // y Fichas: logo + nombre de unidad pequeño arriba + título grande del apartado.
  unitHero: { position:"relative", overflow:"hidden", background:"linear-gradient(135deg, #4f8f2f 0%, #3a6b22 70%, #2e5419 100%)", borderRadius:18, padding:"14px 16px", marginBottom:18, boxShadow:"0 6px 20px rgba(79,143,47,0.28)", color:"#fff" },
  unitHeroGlow: { position:"absolute", top:-40, right:-40, width:160, height:160, borderRadius:"50%", background:"radial-gradient(circle, rgba(127,191,77,0.5) 0%, rgba(127,191,77,0) 70%)", pointerEvents:"none" },
  unitHeroRow: { position:"relative", zIndex:1, display:"flex", alignItems:"center", gap:12 },
  unitHeroLogoWrap: { width:48, height:48, borderRadius:12, background:"rgba(255,255,255,0.20)", border:"2px solid rgba(255,255,255,0.42)", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0, boxShadow:"0 3px 10px rgba(0,0,0,0.20)" },
  unitHeroLogoImg: { width:"100%", height:"100%", objectFit:"cover" },
  unitHeroLabelSmall: { fontSize:10, fontWeight:700, letterSpacing:0.6, color:"rgba(255,255,255,0.82)", textTransform:"uppercase", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  unitHeroTitleBig: { fontSize:22, fontWeight:900, letterSpacing:-0.6, color:"#fff", margin:0, lineHeight:1.1, textShadow:"0 1px 2px rgba(0,0,0,0.18)", overflow:"hidden", textOverflow:"ellipsis" },
  unitHeroBtn: { position:"relative", zIndex:1, width:"100%", background:"rgba(255,255,255,0.95)", border:"none", borderRadius:"var(--radius-full,9999px)", padding:"9px 16px", color:"#3a6b22", fontSize:13, fontWeight:800, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, boxShadow:"0 2px 8px rgba(0,0,0,0.15)" },
  // ── SECCIÓN PERSONALIZAR ──
  persHero: { display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderRadius:14, background:"linear-gradient(135deg, #ede9fe 0%, #fdf2f8 100%)", border:"1px solid #e9d5ff", marginBottom:16 },
  persHeroIcon: { width:48, height:48, borderRadius:12, background:"linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, color:"#fff", flexShrink:0, boxShadow:"0 4px 12px rgba(139,92,246,0.28)" },
  persHeroTitle: { fontSize:16, fontWeight:800, color:"#581c87", margin:0, marginBottom:3, letterSpacing:-0.3 },
  persHeroSub: { fontSize:12, color:"#7c3aed", lineHeight:1.4, margin:0 },

  // ── Sección Torneos: hero verde + tarjetas individuales ──
  torneosHero: { display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderRadius:14, background:"linear-gradient(135deg, #ecfccb 0%, #f0fdf4 100%)", border:"1px solid #bbf7d0", marginBottom:16 },
  torneosHeroIcon: { width:48, height:48, borderRadius:12, background:"linear-gradient(135deg, #4f8f2f 0%, #7fbf4d 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, color:"#fff", flexShrink:0, boxShadow:"0 4px 12px rgba(79,143,47,0.28)" },
  torneosHeroTitle: { fontSize:18, fontWeight:800, color:"#14532d", margin:0, marginBottom:3, letterSpacing:-0.3 },
  torneosHeroSub: { fontSize:12.5, color:"#15803d", lineHeight:1.4, margin:0 },
  torneosGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))", gap:12 },
  torneoCard: { background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:14, padding:"14px 14px 12px", boxShadow:"0 1px 4px rgba(0,0,0,0.05)", display:"flex", flexDirection:"column", gap:10, minWidth:0 },
  torneoCardHeader: { display:"flex", alignItems:"center", gap:10, minWidth:0 },
  torneoBadge: { width:38, height:38, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:800, flexShrink:0 },
  torneoNombre: { fontSize:15, fontWeight:800, color:"#111827", lineHeight:1.2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  torneoTemporada: { fontSize:11.5, color:"#6b7280", marginTop:2, fontWeight:600 },
  torneoMetaRow: { display:"flex", gap:6, flexWrap:"wrap" },
  torneoMetaPill: { fontSize:11.5, color:"#374151", background:"#f3f4f6", border:`1px solid ${BORDER}`, borderRadius:999, padding:"3px 10px", fontWeight:600 },
  torneoActions: { display:"flex", gap:8, alignItems:"center", marginTop:4 },
  persCard: { background:"#ffffff", border:`1px solid ${BORDER}`, borderRadius:14, padding:16, boxShadow:"0 2px 10px rgba(0,0,0,0.04)" },
  persCardHead: { display:"flex", alignItems:"flex-start", gap:10, marginBottom:14, paddingBottom:12, borderBottom:`1px solid ${BORDER}` },
  persCardEmoji: { fontSize:22, width:38, height:38, borderRadius:10, background:"#f0fdf4", border:"1px solid #c3e6a3", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  persCardTitle: { fontSize:14.5, fontWeight:800, color:"#111827", marginBottom:2, lineHeight:1.2 },
  persCardDesc: { fontSize:11.5, color:"#6b7280", lineHeight:1.4 },
  torneoColorRow: { display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:12, background:"#fafafa", border:"1px solid #e5e7eb" },
  torneoColorSwatch: { width:40, height:40, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:"#fff", flexShrink:0, boxShadow:"0 2px 8px rgba(0,0,0,0.10)" },
  torneoColorName: { fontSize:13.5, fontWeight:700, color:"#111827", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  torneoColorHex: { fontSize:10.5, color:"#9ca3af", fontFamily:"'DM Mono', monospace", letterSpacing:0.5 },
  torneoColorBtn: { background:"#fff", border:"1.5px solid #4f8f2f", borderRadius:"var(--radius-full,9999px)", padding:"6px 14px", color:"#4f8f2f", fontSize:11.5, fontWeight:800, cursor:"pointer", flexShrink:0 },
  // ── PATROCINADORES (publicidad de la unidad) ──
  patroRow: { display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:12, background:"linear-gradient(90deg, #faf5ff 0%, #ffffff 65%)", border:"1px solid #e9d5ff" },
  patroThumb: { height:48, borderRadius:8, background:"#fff", border:"1px solid #e5e7eb", overflow:"hidden", flexShrink:0 },
  patroFormatoPill: { display:"inline-block", fontSize:10, fontWeight:800, color:"#7c3aed", background:"#f3e8ff", border:"1px solid #e9d5ff", borderRadius:999, padding:"3px 9px", letterSpacing:0.5, textTransform:"uppercase" },
  patroActions: { display:"flex", gap:5, alignItems:"center", flexShrink:0 },
  patroArrowBtn: { width:30, height:30, borderRadius:7, border:"1px solid #e5e7eb", background:"#fff", color:"#374151", fontSize:14, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" },
  patroToggleBtn: { width:30, height:30, borderRadius:7, border:"1px solid", fontSize:11, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" },
  patroDelBtn: { width:30, height:30, borderRadius:7, border:"1px solid #fecaca", background:"#fff", color:"#dc2626", fontSize:13, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" },
  patroAddBox: { background:"linear-gradient(135deg, #faf5ff 0%, #fdf4ff 100%)", border:"1px dashed #d8b4fe", borderRadius:12, padding:14 },
  // ── HEADER LEGACY ──
  header: { marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" },
  title: { fontSize: 26, fontWeight: 800, color: "#111827", letterSpacing: -0.8, marginBottom: 4 },
  sub: { color: "#6b7280", fontSize: 14 },
  // ── HEADER SECCIÓN ÁRBITROS (amber, color de rol árbitro) ──
  // Fila compacta de contador + botón actualizar (el título grande ya está en el unitHero).
  arbCountRow: { display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"8px 14px", borderRadius:10, background:"#fffbeb", border:"1px solid #fde68a", marginBottom:14, flexWrap:"wrap" },
  arbCountTxt: { fontSize:12, fontWeight:700, color:"#92400e" },
  arbReloadBtn: { background:"#fff", border:"1px solid #fde68a", borderRadius:"var(--radius-full,9999px)", padding:"5px 12px", color:"#d97706", fontSize:11.5, fontWeight:800, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:4, boxShadow:"0 1px 4px rgba(245,158,11,0.18)" },
  arbSecHero: { position:"relative", overflow:"hidden", background:"linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", borderRadius:14, padding:"12px 16px", marginBottom:14, color:"#fff", boxShadow:"0 4px 14px rgba(245,158,11,0.28)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" },
  arbSecHeroLeft: { display:"flex", alignItems:"center", gap:10, minWidth:0, flex:1 },
  arbSecHeroIcon: { width:38, height:38, borderRadius:10, background:"rgba(255,255,255,0.22)", border:"1px solid rgba(255,255,255,0.36)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 },
  arbSecHeroTitle: { fontSize:14, fontWeight:800, color:"#fff", letterSpacing:-0.3, lineHeight:1.2, marginBottom:2 },
  arbSecHeroSub: { fontSize:11.5, fontWeight:600, color:"rgba(255,255,255,0.85)" },
  arbSecHeroBtn: { background:"rgba(255,255,255,0.95)", border:"none", borderRadius:"var(--radius-full,9999px)", padding:"6px 12px", color:"#d97706", fontSize:11.5, fontWeight:800, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:4, boxShadow:"0 2px 6px rgba(0,0,0,0.12)", flexShrink:0 },
  // ── FILA ÁRBITRO COLORIDA ──
  arbRow: { background:"linear-gradient(90deg, #fffbeb 0%, #ffffff 65%)", border:"1px solid #fde68a", borderLeft:"4px solid #f59e0b", borderRadius:12, padding:"12px 14px", display:"flex", alignItems:"center", gap:12, justifyContent:"space-between", boxShadow:"0 1px 4px rgba(245,158,11,0.10)", flexWrap:"wrap" },
  arbAvatar: { width:44, height:44, borderRadius:"50%", background:"linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", border:"2px solid #f59e0b", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 },
  arbName: { fontSize:14.5, fontWeight:800, color:"#92400e", marginBottom:2, lineHeight:1.2 },
  arbMeta: { fontSize:11.5, color:"#a16207", lineHeight:1.3 },
  arbPillTotal: { fontSize:10.5, fontWeight:800, padding:"5px 10px", borderRadius:"var(--radius-full,9999px)", background:"#fef3c7", color:"#92400e", border:"1px solid #fde68a", flexShrink:0 },
  arbBtnAcceso: { fontSize:11.5, fontWeight:800, padding:"7px 12px", borderRadius:"var(--radius-full,9999px)", border:"none", cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" },
  // Encabezados de secciones (pendientes / confirmados)
  arbSectionHead: { display:"flex", alignItems:"center", gap:8, marginBottom:8, marginTop:4 },
  arbSectionDot: { width:8, height:8, borderRadius:"50%", background:"#f59e0b" },
  arbSectionTitle: { fontSize:12, fontWeight:800, color:"#111827", textTransform:"uppercase", letterSpacing:0.7 },
  arbSectionCount: { fontSize:11, fontWeight:800, padding:"2px 9px", borderRadius:"var(--radius-full,9999px)", background:"#fef3c7", color:"#92400e" },
  arbPendingHint: { fontSize:12, color:"#92400e", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:"8px 12px", marginBottom:10, lineHeight:1.4 },
  ligaSelector: { display: "flex", alignItems: "center", gap: 14, marginBottom: 24, flexWrap: "wrap" },
  ligaLabel: { fontSize: 13, color: "#6b7280", fontWeight: 600, flexShrink: 0 },
  ligaTabs: { display: "flex", gap: 8, flexWrap: "wrap" },
  ligaTab: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "7px 16px", color: "#6b7280", fontSize: 13, cursor: "pointer", fontWeight: 500, transition: "transform 0.15s, box-shadow 0.15s" },
  ligaTabActive: { background: `linear-gradient(135deg, ${GREEN} 0%, #7fbf4d 100%)`, borderColor: GREEN, color: "#fff", fontWeight: 800, boxShadow: "0 4px 12px rgba(79,143,47,0.35)", transform: "translateY(-1px)" },
  tabs: { display: "flex", gap: 4, marginBottom: 24, borderBottom: `1px solid ${BORDER}` },
  tab: { background: "transparent", border: "none", borderBottom: "2px solid transparent", color: "#6b7280", padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: -1 },
  tabActive: { color: GREEN, borderBottomColor: GREEN },
  secHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  secCount: { color: "#6b7280", fontSize: 13 },
  btnAdd: { background: GREEN, color: "#ffffff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  equipoGrid: { display: "flex", flexDirection: "column", gap: 10 },
  equipoCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 4px rgba(79,143,47,0.07)", borderTop: `3px solid ${GREEN}`, minWidth: 0 },
  equipoCardRow: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  equipoCardLeft: { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12 },
  equipoCardRight: { display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end", flexShrink: 0 },
  equipoCardInfo: { flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1 }, // legacy
  equipoCardCenter: { minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1 },        // legacy
  equipoActionsCol: { display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch", flexShrink: 0 },  // legacy
  equipoActionsRow: { display: "flex", gap: 6, justifyContent: "flex-end" },
  equipoCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  escudoWrap: { width: 52, height: 52, borderRadius: 12, overflow: "hidden", flexShrink: 0 },
  escudoImg: { width: "100%", height: "100%", objectFit: "cover" },
  escudoPlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff", borderRadius: 12 },
  equipoActions: { display: "flex", gap: 6 },
  equipoNombre: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800, color: "#111827", lineHeight: 1.2, letterSpacing: -0.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word", overflowWrap: "anywhere" },
  equipoMeta: { fontSize: 11, color: "#6b7280", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, // legacy
  equipoMetaRight: { fontSize: 11, color: "#6b7280", fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" },
  btnVer: { background: "transparent", borderWidth: 1.5, borderStyle: "solid", borderColor: GREEN, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 800, whiteSpace: "nowrap", lineHeight: 1.2 },
  detalleHeader: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", gap: 20, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  escudoWrapLg: { width: 72, height: 72, borderRadius: 14, overflow: "hidden", flexShrink: 0 },
  escudoImgLg: { width: "100%", height: "100%", objectFit: "cover" },
  escudoPlaceholderLg: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, color: "#fff" },
  detalleNombre: { fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 4 },
  detalleMeta: { color: "#6b7280", fontSize: 14 },
  jugadorList: { display: "flex", flexDirection: "column", gap: 8 },
  jugadorRow: { background: "linear-gradient(90deg, #f0fdf4 0%, #ffffff 60%)", border: `1px solid #c3e6a3`, borderRadius: 11, padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 3px rgba(79,143,47,0.07)", borderLeft: `3px solid ${GREEN}` },
  jugadorAvatar: { flexShrink: 0 },
  jugadorFoto: { width: 38, height: 38, borderRadius: "50%", objectFit: "cover" },
  jugadorFotoPlaceholder: { width: 38, height: 38, borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 },
  jugadorInfo: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 },
  jugadorNombre: { fontSize: 14.5, fontWeight: 800, color: "#111827", lineHeight: 1.15, display: "flex", alignItems: "center" },
  jugadorNombreTxt: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  jugadorMeta: { fontSize: 11, color: "#6b7280" }, // legacy (otros listados)
  jugadorMetaLinea: { fontSize: 10.5, color: "#6b7280", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  jugadorDorsal: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 },
  dorsalBadge: { width: 30, height: 30, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#fff" },
  dorsalLabel: { fontSize: 8.5, color: "#9ca3af", letterSpacing: 0.3 },
  jugadorCamiseta: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 52, maxWidth: 72, flexShrink: 0 },
  camisetaNombre: { fontSize: 10.5, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" },
  camisetaLabel: { fontSize: 8.5, color: "#9ca3af", letterSpacing: 0.3 },
  equipoBadge: { fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 8 },
  backBtn: { background: "transparent", border: "none", color: GREEN, fontSize: 14, cursor: "pointer", marginBottom: 20, padding: 0, fontWeight: 600 },
  empty: { textAlign: "center", padding: "60px 20px" },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTxt: { color: "#6b7280", fontSize: 15, marginBottom: 12 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.28)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, overflowY: "auto" },
  modalBox: { background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 24, width: "100%", maxWidth: 440, maxHeight: "calc(100vh - 32px)", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 22 },
  escudoUpload: { display: "flex", alignItems: "center", gap: 18, marginBottom: 22, background: BASE, borderRadius: 12, padding: 16 },
  escudoUploadPreview: { width: 64, height: 64, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff", overflow: "hidden" },
  uploadLabel: { display: "inline-block", background: "#f3f4f6", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: "#6b7280", fontSize: 13, cursor: "pointer" },
  field: { marginBottom: 18 },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 },
  input: { width: "100%", background: BASE, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "10px 14px", color: "#111827", fontSize: 14, outline: "none", boxSizing: "border-box" },
  colorGrid: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  colorDot: { width: 28, height: 28, borderRadius: "50%", cursor: "pointer", transition: "box-shadow 0.2s" },
  colorCustom: { width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0, background: "transparent" },
  modalActions: { display: "flex", gap: 10, marginTop: 24 },
  btnCancel: { flex: 1, background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, color: "#6b7280", fontSize: 14, cursor: "pointer" },
  btnSave: { flex: 2, background: GREEN, color: "#ffffff", border: "none", borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer" },
  btnEdit: { background: "#f3f4f6", color: "#6b7280", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "4px 8px", fontSize: 13, cursor: "pointer", lineHeight: 1 },
  btnDel: { background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 7, padding: "4px 8px", fontSize: 13, cursor: "pointer", lineHeight: 1 },
  toast: { position: "fixed", bottom: 28, right: 28, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999 },
  capitanBox: { background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)", border: "1px solid #fde68a", borderRadius: 14, padding: "14px 18px", marginBottom: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" },
  capitanInfo: { display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  capitanCrown: { fontSize: 26, width: 44, height: 44, borderRadius: 10, background: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  capitanLabel: { fontSize: 11, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 2 },
  capitanNombre: { fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 2 },
  capitanMeta: { fontSize: 12, color: "#6b7280" },
  btnAsignarCap: { background: "#f59e0b", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" },
  btnQuitarCap: { background: "#fff", color: "#92400e", border: "1px solid #fde68a", borderRadius: 10, padding: "9px 16px", fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" },
  btnQuitarCapInline: { marginTop: 4, alignSelf: "flex-start", background: "transparent", color: "#92400e", border: "none", padding: "1px 0", fontWeight: 700, fontSize: 10, cursor: "pointer", whiteSpace: "nowrap", textDecoration: "underline", textUnderlineOffset: 2 },
  jugadorRowCap: { background: "linear-gradient(90deg, #fffbeb 0%, #ffffff 60%)", border: "1px solid #fde68a", borderLeft: "3px solid #f59e0b" },
  btnEliminarJug: { background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 7, padding: "4px 7px", fontSize: 12, cursor: "pointer", flexShrink: 0 },
  confirmCard: { display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "#f9fafb", border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 16 },
};

const css = `
  .la-card { transition: transform 0.18s, box-shadow 0.18s; }
  .la-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
  input:focus, select:focus { border-color: #4f8f2f !important; }
`;