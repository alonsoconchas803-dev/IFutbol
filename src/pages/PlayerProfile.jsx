import { useState, useEffect, useMemo } from "react";
import JerseySVG, { JerseyDesignPicker } from "../components/JerseySVG";
import { toTitleCase } from "../App";

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

const COLORES_CAMISETA = ["#e53e3e","#dd6b20","#d69e2e","#38a169","#3182ce","#805ad5","#d53f8c","#2d3748"];
const COLORES_SECUNDARIOS = ["#ffffff","#000000","#f5f5f5","#fbbf24","#ef4444","#3b82f6","#10b981","#8b5cf6"];

// Normaliza "1", "00001", "af-1", "AF-00001" → "AF-00001"
const normalizarAfiliado = (input) => {
  const limpio = String(input || "").trim().toUpperCase().replace(/^AF-?/, "");
  if (!limpio) return "";
  if (/^\d+$/.test(limpio)) return `AF-${limpio.padStart(5, "0")}`;
  return `AF-${limpio}`;
};

// Devuelve { dorsal, cambiado } usando el preferido si está libre, o el primer libre.
const calcularDorsal = (preferido, ocupados) => {
  const set = ocupados instanceof Set ? ocupados : new Set(ocupados || []);
  if (preferido && !set.has(preferido)) return { dorsal: preferido, cambiado: false };
  for (let i = 1; i <= 99; i++) {
    if (!set.has(i)) return { dorsal: i, cambiado: !!preferido };
  }
  return { dorsal: null, cambiado: false };
};

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
    throw new Error(err.message || "Error");
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
  if (!res.ok) throw new Error("Error al subir foto");
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
};

const POSICIONES = ["Portero", "Defensa", "Mediocampista", "Delantero"];

