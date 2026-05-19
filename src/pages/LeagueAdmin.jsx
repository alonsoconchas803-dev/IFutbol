import ScheduleGenerator from "./ScheduleGenerator";
import FichaGenerator, { FichaDetalleModal } from "./FichaGenerator";
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

// Normaliza "1", "00001", "af-1", "AF-00001" → "AF-00001"
const normalizarAfiliado = (input) => {
  const limpio = String(input || "").trim().toUpperCase().replace(/^AF-?/, "");
  if (!limpio) return "";
  if (/^\d+$/.test(limpio)) return `AF-${limpio.padStart(5, "0")}`;
  return `AF-${limpio}`;
};

// Devuelve { dorsal, cambiado } usando el preferido si está libre,
// o el primer libre disponible (1..99). Si todos están ocupados → null.
const calcularDorsal = (preferido, ocupados) => {
  const set = ocupados instanceof Set ? ocupados : new Set(ocupados || []);
  if (preferido && !set.has(preferido)) return { dorsal: preferido, cambiado: false };
  for (let i = 1; i <= 99; i++) {
    if (!set.has(i)) return { dorsal: i, cambiado: !!preferido };
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

  // Color del torneo activo
  const [colorLigaForm, setColorLigaForm] = useState("#4f8f2f");

  // CRUD de torneos (alta/edición desde el panel del admin de unidad)
  const [ligaForm, setLigaForm] = useState({ nombre: "", dia: "Lunes", turno: "Noche", temporada: "", color_marca: "#4f8f2f" });
  const [editLigaId, setEditLigaId] = useState(null);
  const [eliminarLigaTarget, setEliminarLigaTarget] = useState(null);

  // Resultados (fichas cerradas)
  const [resultados, setResultados] = useState([]);
  const [resultadosLoading, setResultadosLoading] = useState(false);
  const [jugadoresInfo, setJugadoresInfo] = useState({});
  const [resultadoExpandido, setResultadoExpandido] = useState(null);
  const [jornadaSelectedRes, setJornadaSelectedRes] = useState(null);
  const [resultadoVistaFicha, setResultadoVistaFicha] = useState(null); // partido cuyo modal "ver ficha" está abierto

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
      setJugadoresEquipo(data || []);
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
          const dManual = +capitanForm.dorsal;
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

  // ── RESULTADOS (FICHAS CERRADAS) ──────────────────────────────
  const cargarResultados = async () => {
    if (!ligaSeleccionada) return;
    setResultadosLoading(true);
    try {
      const jornadas = await db(`/jornadas?liga_id=eq.${ligaSeleccionada.id}&select=id,numero,fecha&order=numero`, token);
      const jornadaIds = (jornadas || []).map(j => j.id);
      if (jornadaIds.length === 0) { setResultados([]); setResultadosLoading(false); return; }

      const partidos = await db(
        `/partidos?jornada_id=in.(${jornadaIds.join(",")})&select=id,jornada_id,equipo_local_id,equipo_visitante_id,hora,cancha_numero,jornadas(numero,fecha,liga_id),ficha_partido(*)`,
        token
      );

      const cerradas = (partidos || []).filter(p => {
        const f = Array.isArray(p.ficha_partido) ? p.ficha_partido[0] : p.ficha_partido;
        return f?.cerrada;
      });

      const equipoIds = new Set();
      cerradas.forEach(p => { equipoIds.add(p.equipo_local_id); equipoIds.add(p.equipo_visitante_id); });
      const equipos = equipoIds.size > 0
        ? await db(`/equipos?id=in.(${[...equipoIds].join(",")})&select=id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url`, token)
        : [];
      const equiposMap = Object.fromEntries(equipos.map(e => [e.id, e]));

      const jugIds = new Set();
      cerradas.forEach(p => {
        const f = Array.isArray(p.ficha_partido) ? p.ficha_partido[0] : p.ficha_partido;
        (f?.asistencia || []).forEach(id => jugIds.add(id));
        (f?.goleadores || []).forEach(g => g.jugador_id && jugIds.add(g.jugador_id));
      });
      const jugadores = jugIds.size > 0
        ? await db(`/jugadores?id=in.(${[...jugIds].join(",")})&select=id,nombre_completo,numero_afiliado,foto_url`, token)
        : [];
      const jugadoresMap = Object.fromEntries(jugadores.map(j => [j.id, j]));

      // Necesitamos también los dorsales del jugador en su equipo para esta liga
      const inscripciones = jugIds.size > 0
        ? await db(`/jugador_equipo?liga_id=eq.${ligaSeleccionada.id}&jugador_id=in.(${[...jugIds].join(",")})&select=jugador_id,equipo_id,dorsal,nombre_camiseta`, token)
        : [];
      const inscMap = {};
      inscripciones.forEach(i => { inscMap[`${i.jugador_id}_${i.equipo_id}`] = i; });

      setJugadoresInfo({ jug: jugadoresMap, insc: inscMap });
      const procesados = cerradas.map(p => {
        const ficha = Array.isArray(p.ficha_partido) ? p.ficha_partido[0] : p.ficha_partido;
        return {
          id: p.id,
          local: equiposMap[p.equipo_local_id],
          visitante: equiposMap[p.equipo_visitante_id],
          jornada: p.jornadas?.numero,
          fecha: p.jornadas?.fecha,
          hora: p.hora,
          cancha_numero: p.cancha_numero,
          jornadas: p.jornadas, // numero, fecha, liga_id
          ficha,
        };
      }).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.jornada || 0) - (a.jornada || 0));
      setResultados(procesados);
      // Selección por defecto: la jornada más alta con fichas cerradas
      const jornadasUnicas = [...new Set(procesados.map(r => r.jornada).filter(Boolean))].sort((a, b) => b - a);
      setJornadaSelectedRes(jornadasUnicas[0] ?? null);
    } catch (e) { showToast(e.message, "err"); }
    setResultadosLoading(false);
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
        portada_url = await uploadFile("imagenes", path, personalizarPortadaFile, token);
      }
      const payload = { ...personalizarForm, logo_url, portada_url };
      await db(`/canchas?id=eq.${miUnidad.id}`, token, { method: "PATCH", body: JSON.stringify(payload) });
      showToast("Personalización guardada ✓");
      setMiUnidad({ ...miUnidad, ...payload });
      setPersonalizarLogoFile(null);
      setPersonalizarPortadaFile(null);
      setPersonalizarForm(f => ({ ...f, logo_url, portada_url }));
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
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
    }
  }, [seccion, miUnidad?.id]);

  useEffect(() => {
    if (seccion === "resultados" && ligaSeleccionada) cargarResultados();
  }, [seccion, ligaSeleccionada]);

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
        escudo_url = await uploadFile("imagenes", path, escudoFile, token);
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

  const confirmarEliminarEquipo = async () => {
    if (!eliminarEquipoTarget) return;
    setLoading(true);
    try {
      await db(`/equipos?id=eq.${eliminarEquipoTarget.id}`, token, { method: "DELETE" });
      showToast("Equipo eliminado");
      if (equipoDetalle?.id === eliminarEquipoTarget.id) setEquipoDetalle(null);
      setEliminarEquipoTarget(null);
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
  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {toast && <div style={{ ...s.toast, background: toast.tipo === "err" ? "#ef4444" : "#4ade80", color: toast.tipo === "err" ? "#fff" : "#0d0d1a" }}>{toast.msg}</div>}

      {/* ENCABEZADO — hero con gradiente verde. Se oculta en "calendario", "fichas" y "torneos": esas secciones renderizan un hero temático propio */}
      {seccion !== "calendario" && seccion !== "fichas" && seccion !== "torneos" && (
        <div style={s.unitHero}>
          <div style={s.unitHeroGlow} />
          <div style={s.unitHeroRow}>
            <div style={s.unitHeroLogoWrap}>
              {miUnidad?.logo_url
                ? <img src={miUnidad.logo_url} alt={miUnidad.nombre} style={s.unitHeroLogoImg} />
                : <span style={{ fontSize:30 }}>🏟️</span>}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={s.unitHeroLabel}>UNIDAD DEPORTIVA</div>
              <h2 style={s.unitHeroName}>{miUnidad?.nombre || "Panel Admin"}</h2>
            </div>
          </div>
        </div>
      )}

      {/* SELECTOR DE LIGA — oculto en "Torneos" (vista dedicada), "Personalizar"
          (aplica a la unidad), "Calendario" y "Fichas" (se renderizan dentro de
          sus componentes bajo el hero), y "detalle" de equipo (volver atrás para
          verlos). Aquí solo se elige torneo activo; alta/edición vive en la
          sección "Torneos". */}
      {seccion !== "torneos" && seccion !== "personalizar" && seccion !== "calendario" && seccion !== "fichas" && seccion !== "detalle" && (
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
          {/* Hero temático: mismo patrón que "Personalizar" pero en verde-marca */}
          <div style={s.torneosHero}>
            <div style={s.torneosHeroIcon}>🏆</div>
            <div style={{ flex:1, minWidth:0 }}>
              <h3 style={s.torneosHeroTitle}>Torneos</h3>
              <p style={s.torneosHeroSub}>
                Crea, edita y administra los torneos activos de {miUnidad?.nombre || "tu unidad"}.
              </p>
            </div>
          </div>

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
                <span style={s.secCount}>{equipos.length} equipos en {ligaSeleccionada.nombre}</span>
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
                <div style={s.equipoGrid}>
                  {equipos.map(eq => {
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
                              <button style={s.btnDel} onClick={() => eliminarEquipo(eq)} title="Eliminar">🗑️</button>
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
                  {jugadoresOrdenados.map(je => (
                    <div key={je.id} style={{ ...s.jugadorRow, ...(je.es_capitan ? s.jugadorRowCap : {}) }}>
                      <div style={s.jugadorAvatar}>
                        {je.jugadores?.foto_url
                          ? <img src={je.jugadores.foto_url} alt="foto" style={s.jugadorFoto} />
                          : <div style={s.jugadorFotoPlaceholder}>🏃</div>}
                      </div>
                      <div style={s.jugadorInfo}>
                        <div style={s.jugadorNombre}>
                          {je.es_capitan && <span style={{ marginRight: 5 }}>👑</span>}
                          <span style={s.jugadorNombreTxt}>{je.jugadores?.nombre_completo}</span>
                        </div>
                        <div style={s.jugadorMetaLinea}>{je.jugadores?.posicion_preferida || "—"}</div>
                        <div style={s.jugadorMetaLinea}>#{je.jugadores?.numero_afiliado}</div>
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
                      <button style={s.btnEliminarJug}
                        onClick={() => { setEliminarJugTarget(je); setModalJugadores("eliminar"); }}
                        title="Eliminar del equipo">
                        🗑️
                      </button>
                    </div>
                  ))}
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
              <div style={s.arbSecHero}>
                <div style={s.arbSecHeroLeft}>
                  <div style={s.arbSecHeroIcon}>🟡</div>
                  <div style={{ minWidth:0 }}>
                    <div style={s.arbSecHeroTitle}>Árbitros de la unidad</div>
                    <div style={s.arbSecHeroSub}>
                      {confirmados.length} confirmados · {pendientes.length} pendientes
                    </div>
                  </div>
                </div>
                <button style={s.arbSecHeroBtn} onClick={cargarArbitros} title="Recargar">
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

          {/* ── SECCIÓN RESULTADOS (FICHAS CERRADAS) ── */}
          {seccion === "resultados" && (() => {
            const jornadasDisponibles = [...new Set(resultados.map(r => r.jornada).filter(Boolean))].sort((a, b) => b - a);
            const resultadosFiltrados = jornadaSelectedRes != null
              ? resultados.filter(r => r.jornada === jornadaSelectedRes)
              : resultados;
            return (
            <div>
              <div style={s.secHeader}>
                <span style={s.secCount}>{resultados.length} partido{resultados.length === 1 ? "" : "s"} con ficha cerrada</span>
                <button style={{ ...s.btnAdd, background:"#f9fafb", color:"#374151", border:"1px solid #e5e7eb" }}
                  onClick={cargarResultados} disabled={resultadosLoading}>
                  ↻ Actualizar
                </button>
              </div>
              {resultadosLoading ? (
                <div style={{ textAlign:"center", padding:60, color:"#6b7280" }}>Cargando…</div>
              ) : resultados.length === 0 ? (
                <div style={s.empty}>
                  <div style={s.emptyIcon}>📋</div>
                  <div style={s.emptyTxt}>Aún no hay partidos con ficha cerrada</div>
                  <p style={{ color:"#9ca3af", fontSize:13 }}>Las fichas que el árbitro cierre aparecerán aquí con su detalle.</p>
                </div>
              ) : (
                <>
                  {/* Selector de jornadas */}
                  {jornadasDisponibles.length > 0 && (
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:18, alignItems:"center" }}>
                      <span style={{ fontSize:13, color:"#6b7280", fontWeight:600 }}>Jornada:</span>
                      {jornadasDisponibles.map(j => (
                        <button key={j}
                          onClick={() => setJornadaSelectedRes(j)}
                          style={{
                            background: jornadaSelectedRes === j ? `linear-gradient(135deg, ${GREEN} 0%, #7fbf4d 100%)` : SURFACE,
                            color: jornadaSelectedRes === j ? "#fff" : "#6b7280",
                            border: `1px solid ${jornadaSelectedRes === j ? GREEN : BORDER}`,
                            borderRadius: 20,
                            padding: "6px 14px",
                            fontSize: 13,
                            cursor: "pointer",
                            fontWeight: jornadaSelectedRes === j ? 800 : 600,
                            boxShadow: jornadaSelectedRes === j ? "0 3px 10px rgba(79,143,47,0.3)" : "none"
                          }}>
                          J{j}
                        </button>
                      ))}
                      <button
                        onClick={() => setJornadaSelectedRes(null)}
                        style={{
                          background: jornadaSelectedRes === null ? `linear-gradient(135deg, ${GREEN} 0%, #7fbf4d 100%)` : SURFACE,
                          color: jornadaSelectedRes === null ? "#fff" : "#6b7280",
                          border: `1px solid ${jornadaSelectedRes === null ? GREEN : BORDER}`,
                          borderRadius: 20,
                          padding: "6px 14px",
                          fontSize: 13,
                          cursor: "pointer",
                          fontWeight: jornadaSelectedRes === null ? 800 : 600,
                          boxShadow: jornadaSelectedRes === null ? "0 3px 10px rgba(79,143,47,0.3)" : "none"
                        }}>
                        Todas
                      </button>
                    </div>
                  )}
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {resultadosFiltrados.length === 0 ? (
                    <div style={s.empty}>
                      <div style={s.emptyIcon}>📋</div>
                      <div style={s.emptyTxt}>No hay partidos cerrados en esta jornada</div>
                    </div>
                  ) : resultadosFiltrados.map(r => {
                    const expandido = resultadoExpandido === r.id;
                    const goleadores = r.ficha?.goleadores || [];
                    const asistencia = r.ficha?.asistencia || [];
                    const golesLocal = goleadores.filter(g => g.equipo === r.local?.id);
                    const golesVisit = goleadores.filter(g => g.equipo === r.visitante?.id);
                    const asistLocal = asistencia.map(jid => ({ jid, insc: jugadoresInfo.insc?.[`${jid}_${r.local?.id}`], jug: jugadoresInfo.jug?.[jid] })).filter(x => x.insc);
                    const asistVisit = asistencia.map(jid => ({ jid, insc: jugadoresInfo.insc?.[`${jid}_${r.visitante?.id}`], jug: jugadoresInfo.jug?.[jid] })).filter(x => x.insc);
                    return (
                      <div key={r.id} style={s.resultadoCard}>
                        <div style={s.resultadoTop} onClick={() => setResultadoExpandido(expandido ? null : r.id)}>
                          <div style={s.resultadoMeta}>
                            <span style={s.resultadoJornada}>J{r.jornada}</span>
                            <span style={s.resultadoFecha}>{r.fecha || "Sin fecha"}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setResultadoVistaFicha(r); }}
                              style={{ marginLeft: "auto", background:"#f0fdf4", border:"1px solid #c3e6a3", color:"#15803d", borderRadius:8, padding:"4px 10px", fontSize:11, fontWeight:700, cursor:"pointer" }}
                              title="Ver ficha completa">
                              📝 Ver ficha
                            </button>
                          </div>
                          <div style={s.resultadoMid}>
                            <div style={{ ...s.resEq, justifyContent:"flex-end" }}>
                              <span style={s.resEqNombre}>{r.local?.nombre || "—"}</span>
                              <span style={{ ...s.resEqColor, background: r.local?.color_playera || "#9ca3af" }} />
                            </div>
                            <div style={s.resMarcador}>
                              {r.ficha?.goles_local} - {r.ficha?.goles_visitante}
                            </div>
                            <div style={s.resEq}>
                              <span style={{ ...s.resEqColor, background: r.visitante?.color_playera || "#9ca3af" }} />
                              <span style={s.resEqNombre}>{r.visitante?.nombre || "—"}</span>
                            </div>
                          </div>
                          <div style={s.resExpandIcon}>{expandido ? "▲" : "▼"}</div>
                        </div>
                        {expandido && (
                          <div style={s.resultadoDetalle}>
                            {/* Goleadores */}
                            <div style={s.resDetSec}>
                              <div style={s.resDetTitle}>⚽ Goleadores</div>
                              {goleadores.length === 0 ? (
                                <div style={s.resDetEmpty}>Sin goles registrados</div>
                              ) : (
                                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                                  <div>
                                    <div style={s.resDetSubT}>{r.local?.nombre}</div>
                                    {golesLocal.length === 0 ? <div style={s.resDetMini}>—</div> : golesLocal.map((g, i) => (
                                      <div key={i} style={s.resDetMini}>
                                        <strong>#{g.dorsal || "?"}</strong> {g.nombre} <span style={{ color: GREEN, fontWeight: 800 }}>({g.goles})</span>
                                      </div>
                                    ))}
                                  </div>
                                  <div>
                                    <div style={s.resDetSubT}>{r.visitante?.nombre}</div>
                                    {golesVisit.length === 0 ? <div style={s.resDetMini}>—</div> : golesVisit.map((g, i) => (
                                      <div key={i} style={s.resDetMini}>
                                        <strong>#{g.dorsal || "?"}</strong> {g.nombre} <span style={{ color: GREEN, fontWeight: 800 }}>({g.goles})</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            {/* Asistencia */}
                            <div style={s.resDetSec}>
                              <div style={s.resDetTitle}>👥 Asistencia ({asistencia.length})</div>
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                                <div>
                                  <div style={s.resDetSubT}>{r.local?.nombre} ({asistLocal.length})</div>
                                  {asistLocal.length === 0 ? <div style={s.resDetMini}>—</div> : asistLocal.map(({jid, insc, jug}) => (
                                    <div key={jid} style={s.resDetMini}>
                                      <strong>#{insc?.dorsal || "?"}</strong> {jug?.nombre_completo || "—"}
                                    </div>
                                  ))}
                                </div>
                                <div>
                                  <div style={s.resDetSubT}>{r.visitante?.nombre} ({asistVisit.length})</div>
                                  {asistVisit.length === 0 ? <div style={s.resDetMini}>—</div> : asistVisit.map(({jid, insc, jug}) => (
                                    <div key={jid} style={s.resDetMini}>
                                      <strong>#{insc?.dorsal || "?"}</strong> {jug?.nombre_completo || "—"}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            {/* Faltas y observaciones */}
                            {(r.ficha?.faltas_local || r.ficha?.faltas_visitante || r.ficha?.observaciones) && (
                              <div style={s.resDetSec}>
                                <div style={s.resDetTitle}>📝 Otros</div>
                                <div style={s.resDetMini}>
                                  Faltas: {r.local?.nombre} ({r.ficha.faltas_local || 0}) · {r.visitante?.nombre} ({r.ficha.faltas_visitante || 0})
                                </div>
                                {r.ficha.observaciones && (
                                  <div style={{ ...s.resDetMini, marginTop: 6, fontStyle:"italic" }}>
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
                </>
              )}
            </div>
            );
          })()}

          {/* MODAL: VER FICHA COMPLETA (solo lectura, desde sección Resultados) */}
          {resultadoVistaFicha && (
            <FichaDetalleModal
              partido={{
                id: resultadoVistaFicha.id,
                equipos_local: resultadoVistaFicha.local,
                equipos_visitante: resultadoVistaFicha.visitante,
                hora: resultadoVistaFicha.hora,
                cancha_numero: resultadoVistaFicha.cancha_numero,
                jornadas: resultadoVistaFicha.jornadas,
                ficha: resultadoVistaFicha.ficha,
              }}
              token={token}
              liga={ligaSeleccionada}
              onClose={() => setResultadoVistaFicha(null)}
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
                  placeholder="00001"
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
                type="number"
                min="1" max="99"
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
                placeholder={"00001\n00002\n00003"}
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

      {/* ── MODAL ELIMINAR EQUIPO ── */}
      {eliminarEquipoTarget && (
        <div style={s.overlay} onClick={() => !loading && setEliminarEquipoTarget(null)}>
          <div style={{ ...s.modalBox, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>⚠️</div>
              <h3 style={{ ...s.modalTitle, marginBottom: 10 }}>¿Eliminar este equipo?</h3>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6 }}>
                {eliminarEquipoTarget.nombre}
              </div>
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#991b1b", lineHeight: 1.45, marginBottom: 18 }}>
              <strong>Aviso:</strong> Se perderán todos sus jugadores inscritos en este torneo. Esta acción no se puede deshacer.
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setEliminarEquipoTarget(null)} disabled={loading}>Cancelar</button>
              <button style={{ ...s.btnSave, background: "#dc2626" }} onClick={confirmarEliminarEquipo} disabled={loading}>
                {loading ? "Eliminando..." : "Sí, eliminar"}
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
  // ── HERO DE UNIDAD (gradiente verde) ──
  unitHero: { position:"relative", overflow:"hidden", background:"linear-gradient(135deg, #4f8f2f 0%, #3a6b22 70%, #2e5419 100%)", borderRadius:18, padding:"16px 18px", marginBottom:18, boxShadow:"0 6px 20px rgba(79,143,47,0.28)", color:"#fff" },
  unitHeroGlow: { position:"absolute", top:-40, right:-40, width:160, height:160, borderRadius:"50%", background:"radial-gradient(circle, rgba(127,191,77,0.5) 0%, rgba(127,191,77,0) 70%)", pointerEvents:"none" },
  unitHeroRow: { position:"relative", zIndex:1, display:"flex", alignItems:"center", gap:14, marginBottom:12 },
  unitHeroLogoWrap: { width:56, height:56, borderRadius:14, background:"rgba(255,255,255,0.18)", border:"1.5px solid rgba(255,255,255,0.35)", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0, boxShadow:"0 4px 12px rgba(0,0,0,0.18)" },
  unitHeroLogoImg: { width:"100%", height:"100%", objectFit:"cover" },
  unitHeroLabel: { fontSize:10.5, fontWeight:700, letterSpacing:1.2, color:"rgba(255,255,255,0.78)", textTransform:"uppercase", marginBottom:3 },
  unitHeroName: { fontSize:20, fontWeight:800, color:"#fff", letterSpacing:-0.5, margin:0, lineHeight:1.15, textShadow:"0 1px 2px rgba(0,0,0,0.18)", overflow:"hidden", textOverflow:"ellipsis" },
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
  // ── HEADER LEGACY ──
  header: { marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" },
  title: { fontSize: 26, fontWeight: 800, color: "#111827", letterSpacing: -0.8, marginBottom: 4 },
  sub: { color: "#6b7280", fontSize: 14 },
  // ── HEADER SECCIÓN ÁRBITROS (amber, color de rol árbitro) ──
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
  // ── Resultados ──
  resultadoCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  resultadoTop: { display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 14, padding: "12px 16px", cursor: "pointer" },
  resultadoMeta: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, minWidth: 60 },
  resultadoJornada: { fontSize: 12, fontWeight: 800, color: GREEN, padding: "2px 8px", background: "#f0fdf4", borderRadius: 6, border: "1px solid #c3e6a3" },
  resultadoFecha: { fontSize: 11, color: "#9ca3af" },
  resultadoMid: { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10 },
  resEq: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 },
  resEqNombre: { fontSize: 13, fontWeight: 700, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  resEqColor: { width: 12, height: 12, borderRadius: "50%", flexShrink: 0 },
  resMarcador: { fontSize: 18, fontWeight: 900, color: "#111827", padding: "4px 10px", background: "#f9fafb", borderRadius: 8 },
  resExpandIcon: { color: "#9ca3af", fontSize: 11 },
  resultadoDetalle: { borderTop: `1px solid ${BORDER}`, padding: "16px", background: "linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)" },
  resDetSec: { marginBottom: 16, background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  resDetTitle: { fontSize: 13, fontWeight: 800, color: GREEN, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6, paddingBottom: 8, borderBottom: `1px solid #f0fdf4` },
  resDetSubT: { fontSize: 11, fontWeight: 800, color: "#fff", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5, padding: "4px 10px", borderRadius: 6, display: "inline-block" },
  resDetMini: { fontSize: 13, color: "#374151", padding: "5px 8px", borderRadius: 6, marginBottom: 3, display: "flex", alignItems: "center", gap: 8 },
  resDetMiniGol: { background: "#f0fdf4", border: "1px solid #c3e6a3" },
  resDetDorsal: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, color: "#fff", fontWeight: 800, fontSize: 11, flexShrink: 0 },
  resDetGoles: { background: GREEN, color: "#fff", padding: "2px 8px", borderRadius: 10, fontWeight: 800, fontSize: 11, marginLeft: "auto" },
  resDetEmpty: { fontSize: 12, color: "#9ca3af", fontStyle: "italic", textAlign: "center", padding: "8px 0" },
};

const css = `
  .la-card { transition: transform 0.18s, box-shadow 0.18s; }
  .la-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
  input:focus, select:focus { border-color: #4f8f2f !important; }
`;