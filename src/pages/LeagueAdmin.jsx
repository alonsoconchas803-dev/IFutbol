import ScheduleGenerator from "./ScheduleGenerator";
import FichaGenerator from "./FichaGenerator";
import { useState, useEffect } from "react";
import JerseySVG, { JerseyDesignPicker } from "../components/JerseySVG";
import PersonalizacionUnidadFields from "../components/PersonalizacionUnidadFields";

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

const uploadFile = async (bucket, path, file, token) => {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": file.type,
      "x-upsert": "true",
    },
    body: file,
  });
  if (!res.ok) throw new Error("Error al subir imagen");
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
};

const COLORES = ["#e53e3e","#dd6b20","#d69e2e","#38a169","#3182ce","#805ad5","#d53f8c","#2d3748"];
const POSICIONES = ["Portero","Defensa","Mediocampista","Delantero"];

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

  // Personalización de la unidad
  const [miUnidad, setMiUnidad] = useState(null);
  const [personalizarForm, setPersonalizarForm] = useState({ logo_url: "", estilo_tarjeta: "logo_arriba", color_marca: "#4f8f2f", lema: "", portada_url: "", tamano_logo: "mediano", forma_logo: "cuadrado", intensidad_fondo: "medio" });
  const [personalizarLogoFile, setPersonalizarLogoFile] = useState(null);
  const [personalizarLogoPreview, setPersonalizarLogoPreview] = useState(null);
  const [personalizarPortadaFile, setPersonalizarPortadaFile] = useState(null);
  const [personalizarPortadaPreview, setPersonalizarPortadaPreview] = useState(null);

  // Color del torneo activo
  const [colorLigaForm, setColorLigaForm] = useState("#4f8f2f");

  // Resultados (fichas cerradas)
  const [resultados, setResultados] = useState([]);
  const [resultadosLoading, setResultadosLoading] = useState(false);
  const [jugadoresInfo, setJugadoresInfo] = useState({});
  const [resultadoExpandido, setResultadoExpandido] = useState(null);
  const [jornadaSelectedRes, setJornadaSelectedRes] = useState(null);

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
        `/partidos?jornada_id=in.(${jornadaIds.join(",")})&select=id,jornada_id,equipo_local_id,equipo_visitante_id,jornadas(numero,fecha),ficha_partido(*)`,
        token
      );

      const cerradas = (partidos || []).filter(p => {
        const f = Array.isArray(p.ficha_partido) ? p.ficha_partido[0] : p.ficha_partido;
        return f?.cerrada;
      });

      const equipoIds = new Set();
      cerradas.forEach(p => { equipoIds.add(p.equipo_local_id); equipoIds.add(p.equipo_visitante_id); });
      const equipos = equipoIds.size > 0
        ? await db(`/equipos?id=in.(${[...equipoIds].join(",")})&select=id,nombre,color_playera,escudo_url`, token)
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
      const [arbsCanchaData, arbsLigaData, solicData] = await Promise.all([
        db(`/arbitro_cancha?cancha_id=eq.${canchaId}&select=user_id,acceso_total`, token),
        db(`/arbitro_liga?liga_id=eq.${ligaSeleccionada.id}&select=user_id`, token),
        db(`/solicitudes_registro?tipo_rol=eq.referee&estado=eq.aprobado&select=user_id,nombre_completo`, token),
      ]);
      const arbsLigaSet = new Set((arbsLigaData || []).map(a => a.user_id));
      const solicMap = Object.fromEntries((solicData || []).map(s => [s.user_id, s.nombre_completo]));
      setArbitros((arbsCanchaData || []).map(arb => ({
        user_id: arb.user_id,
        nombre: solicMap[arb.user_id] || "Árbitro",
        acceso_total: arb.acceso_total,
        tiene_acceso_liga: arb.acceso_total || arbsLigaSet.has(arb.user_id),
      })));
    } catch (e) { showToast(e.message, "err"); }
  };

  const toggleAccesoArbitro = async (arbitro) => {
    try {
      if (arbitro.acceso_total) {
        return showToast("Este árbitro tiene acceso total. Modifícalo desde Solicitudes.", "err");
      }
      if (arbitro.tiene_acceso_liga) {
        await db(`/arbitro_liga?user_id=eq.${arbitro.user_id}&liga_id=eq.${ligaSeleccionada.id}`, token, { method: "DELETE" });
        showToast("Acceso revocado");
      } else {
        await db("/arbitro_liga", token, {
          method: "POST",
          body: JSON.stringify({ user_id: arbitro.user_id, liga_id: ligaSeleccionada.id })
        });
        showToast("Acceso otorgado ✓");
      }
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
      setModal(null);
    } catch (e) { showToast(e.message, "err"); }
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

  const abrirPersonalizar = () => {
    if (!miUnidad) return;
    setPersonalizarForm({
      logo_url: miUnidad.logo_url || "",
      estilo_tarjeta: miUnidad.estilo_tarjeta || "logo_arriba",
      color_marca: miUnidad.color_marca || "#4f8f2f",
      lema: miUnidad.lema || "",
      portada_url: miUnidad.portada_url || "",
      tamano_logo: miUnidad.tamano_logo || "mediano",
      forma_logo: miUnidad.forma_logo || "cuadrado",
      intensidad_fondo: miUnidad.intensidad_fondo || "medio"
    });
    setPersonalizarLogoFile(null);
    setPersonalizarLogoPreview(miUnidad.logo_url || null);
    setPersonalizarPortadaFile(null);
    setPersonalizarPortadaPreview(miUnidad.portada_url || null);
    setModal("personalizar");
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

      if (editEquipoId) {
        await db(`/equipos?id=eq.${editEquipoId}`, token, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Equipo actualizado ✓");
      } else {
        await db("/equipos", token, { method: "POST", body: JSON.stringify(payload) });
        showToast("Equipo registrado ✓");
      }
      setEquipoForm({ nombre: "", color_playera: "#3182ce", color_camiseta_2: "#ffffff", diseno_camiseta: "solido", escudo_url: "" });
      setEscudoFile(null); setEscudoPreview(null); setEditEquipoId(null);
      setModal(null);
      cargarEquipos(ligaSeleccionada.id);
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const eliminarEquipo = async (id) => {
    if (!confirm("¿Eliminar este equipo? Se perderán sus jugadores inscritos.")) return;
    try {
      await db(`/equipos?id=eq.${id}`, token, { method: "DELETE" });
      showToast("Equipo eliminado");
      if (equipoDetalle?.id === id) setEquipoDetalle(null);
      cargarEquipos(ligaSeleccionada.id);
    } catch (e) { showToast(e.message, "err"); }
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
    setEscudoFile(file);
    setEscudoPreview(URL.createObjectURL(file));
  };

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {toast && <div style={{ ...s.toast, background: toast.tipo === "err" ? "#ef4444" : "#4ade80", color: toast.tipo === "err" ? "#fff" : "#0d0d1a" }}>{toast.msg}</div>}

      {/* ENCABEZADO */}
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {miUnidad?.logo_url && (
            <div style={{ width: 52, height: 52, borderRadius: 12, overflow: "hidden", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
              <img src={miUnidad.logo_url} alt={miUnidad.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}
          <div>
            <h2 style={s.title}>{miUnidad?.nombre ? `${miUnidad.nombre} 🏟️` : "Panel Admin de Unidad 🏟️"}</h2>
            <p style={s.sub}>Gestiona equipos, jugadores y árbitros de tu unidad deportiva</p>
          </div>
        </div>
        {miUnidad && (
          <button
            onClick={abrirPersonalizar}
            style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 10, padding: "8px 14px", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            🎨 Personalizar mi unidad
          </button>
        )}
      </div>

      {/* SELECTOR DE LIGA */}
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
          {ligas.length === 0 && <span style={{ color: "#666", fontSize: 13 }}>No hay ligas activas. Pídele al Super Admin que cree una.</span>}
        </div>
        {ligaSeleccionada && (
          <button
            onClick={() => { setColorLigaForm(ligaSeleccionada.color_marca || "#4f8f2f"); setModal("color_liga"); }}
            style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 10, padding: "8px 14px", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            title="Cambiar color del torneo">
            🎨 Color del torneo
          </button>
        )}
      </div>

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
                  {equipos.map(eq => (
                    <div key={eq.id} style={{ ...s.equipoCard, borderTop: `4px solid ${eq.color_playera || "#3182ce"}` }} className="la-card">
                      <div style={s.equipoCardTop}>
                        <JerseySVG
                          diseno={eq.diseno_camiseta || "solido"}
                          color1={eq.color_playera || "#3182ce"}
                          color2={eq.color_camiseta_2 || "#ffffff"}
                          escudoUrl={eq.escudo_url || null}
                          size={52}
                        />
                        <div style={s.equipoActions}>
                          <button style={s.btnEdit} onClick={() => editarEquipo(eq)}>✏️</button>
                          <button style={s.btnDel} onClick={() => eliminarEquipo(eq.id)}>🗑️</button>
                        </div>
                      </div>
                      <div style={s.equipoNombre}>{eq.nombre}</div>
                      <div style={s.equipoMeta}>
                        {jugadores.filter(j => j.equipo_id === eq.id).length} jugadores inscritos
                      </div>
                      <button style={{ ...s.btnVer, borderColor: eq.color_playera || "#3182ce", color: eq.color_playera || "#3182ce" }}
                        onClick={() => verEquipo(eq)}>
                        Ver equipo →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── DETALLE EQUIPO ── */}
          {seccion === "detalle" && equipoDetalle && (() => {
            const capitanActual = jugadoresEquipo.find(j => j.es_capitan);
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

              {/* BLOQUE CAPITÁN */}
              <div style={s.capitanBox}>
                {capitanActual ? (
                  <>
                    <div style={s.capitanInfo}>
                      <div style={s.capitanCrown}>👑</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.capitanLabel}>Capitán del equipo</div>
                        <div style={s.capitanNombre}>{capitanActual.jugadores?.nombre_completo}</div>
                        <div style={s.capitanMeta}>#{capitanActual.jugadores?.numero_afiliado}</div>
                      </div>
                    </div>
                    <button style={s.btnQuitarCap} onClick={() => quitarCapitan(capitanActual.id, capitanActual.jugadores?.nombre_completo)}>
                      Quitar capitanía
                    </button>
                  </>
                ) : (
                  <>
                    <div style={s.capitanInfo}>
                      <div style={s.capitanCrown}>👑</div>
                      <div>
                        <div style={s.capitanLabel}>Sin capitán asignado</div>
                        <div style={s.capitanMeta}>Asigna a un jugador para que gestione el equipo</div>
                      </div>
                    </div>
                    <button style={s.btnAsignarCap} onClick={() => { setCapitanForm({ numero_afiliado: "", dorsal: "" }); setCapitanCandidato(null); setModalCapitan("input"); }}>
                      + Asignar capitán
                    </button>
                  </>
                )}
              </div>

              <div style={s.secHeader}>
                <span style={s.secCount}>{jugadoresEquipo.length} / 17 jugadores</span>
                <button style={s.btnAdd}
                  onClick={() => { setAnadirAfiliados(""); setAnadirCandidatos([]); setModalJugadores("anadir_input"); }}
                  disabled={jugadoresEquipo.length >= 17}>
                  + Añadir jugadores
                </button>
              </div>

              {jugadoresEquipo.length === 0 ? (
                <div style={s.empty}>
                  <div style={s.emptyIcon}>🏃</div>
                  <div style={s.emptyTxt}>No hay jugadores inscritos en este equipo aún</div>
                  <p style={{ color: "#555", fontSize: 13 }}>Añádelos con su número de afiliado</p>
                </div>
              ) : (
                <div style={s.jugadorList}>
                  {jugadoresEquipo.map(je => (
                    <div key={je.id} style={{ ...s.jugadorRow, ...(je.es_capitan ? s.jugadorRowCap : {}) }}>
                      <div style={s.jugadorAvatar}>
                        {je.jugadores?.foto_url
                          ? <img src={je.jugadores.foto_url} alt="foto" style={s.jugadorFoto} />
                          : <div style={s.jugadorFotoPlaceholder}>🏃</div>}
                      </div>
                      <div style={s.jugadorInfo}>
                        <div style={s.jugadorNombre}>
                          {je.es_capitan && <span style={{ marginRight: 6 }}>👑</span>}
                          {je.jugadores?.nombre_completo}
                        </div>
                        <div style={s.jugadorMeta}>{je.jugadores?.posicion_preferida} · #{je.jugadores?.numero_afiliado}</div>
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
  />
)}

          {/* ── SECCIÓN ÁRBITROS ── */}
          {seccion === "arbitros" && (
            <div>
              <div style={s.secHeader}>
                <span style={s.secCount}>{arbitros.length} árbitros en la unidad deportiva</span>
                <button style={{ ...s.btnAdd, background:"#f9fafb", color:"#374151", border:"1px solid #e5e7eb" }}
                  onClick={cargarArbitros} title="Recargar">
                  ↻ Actualizar
                </button>
              </div>

              {arbitros.length === 0 ? (
                <div style={s.empty}>
                  <div style={s.emptyIcon}>🟡</div>
                  <div style={s.emptyTxt}>No hay árbitros asignados a esta unidad deportiva</div>
                  <div style={{ fontSize:13, color:"#6b7280" }}>Los árbitros se asignan desde Solicitudes en el panel Super Admin</div>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {arbitros.map(arb => (
                    <div key={arb.user_id} style={{ ...s.jugadorRow, justifyContent:"space-between" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                        <div style={{ width:42, height:42, borderRadius:"50%", background:"#fef3c7", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                          🟡
                        </div>
                        <div>
                          <div style={s.jugadorNombre}>{arb.nombre}</div>
                          <div style={{ fontSize:12, color:"#6b7280" }}>
                            {arb.acceso_total
                              ? "Acceso total a todos los torneos de esta unidad"
                              : arb.tiene_acceso_liga
                                ? `Con acceso a ${ligaSeleccionada.nombre}`
                                : `Sin acceso a ${ligaSeleccionada.nombre}`}
                          </div>
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        {arb.acceso_total ? (
                          <span style={{ fontSize:11, padding:"4px 10px", borderRadius:6, background:"#f0fdf4", color:"#4f8f2f", border:"1px solid #c3e6a3", fontWeight:700 }}>
                            Acceso total
                          </span>
                        ) : (
                          <button
                            onClick={() => toggleAccesoArbitro(arb)}
                            style={{
                              fontSize:12, padding:"6px 14px", borderRadius:8, cursor:"pointer", fontWeight:700, border:"none",
                              background: arb.tiene_acceso_liga ? "#fee2e2" : "#f0fdf4",
                              color: arb.tiene_acceso_liga ? "#dc2626" : "#4f8f2f",
                            }}>
                            {arb.tiene_acceso_liga ? "✕ Revocar acceso" : "✓ Dar acceso"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop:20, padding:"12px 16px", borderRadius:10, background:"#fffbeb", border:"1px solid #fde68a", fontSize:12, color:"#92400e" }}>
                ⚠️ Para cambiar las unidades deportivas de un árbitro o su tipo de acceso, usa <strong>Solicitudes</strong> en el panel Super Admin.
              </div>
            </div>
          )}

          {/* ── SECCIÓN FICHAS ── */}
          {seccion === "fichas" && (
            <FichaGenerator session={session} liga={ligaSeleccionada} />
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

        </>
      )}

      {/* ── MODAL PERSONALIZAR UNIDAD ── */}
      {modal === "personalizar" && miUnidad && (
        <div style={s.overlay} onClick={() => setModal(null)}>
          <div style={{ ...s.modalBox, maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>🎨 Personalizar {miUnidad.nombre}</h3>

            <PersonalizacionUnidadFields
              form={personalizarForm} setForm={setPersonalizarForm}
              logoPreview={personalizarLogoPreview} setLogoFile={setPersonalizarLogoFile} setLogoPreview={setPersonalizarLogoPreview}
              portadaPreview={personalizarPortadaPreview} setPortadaFile={setPersonalizarPortadaFile} setPortadaPreview={setPersonalizarPortadaPreview}
            />

            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button style={s.btnSave} onClick={guardarPersonalizacion} disabled={loading}>
                {loading ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {["#4f8f2f","#3182ce","#e53e3e","#dd6b20","#d69e2e","#805ad5","#d53f8c","#0ea5e9","#14b8a6","#1f2937"].map(c => (
                  <div key={c} onClick={() => setColorLigaForm(c)}
                    style={{ width: 32, height: 32, borderRadius: "50%", background: c, cursor: "pointer",
                      boxShadow: colorLigaForm === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : "none" }} />
                ))}
                <input type="color" value={colorLigaForm}
                  onChange={e => setColorLigaForm(e.target.value)}
                  style={{ width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0 }}
                  title="Color personalizado" />
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
              <div style={{ flex: 1 }}>
                <label style={s.uploadLabel}>
                  📁 Subir logo del equipo
                  <input type="file" accept="image/*" onChange={handleEscudoChange} style={{ display: "none" }} />
                </label>
                <p style={{ color: "#888", fontSize: 11, marginTop: 6 }}>Aparece en la camiseta. PNG o JPG.</p>
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
                <div style={s.colorGrid}>
                  {COLORES.map(c => (
                    <div key={c} onClick={() => setEquipoForm({ ...equipoForm, color_playera: c })}
                      style={{ ...s.colorDot, background: c, boxShadow: equipoForm.color_playera === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : "none" }} />
                  ))}
                  <input type="color" value={equipoForm.color_playera}
                    onChange={e => setEquipoForm({ ...equipoForm, color_playera: e.target.value })}
                    style={s.colorCustom} title="Color personalizado" />
                </div>
              </div>
              <div style={{ ...s.field, flex: 1 }}>
                <label style={s.label}>Color secundario</label>
                <div style={s.colorGrid}>
                  {["#ffffff","#000000","#f5f5f5","#fbbf24","#ef4444","#3b82f6","#10b981","#8b5cf6"].map(c => (
                    <div key={c} onClick={() => setEquipoForm({ ...equipoForm, color_camiseta_2: c })}
                      style={{ ...s.colorDot, background: c, boxShadow: equipoForm.color_camiseta_2 === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : "none", border: c === "#ffffff" ? "1px solid #e5e7eb" : "none" }} />
                  ))}
                  <input type="color" value={equipoForm.color_camiseta_2}
                    onChange={e => setEquipoForm({ ...equipoForm, color_camiseta_2: e.target.value })}
                    style={s.colorCustom} title="Color secundario personalizado" />
                </div>
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
  header: { marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" },
  title: { fontSize: 26, fontWeight: 800, color: "#111827", letterSpacing: -0.8, marginBottom: 4 },
  sub: { color: "#6b7280", fontSize: 14 },
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
  equipoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 },
  equipoCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, boxShadow: "0 2px 8px rgba(79,143,47,0.08)", borderTop: `3px solid ${GREEN}` },
  equipoCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  escudoWrap: { width: 52, height: 52, borderRadius: 12, overflow: "hidden", flexShrink: 0 },
  escudoImg: { width: "100%", height: "100%", objectFit: "cover" },
  escudoPlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff", borderRadius: 12 },
  equipoActions: { display: "flex", gap: 6 },
  equipoNombre: { fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 6 },
  equipoMeta: { fontSize: 12, color: "#6b7280", marginBottom: 14 },
  btnVer: { background: "transparent", border: "1px solid", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 },
  detalleHeader: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", gap: 20, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  escudoWrapLg: { width: 72, height: 72, borderRadius: 14, overflow: "hidden", flexShrink: 0 },
  escudoImgLg: { width: "100%", height: "100%", objectFit: "cover" },
  escudoPlaceholderLg: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, color: "#fff" },
  detalleNombre: { fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 4 },
  detalleMeta: { color: "#6b7280", fontSize: 14 },
  jugadorList: { display: "flex", flexDirection: "column", gap: 10 },
  jugadorRow: { background: "linear-gradient(90deg, #f0fdf4 0%, #ffffff 60%)", border: `1px solid #c3e6a3`, borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 1px 4px rgba(79,143,47,0.08)", borderLeft: `4px solid ${GREEN}` },
  jugadorAvatar: { flexShrink: 0 },
  jugadorFoto: { width: 44, height: 44, borderRadius: "50%", objectFit: "cover" },
  jugadorFotoPlaceholder: { width: 44, height: 44, borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 },
  jugadorInfo: { flex: 1 },
  jugadorNombre: { fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 3 },
  jugadorMeta: { fontSize: 12, color: "#6b7280" },
  jugadorDorsal: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  dorsalBadge: { width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#fff" },
  dorsalLabel: { fontSize: 10, color: "#9ca3af" },
  jugadorCamiseta: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 80 },
  camisetaNombre: { fontSize: 13, fontWeight: 700, color: "#111827", textTransform: "uppercase" },
  camisetaLabel: { fontSize: 10, color: "#9ca3af" },
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
  btnEdit: { background: "#f3f4f6", color: "#6b7280", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "5px 9px", fontSize: 13, cursor: "pointer" },
  btnDel: { background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 7, padding: "5px 9px", fontSize: 13, cursor: "pointer" },
  toast: { position: "fixed", bottom: 28, right: 28, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999 },
  capitanBox: { background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)", border: "1px solid #fde68a", borderRadius: 14, padding: "14px 18px", marginBottom: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" },
  capitanInfo: { display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  capitanCrown: { fontSize: 26, width: 44, height: 44, borderRadius: 10, background: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  capitanLabel: { fontSize: 11, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 2 },
  capitanNombre: { fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 2 },
  capitanMeta: { fontSize: 12, color: "#6b7280" },
  btnAsignarCap: { background: "#f59e0b", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" },
  btnQuitarCap: { background: "#fff", color: "#92400e", border: "1px solid #fde68a", borderRadius: 10, padding: "9px 16px", fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" },
  jugadorRowCap: { background: "linear-gradient(90deg, #fffbeb 0%, #ffffff 60%)", border: "1px solid #fde68a", borderLeft: "4px solid #f59e0b" },
  btnEliminarJug: { background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 8, padding: "6px 10px", fontSize: 14, cursor: "pointer", flexShrink: 0 },
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