export default function PlayerProfile({ session, seccionInicial = "perfil" }) {
  const [jugador, setJugador] = useState(null);
  const [inscripciones, setInscripciones] = useState([]);
  const [seccion, setSeccion] = useState(seccionInicial);
  const [editando, setEditando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState(null);
  const [editandoInsc, setEditandoInsc] = useState(null);
  const [inscEditForm, setInscEditForm] = useState({ dorsal: "", nombre_camiseta: "" });
  const [confirmDesinsc, setConfirmDesinsc] = useState(null);

  // ── ESTADOS DE ESTADÍSTICAS ──────────────────────────────────
  const [statsLoading, setStatsLoading] = useState(false);
  const [partidosJugados, setPartidosJugados] = useState([]);
  const [filtroStats, setFiltroStats] = useState("activos"); // "activos" | <liga_id> | "historico"

  // ── ESTADOS DEL PANEL DE CAPITÁN ─────────────────────────────
  const [equipoCapActivoId, setEquipoCapActivoId] = useState(null);
  const [equipoCapData, setEquipoCapData] = useState(null);
  const [jugadoresEquipoCap, setJugadoresEquipoCap] = useState([]);
  const [modalCap, setModalCap] = useState(null); // "tarjeta" | "anadir_input" | "anadir_confirm" | "eliminar" | "dorsal"
  const [tarjetaForm, setTarjetaForm] = useState({ color_playera: "#3182ce", color_camiseta_2: "#ffffff", diseno_camiseta: "solido", escudo_url: "" });
  const [tarjetaEscudoFile, setTarjetaEscudoFile] = useState(null);
  const [tarjetaEscudoPreview, setTarjetaEscudoPreview] = useState(null);
  const [anadirAfiliados, setAnadirAfiliados] = useState("");
  const [anadirCandidatos, setAnadirCandidatos] = useState([]);
  const [eliminarTarget, setEliminarTarget] = useState(null);
  const [dorsalTarget, setDorsalTarget] = useState(null);
  const [dorsalNuevo, setDorsalNuevo] = useState("");

  // Formulario perfil
  const [form, setForm] = useState({
    nombre_completo: "", fecha_nacimiento: "",
    domicilio: "", posicion_preferida: "Delantero",
    numero_preferido: "", nombre_camiseta_preferido: ""
  });
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);

  const token = session?.access_token;
  const userId = session?.user?.id;

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  // ── CARGAR PERFIL ─────────────────────────────────────────────
  const cargarPerfil = async () => {
    setLoading(true);
    try {
      const data = await db(`/jugadores?user_id=eq.${userId}`, token);
      if (data && data.length > 0) {
        const j = data[0];
        setJugador(j);
        setForm({
          nombre_completo: j.nombre_completo || "",
          fecha_nacimiento: j.fecha_nacimiento || "",
          domicilio: j.domicilio || "",
          posicion_preferida: j.posicion_preferida || "Delantero",
          numero_preferido: j.numero_preferido ?? "",
          nombre_camiseta_preferido: j.nombre_camiseta_preferido || "",
        });
        setFotoPreview(j.foto_url || null);
        await cargarInscripciones(j.id);
      }
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  // ── CARGAR INSCRIPCIONES ──────────────────────────────────────
  const cargarInscripciones = async (jugadorId) => {
    try {
      const data = await db(
        `/jugador_equipo?jugador_id=eq.${jugadorId}&select=*,equipos(nombre,color_playera,escudo_url),ligas(nombre,dia,turno)&order=created_at.desc`,
        token
      );
      setInscripciones(data || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { cargarPerfil(); }, []);

  // ── GUARDAR PERFIL ────────────────────────────────────────────
  const guardarPerfil = async () => {
    setGuardando(true);
    try {
      let foto_url = jugador?.foto_url;
      if (fotoFile) {
        const ext = fotoFile.name.split(".").pop();
        const path = `fotos/${userId}.${ext}`;
        foto_url = await uploadFile("imagenes", path, fotoFile, token);
      }
      const payload = {
        ...form,
        numero_preferido: form.numero_preferido === "" ? null : +form.numero_preferido,
        nombre_camiseta_preferido: form.nombre_camiseta_preferido?.trim() ? form.nombre_camiseta_preferido.trim().toUpperCase() : null,
        foto_url
      };
      if (jugador) {
        await db(`/jugadores?id=eq.${jugador.id}`, token, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Perfil actualizado ✓");
      }
      setEditando(false);
      cargarPerfil();
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  // ── DESINSCRIBIRSE DE UN EQUIPO ───────────────────────────────
  const desinscribirse = async () => {
    if (!confirmDesinsc) return;
    setGuardando(true);
    try {
      await db(`/jugador_equipo?id=eq.${confirmDesinsc.id}`, token, { method: "DELETE" });
      showToast("Te has dado de baja del equipo");
      setConfirmDesinsc(null);
      cargarInscripciones(jugador.id);
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  // ── EDITAR INSCRIPCIÓN (dorsal + nombre camiseta) ─────────────
  const abrirEditarInsc = (ins) => {
    setEditandoInsc(ins);
    setInscEditForm({ dorsal: ins.dorsal || "", nombre_camiseta: ins.nombre_camiseta || "" });
  };

  const guardarInscripcion = async () => {
    if (!inscEditForm.dorsal) return showToast("El dorsal es obligatorio", "err");
    setGuardando(true);
    try {
      await db(`/jugador_equipo?id=eq.${editandoInsc.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          dorsal: +inscEditForm.dorsal,
          nombre_camiseta: inscEditForm.nombre_camiseta.toUpperCase() || editandoInsc.nombre_camiseta,
        }),
      });
      showToast("Camiseta actualizada ✓");
      setEditandoInsc(null);
      cargarInscripciones(jugador.id);
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  // ── PANEL DE CAPITÁN ──────────────────────────────────────────
  const equiposComoCapitan = useMemo(
    () => inscripciones.filter(i => i.es_capitan),
    [inscripciones]
  );

  // Selecciona el primer equipo como capitán al entrar a la sección
  useEffect(() => {
    if (seccion === "mi-equipo" && !equipoCapActivoId && equiposComoCapitan.length > 0) {
      setEquipoCapActivoId(equiposComoCapitan[0].equipo_id);
    }
  }, [seccion, equiposComoCapitan, equipoCapActivoId]);

  // Carga datos completos del equipo activo cuando cambia la selección
  useEffect(() => {
    if (!equipoCapActivoId) return;
    cargarEquipoCap(equipoCapActivoId);
  }, [equipoCapActivoId]);

  const cargarEquipoCap = async (equipoId) => {
    try {
      const insc = inscripciones.find(i => i.equipo_id === equipoId);
      if (!insc) return;
      const [eq] = await db(`/equipos?id=eq.${equipoId}&select=*`, token);
      setEquipoCapData(eq);
      const jugs = await db(
        `/jugador_equipo?equipo_id=eq.${equipoId}&liga_id=eq.${insc.liga_id}&select=*,jugadores(nombre_completo,foto_url,posicion_preferida,numero_afiliado)&order=dorsal`,
        token
      );
      setJugadoresEquipoCap(jugs || []);
    } catch (e) { showToast(e.message, "err"); }
  };

  const abrirEditarTarjeta = () => {
    if (!equipoCapData) return;
    setTarjetaForm({
      color_playera: equipoCapData.color_playera || "#3182ce",
      color_camiseta_2: equipoCapData.color_camiseta_2 || "#ffffff",
      diseno_camiseta: equipoCapData.diseno_camiseta || "solido",
      escudo_url: equipoCapData.escudo_url || "",
    });
    setTarjetaEscudoFile(null);
    setTarjetaEscudoPreview(equipoCapData.escudo_url || null);
    setModalCap("tarjeta");
  };

  const handleTarjetaEscudoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setTarjetaEscudoFile(file);
    setTarjetaEscudoPreview(URL.createObjectURL(file));
  };

  const guardarTarjetaEquipo = async () => {
    if (!equipoCapData) return;
    setGuardando(true);
    try {
      let escudo_url = tarjetaForm.escudo_url;
      if (tarjetaEscudoFile) {
        const ext = tarjetaEscudoFile.name.split(".").pop();
        const path = `escudos/${equipoCapData.id}-${Date.now()}.${ext}`;
        escudo_url = await uploadFile("imagenes", path, tarjetaEscudoFile, token);
      }
      const payload = { ...tarjetaForm, escudo_url };
      await db(`/equipos?id=eq.${equipoCapData.id}`, token, {
        method: "PATCH", body: JSON.stringify(payload)
      });
      showToast("Tarjeta del equipo actualizada ✓");
      setEquipoCapData({ ...equipoCapData, ...payload });
      setModalCap(null);
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  // ── AÑADIR JUGADORES POR NÚMERO DE AFILIADO ───────────────────
  const buscarCandidatosAnadir = async () => {
    const insc = inscripciones.find(i => i.equipo_id === equipoCapActivoId);
    if (!insc) return;
    const afs = anadirAfiliados
      .split(/[,\s\n]+/)
      .map(normalizarAfiliado)
      .filter(Boolean);
    if (afs.length === 0) return showToast("Ingresa al menos un número de afiliado", "err");
    if (jugadoresEquipoCap.length + afs.length > 17)
      return showToast(`Máximo 17 jugadores por equipo. Quedan ${17 - jugadoresEquipoCap.length} cupos.`, "err");

    setGuardando(true);
    try {
      const idsActuales = new Set(jugadoresEquipoCap.map(j => j.jugadores?.numero_afiliado));
      const enLiga = await db(
        `/jugador_equipo?liga_id=eq.${insc.liga_id}&select=jugador_id,equipo_id`,
        token
      );
      const idsEnLiga = new Set((enLiga || []).map(e => e.jugador_id));

      // Dorsales actualmente ocupados; vamos reservando los que asignemos en este lote
      const dorsalesOcupados = new Set(jugadoresEquipoCap.map(j => j.dorsal).filter(Boolean));

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
        dorsalesOcupados.add(dorsal); // reservar para los siguientes del lote
        const nombreCam = (jug.nombre_camiseta_preferido?.trim() || jug.nombre_completo.split(" ").slice(-1)[0] || jug.nombre_completo).toUpperCase();
        candidatos.push({
          ...jug,
          nombre_camiseta_sugerido: nombreCam,
          dorsal_asignado: dorsal,
          dorsal_cambiado: cambiado,
        });
      }

      if (errores.length > 0) showToast(errores.join(" · "), "err");
      if (candidatos.length === 0) { setGuardando(false); return; }

      setAnadirCandidatos(candidatos);
      setModalCap("anadir_confirm");
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  const confirmarAnadirJugadores = async () => {
    const insc = inscripciones.find(i => i.equipo_id === equipoCapActivoId);
    if (!insc || anadirCandidatos.length === 0) return;
    setGuardando(true);
    try {
      const payload = anadirCandidatos.map(c => ({
        jugador_id: c.id,
        equipo_id: equipoCapActivoId,
        liga_id: insc.liga_id,
        dorsal: c.dorsal_asignado,
        nombre_camiseta: c.nombre_camiseta_sugerido,
        es_capitan: false,
        activo: true,
      }));
      await db("/jugador_equipo", token, { method: "POST", body: JSON.stringify(payload) });
      const cambios = anadirCandidatos.filter(c => c.dorsal_cambiado).length;
      const baseMsg = `✓ ${anadirCandidatos.length} jugador${anadirCandidatos.length === 1 ? "" : "es"} añadido${anadirCandidatos.length === 1 ? "" : "s"}`;
      showToast(cambios > 0 ? `${baseMsg}. ${cambios} con dorsal alternativo (preferido ocupado).` : baseMsg);
      setModalCap(null);
      setAnadirAfiliados("");
      setAnadirCandidatos([]);
      await cargarEquipoCap(equipoCapActivoId);
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  // ── ELIMINAR JUGADOR (con limpieza de fichas no cerradas) ─────
  const eliminarJugadorCap = async () => {
    if (!eliminarTarget) return;
    const insc = inscripciones.find(i => i.equipo_id === equipoCapActivoId);
    if (!insc) return;
    setGuardando(true);
    try {
      const jugadorId = eliminarTarget.jugador_id;
      // 1. Buscar partidos abiertos de la liga donde aparece el jugador
      const jornadas = await db(`/jornadas?liga_id=eq.${insc.liga_id}&select=id`, token);
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
            const asistencia = Array.isArray(f.asistencia) ? f.asistencia.filter(a => a.jugador_id !== jugadorId) : [];
            await db(`/ficha_partido?id=eq.${f.id}`, token, {
              method: "PATCH",
              body: JSON.stringify({ goleadores, asistencia })
            });
          }
        }
      }
      // 2. Eliminar la inscripción
      await db(`/jugador_equipo?id=eq.${eliminarTarget.id}`, token, { method: "DELETE" });
      showToast("Jugador eliminado del equipo");
      setModalCap(null);
      setEliminarTarget(null);
      await cargarEquipoCap(equipoCapActivoId);
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  // ── ESTADÍSTICAS ──────────────────────────────────────────────
  // Recarga cada vez que se entra a la sección o cambian las inscripciones,
  // para reflejar fichas recién cerradas o cambios del árbitro.
  useEffect(() => {
    if (seccion === "estadisticas" && jugador && inscripciones.length > 0) {
      cargarEstadisticas();
    }
  }, [seccion, jugador?.id, inscripciones.length]);

  const cargarEstadisticas = async () => {
    if (!jugador || inscripciones.length === 0) return;
    setStatsLoading(true);
    try {
      const equipoIds = [...new Set(inscripciones.map(i => i.equipo_id))];
      const ligaIds = [...new Set(inscripciones.map(i => i.liga_id))];

      const ligasFull = await db(
        `/ligas?id=in.(${ligaIds.join(",")})&select=id,nombre,temporada,activa,color_marca,cancha_id,canchas(nombre)`,
        token
      );

      // Cargar todos los equipos de los partidos (rivales) en batch separado
      const partidosRaw = await db(
        `/partidos?or=(equipo_local_id.in.(${equipoIds.join(",")}),equipo_visitante_id.in.(${equipoIds.join(",")}))&equipo_local_id=not.is.null&equipo_visitante_id=not.is.null&select=id,equipo_local_id,equipo_visitante_id,jornada_id,jornadas(numero,fecha,liga_id),ficha_partido(*)`,
        token
      );

      const liguillaRaw = await db(
        `/liguilla_partidos?or=(equipo_local_id.in.(${equipoIds.join(",")}),equipo_visitante_id.in.(${equipoIds.join(",")}))&cerrado=eq.true&select=id,liga_id,equipo_local_id,equipo_visitante_id,fase,goles_local,goles_visitante,goleadores,jornadas(numero,fecha)`,
        token
      );

      // Cargar info de TODOS los equipos involucrados (mis equipos + rivales)
      const todosEquipoIds = new Set(equipoIds);
      (partidosRaw || []).forEach(p => { todosEquipoIds.add(p.equipo_local_id); todosEquipoIds.add(p.equipo_visitante_id); });
      (liguillaRaw || []).forEach(p => { todosEquipoIds.add(p.equipo_local_id); todosEquipoIds.add(p.equipo_visitante_id); });
      const equiposInfo = todosEquipoIds.size > 0
        ? await db(`/equipos?id=in.(${[...todosEquipoIds].join(",")})&select=id,nombre,color_playera,escudo_url`, token)
        : [];
      const equiposMap = Object.fromEntries(equiposInfo.map(e => [e.id, e]));
      const ligasMap = Object.fromEntries(ligasFull.map(l => [l.id, l]));

      const procesados = [];

      // Partidos regulares con ficha cerrada
      for (const p of partidosRaw || []) {
        const ficha = Array.isArray(p.ficha_partido) ? p.ficha_partido[0] : p.ficha_partido;
        if (!ficha?.cerrada) continue;
        const liga = ligasMap[p.jornadas?.liga_id];
        if (!liga) continue;
        const miEquipoId = equipoIds.find(eid => eid === p.equipo_local_id || eid === p.equipo_visitante_id);
        if (!miEquipoId) continue;
        const esLocal = miEquipoId === p.equipo_local_id;
        const goles = (ficha.goleadores || []).filter(g => g.jugador_id === jugador.id).reduce((s, g) => s + (g.goles || 0), 0);
        const presente = (ficha.asistencia || []).includes(jugador.id);
        procesados.push({
          id: p.id,
          liga_id: liga.id,
          liga_nombre: liga.nombre,
          temporada: liga.temporada,
          activa: liga.activa,
          unidad: liga.canchas?.nombre,
          color_liga: liga.color_marca,
          jornada: p.jornadas?.numero,
          fecha: p.jornadas?.fecha,
          miEquipo: equiposMap[miEquipoId],
          rival: equiposMap[esLocal ? p.equipo_visitante_id : p.equipo_local_id],
          miMarcador: esLocal ? ficha.goles_local : ficha.goles_visitante,
          rivalMarcador: esLocal ? ficha.goles_visitante : ficha.goles_local,
          misGoles: goles,
          presente,
          tipo: "regular",
        });
      }

      // Liguilla / Copa
      for (const lp of liguillaRaw || []) {
        const liga = ligasMap[lp.liga_id];
        if (!liga) continue;
        const miEquipoId = equipoIds.find(eid => eid === lp.equipo_local_id || eid === lp.equipo_visitante_id);
        if (!miEquipoId) continue;
        const esLocal = miEquipoId === lp.equipo_local_id;
        const goles = (lp.goleadores || []).filter(g => g.jugador_id === jugador.id).reduce((s, g) => s + (g.goles || 0), 0);
        procesados.push({
          id: lp.id,
          liga_id: liga.id,
          liga_nombre: liga.nombre,
          temporada: liga.temporada,
          activa: liga.activa,
          unidad: liga.canchas?.nombre,
          color_liga: liga.color_marca,
          jornada: lp.jornadas?.numero,
          fecha: lp.jornadas?.fecha,
          miEquipo: equiposMap[miEquipoId],
          rival: equiposMap[esLocal ? lp.equipo_visitante_id : lp.equipo_local_id],
          miMarcador: esLocal ? lp.goles_local : lp.goles_visitante,
          rivalMarcador: esLocal ? lp.goles_visitante : lp.goles_local,
          misGoles: goles,
          presente: true, // liguilla no rastrea asistencia individual
          tipo: "liguilla",
          fase: lp.fase,
        });
      }

      procesados.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
      setPartidosJugados(procesados);
    } catch (e) { showToast(e.message, "err"); }
    setStatsLoading(false);
  };

  // Datos derivados para el selector y agregados
  const ligasInscrito = useMemo(() => {
    const map = new Map();
    inscripciones.forEach(i => {
      if (i.ligas) map.set(i.liga_id, { id: i.liga_id, nombre: i.ligas.nombre, equipo_id: i.equipo_id });
    });
    return [...map.values()];
  }, [inscripciones]);

  const temporadasDistintas = useMemo(() => {
    return [...new Set(partidosJugados.map(p => p.temporada).filter(Boolean))];
  }, [partidosJugados]);

  const partidosFiltrados = useMemo(() => {
    if (filtroStats === "activos") return partidosJugados.filter(p => p.activa);
    if (filtroStats === "historico") return partidosJugados;
    return partidosJugados.filter(p => p.liga_id === filtroStats);
  }, [partidosJugados, filtroStats]);

  const stats = useMemo(() => {
    const ps = partidosFiltrados;
    const pjPresente = ps.filter(p => p.presente).length;
    const totalGoles = ps.reduce((s, p) => s + (p.misGoles || 0), 0);
    const partidosConGol = ps.filter(p => p.misGoles > 0).length;
    const promedio = pjPresente > 0 ? (totalGoles / pjPresente) : 0;
    const equipos = [...new Set(ps.map(p => p.miEquipo?.id).filter(Boolean))].length;
    const v = ps.filter(p => p.miMarcador > p.rivalMarcador).length;
    const e = ps.filter(p => p.miMarcador === p.rivalMarcador).length;
    const d = ps.filter(p => p.miMarcador < p.rivalMarcador).length;
    return { pjPresente, totalGoles, partidosConGol, promedio, equipos, v, e, d, total: ps.length };
  }, [partidosFiltrados]);

  // ── EDITAR DORSAL ─────────────────────────────────────────────
  const guardarDorsalCap = async () => {
    if (!dorsalTarget) return;
    const num = parseInt(dorsalNuevo, 10);
    if (!num || num < 1 || num > 99) return showToast("Dorsal entre 1 y 99", "err");
    const ocupado = jugadoresEquipoCap.find(j => j.dorsal === num && j.id !== dorsalTarget.id);
    if (ocupado) return showToast(`El dorsal ${num} ya lo usa ${ocupado.jugadores?.nombre_completo}`, "err");
    setGuardando(true);
    try {
      await db(`/jugador_equipo?id=eq.${dorsalTarget.id}`, token, {
        method: "PATCH", body: JSON.stringify({ dorsal: num })
      });
      showToast("Dorsal actualizado ✓");
      setModalCap(null);
      setDorsalTarget(null);
      setDorsalNuevo("");
      await cargarEquipoCap(equipoCapActivoId);
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <div style={s.spinner} />
    </div>
  );

  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {toast && <div style={{ ...s.toast, background: toast.tipo === "err" ? "#ef4444" : "#4ade80", color: toast.tipo === "err" ? "#fff" : "#0d0d1a" }}>{toast.msg}</div>}

      <div style={s.header}>
        <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.7)", textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>
          {seccion === "perfil" ? "Jugador registrado" : seccion === "mi-equipo" ? "Capitán de equipo" : seccion === "estadisticas" ? "Tu rendimiento" : "Torneos activos"}
        </div>
        <h2 style={s.title}>
          {seccion === "perfil" ? "🏃 Mi Perfil" : seccion === "mi-equipo" ? "👑 Mi Equipo" : seccion === "estadisticas" ? "📊 Mis Estadísticas" : "🏆 Mis Torneos"}
        </h2>
        <p style={s.sub}>
          {seccion === "perfil" ? "Tu identidad en la plataforma" : seccion === "mi-equipo" ? "Gestiona la lista y la tarjeta de tu equipo" : seccion === "estadisticas" ? "Goles, partidos y resultados" : "Tus inscripciones activas"}
        </p>
      </div>

      {/* ── SECCIÓN PERFIL ── */}
      {seccion === "perfil" && (
        <div>
          {/* TARJETA DE JUGADOR */}
          <div style={s.playerCard}>
            {/* Banner verde con avatar e info principal */}
            <div style={s.playerCardBanner}>
              <div style={s.playerCardLeft}>
                <div style={s.avatarWrap}>
                  {fotoPreview
                    ? <img src={fotoPreview} alt="foto" style={s.avatarImg} />
                    : <div style={s.avatarPlaceholder}>🏃</div>}
                  {editando && (
                    <label style={s.avatarEditBtn}>
                      📷
                      <input type="file" accept="image/*" onChange={handleFotoChange} style={{ display: "none" }} />
                    </label>
                  )}
                </div>
              </div>
              <div style={s.playerCardRight}>
                <div style={s.afiliadoBadge}>#{jugador?.numero_afiliado || "AF-?????"}</div>
                <div style={s.playerNombre}>{jugador?.nombre_completo || "Sin nombre"}</div>
                <div style={s.playerPosicion}>{jugador?.posicion_preferida || "—"}</div>
              </div>
            </div>

            {/* Cuerpo: datos y acciones */}
            <div style={s.playerCardBody}>
              {!editando ? (
                <>
                  <div style={s.playerDatos}>
                    {[
                      ["📅","Fecha nac.", jugador?.fecha_nacimiento || "—"],
                      ["🏠","Domicilio", jugador?.domicilio || "—"],
                      ["🎽","Número preferido", jugador?.numero_preferido ? `#${jugador.numero_preferido}` : "—"],
                      ["🅰️","Nombre en camiseta", jugador?.nombre_camiseta_preferido || "—"],
                    ].map(([icon,lbl,val]) => (
                      <div key={lbl} style={s.playerDato}>
                        <div style={s.playerDatoIcon}>{icon}</div>
                        <div>
                          <div style={s.playerDatoLabel}>{lbl}</div>
                          <div style={s.playerDatoVal}>{val}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button style={s.btnEditar} onClick={() => setEditando(true)}>✏️ Editar perfil</button>
                </>
              ) : (
                <div style={s.editForm}>
                  {[["nombre_completo","Nombre completo","text"],["fecha_nacimiento","Fecha de nacimiento","date"],["domicilio","Domicilio","text"]].map(([key,lbl,type]) => (
                    <div key={key} style={s.field}>
                      <label style={s.label}>{lbl}</label>
                      <input style={s.input} type={type}
                        value={form[key]}
                        onChange={e => setForm({ ...form, [key]: key === "nombre_completo" ? toTitleCase(e.target.value) : e.target.value })} />
                    </div>
                  ))}
                  <div style={s.field}>
                    <label style={s.label}>Posición preferida</label>
                    <select style={s.input} value={form.posicion_preferida}
                      onChange={e => setForm({ ...form, posicion_preferida: e.target.value })}>
                      {POSICIONES.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Número preferido en camiseta (1–99)</label>
                    <input style={s.input} type="number" min="1" max="99" placeholder="ej. 10"
                      value={form.numero_preferido}
                      onChange={e => setForm({ ...form, numero_preferido: e.target.value })} />
                    <p style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>
                      Cuando te inscriban en un equipo, intentarán darte este dorsal. Si está ocupado, te asignarán otro.
                    </p>
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Nombre en camiseta</label>
                    <input style={s.input} type="text" placeholder="GARCÍA"
                      value={form.nombre_camiseta_preferido}
                      onChange={e => setForm({ ...form, nombre_camiseta_preferido: e.target.value.toUpperCase() })} />
                    <p style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>
                      Si lo dejas vacío, usaremos tu apellido al inscribirte.
                    </p>
                  </div>
                  <div style={s.editActions}>
                    <button style={s.btnCancelar} onClick={() => { setEditando(false); setFotoFile(null); setFotoPreview(jugador?.foto_url); }}>Cancelar</button>
                    <button style={s.btnGuardar} onClick={guardarPerfil} disabled={guardando}>
                      {guardando ? "Guardando..." : "Guardar cambios"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ESTADÍSTICAS RÁPIDAS */}
          <div style={s.statsRow}>
            {[
              ["🏆","Ligas activas", inscripciones.length],
              ["⚽","Equipos", inscripciones.length],
              ["🎽","Número afiliado", jugador?.numero_afiliado || "—"],
            ].map(([icon, lbl, val]) => (
              <div key={lbl} style={s.statCard}>
                <div style={s.statIconWrap}>{icon}</div>
                <div style={s.statVal}>{val}</div>
                <div style={s.statLabel}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECCIÓN LIGAS ── */}
      {seccion === "ligas" && (
        <div>
          <div style={s.secHeader}>
            <span style={s.secCount}>{inscripciones.length} {inscripciones.length === 1 ? "inscripción activa" : "inscripciones activas"}</span>
          </div>

          {inscripciones.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>🏆</div>
              <div style={s.emptyTxt}>Aún no estás inscrito en ningún equipo</div>
              <p style={{ color:"#9ca3af", fontSize:13, margin:0 }}>El administrador de tu unidad deportiva te inscribirá usando tu número de afiliado.</p>
            </div>
          ) : (
            <div style={s.inscripcionesList}>
              {inscripciones.map(ins => (
                <div key={ins.id} style={{ ...s.inscripcionCard, borderLeft: `4px solid ${ins.equipos?.color_playera || "#3182ce"}` }}>
                  <div style={s.inscripcionLeft}>
                    <div style={s.escudoWrap}>
                      {ins.equipos?.escudo_url
                        ? <img src={ins.equipos.escudo_url} alt="escudo" style={s.escudoImg} />
                        : <div style={{ ...s.escudoPlaceholder, background: ins.equipos?.color_playera || "#3182ce" }}>{ins.equipos?.nombre[0]}</div>}
                    </div>
                    <div>
                      <div style={s.inscripcionEquipo}>{ins.equipos?.nombre}</div>
                      <div style={s.inscripcionLiga}>🏆 {ins.ligas?.nombre} · {ins.ligas?.dia} {ins.ligas?.turno}</div>
                    </div>
                  </div>
                  <div style={s.inscripcionRight}>
                    {ins.es_capitan && (
                      <div style={s.capitanCol}>
                        <div style={s.capitanBadge}>👑 CAPITÁN</div>
                        <button style={s.btnGestionarEquipo} onClick={() => { setEquipoCapActivoId(ins.equipo_id); setSeccion("mi-equipo"); }}>
                          Gestionar →
                        </button>
                      </div>
                    )}
                    <div style={s.dorsalCard}>
                      <div style={{ ...s.dorsalNum, background: ins.equipos?.color_playera || "#3182ce" }}>{ins.dorsal}</div>
                      <div style={s.dorsalNombreCamiseta}>{ins.nombre_camiseta}</div>
                      <div style={{ display:"flex", gap:6, marginTop:2 }}>
                        <button style={s.btnEditarCamiseta} onClick={() => abrirEditarInsc(ins)}>✏️</button>
                        <button style={{ ...s.btnEditarCamiseta, color:"#ef4444", borderColor:"#fca5a5" }} onClick={() => setConfirmDesinsc(ins)}>🚪</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SECCIÓN ESTADÍSTICAS ── */}
      {seccion === "estadisticas" && (
        <div>
          {statsLoading ? (
            <div style={{ textAlign:"center", padding:60 }}><div style={s.spinner} /></div>
          ) : ligasInscrito.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>📊</div>
              <div style={s.emptyTxt}>Aún no estás inscrito en ningún torneo</div>
              <p style={{ color:"#9ca3af", fontSize:13, margin:0 }}>Cuando juegues partidos aparecerán tus estadísticas aquí.</p>
            </div>
          ) : (
            <>
              {/* Selector de torneo */}
              <div style={{ display:"flex", justifyContent:"flex-end", marginBottom: 8 }}>
                <button
                  onClick={cargarEstadisticas}
                  style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 12px", color:"#374151", fontSize:12, fontWeight:600, cursor:"pointer" }}
                  disabled={statsLoading}>
                  🔄 Actualizar
                </button>
              </div>
              <div style={s.statsFiltros}>
                <button
                  onClick={() => setFiltroStats("activos")}
                  style={{ ...s.statsFiltro, ...(filtroStats === "activos" ? s.statsFiltroActivo : {}) }}>
                  ⚡ Todos los activos
                </button>
                {ligasInscrito.map(l => (
                  <button key={l.id}
                    onClick={() => setFiltroStats(l.id)}
                    style={{ ...s.statsFiltro, ...(filtroStats === l.id ? s.statsFiltroActivo : {}) }}>
                    🏆 {l.nombre}
                  </button>
                ))}
                {temporadasDistintas.length > 1 && (
                  <button
                    onClick={() => setFiltroStats("historico")}
                    style={{ ...s.statsFiltro, ...(filtroStats === "historico" ? s.statsFiltroActivo : {}) }}>
                    📜 Histórico ({temporadasDistintas.length} temporadas)
                  </button>
                )}
              </div>

              {/* Cards de stats principales */}
              <div style={s.statsGrid}>
                <div style={s.statBig}>
                  <div style={s.statBigVal}>{stats.totalGoles}</div>
                  <div style={s.statBigLbl}>⚽ Goles</div>
                </div>
                <div style={s.statBig}>
                  <div style={s.statBigVal}>{stats.pjPresente}</div>
                  <div style={s.statBigLbl}>👟 Partidos jugados</div>
                </div>
                <div style={s.statBig}>
                  <div style={s.statBigVal}>{stats.promedio.toFixed(2)}</div>
                  <div style={s.statBigLbl}>📈 Goles / partido</div>
                </div>
              </div>

              {/* Stats secundarias */}
              <div style={s.statsSecondary}>
                <div style={s.statSmall}><span style={{ color:"#16a34a" }}>{stats.v}</span><span style={s.statSmallLbl}>Victorias</span></div>
                <div style={s.statSmall}><span style={{ color:"#ca8a04" }}>{stats.e}</span><span style={s.statSmallLbl}>Empates</span></div>
                <div style={s.statSmall}><span style={{ color:"#dc2626" }}>{stats.d}</span><span style={s.statSmallLbl}>Derrotas</span></div>
                <div style={s.statSmall}><span style={{ color:GREEN }}>{stats.equipos}</span><span style={s.statSmallLbl}>Equipos</span></div>
              </div>

              {/* Lista de partidos */}
              <div style={{ marginTop: 24 }}>
                <div style={s.secHeader}>
                  <span style={s.secCount}>📋 Detalle de partidos ({partidosFiltrados.length})</span>
                </div>
                {partidosFiltrados.length === 0 ? (
                  <div style={s.empty}>
                    <div style={s.emptyIcon}>📊</div>
                    <div style={s.emptyTxt}>No hay partidos en esta selección</div>
                  </div>
                ) : (
                  <div style={s.partidosList}>
                    {partidosFiltrados.map(p => {
                      const gano = p.miMarcador > p.rivalMarcador;
                      const empate = p.miMarcador === p.rivalMarcador;
                      const colorRes = gano ? "#16a34a" : empate ? "#ca8a04" : "#dc2626";
                      return (
                        <div key={p.id} style={{ ...s.partidoCard, borderLeft: `4px solid ${p.color_liga || GREEN}` }}>
                          <div style={s.partidoTop}>
                            <span style={s.partidoLiga}>
                              {p.tipo === "liguilla" ? "🏆 " + (p.fase || "Liguilla") : `J${p.jornada}`} · {p.liga_nombre}
                            </span>
                            <span style={s.partidoFecha}>{p.fecha || "Sin fecha"}</span>
                          </div>
                          <div style={s.partidoMid}>
                            <div style={s.partidoEquipo}>
                              <span style={{ ...s.partidoColor, background: p.miEquipo?.color_playera || "#3182ce" }} />
                              <span style={s.partidoEquipoNombre}>{p.miEquipo?.nombre || "—"}</span>
                            </div>
                            <div style={{ ...s.partidoMarcador, color: colorRes }}>
                              {p.miMarcador} - {p.rivalMarcador}
                            </div>
                            <div style={s.partidoEquipo}>
                              <span style={s.partidoEquipoNombre}>{p.rival?.nombre || "—"}</span>
                              <span style={{ ...s.partidoColor, background: p.rival?.color_playera || "#9ca3af" }} />
                            </div>
                          </div>
                          <div style={s.partidoFoot}>
                            {!p.presente && p.tipo === "regular" && (
                              <span style={{ ...s.partidoTag, background:"#fef2f2", color:"#dc2626" }}>Ausente</span>
                            )}
                            {p.misGoles > 0 && (
                              <span style={{ ...s.partidoTag, background:"#f0fdf4", color: GREEN }}>
                                ⚽ {p.misGoles} {p.misGoles === 1 ? "gol" : "goles"}
                              </span>
                            )}
                            {!p.activa && (
                              <span style={{ ...s.partidoTag, background:"#f3f4f6", color:"#6b7280" }}>{p.temporada || "Histórico"}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── SECCIÓN MI EQUIPO (CAPITÁN) ── */}
      {seccion === "mi-equipo" && (
        equiposComoCapitan.length === 0 ? (
          <div style={s.empty}>
            <div style={s.emptyIcon}>👑</div>
            <div style={s.emptyTxt}>No eres capitán de ningún equipo</div>
            <p style={{ color:"#9ca3af", fontSize:13, margin:0 }}>
              El admin de tu unidad deportiva te asignará como capitán.
            </p>
          </div>
        ) : (
          <div>
            {/* Selector de equipo si hay varios */}
            {equiposComoCapitan.length > 1 && (
              <div style={s.capSelector}>
                {equiposComoCapitan.map(c => (
                  <button key={c.id}
                    onClick={() => setEquipoCapActivoId(c.equipo_id)}
                    style={{ ...s.capSelectorTab, ...(equipoCapActivoId === c.equipo_id ? s.capSelectorTabActive : {}) }}>
                    👕 {c.equipos?.nombre}
                  </button>
                ))}
              </div>
            )}

            {/* Tarjeta del equipo */}
            {equipoCapData && (
              <div style={{ ...s.equipoCardCap, borderTop: `4px solid ${equipoCapData.color_playera || "#3182ce"}` }}>
                <div style={s.equipoCardCapTop}>
                  <JerseySVG
                    diseno={equipoCapData.diseno_camiseta || "solido"}
                    color1={equipoCapData.color_playera || "#3182ce"}
                    color2={equipoCapData.color_camiseta_2 || "#ffffff"}
                    escudoUrl={equipoCapData.escudo_url || null}
                    size={72}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.equipoCardCapNombre}>{equipoCapData.nombre}</div>
                    <div style={s.equipoCardCapMeta}>
                      {jugadoresEquipoCap.length} / 17 jugadores
                    </div>
                  </div>
                </div>
                <button style={s.btnEditarTarjeta} onClick={abrirEditarTarjeta}>
                  🎨 Editar tarjeta del equipo
                </button>
              </div>
            )}

            {/* Acciones de jugadores */}
            <div style={s.secHeader}>
              <span style={s.secCount}>👥 Jugadores del equipo</span>
              <button style={s.btnAdd}
                onClick={() => { setAnadirAfiliados(""); setAnadirCandidatos([]); setModalCap("anadir_input"); }}
                disabled={jugadoresEquipoCap.length >= 17}>
                + Añadir jugadores
              </button>
            </div>

            {jugadoresEquipoCap.length === 0 ? (
              <div style={s.empty}>
                <div style={s.emptyIcon}>🏃</div>
                <div style={s.emptyTxt}>Aún no hay jugadores en tu equipo</div>
                <p style={{ color:"#9ca3af", fontSize:13, margin:0 }}>
                  Añádelos con su número de afiliado.
                </p>
              </div>
            ) : (
              <div style={s.jugadorListCap}>
                {jugadoresEquipoCap.map(je => (
                  <div key={je.id} style={{ ...s.jugadorRowCap, ...(je.es_capitan ? { borderLeft: `4px solid #f59e0b`, background: "linear-gradient(90deg, #fffbeb 0%, #ffffff 60%)" } : {}) }}>
                    <div style={s.jugadorAvatarCap}>
                      {je.jugadores?.foto_url
                        ? <img src={je.jugadores.foto_url} alt="foto" style={s.jugadorFotoCap} />
                        : <div style={s.jugadorFotoPlaceholderCap}>🏃</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.jugadorNombreCap}>
                        {je.es_capitan && <span style={{ marginRight: 5 }}>👑</span>}
                        {je.jugadores?.nombre_completo}
                      </div>
                      <div style={s.jugadorMetaCap}>
                        #{je.jugadores?.numero_afiliado} · {je.nombre_camiseta}
                      </div>
                    </div>
                    <button
                      style={{ ...s.dorsalBtn, background: equipoCapData?.color_playera || "#3182ce" }}
                      onClick={() => { setDorsalTarget(je); setDorsalNuevo(je.dorsal || ""); setModalCap("dorsal"); }}
                      title="Cambiar dorsal">
                      {je.dorsal || "—"}
                    </button>
                    {!je.es_capitan && (
                      <button style={s.btnEliminarCap}
                        onClick={() => { setEliminarTarget(je); setModalCap("eliminar"); }}
                        title="Eliminar del equipo">
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* ── MODAL EDITAR TARJETA DEL EQUIPO ── */}
      {modalCap === "tarjeta" && equipoCapData && (
        <div style={s.overlay} onClick={() => setModalCap(null)}>
          <div style={{ ...s.modalBox, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>🎨 Editar tarjeta de {equipoCapData.nombre}</h3>

            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 18 }}>
              <JerseySVG
                diseno={tarjetaForm.diseno_camiseta}
                color1={tarjetaForm.color_playera}
                color2={tarjetaForm.color_camiseta_2}
                escudoUrl={tarjetaEscudoPreview || null}
                size={72}
              />
              <div style={{ flex: 1 }}>
                <label style={s.uploadLabelCap}>
                  📁 Subir logo del equipo
                  <input type="file" accept="image/*" onChange={handleTarjetaEscudoChange} style={{ display: "none" }} />
                </label>
                <p style={{ color: "#9ca3af", fontSize: 11, marginTop: 6 }}>PNG o JPG. Aparece en la camiseta.</p>
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Diseño de camiseta</label>
              <JerseyDesignPicker
                diseno={tarjetaForm.diseno_camiseta}
                color1={tarjetaForm.color_playera}
                color2={tarjetaForm.color_camiseta_2}
                onChange={({ diseno }) => setTarjetaForm({ ...tarjetaForm, diseno_camiseta: diseno })}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Color principal</label>
              <div style={s.colorGridCap}>
                {COLORES_CAMISETA.map(c => (
                  <div key={c} onClick={() => setTarjetaForm({ ...tarjetaForm, color_playera: c })}
                    style={{ ...s.colorDotCap, background: c, boxShadow: tarjetaForm.color_playera === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : "none" }} />
                ))}
                <input type="color" value={tarjetaForm.color_playera}
                  onChange={e => setTarjetaForm({ ...tarjetaForm, color_playera: e.target.value })}
                  style={s.colorCustomCap} />
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Color secundario</label>
              <div style={s.colorGridCap}>
                {COLORES_SECUNDARIOS.map(c => (
                  <div key={c} onClick={() => setTarjetaForm({ ...tarjetaForm, color_camiseta_2: c })}
                    style={{ ...s.colorDotCap, background: c, boxShadow: tarjetaForm.color_camiseta_2 === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : "none", border: c === "#ffffff" ? "1px solid #e5e7eb" : "none" }} />
                ))}
                <input type="color" value={tarjetaForm.color_camiseta_2}
                  onChange={e => setTarjetaForm({ ...tarjetaForm, color_camiseta_2: e.target.value })}
                  style={s.colorCustomCap} />
              </div>
            </div>

            <div style={s.modalActions}>
              <button style={s.btnCancelar} onClick={() => setModalCap(null)}>Cancelar</button>
              <button style={s.btnGuardar} onClick={guardarTarjetaEquipo} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar tarjeta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL AÑADIR JUGADORES: paso 1 (input afiliados) ── */}
      {modalCap === "anadir_input" && (
        <div style={s.overlay} onClick={() => setModalCap(null)}>
          <div style={{ ...s.modalBox, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>+ Añadir jugadores</h3>
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
              Cupos disponibles: <strong>{17 - jugadoresEquipoCap.length}</strong> / 17
            </p>
            <div style={s.modalActions}>
              <button style={s.btnCancelar} onClick={() => setModalCap(null)}>Cancelar</button>
              <button style={s.btnGuardar} onClick={buscarCandidatosAnadir} disabled={guardando}>
                {guardando ? "Buscando..." : "Verificar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL AÑADIR JUGADORES: paso 2 (confirmar) ── */}
      {modalCap === "anadir_confirm" && (
        <div style={s.overlay} onClick={() => setModalCap(null)}>
          <div style={{ ...s.modalBox, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>Confirmar inscripción</h3>
            <p style={{ fontSize: 13, color: "#374151", marginBottom: 16 }}>
              Estos {anadirCandidatos.length} jugador{anadirCandidatos.length === 1 ? "" : "es"} se inscribirán en <strong>{equipoCapData?.nombre}</strong>:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 300, overflowY: "auto", marginBottom: 18 }}>
              {anadirCandidatos.map(c => (
                <div key={c.id} style={s.confirmCard}>
                  <div style={s.confirmFoto}>
                    {c.foto_url
                      ? <img src={c.foto_url} alt="foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 22 }}>🏃</span>}
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
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: c.dorsal_cambiado ? "#f59e0b" : (equipoCapData?.color_playera || "#3182ce"), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900 }}>
                      {c.dorsal_asignado}
                    </div>
                    <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 700, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>Dorsal</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancelar} onClick={() => setModalCap("anadir_input")}>← Volver</button>
              <button style={s.btnGuardar} onClick={confirmarAnadirJugadores} disabled={guardando}>
                {guardando ? "Inscribiendo..." : `✓ Inscribir ${anadirCandidatos.length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ELIMINAR JUGADOR (con advertencia) ── */}
      {modalCap === "eliminar" && eliminarTarget && (
        <div style={s.overlay} onClick={() => setModalCap(null)}>
          <div style={{ ...s.modalBox, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>⚠️</div>
              <h3 style={{ ...s.modalTitle, marginBottom: 10 }}>¿Eliminar a este jugador?</h3>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6 }}>
                {eliminarTarget.jugadores?.nombre_completo}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>#{eliminarTarget.jugadores?.numero_afiliado}</div>
            </div>
            <div style={s.warningBoxCap}>
              <strong>Aviso:</strong> Saldrá de la lista de tu equipo y se borrarán todos sus datos en partidos pendientes (asistencia y goles registrados en fichas no cerradas). Las fichas ya cerradas se conservan.
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancelar} onClick={() => setModalCap(null)}>Cancelar</button>
              <button style={{ ...s.btnGuardar, background: "#ef4444" }} onClick={eliminarJugadorCap} disabled={guardando}>
                {guardando ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CAMBIAR DORSAL ── */}
      {modalCap === "dorsal" && dorsalTarget && (
        <div style={s.overlay} onClick={() => setModalCap(null)}>
          <div style={{ ...s.modalBox, maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>Cambiar dorsal</h3>
            <div style={{ fontSize: 14, color: "#374151", marginBottom: 16 }}>
              <strong>{dorsalTarget.jugadores?.nombre_completo}</strong>
            </div>
            <div style={s.field}>
              <label style={s.label}>Nuevo dorsal (1–99)</label>
              <input style={s.input} type="number" min="1" max="99"
                value={dorsalNuevo}
                onChange={e => setDorsalNuevo(e.target.value)}
                autoFocus />
              <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                No puede repetirse en este equipo.
              </p>
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancelar} onClick={() => setModalCap(null)}>Cancelar</button>
              <button style={s.btnGuardar} onClick={guardarDorsalCap} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar dorsal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EDITAR CAMISETA ── */}
      {editandoInsc && (
        <div style={s.overlay} onClick={() => setEditandoInsc(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>Editar camiseta 🎽</h3>
            <div style={{ marginBottom: 18, padding: "12px 16px", background: "#f0fdf4", border: "1px solid #c3e6a3", borderRadius: 10, fontSize: 14, fontWeight: 600 }}>
              {editandoInsc.equipos?.nombre} · {editandoInsc.ligas?.nombre}
            </div>
            <div style={s.formRow}>
              <div style={s.field}>
                <label style={s.label}>Dorsal *</label>
                <input style={s.input} type="number" min="1" max="99" placeholder="ej. 10"
                  value={inscEditForm.dorsal} onChange={e => setInscEditForm({ ...inscEditForm, dorsal: e.target.value })} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Nombre en camiseta</label>
                <input style={s.input} type="text" placeholder="APELLIDO"
                  value={inscEditForm.nombre_camiseta} onChange={e => setInscEditForm({ ...inscEditForm, nombre_camiseta: e.target.value.toUpperCase() })} />
              </div>
            </div>
            <div style={s.camisetaPreview}>
              <div style={{ ...s.camisetaNum, background: editandoInsc.equipos?.color_playera || "#3182ce" }}>
                {inscEditForm.dorsal || "?"}
              </div>
              <div style={s.camisetaNombrePreview}>{inscEditForm.nombre_camiseta || "NOMBRE"}</div>
              <div style={{ fontSize: 11, color: "#555" }}>Vista previa camiseta</div>
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancelar} onClick={() => setEditandoInsc(null)}>Cancelar</button>
              <button style={s.btnGuardar} onClick={guardarInscripcion} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONFIRMAR BAJA ── */}
      {confirmDesinsc && (
        <div style={s.overlay} onClick={() => setConfirmDesinsc(null)}>
          <div style={{ ...s.modalBox, maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🚪</div>
              <h3 style={{ ...s.modalTitle, marginBottom:8 }}>¿Darte de baja?</h3>
              <p style={{ color:"#6b7280", fontSize:14, margin:0 }}>
                Saldrás del equipo <strong>{confirmDesinsc.equipos?.nombre}</strong> en la liga <strong>{confirmDesinsc.ligas?.nombre}</strong>.
              </p>
              <p style={{ color:"#ef4444", fontSize:12, marginTop:8 }}>
                Esta acción no se puede revertir.
              </p>
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancelar} onClick={() => setConfirmDesinsc(null)}>Cancelar</button>
              <button style={{ ...s.btnGuardar, background:"#ef4444" }} onClick={desinscribirse} disabled={guardando}>
                {guardando ? "Procesando..." : "Sí, darme de baja"}
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
  header: { marginBottom: 24, padding: "20px 24px", background: `linear-gradient(135deg, ${GREEN} 0%, #7fbf4d 100%)`, borderRadius: 16, boxShadow: "0 4px 16px rgba(79,143,47,0.3)" },
  title: { fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: -0.8, marginBottom: 4 },
  sub: { color: "rgba(255,255,255,0.78)", fontSize: 14, margin: 0 },
  playerCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 18, marginBottom: 20, overflow: "hidden", boxShadow: "0 4px 16px rgba(79,143,47,0.12)" },
  playerCardBanner: { background: "linear-gradient(135deg, #4f8f2f 0%, #7fbf4d 100%)", padding: "24px 28px", display: "flex", gap: 20, alignItems: "center" },
  playerCardBody: { padding: "20px 28px 24px" },
  playerCardLeft: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexShrink: 0 },
  avatarWrap: { position: "relative", width: 88, height: 88 },
  avatarImg: { width: 88, height: 88, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,0.6)" },
  avatarPlaceholder: { width: 88, height: 88, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, border: "3px solid rgba(255,255,255,0.4)" },
  avatarEditBtn: { position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" },
  playerCardRight: { flex: 1 },
  afiliadoBadge: { display: "inline-block", background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: 12, fontWeight: 800, padding: "4px 12px", borderRadius: 8, marginBottom: 8, letterSpacing: 1, border: "1px solid rgba(255,255,255,0.35)" },
  playerNombre: { fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 3, letterSpacing: -0.4 },
  playerPosicion: { fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 500 },
  playerDatos: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 },
  playerDato: { background: "#f0fdf4", border: "1px solid #c3e6a3", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 },
  playerDatoIcon: { width: 32, height: 32, background: "linear-gradient(135deg, #4f8f2f, #7fbf4d)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 },
  playerDatoLabel: { fontSize: 10, color: GREEN, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  playerDatoVal: { fontSize: 14, color: "#111827", fontWeight: 600 },
  btnEditar: { background: "linear-gradient(135deg, #4f8f2f, #7fbf4d)", border: "none", borderRadius: 10, padding: "10px 22px", color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: "0 2px 8px rgba(79,143,47,0.3)" },
  editForm: { display: "flex", flexDirection: "column", gap: 0 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 },
  statCard: { background: "linear-gradient(135deg, #f0fdf4 0%, #e8f5e1 100%)", border: "1px solid #c3e6a3", borderRadius: 14, padding: "20px 16px", textAlign: "center", boxShadow: "0 2px 8px rgba(79,143,47,0.08)" },
  statIconWrap: { width: 48, height: 48, background: "linear-gradient(135deg, #4f8f2f, #7fbf4d)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, margin: "0 auto 10px", boxShadow: "0 3px 10px rgba(79,143,47,0.3)" },
  statVal: { fontSize: 24, fontWeight: 900, color: GREEN, marginBottom: 4 },
  statLabel: { fontSize: 12, color: "#6b7280", fontWeight: 500 },
  secHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  secCount: { color: "#6b7280", fontSize: 13 },
  btnAdd: { background: GREEN, color: "#ffffff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  empty: { textAlign: "center", padding: "60px 20px" },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTxt: { color: "#6b7280", fontSize: 15, marginBottom: 20, fontWeight: 600 },
  inscripcionesList: { display: "flex", flexDirection: "column", gap: 12 },
  inscripcionCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  inscripcionLeft: { display: "flex", alignItems: "center", gap: 16 },
  escudoWrap: { width: 52, height: 52, borderRadius: 12, overflow: "hidden", flexShrink: 0 },
  escudoImg: { width: "100%", height: "100%", objectFit: "cover" },
  escudoPlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff" },
  inscripcionEquipo: { fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 4 },
  inscripcionLiga: { fontSize: 13, color: "#6b7280" },
  inscripcionRight: { display: "flex", alignItems: "center", gap: 14 },
  capitanCol: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, width: 100 },
  dorsalCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  dorsalNum: { width: 48, height: 48, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: "#fff" },
  dorsalNombreCamiseta: { fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 },
  btnEditarCamiseta: { background: "transparent", border: "1px solid #e5e7eb", borderRadius: 7, padding: "4px 10px", fontSize: 11, color: "#6b7280", cursor: "pointer", fontWeight: 600 },
  field: { marginBottom: 16, flex: 1 },
  formRow: { display: "flex", gap: 16 },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 },
  input: { width: "100%", background: BASE, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "10px 14px", color: "#111827", fontSize: 14, outline: "none", boxSizing: "border-box" },
  editActions: { display: "flex", gap: 10, marginTop: 8 },
  btnCancelar: { flex: 1, background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 10, color: "#6b7280", fontSize: 13, cursor: "pointer" },
  btnGuardar: { flex: 2, background: GREEN, color: "#ffffff", border: "none", borderRadius: 10, padding: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" },
  camisetaPreview: { background: BASE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px", textAlign: "center", marginBottom: 16 },
  camisetaNum: { width: 52, height: 52, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: "#fff", margin: "0 auto 8px" },
  camisetaNombrePreview: { fontSize: 16, fontWeight: 800, color: "#111827", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 },
  warningBox: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", color: "#ca8a04", fontSize: 13 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.28)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, overflowY: "auto" },
  modalBox: { background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 24, width: "100%", maxWidth: 440, maxHeight: "calc(100vh - 32px)", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 22 },
  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  spinner: { width: 32, height: 32, border: `3px solid ${BORDER}`, borderTop: `3px solid ${GREEN}`, borderRadius: "50%", margin: "0 auto", animation: "spin 0.7s linear infinite" },
  toast: { position: "fixed", bottom: 28, right: 28, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999 },
  // ── Estilos del panel de capitán ──
  capitanBadge: { background: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)", color: "#fff", fontSize: 12, fontWeight: 800, letterSpacing: 0.8, padding: "6px 10px", borderRadius: 14, boxShadow: "0 2px 8px rgba(245,158,11,0.4)", whiteSpace: "nowrap", textAlign: "center" },
  btnGestionarEquipo: { background: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)", color: "#fff", border: "none", borderRadius: 10, padding: "7px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 8px rgba(245,158,11,0.35)", whiteSpace: "nowrap", textAlign: "center" },
  capSelector: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 },
  capSelectorTab: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "7px 14px", color: "#6b7280", fontSize: 13, cursor: "pointer", fontWeight: 600 },
  capSelectorTabActive: { background: "#f0fdf4", borderColor: GREEN, color: GREEN },
  equipoCardCap: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, marginBottom: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  equipoCardCapTop: { display: "flex", alignItems: "center", gap: 16, marginBottom: 14 },
  equipoCardCapNombre: { fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 4 },
  equipoCardCapMeta: { fontSize: 13, color: "#6b7280" },
  btnEditarTarjeta: { width: "100%", background: "#f9fafb", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 16px", color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  jugadorListCap: { display: "flex", flexDirection: "column", gap: 10 },
  jugadorRowCap: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 },
  jugadorAvatarCap: { flexShrink: 0 },
  jugadorFotoCap: { width: 40, height: 40, borderRadius: "50%", objectFit: "cover" },
  jugadorFotoPlaceholderCap: { width: 40, height: 40, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 },
  jugadorNombreCap: { fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  jugadorMetaCap: { fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  dorsalBtn: { width: 40, height: 40, borderRadius: 10, border: "none", color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer", flexShrink: 0 },
  btnEliminarCap: { background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 10px", fontSize: 14, cursor: "pointer", flexShrink: 0 },
  warningBoxCap: { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#991b1b", lineHeight: 1.45, marginBottom: 18 },
  uploadLabelCap: { display: "inline-block", background: "#f3f4f6", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: "#6b7280", fontSize: 13, cursor: "pointer" },
  colorGridCap: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  colorDotCap: { width: 28, height: 28, borderRadius: "50%", cursor: "pointer", transition: "box-shadow 0.2s" },
  colorCustomCap: { width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0, background: "transparent" },
  confirmCard: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "#f9fafb", border: `1px solid ${BORDER}`, borderRadius: 10 },
  confirmFoto: { width: 42, height: 42, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  confirmCamiseta: { textAlign: "right", flexShrink: 0 },
  confirmCamisetaLabel: { fontSize: 9, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  confirmCamisetaNombre: { fontSize: 12, fontWeight: 800, color: GREEN, letterSpacing: 1 },
  btnAdd: { background: GREEN, color: "#ffffff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  // ── Estadísticas ──
  statsFiltros: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 },
  statsFiltro: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "7px 14px", color: "#6b7280", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  statsFiltroActivo: { background: "#f0fdf4", borderColor: GREEN, color: GREEN },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 },
  statBig: { background: "linear-gradient(135deg, #f0fdf4 0%, #e8f5e1 100%)", border: "1px solid #c3e6a3", borderRadius: 14, padding: "18px 12px", textAlign: "center", boxShadow: "0 2px 8px rgba(79,143,47,0.08)" },
  statBigVal: { fontSize: 28, fontWeight: 900, color: GREEN, marginBottom: 4, letterSpacing: -0.6 },
  statBigLbl: { fontSize: 11, color: "#6b7280", fontWeight: 600 },
  statsSecondary: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 },
  statSmall: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 6px", textAlign: "center", display: "flex", flexDirection: "column", gap: 2, fontSize: 18, fontWeight: 800 },
  statSmallLbl: { fontSize: 10, color: "#9ca3af", fontWeight: 600, marginTop: 2 },
  partidosList: { display: "flex", flexDirection: "column", gap: 10 },
  partidoCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 },
  partidoTop: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#6b7280", fontWeight: 600, gap: 8 },
  partidoLiga: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 },
  partidoFecha: { flexShrink: 0 },
  partidoMid: { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10 },
  partidoEquipo: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 },
  partidoEquipoNombre: { fontSize: 13, fontWeight: 700, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  partidoColor: { width: 12, height: 12, borderRadius: "50%", flexShrink: 0 },
  partidoMarcador: { fontSize: 18, fontWeight: 900, padding: "4px 10px", background: "#f9fafb", borderRadius: 8, whiteSpace: "nowrap" },
  partidoFoot: { display: "flex", gap: 6, flexWrap: "wrap" },
  partidoTag: { fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.5 },
};

const css = `
  * { box-sizing: border-box; }
  input:focus, select:focus { border-color: #4f8f2f !important; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;