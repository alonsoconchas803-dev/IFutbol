import { useState, useEffect, useMemo } from "react";
import JerseySVG, { JerseyDesignPicker } from "../components/JerseySVG";
import { toTitleCase } from "../App";
import { uploadFile } from "../lib/storage";
import ColorPicker from "../components/ColorPicker";

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

const POSICIONES = ["Portero", "Defensa", "Mediocampista", "Delantero"];

export default function PlayerProfile({ session, seccionInicial = "perfil", setTopbarBack }) {
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
  const [ambitoStats, setAmbitoStats] = useState("activas"); // "activas" | "historico"
  const [tabStats, setTabStats] = useState("resumen"); // "resumen" | "equipos" | "ligas" | "unidades"
  const [partidosOpen, setPartidosOpen] = useState(false);
  // Posiciones de goleo por liga: { [liga_id]: { goles, posicion } }
  const [posicionesGoleo, setPosicionesGoleo] = useState({});

  // ── ESTADOS DEL PANEL DE CAPITÁN ─────────────────────────────
  const [equipoCapActivoId, setEquipoCapActivoId] = useState(null);
  const [equipoCapData, setEquipoCapData] = useState(null);
  const [jugadoresEquipoCap, setJugadoresEquipoCap] = useState([]);
  // Mapa jugador_id → partidos pendientes (para subrayar y bloquear eliminación)
  const [sancionesEquipoCap, setSancionesEquipoCap] = useState({});
  const [modalCap, setModalCap] = useState(null); // "tarjeta" | "anadir_input" | "anadir_confirm" | "eliminar" | "dorsal"
  const [tarjetaForm, setTarjetaForm] = useState({ color_playera: "#3182ce", color_camiseta_2: "#ffffff", diseno_camiseta: "solido", escudo_url: "" });
  const [tarjetaEscudoFile, setTarjetaEscudoFile] = useState(null);
  const [tarjetaEscudoPreview, setTarjetaEscudoPreview] = useState(null);
  const [anadirAfiliados, setAnadirAfiliados] = useState("");
  const [anadirCandidatos, setAnadirCandidatos] = useState([]);
  const [eliminarTarget, setEliminarTarget] = useState(null);
  const [dorsalTarget, setDorsalTarget] = useState(null);
  const [dorsalNuevo, setDorsalNuevo] = useState("");
  // Toggle: cuando está activo aparecen los botones 🗑️ junto a cada dorsal.
  const [modoEliminar, setModoEliminar] = useState(false);

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
        foto_url = await uploadFile("imagenes", path, fotoFile, token, "jugador");
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
      // Si estoy en la pantalla de gestión, refresco la lista para ver mi cambio en vivo.
      if (equipoCapActivoId) await cargarEquipoCap(equipoCapActivoId);
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Revoca el blob anterior para no acumular URLs en memoria.
    if (typeof fotoPreview === "string" && fotoPreview.startsWith("blob:")) URL.revokeObjectURL(fotoPreview);
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
    showToast(`Foto "${file.name}" cargada ✓ se guardará al confirmar`);
  };

  // ── PANEL DE CAPITÁN ──────────────────────────────────────────
  const equiposComoCapitan = useMemo(
    () => inscripciones.filter(i => i.es_capitan),
    [inscripciones]
  );

  // Fallback: si entra a "mi-equipo" sin equipo activo, selecciona el primero inscrito
  // (sea como capitán o jugador). El flujo normal viene del botón "Gestionar" que ya lo setea.
  useEffect(() => {
    if (seccion === "mi-equipo" && !equipoCapActivoId && inscripciones.length > 0) {
      setEquipoCapActivoId(inscripciones[0].equipo_id);
    }
  }, [seccion, inscripciones, equipoCapActivoId]);

  // Botón de volver en la topbar mientras el capitán gestiona su equipo
  useEffect(() => {
    if (!setTopbarBack) return;
    if (seccion === "mi-equipo") {
      setTopbarBack({ label: "Mis Torneos", onClick: () => { setEquipoCapActivoId(null); setSeccion("ligas"); } });
    } else {
      setTopbarBack(null);
    }
    return () => setTopbarBack(null);
  }, [seccion, setTopbarBack]);

  const cargarEquipoCap = async (equipoId) => {
    try {
      const insc = inscripciones.find(i => i.equipo_id === equipoId);
      if (!insc) return;
      const [eq] = await db(`/equipos?id=eq.${equipoId}&select=*`, token);
      setEquipoCapData(eq);
      // RPC con privacidad server-side: el caller no-capitán recibe nombre_completo
      // y numero_afiliado en NULL para el resto del equipo (solo ve los suyos).
      const filas = await db(`/rpc/listar_jugadores_equipo`, token, {
        method: "POST",
        body: JSON.stringify({ p_equipo_id: equipoId, p_liga_id: insc.liga_id }),
      });
      // Reestructuro para mantener la forma { ..., jugadores: { ... } } que espera la UI.
      const jugs = (filas || []).map(r => ({
        id: r.id,
        jugador_id: r.jugador_id,
        dorsal: r.dorsal,
        nombre_camiseta: r.nombre_camiseta,
        es_capitan: r.es_capitan,
        activo: r.activo,
        jugadores: {
          nombre_completo: r.nombre_completo,
          foto_url: r.foto_url,
          posicion_preferida: r.posicion_preferida,
          numero_afiliado: r.numero_afiliado,
        },
      }));
      setJugadoresEquipoCap(jugs);
      // Carga sanciones activas de los jugadores del equipo para subrayar
      // visualmente y para que el botón eliminar quede deshabilitado.
      try {
        const sancs = await db(
          `/sanciones?equipo_id=eq.${equipoId}&partidos_pendientes=gt.0&select=jugador_id,partidos_pendientes`,
          token
        );
        const m = {};
        for (const s of (sancs || [])) m[s.jugador_id] = (m[s.jugador_id] || 0) + s.partidos_pendientes;
        setSancionesEquipoCap(m);
      } catch (_) { setSancionesEquipoCap({}); }
    } catch (e) { showToast(e.message, "err"); }
  };

  // Carga datos completos del equipo activo cuando cambia la selección
  useEffect(() => {
    if (!equipoCapActivoId) return;
    cargarEquipoCap(equipoCapActivoId);
    setModoEliminar(false);
  }, [equipoCapActivoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si salgo de la pantalla de gestión, desactivo el modo eliminar para no
  // dejarlo "encendido" la próxima vez que entre.
  useEffect(() => {
    if (seccion !== "mi-equipo") setModoEliminar(false);
  }, [seccion]);

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
    if (typeof tarjetaEscudoPreview === "string" && tarjetaEscudoPreview.startsWith("blob:")) URL.revokeObjectURL(tarjetaEscudoPreview);
    setTarjetaEscudoFile(file);
    setTarjetaEscudoPreview(URL.createObjectURL(file));
    showToast(`Logo "${file.name}" cargado ✓ se guardará con la tarjeta`);
  };

  const quitarTarjetaEscudo = () => {
    if (typeof tarjetaEscudoPreview === "string" && tarjetaEscudoPreview.startsWith("blob:")) URL.revokeObjectURL(tarjetaEscudoPreview);
    setTarjetaEscudoFile(null);
    setTarjetaEscudoPreview(null);
  };

  const guardarTarjetaEquipo = async () => {
    if (!equipoCapData) return;
    setGuardando(true);
    try {
      let escudo_url = tarjetaForm.escudo_url;
      if (tarjetaEscudoFile) {
        const ext = tarjetaEscudoFile.name.split(".").pop();
        const path = `escudos/${equipoCapData.id}-${Date.now()}.${ext}`;
        escudo_url = await uploadFile("imagenes", path, tarjetaEscudoFile, token, "escudo");
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
        // RPC: capitanes ya no pueden hacer SELECT directo sobre /jugadores con la nueva RLS.
        const filas = await db(`/rpc/buscar_jugador_por_afiliado`, token, {
          method: "POST",
          body: JSON.stringify({ p_afiliado: af }),
        });
        const jug = Array.isArray(filas) ? filas[0] : null;
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
    // Defensa en profundidad: el botón ya valida, pero si algo llega acá con un capitán, frenamos.
    if (eliminarTarget.es_capitan) {
      showToast("El capitán no puede ser eliminado. Pide al admin transferir la capitanía primero.", "err");
      setModalCap(null);
      setEliminarTarget(null);
      return;
    }
    // Bloqueo si el jugador tiene una sanción activa: no se le puede sacar
    // del equipo hasta que cumpla los partidos pendientes.
    try {
      const sancs = await db(
        `/sanciones?jugador_id=eq.${eliminarTarget.jugador_id}&equipo_id=eq.${equipoCapActivoId}&partidos_pendientes=gt.0&select=partidos_pendientes`,
        token
      );
      const pendientes = (sancs || []).reduce((acc, s) => acc + s.partidos_pendientes, 0);
      if (pendientes > 0) {
        showToast(`No se puede eliminar: jugador con sanción activa (${pendientes} partidos)`, "err");
        setModalCap(null);
        setEliminarTarget(null);
        return;
      }
    } catch (_) { /* si falla la consulta, permitir continuar */ }
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

      // Posiciones de goleo por liga (server-side: ranking estándar, solo nuestros datos)
      if (ligaIds.length > 0) {
        try {
          const filas = await db(`/rpc/posicion_goleo_ligas`, token, {
            method: "POST",
            body: JSON.stringify({ p_jugador_id: jugador.id, p_ligas: ligaIds }),
          });
          setPosicionesGoleo(Object.fromEntries((filas || []).map(f => [f.liga_id, { goles: f.goles, posicion: f.posicion }])));
        } catch (e) { /* falla silenciosa: las cards muestran "sin posición" */ }
      }
    } catch (e) { showToast(e.message, "err"); }
    setStatsLoading(false);
  };

  // Recarga cada vez que se entra a la sección o cambian las inscripciones,
  // para reflejar fichas recién cerradas o cambios del árbitro.
  useEffect(() => {
    if (seccion === "estadisticas" && jugador && inscripciones.length > 0) {
      cargarEstadisticas();
    }
  }, [seccion, jugador?.id, inscripciones.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: agrega un partido a un acumulador de stats { pj, goles, v, e, d }.
  const acumStats = (acc, p) => {
    acc.pj += p.presente ? 1 : 0;
    acc.goles += p.misGoles || 0;
    if (p.miMarcador > p.rivalMarcador) acc.v += 1;
    else if (p.miMarcador === p.rivalMarcador) acc.e += 1;
    else acc.d += 1;
    return acc;
  };
  const statsBase = () => ({ pj: 0, goles: 0, v: 0, e: 0, d: 0 });

  // Datos derivados para el selector y agregados
  const ligasInscrito = useMemo(() => {
    const map = new Map();
    inscripciones.forEach(i => {
      if (i.ligas) map.set(i.liga_id, { id: i.liga_id, nombre: i.ligas.nombre, equipo_id: i.equipo_id });
    });
    return [...map.values()];
  }, [inscripciones]);

  const hayHistorico = useMemo(
    () => partidosJugados.some(p => !p.activa),
    [partidosJugados]
  );

  // Universo de partidos según el ámbito (activas vs histórico completo).
  const partidosFiltrados = useMemo(() => {
    if (ambitoStats === "historico") return partidosJugados;
    return partidosJugados.filter(p => p.activa);
  }, [partidosJugados, ambitoStats]);

  const stats = useMemo(() => {
    const acc = partidosFiltrados.reduce(acumStats, statsBase());
    const promedio = acc.pj > 0 ? (acc.goles / acc.pj) : 0;
    const equipos = new Set(partidosFiltrados.map(p => p.miEquipo?.id).filter(Boolean)).size;
    return { ...acc, promedio, equipos, total: partidosFiltrados.length };
  }, [partidosFiltrados]);

  // ── Records personales (sobre el universo activo) ──
  const records = useMemo(() => {
    const ps = partidosFiltrados;
    // Mejor partido: mayor cantidad de goles del jugador (desempate: marcador favorable más amplio)
    let mejor = null;
    for (const p of ps) {
      if ((p.misGoles || 0) <= 0) continue;
      if (!mejor
        || p.misGoles > mejor.misGoles
        || (p.misGoles === mejor.misGoles && (p.miMarcador - p.rivalMarcador) > (mejor.miMarcador - mejor.rivalMarcador))) {
        mejor = p;
      }
    }
    const hatTricks = ps.filter(p => (p.misGoles || 0) >= 3).length;
    // Racha sin perder (más reciente hacia atrás): partidos consecutivos donde no perdió.
    const ordenadosDesc = [...ps].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    let racha = 0;
    for (const p of ordenadosDesc) {
      if (p.miMarcador >= p.rivalMarcador) racha += 1;
      else break;
    }
    // Rival al que más goles le anotó (por id de equipo rival).
    const golesVsRival = new Map();
    for (const p of ps) {
      if (!p.rival?.id) continue;
      const acum = golesVsRival.get(p.rival.id) || { rival: p.rival, goles: 0 };
      acum.goles += p.misGoles || 0;
      golesVsRival.set(p.rival.id, acum);
    }
    let rivalTop = null;
    for (const r of golesVsRival.values()) {
      if (!rivalTop || r.goles > rivalTop.goles) rivalTop = r;
    }
    return { mejor, hatTricks, racha, rivalTop };
  }, [partidosFiltrados]);

  // ── Agrupación por equipo ──
  const statsPorEquipo = useMemo(() => {
    const map = new Map();
    for (const p of partidosFiltrados) {
      if (!p.miEquipo?.id) continue;
      const cur = map.get(p.miEquipo.id) || { equipo: p.miEquipo, ...statsBase() };
      acumStats(cur, p);
      map.set(p.miEquipo.id, cur);
    }
    const arr = [...map.values()].map(s => ({ ...s, promedio: s.pj > 0 ? s.goles / s.pj : 0 }));
    arr.sort((a, b) => b.goles - a.goles || b.pj - a.pj);
    return arr;
  }, [partidosFiltrados]);

  // ── Agrupación por liga (con desglose interno por equipo) ──
  const statsPorLiga = useMemo(() => {
    const map = new Map();
    for (const p of partidosFiltrados) {
      if (!p.liga_id) continue;
      let cur = map.get(p.liga_id);
      if (!cur) {
        cur = {
          liga_id: p.liga_id,
          liga_nombre: p.liga_nombre,
          temporada: p.temporada,
          activa: p.activa,
          unidad: p.unidad,
          color: p.color_liga,
          ...statsBase(),
          porEquipo: new Map(),
        };
        map.set(p.liga_id, cur);
      }
      acumStats(cur, p);
      if (p.miEquipo?.id) {
        const eq = cur.porEquipo.get(p.miEquipo.id) || { equipo: p.miEquipo, ...statsBase() };
        acumStats(eq, p);
        cur.porEquipo.set(p.miEquipo.id, eq);
      }
    }
    const arr = [...map.values()].map(l => ({
      ...l,
      promedio: l.pj > 0 ? l.goles / l.pj : 0,
      porEquipo: [...l.porEquipo.values()].sort((a, b) => b.goles - a.goles),
    }));
    // Activas primero, luego por temporada descendente
    arr.sort((a, b) => (b.activa ? 1 : 0) - (a.activa ? 1 : 0) || (b.temporada || "").localeCompare(a.temporada || ""));
    return arr;
  }, [partidosFiltrados]);

  // ── Agrupación por unidad ──
  const statsPorUnidad = useMemo(() => {
    const map = new Map();
    for (const p of partidosFiltrados) {
      const key = p.unidad || "Sin unidad";
      let cur = map.get(key);
      if (!cur) cur = { unidad: key, ligas: new Set(), equipos: new Set(), ...statsBase() };
      acumStats(cur, p);
      cur.ligas.add(p.liga_id);
      if (p.miEquipo?.id) cur.equipos.add(p.miEquipo.id);
      map.set(key, cur);
    }
    const arr = [...map.values()].map(u => ({ ...u, promedio: u.pj > 0 ? u.goles / u.pj : 0, ligasCount: u.ligas.size, equiposCount: u.equipos.size }));
    arr.sort((a, b) => b.goles - a.goles || b.pj - a.pj);
    return arr;
  }, [partidosFiltrados]);

  // Máximo para escalar el bar chart (ancho relativo de las barras).
  const maxGolesEquipo = useMemo(() => Math.max(1, ...statsPorEquipo.map(s => s.goles)), [statsPorEquipo]);
  const maxGolesLiga = useMemo(() => Math.max(1, ...statsPorLiga.map(s => s.goles)), [statsPorLiga]);

  // Mejor posición de goleo entre todas las ligas (menor número de posición; desempate por más goles).
  // Solo cuenta ligas donde anotó al menos un gol — "ser 1° con 0 goles" no es presumible.
  const mejorPosicion = useMemo(() => {
    const ligaPorId = new Map(statsPorLiga.map(l => [l.liga_id, l]));
    const candidatos = Object.entries(posicionesGoleo)
      .filter(([liga_id, p]) => p.goles > 0 && ligaPorId.has(liga_id))
      .map(([liga_id, p]) => ({ liga_id, ...p, liga: ligaPorId.get(liga_id) }));
    if (candidatos.length === 0) return null;
    candidatos.sort((a, b) => a.posicion - b.posicion || b.goles - a.goles);
    return candidatos[0];
  }, [posicionesGoleo, statsPorLiga]);

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

  // Derivado para encabezado + bloque mi-equipo
  const inscActivaTop = inscripciones.find(i => i.equipo_id === equipoCapActivoId);
  const esCapitanDelActivoTop = !!inscActivaTop?.es_capitan;

  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {toast && <div style={{ ...s.toast, background: toast.tipo === "err" ? "#ef4444" : "#4ade80", color: toast.tipo === "err" ? "#fff" : "#0d0d1a" }}>{toast.msg}</div>}

      <div style={seccion === "ligas" ? { ...s.header, padding: "14px 24px" } : s.header}>
        {seccion !== "perfil" && seccion !== "ligas" && (seccion !== "mi-equipo" || esCapitanDelActivoTop) && (
          <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.7)", textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>
            {seccion === "mi-equipo" ? "Capitán de equipo" : "Tu rendimiento"}
          </div>
        )}
        <h2 style={s.title}>
          {seccion === "perfil" ? "🏃 Mi Perfil" : seccion === "mi-equipo" ? (esCapitanDelActivoTop ? "👑 Mi Equipo" : "Mi Equipo") : seccion === "estadisticas" ? "📊 Mis Estadísticas" : "🏆 Mis Torneos"}
        </h2>
        {seccion !== "ligas" && (
          <p style={s.sub}>
            {seccion === "perfil"
              ? "Tu identidad en la plataforma"
              : seccion === "mi-equipo"
                ? (esCapitanDelActivoTop ? "Gestiona la lista y la tarjeta de tu equipo" : "Tu equipo y compañeros")
                : "Goles, partidos y resultados"}
          </p>
        )}
        {seccion === "estadisticas" && (
          <button
            onClick={cargarEstadisticas}
            disabled={statsLoading}
            style={s.btnRefreshHeader}
            title="Actualizar estadísticas"
            aria-label="Actualizar estadísticas">
            {/* translate compensa el offset visual del emoji 🔄 dentro de su caja */}
            <span style={{ display: "inline-block", transform: "translate(1px, 1px)" }}>🔄</span>
          </button>
        )}
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
                  {/* Check verde cuando la foto es nueva (blob) y aún no se guardó */}
                  {editando && typeof fotoPreview === "string" && fotoPreview.startsWith("blob:") && (
                    <span title="Foto lista. Se guardará al confirmar."
                      style={{ position:"absolute", top:-2, right:-2, width:22, height:22, borderRadius:"50%", background:"#16a34a", color:"#fff", fontSize:12, fontWeight:900, display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid #fff", boxShadow:"0 2px 6px rgba(0,0,0,0.18)" }}>
                      ✓
                    </span>
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
                      <div style={s.inscripcionLiga}>🏆 {ins.ligas?.nombre}</div>
                      <div style={s.inscripcionDiaTurno}>📅 {ins.ligas?.dia} · {ins.ligas?.turno}</div>
                    </div>
                  </div>
                  <div style={s.inscripcionRight}>
                    <div style={s.dorsalCard}>
                      {ins.es_capitan && <div style={s.capitanBadgeMini}>👑 CAPITÁN</div>}
                      <div style={{ ...s.dorsalNum, background: ins.equipos?.color_playera || "#3182ce" }}>{ins.dorsal}</div>
                      <div style={s.dorsalNombreCamiseta}>{ins.nombre_camiseta}</div>
                      <button
                        style={ins.es_capitan ? s.btnGestionarEquipo : s.btnGestionarSimple}
                        onClick={() => { setEquipoCapActivoId(ins.equipo_id); setSeccion("mi-equipo"); }}>
                        Gestionar →
                      </button>
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
          ) : partidosFiltrados.length === 0 && ambitoStats === "activas" ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>⏳</div>
              <div style={s.emptyTxt}>Aún no has jugado partidos</div>
              <p style={{ color:"#9ca3af", fontSize:13, margin:0 }}>Tus estadísticas aparecerán cuando el árbitro cierre tu primera ficha.</p>
              {hayHistorico && (
                <button style={{ ...s.btnGestionarSimple, marginTop: 12 }} onClick={() => setAmbitoStats("historico")}>
                  Ver mi histórico →
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Toggle ámbito */}
              {hayHistorico && (
                <div style={s.statsToggle}>
                  <button onClick={() => setAmbitoStats("activas")}
                    style={{ ...s.statsToggleBtn, ...(ambitoStats === "activas" ? s.statsToggleBtnActive : {}) }}>
                    ⚡ Activas
                  </button>
                  <button onClick={() => setAmbitoStats("historico")}
                    style={{ ...s.statsToggleBtn, ...(ambitoStats === "historico" ? s.statsToggleBtnActive : {}) }}>
                    📜 Histórico
                  </button>
                </div>
              )}

              {/* Hero */}
              <div style={s.statsHero}>
                <div style={s.statsHeroRow}>
                  <div style={s.statsHeroBig}>
                    <div style={s.statsHeroBigVal}>{stats.goles}</div>
                    <div style={s.statsHeroBigLbl}>⚽ Goles</div>
                  </div>
                  <div style={s.statsHeroBig}>
                    <div style={s.statsHeroBigVal}>{stats.pj}</div>
                    <div style={s.statsHeroBigLbl}>👟 Partidos</div>
                  </div>
                  <div style={s.statsHeroBig}>
                    <div style={s.statsHeroBigVal}>{stats.promedio.toFixed(2)}</div>
                    <div style={s.statsHeroBigLbl}>📈 G/P</div>
                  </div>
                </div>
                <div style={s.statsHeroVED}>
                  <div style={{ ...s.statsHeroVEDChip, background: "#dcfce7", color: "#16a34a" }}>{stats.v} V</div>
                  <div style={{ ...s.statsHeroVEDChip, background: "#fef9c3", color: "#a16207" }}>{stats.e} E</div>
                  <div style={{ ...s.statsHeroVEDChip, background: "#fee2e2", color: "#dc2626" }}>{stats.d} D</div>
                </div>
              </div>

              {/* Tabs */}
              <div style={s.statsTabs}>
                {[
                  { k: "resumen", lbl: "📊 Resumen" },
                  { k: "equipos", lbl: "👕 Equipos" },
                  { k: "ligas",   lbl: "🏆 Ligas"   },
                  { k: "unidades",lbl: "📍 Unidades" },
                ].map(t => (
                  <button key={t.k} onClick={() => setTabStats(t.k)}
                    style={{ ...s.statsTabBtn, ...(tabStats === t.k ? s.statsTabBtnActive : {}) }}>
                    {t.lbl}
                  </button>
                ))}
              </div>

              {/* Contenido por tab */}
              {tabStats === "resumen" && (
                <div style={s.recordsGrid}>
                  <div style={s.recordCard}>
                    <div style={s.recordIcon}>🏆</div>
                    <div style={s.recordLbl}>Mejor partido</div>
                    {records.mejor ? (
                      <>
                        <div style={s.recordVal}>{records.mejor.misGoles} {records.mejor.misGoles === 1 ? "gol" : "goles"}</div>
                        <div style={s.recordSub}>{records.mejor.miEquipo?.nombre} {records.mejor.miMarcador}-{records.mejor.rivalMarcador} {records.mejor.rival?.nombre}</div>
                      </>
                    ) : <div style={s.recordVal}>—</div>}
                  </div>
                  <div style={s.recordCard}>
                    <div style={s.recordIcon}>🎯</div>
                    <div style={s.recordLbl}>Hat-tricks</div>
                    <div style={s.recordVal}>{records.hatTricks}</div>
                    <div style={s.recordSub}>{records.hatTricks === 1 ? "partido con 3+ goles" : "partidos con 3+ goles"}</div>
                  </div>
                  <div style={s.recordCard}>
                    <div style={s.recordIcon}>🔥</div>
                    <div style={s.recordLbl}>Racha sin perder</div>
                    <div style={s.recordVal}>{records.racha}</div>
                    <div style={s.recordSub}>{records.racha === 1 ? "partido consecutivo" : "partidos consecutivos"}</div>
                  </div>
                  <div style={s.recordCard}>
                    <div style={s.recordIcon}>⚔️</div>
                    <div style={s.recordLbl}>Tu víctima favorita</div>
                    {records.rivalTop && records.rivalTop.goles > 0 ? (
                      <>
                        <div style={s.recordVal}>{records.rivalTop.goles} {records.rivalTop.goles === 1 ? "gol" : "goles"}</div>
                        <div style={s.recordSub}>vs {records.rivalTop.rival?.nombre}</div>
                      </>
                    ) : <div style={s.recordVal}>—</div>}
                  </div>
                  <div style={{ ...s.recordCard, gridColumn: "1 / -1" }}>
                    <div style={s.recordIcon}>🥇</div>
                    <div style={s.recordLbl}>Mejor posición de goleo</div>
                    {mejorPosicion ? (
                      <>
                        <div style={s.recordVal}>{mejorPosicion.posicion}°</div>
                        <div style={s.recordSub}>{mejorPosicion.liga?.liga_nombre} · {mejorPosicion.goles} {mejorPosicion.goles === 1 ? "gol" : "goles"}</div>
                      </>
                    ) : (
                      <>
                        <div style={s.recordVal}>—</div>
                        <div style={s.recordSub}>Aún no has anotado</div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {tabStats === "equipos" && (
                <div>
                  {statsPorEquipo.length === 0 ? (
                    <div style={s.empty}><div style={s.emptyTxt}>Sin datos en esta selección</div></div>
                  ) : (
                    <>
                      {/* Bar chart */}
                      <div style={s.barChart}>
                        <div style={s.barChartTitle}>Goles por equipo</div>
                        {statsPorEquipo.map(e => (
                          <div key={e.equipo.id} style={s.barRow}>
                            <span style={s.barLbl}>{e.equipo.nombre}</span>
                            <div style={s.barTrack}>
                              <div style={{ ...s.barFill, width: `${(e.goles / maxGolesEquipo) * 100}%`, background: e.equipo.color_playera || GREEN }} />
                            </div>
                            <span style={s.barVal}>{e.goles}</span>
                          </div>
                        ))}
                      </div>
                      {/* Cards */}
                      <div style={s.grupoCards}>
                        {statsPorEquipo.map(e => (
                          <div key={e.equipo.id} style={{ ...s.grupoCard, borderLeft: `4px solid ${e.equipo.color_playera || GREEN}` }}>
                            <div style={s.grupoCardTop}>
                              <div style={s.grupoCardLogo}>
                                {e.equipo.escudo_url
                                  ? <img src={e.equipo.escudo_url} alt="" style={s.grupoCardLogoImg} />
                                  : <div style={{ ...s.grupoCardLogoPh, background: e.equipo.color_playera || "#3182ce" }}>{e.equipo.nombre?.[0]}</div>}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={s.grupoCardNombre}>{e.equipo.nombre}</div>
                                <div style={s.grupoCardMeta}>{e.pj} PJ · {e.goles} {e.goles === 1 ? "gol" : "goles"} · {e.promedio.toFixed(2)} g/p</div>
                              </div>
                            </div>
                            <div style={s.grupoCardVED}>
                              <span style={{ ...s.vedChip, color: "#16a34a" }}>{e.v} V</span>
                              <span style={{ ...s.vedChip, color: "#a16207" }}>{e.e} E</span>
                              <span style={{ ...s.vedChip, color: "#dc2626" }}>{e.d} D</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {tabStats === "ligas" && (
                <div>
                  {statsPorLiga.length === 0 ? (
                    <div style={s.empty}><div style={s.emptyTxt}>Sin datos en esta selección</div></div>
                  ) : (
                    <>
                      <div style={s.barChart}>
                        <div style={s.barChartTitle}>Goles por liga</div>
                        {statsPorLiga.map(l => (
                          <div key={l.liga_id} style={s.barRow}>
                            <span style={s.barLbl}>{l.liga_nombre}</span>
                            <div style={s.barTrack}>
                              <div style={{ ...s.barFill, width: `${(l.goles / maxGolesLiga) * 100}%`, background: l.color || GREEN }} />
                            </div>
                            <span style={s.barVal}>{l.goles}</span>
                          </div>
                        ))}
                      </div>
                      <div style={s.grupoCards}>
                        {statsPorLiga.map(l => {
                          const c = l.color || GREEN;
                          const pos = posicionesGoleo[l.liga_id];
                          return (
                          <div key={l.liga_id} style={s.ligaCard}>
                            {/* Banner con color de la liga */}
                            <div style={{ ...s.ligaCardBanner, background: `linear-gradient(135deg, rgba(255,255,255,0.18), rgba(0,0,0,0.18)), ${c}` }}>
                              <div style={s.ligaCardBannerTop}>
                                {l.activa
                                  ? <span style={s.ligaCardBannerTag}>● ACTIVA</span>
                                  : l.temporada && <span style={s.ligaCardBannerTag}>{l.temporada}</span>}
                              </div>
                              <div style={s.ligaCardBannerTitle}>{l.liga_nombre}</div>
                              <div style={s.ligaCardBannerMeta}>📍 {l.unidad || "Sin unidad"}</div>
                            </div>

                            {/* Cuerpo */}
                            <div style={s.ligaCardBody}>
                              {/* Stats grandes */}
                              <div style={s.ligaStatsRow}>
                                <div style={s.ligaStat}>
                                  <div style={s.ligaStatVal}>{l.pj}</div>
                                  <div style={s.ligaStatLbl}>👟 PJ</div>
                                </div>
                                <div style={s.ligaStat}>
                                  <div style={s.ligaStatVal}>{l.goles}</div>
                                  <div style={s.ligaStatLbl}>⚽ Goles</div>
                                </div>
                                <div style={s.ligaStat}>
                                  <div style={s.ligaStatVal}>{l.promedio.toFixed(2)}</div>
                                  <div style={s.ligaStatLbl}>📈 G/P</div>
                                </div>
                              </div>

                              {/* Posición de goleo destacada */}
                              {pos?.goles > 0 ? (
                                <div style={s.ligaPosCard}>
                                  <div style={s.ligaPosLeft}>
                                    <div style={s.ligaPosIcon}>🥇</div>
                                    <div>
                                      <div style={s.ligaPosLbl}>Tu posición de goleo</div>
                                      <div style={s.ligaPosSub}>{pos.goles} {pos.goles === 1 ? "gol" : "goles"} anotados</div>
                                    </div>
                                  </div>
                                  <div style={s.ligaPosVal}>{pos.posicion}°</div>
                                </div>
                              ) : (
                                <div style={s.ligaPosCardEmpty}>
                                  <span style={{ fontSize: 18 }}>🥇</span>
                                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#92400e" }}>Sin anotar todavía en esta liga</span>
                                </div>
                              )}

                              {/* V / E / D */}
                              <div style={s.ligaVEDRow}>
                                <div style={{ ...s.ligaVEDChip, background: "#dcfce7", color: "#16a34a", borderColor: "#86efac" }}>
                                  <span style={s.ligaVEDChipNum}>{l.v}</span>
                                  <span style={s.ligaVEDChipLbl}>Victorias</span>
                                </div>
                                <div style={{ ...s.ligaVEDChip, background: "#fef9c3", color: "#a16207", borderColor: "#fde68a" }}>
                                  <span style={s.ligaVEDChipNum}>{l.e}</span>
                                  <span style={s.ligaVEDChipLbl}>Empates</span>
                                </div>
                                <div style={{ ...s.ligaVEDChip, background: "#fee2e2", color: "#dc2626", borderColor: "#fca5a5" }}>
                                  <span style={s.ligaVEDChipNum}>{l.d}</span>
                                  <span style={s.ligaVEDChipLbl}>Derrotas</span>
                                </div>
                              </div>

                              {/* Desglose por equipo si jugó con más de uno en esta liga */}
                              {l.porEquipo.length > 1 && (
                                <div style={s.subgrupo}>
                                  <div style={s.subgrupoTitle}>Tus equipos en esta liga</div>
                                  {l.porEquipo.map(eq => (
                                    <div key={eq.equipo.id} style={s.subgrupoRow}>
                                      <span style={{ ...s.subgrupoDot, background: eq.equipo.color_playera || "#3182ce" }} />
                                      <span style={s.subgrupoNombre}>{eq.equipo.nombre}</span>
                                      <span style={s.subgrupoMeta}>{eq.pj} PJ · {eq.goles} {eq.goles === 1 ? "gol" : "goles"}</span>
                                    </div>
                                  ))}
                                </div>
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

              {tabStats === "unidades" && (
                <div>
                  {statsPorUnidad.length === 0 ? (
                    <div style={s.empty}><div style={s.emptyTxt}>Sin datos en esta selección</div></div>
                  ) : (
                    <div style={s.grupoCards}>
                      {statsPorUnidad.map(u => (
                        <div key={u.unidad} style={{ ...s.grupoCard, borderLeft: `4px solid ${GREEN}` }}>
                          <div style={s.grupoCardNombre}>📍 {u.unidad}</div>
                          <div style={s.grupoCardMeta}>{u.pj} PJ · {u.goles} {u.goles === 1 ? "gol" : "goles"} · {u.promedio.toFixed(2)} g/p</div>
                          <div style={s.grupoCardMeta}>{u.ligasCount} {u.ligasCount === 1 ? "liga" : "ligas"} · {u.equiposCount} {u.equiposCount === 1 ? "equipo" : "equipos"}</div>
                          <div style={s.grupoCardVED}>
                            <span style={{ ...s.vedChip, color: "#16a34a" }}>{u.v} V</span>
                            <span style={{ ...s.vedChip, color: "#a16207" }}>{u.e} E</span>
                            <span style={{ ...s.vedChip, color: "#dc2626" }}>{u.d} D</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Acordeón de detalle */}
              <div style={{ marginTop: 24 }}>
                <button style={s.detalleToggle} onClick={() => setPartidosOpen(o => !o)}>
                  📋 Ver mis {partidosFiltrados.length} {partidosFiltrados.length === 1 ? "partido" : "partidos"} {partidosOpen ? "▲" : "▼"}
                </button>
                {partidosOpen && (
                  <div style={{ ...s.partidosList, marginTop: 12 }}>
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

      {/* ── SECCIÓN MI EQUIPO ── */}
      {seccion === "mi-equipo" && (() => {
        if (inscripciones.length === 0) {
          return (
            <div style={s.empty}>
              <div style={s.emptyIcon}>👕</div>
              <div style={s.emptyTxt}>No estás inscrito en ningún equipo</div>
              <p style={{ color:"#9ca3af", fontSize:13, margin:0 }}>
                Pídele a un capitán que te inscriba con tu número de afiliado.
              </p>
            </div>
          );
        }
        // ¿Soy capitán del equipo que estoy gestionando ahora mismo?
        const inscActiva = inscripciones.find(i => i.equipo_id === equipoCapActivoId);
        const esCapitanDelActivo = !!inscActiva?.es_capitan;
        // Orden: capitán arriba, luego "yo" (para que el jugador no se ande buscando), resto por dorsal.
        const miJugadorId = jugador?.id;
        const jugadoresOrdenados = [...jugadoresEquipoCap].sort((a, b) => {
          if (a.es_capitan && !b.es_capitan) return -1;
          if (!a.es_capitan && b.es_capitan) return 1;
          if (a.jugador_id === miJugadorId && b.jugador_id !== miJugadorId) return -1;
          if (b.jugador_id === miJugadorId && a.jugador_id !== miJugadorId) return 1;
          return (a.dorsal ?? 999) - (b.dorsal ?? 999);
        });
        return (
          <div>
            {/* Selector de equipo: solo si soy capitán de varios (el jugador llega con uno fijo) */}
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
                  {/* Logo del equipo a la izquierda */}
                  <div style={s.equipoCardLogo}>
                    {equipoCapData.escudo_url
                      ? <img src={equipoCapData.escudo_url} alt="escudo" style={s.equipoCardLogoImg} />
                      : <div style={{ ...s.equipoCardLogoPlaceholder, background: equipoCapData.color_playera || "#3182ce" }}>
                          {(equipoCapData.nombre || "?")[0]}
                        </div>}
                  </div>
                  <div style={{ minWidth: 0, flexShrink: 1 }}>
                    <div style={s.equipoCardCapNombre}>{equipoCapData.nombre}</div>
                    <div style={s.equipoCardCapMeta}>
                      {jugadoresEquipoCap.length} / 17 jugadores
                    </div>
                  </div>
                  {/* Camiseta a la derecha (sin escudo dentro para no duplicar) */}
                  <div style={{ marginLeft: "auto", flexShrink: 0 }}>
                    <JerseySVG
                      diseno={equipoCapData.diseno_camiseta || "solido"}
                      color1={equipoCapData.color_playera || "#3182ce"}
                      color2={equipoCapData.color_camiseta_2 || "#ffffff"}
                      escudoUrl={null}
                      size={56}
                    />
                  </div>
                </div>
                {esCapitanDelActivo && (
                  <button style={s.btnEditarTarjeta} onClick={abrirEditarTarjeta}>
                    🎨 Editar tarjeta del equipo
                  </button>
                )}
              </div>
            )}

            {/* Acciones de jugadores */}
            <div style={s.secHeader}>
              <span style={s.secCount}>Jugadores</span>
              {!esCapitanDelActivo && inscActiva && (
                <button style={s.btnDelete} onClick={() => setConfirmDesinsc(inscActiva)}>
                  Salir
                </button>
              )}
              {esCapitanDelActivo && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={s.btnAdd}
                    onClick={() => { setAnadirAfiliados(""); setAnadirCandidatos([]); setModalCap("anadir_input"); }}
                    disabled={jugadoresEquipoCap.length >= 17}>
                    + Añadir
                  </button>
                  <button
                    style={modoEliminar ? s.btnDeleteActive : s.btnDelete}
                    onClick={() => setModoEliminar(v => !v)}>
                    {modoEliminar ? "Listo" : "Sacar"}
                  </button>
                </div>
              )}
            </div>

            {jugadoresEquipoCap.length === 0 ? (
              <div style={s.empty}>
                <div style={s.emptyIcon}>🏃</div>
                <div style={s.emptyTxt}>Aún no hay jugadores en este equipo</div>
                {esCapitanDelActivo && (
                  <p style={{ color:"#9ca3af", fontSize:13, margin:0 }}>
                    Añádelos con su número de afiliado.
                  </p>
                )}
              </div>
            ) : (
              <div style={s.jugadorListCap}>
                {jugadoresOrdenados.map(je => {
                  // Los datos personales (nombre real + afiliado) solo los ve el capitán y el propio jugador.
                  // El resto del equipo solo ve foto, nombre en camiseta y dorsal.
                  const verDatosPersonales = esCapitanDelActivo || je.jugador_id === miJugadorId;
                  const sancPend = sancionesEquipoCap[je.jugador_id] || 0;
                  const sancionado = sancPend > 0;
                  return (
                  <div key={je.id} style={{
                    ...s.jugadorRowCap,
                    ...(je.es_capitan ? { borderLeft: `4px solid #f59e0b`, background: "linear-gradient(90deg, #fffbeb 0%, #ffffff 60%)" } : { borderLeft: `4px solid ${equipoCapData?.color_playera || "#3182ce"}` }),
                    ...(sancionado ? { background: "linear-gradient(90deg, rgba(127,29,29,0.06) 0%, #ffffff 60%)", opacity: 0.7 } : {}),
                  }}>
                    <div style={s.jugadorAvatarCap}>
                      {je.jugadores?.foto_url
                        ? <img src={je.jugadores.foto_url} alt="foto" style={s.jugadorFotoCap} />
                        : <div style={s.jugadorFotoPlaceholderCap}>🏃</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...s.jugadorNombreCap, textDecoration: sancionado ? "underline" : "none", textDecorationColor: "#dc2626" }}>
                        {je.es_capitan && <span style={{ marginRight: 5 }}>👑</span>}
                        {verDatosPersonales ? je.jugadores?.nombre_completo : je.nombre_camiseta}
                      </div>
                      {verDatosPersonales && (
                        <div style={s.jugadorMetaCap}>
                          #{je.jugadores?.numero_afiliado} · {je.nombre_camiseta}
                        </div>
                      )}
                      {sancionado && (
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#7f1d1d", marginTop: 3 }}>
                          🟥 Sancionado · {sancPend} {sancPend === 1 ? "partido" : "partidos"}
                        </div>
                      )}
                    </div>
                    {/* Botón ✏️ solo en mi propia fila, para editar mi dorsal/camiseta */}
                    {je.jugador_id === miJugadorId && inscActiva && (
                      <button style={s.btnEditarMiFila}
                        onClick={() => abrirEditarInsc(inscActiva)}
                        title="Editar mi dorsal y nombre">
                        ✏️
                      </button>
                    )}
                    {esCapitanDelActivo ? (
                      <button
                        style={{ ...s.dorsalBtn, background: equipoCapData?.color_playera || "#3182ce" }}
                        onClick={() => { setDorsalTarget(je); setDorsalNuevo(je.dorsal || ""); setModalCap("dorsal"); }}
                        title="Cambiar dorsal">
                        {je.dorsal || "—"}
                      </button>
                    ) : (
                      <div style={{ ...s.dorsalBtn, background: equipoCapData?.color_playera || "#3182ce", cursor: "default" }}>
                        {je.dorsal || "—"}
                      </div>
                    )}
                    {esCapitanDelActivo && modoEliminar && (
                      <button style={{ ...s.btnEliminarCap, ...((je.es_capitan || sancionado) ? { opacity: 0.45, cursor: "not-allowed" } : {}) }}
                        onClick={() => {
                          if (je.es_capitan) {
                            showToast("El capitán no puede eliminarse. Pide al admin transferir la capitanía primero.", "err");
                            return;
                          }
                          if (sancionado) {
                            showToast(`Jugador con sanción activa (${sancPend} partidos restantes)`, "err");
                            return;
                          }
                          setEliminarTarget(je);
                          setModalCap("eliminar");
                        }}
                        title={je.es_capitan ? "El capitán no puede eliminarse" : sancionado ? `Sancionado: ${sancPend} partidos restantes` : "Eliminar del equipo"}>
                        🗑️
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <label style={s.uploadLabelCap}>
                    📁 {tarjetaEscudoPreview ? "Cambiar logo" : "Subir logo del equipo"}
                    <input type="file" accept="image/*" onChange={handleTarjetaEscudoChange} style={{ display: "none" }} />
                  </label>
                  {tarjetaEscudoPreview && (
                    <button type="button" onClick={quitarTarjetaEscudo}
                      style={{ background: "transparent", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "5px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                      ✕ Quitar
                    </button>
                  )}
                </div>
                {typeof tarjetaEscudoPreview === "string" && tarjetaEscudoPreview.startsWith("blob:") ? (
                  <p style={{ color: "#16a34a", fontSize: 11.5, marginTop: 6, fontWeight: 600 }}>
                    ✓ Logo listo. Se subirá al guardar.
                  </p>
                ) : (
                  <p style={{ color: "#9ca3af", fontSize: 11, marginTop: 6 }}>PNG o JPG. Aparece en la camiseta.</p>
                )}
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
              <ColorPicker
                colores={COLORES_CAMISETA}
                valor={tarjetaForm.color_playera}
                onChange={c => setTarjetaForm({ ...tarjetaForm, color_playera: c })}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Color secundario</label>
              <ColorPicker
                colores={COLORES_SECUNDARIOS}
                valor={tarjetaForm.color_camiseta_2}
                onChange={c => setTarjetaForm({ ...tarjetaForm, color_camiseta_2: c })}
              />
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
              <p style={{ color:"#1d4ed8", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, padding:"8px 10px", fontSize:12.5, marginTop:10, marginBottom:0 }}>
                ℹ️ Tus partidos jugados y estadísticas quedarán en tu historial.
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
  header: { position: "relative", marginBottom: 24, padding: "20px 24px", background: `linear-gradient(135deg, ${GREEN} 0%, #7fbf4d 100%)`, borderRadius: 16, boxShadow: "0 4px 16px rgba(79,143,47,0.3)" },
  // Botón redondo translúcido anclado a la esquina inferior derecha del encabezado.
  // Wrapper centra el emoji con flex; los <span> internos hacen el microajuste para
  // compensar el offset natural del glifo 🔄 (Segoe UI Emoji queda alto a la izquierda).
  btnRefreshHeader: { position: "absolute", bottom: 12, right: 12, width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.18)", color: "#fff", fontSize: 22, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
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
  // Botones rojos sólidos para acciones destructivas (Salir/Sacar). El modo "activo"
  // del Sacar usa un rojo más oscuro para distinguir que estás en modo selección.
  btnDelete: { background: "#dc2626", color: "#ffffff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 2px 8px rgba(220,38,38,0.30)" },
  btnDeleteActive: { background: "#991b1b", color: "#ffffff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 2px 10px rgba(153,27,27,0.45)" },
  empty: { textAlign: "center", padding: "60px 20px" },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTxt: { color: "#6b7280", fontSize: 15, marginBottom: 20, fontWeight: 600 },
  inscripcionesList: { display: "flex", flexDirection: "column", gap: 12 },
  inscripcionCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  inscripcionLeft: { display: "flex", alignItems: "center", gap: 16 },
  escudoWrap: { width: 72, height: 72, borderRadius: 14, overflow: "hidden", flexShrink: 0 },
  escudoImg: { width: "100%", height: "100%", objectFit: "cover" },
  escudoPlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff" },
  inscripcionEquipo: { fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 4 },
  inscripcionLiga: { fontSize: 13, color: "#6b7280" },
  inscripcionDiaTurno: { fontSize: 12.5, color: "#6b7280", marginTop: 2 },
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
  // Versión compacta del badge para ponerlo encima del dorsal en la tarjeta de torneo.
  capitanBadgeMini: { background: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)", color: "#fff", fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, padding: "3px 7px", borderRadius: 10, boxShadow: "0 1px 4px rgba(245,158,11,0.35)", whiteSpace: "nowrap", textAlign: "center" },
  btnGestionarEquipo: { background: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)", color: "#fff", border: "none", borderRadius: 10, padding: "7px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 8px rgba(245,158,11,0.35)", whiteSpace: "nowrap", textAlign: "center", marginTop: 2 },
  // Botón gestionar para jugadores sin capitanía: outline en verde de marca para que se note.
  btnGestionarSimple: { background: "#ffffff", color: GREEN, border: `1.5px solid ${GREEN}`, borderRadius: 10, padding: "7px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", textAlign: "center", marginTop: 2 },
  capSelector: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 },
  capSelectorTab: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "7px 14px", color: "#6b7280", fontSize: 13, cursor: "pointer", fontWeight: 600 },
  capSelectorTabActive: { background: "#f0fdf4", borderColor: GREEN, color: GREEN },
  equipoCardCap: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, marginBottom: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  equipoCardCapTop: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 },
  // Logo del equipo: cuadrado redondeado a la izquierda de la tarjeta de gestión.
  equipoCardLogo: { width: 84, height: 84, borderRadius: 14, overflow: "hidden", flexShrink: 0, border: `1px solid ${BORDER}`, background: SURFACE },
  equipoCardLogoImg: { width: "100%", height: "100%", objectFit: "cover" },
  equipoCardLogoPlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff" },
  equipoCardCapNombre: { fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 4 },
  equipoCardCapMeta: { fontSize: 13, color: "#6b7280" },
  btnEditarTarjeta: { width: "100%", background: "#f9fafb", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 16px", color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  jugadorListCap: { display: "flex", flexDirection: "column", gap: 10 },
  jugadorRowCap: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 },
  jugadorAvatarCap: { flexShrink: 0 },
  jugadorFotoCap: { width: 40, height: 40, borderRadius: "50%", objectFit: "cover" },
  jugadorFotoPlaceholderCap: { width: 40, height: 40, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 },
  jugadorNombreCap: { fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  jugadorMetaCap: { fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  // display:flex + center sirve tanto para el <button> del capitán como para el <div> del no-capitán.
  dorsalBtn: { width: 40, height: 40, borderRadius: 10, border: "none", color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  // ✏️ que aparece solo en la fila del propio jugador para editar dorsal/camiseta.
  btnEditarMiFila: { background: "#eff6ff", color: "#2563eb", border: "1px solid #93c5fd", borderRadius: 8, padding: "8px 10px", fontSize: 14, cursor: "pointer", flexShrink: 0 },
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
  // ── Estadísticas ──
  // Toggle Activas / Histórico
  statsToggle: { display: "flex", gap: 6, padding: 4, background: "#f3f4f6", borderRadius: 12, marginBottom: 14 },
  statsToggleBtn: { flex: 1, background: "transparent", border: "none", borderRadius: 9, padding: "8px 12px", color: "#6b7280", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  statsToggleBtnActive: { background: "#ffffff", color: GREEN, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  // Hero: cards principales agregadas
  statsHero: { background: "linear-gradient(135deg, #f0fdf4 0%, #e8f5e1 100%)", border: "1px solid #c3e6a3", borderRadius: 16, padding: "18px 16px", marginBottom: 16, boxShadow: "0 2px 10px rgba(79,143,47,0.10)" },
  statsHeroRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 },
  statsHeroBig: { textAlign: "center" },
  statsHeroBigVal: { fontSize: 30, fontWeight: 900, color: GREEN, letterSpacing: -0.8, lineHeight: 1 },
  statsHeroBigLbl: { fontSize: 11, color: "#6b7280", fontWeight: 600, marginTop: 4 },
  statsHeroVED: { display: "flex", gap: 6, justifyContent: "center" },
  statsHeroVEDChip: { padding: "4px 12px", borderRadius: 14, fontSize: 12, fontWeight: 800, letterSpacing: 0.4 },
  // Tabs
  statsTabs: { display: "flex", gap: 4, padding: 4, background: "#f3f4f6", borderRadius: 12, marginBottom: 16, overflowX: "auto" },
  statsTabBtn: { flex: "1 1 auto", background: "transparent", border: "none", borderRadius: 9, padding: "8px 10px", color: "#6b7280", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  // Tab activo: relleno verde sólido para que destaque sin ambigüedad.
  statsTabBtnActive: { background: GREEN, color: "#ffffff", boxShadow: "0 2px 8px rgba(79,143,47,0.35)" },
  // Records (tab Resumen)
  recordsGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 },
  recordCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" },
  recordIcon: { fontSize: 22, lineHeight: 1 },
  recordLbl: { fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 },
  recordVal: { fontSize: 22, fontWeight: 900, color: "#111827", letterSpacing: -0.4, lineHeight: 1.1 },
  recordSub: { fontSize: 11.5, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  // Bar chart (CSS plano)
  barChart: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, marginBottom: 14 },
  barChartTitle: { fontSize: 12, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  barRow: { display: "grid", gridTemplateColumns: "minmax(80px, 35%) 1fr auto", alignItems: "center", gap: 8, marginBottom: 6 },
  barLbl: { fontSize: 12, color: "#374151", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  barTrack: { height: 14, background: "#f3f4f6", borderRadius: 7, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 7, transition: "width 0.4s ease" },
  barVal: { fontSize: 12, fontWeight: 800, color: "#111827", minWidth: 24, textAlign: "right" },
  // Cards de agrupación (equipos / ligas / unidades)
  grupoCards: { display: "flex", flexDirection: "column", gap: 10 },
  grupoCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" },
  grupoCardTop: { display: "flex", alignItems: "center", gap: 12 },
  grupoCardLogo: { width: 44, height: 44, borderRadius: 10, overflow: "hidden", flexShrink: 0, border: `1px solid ${BORDER}` },
  grupoCardLogoImg: { width: "100%", height: "100%", objectFit: "cover" },
  grupoCardLogoPh: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#fff" },
  grupoCardNombre: { fontSize: 15, fontWeight: 800, color: "#111827", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  grupoCardMeta: { fontSize: 12.5, color: "#6b7280", fontWeight: 500 },
  grupoCardVED: { display: "flex", gap: 12, paddingTop: 6, borderTop: `1px dashed ${BORDER}` },
  vedChip: { fontSize: 13, fontWeight: 800 },
  tagActiva: { fontSize: 10, fontWeight: 700, background: "#dcfce7", color: "#16a34a", padding: "2px 7px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  tagTemporada: { fontSize: 10, fontWeight: 700, background: "#f3f4f6", color: "#6b7280", padding: "2px 7px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  // Subgrupo (desglose por equipo dentro de una liga)
  subgrupo: { marginTop: 4, padding: "10px 12px", background: "#f9fafb", borderRadius: 10 },
  subgrupoTitle: { fontSize: 10.5, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  subgrupoRow: { display: "flex", alignItems: "center", gap: 8, paddingTop: 4 },
  subgrupoDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  subgrupoNombre: { fontSize: 13, fontWeight: 700, color: "#111827", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  subgrupoMeta: { fontSize: 12, color: "#6b7280" },
  // Línea de "posición de goleo" dentro de cada card de liga (legado; lo usaba el diseño anterior)
  posGoleoLine: { fontSize: 12.5, color: "#92400e", background: "#fff7ed", border: "1px solid #fed7aa", padding: "5px 9px", borderRadius: 8, marginTop: 4, display: "inline-block" },
  // ── Tarjeta de liga rediseñada ──
  ligaCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" },
  // Banner con color de la liga (gradiente sutil sobre el color base)
  ligaCardBanner: { padding: "14px 18px 16px", color: "#ffffff" },
  ligaCardBannerTop: { display: "flex", justifyContent: "flex-end", marginBottom: 6 },
  ligaCardBannerTag: { fontSize: 10, fontWeight: 800, letterSpacing: 1, padding: "3px 9px", borderRadius: 10, background: "rgba(255,255,255,0.22)", border: "1px solid rgba(255,255,255,0.35)", textTransform: "uppercase" },
  ligaCardBannerTitle: { fontSize: 22, fontWeight: 900, letterSpacing: -0.5, marginBottom: 4, textShadow: "0 1px 3px rgba(0,0,0,0.18)" },
  ligaCardBannerMeta: { fontSize: 12.5, color: "rgba(255,255,255,0.88)", fontWeight: 600 },
  // Cuerpo blanco
  ligaCardBody: { padding: 16, display: "flex", flexDirection: "column", gap: 14 },
  // Stats row: 3 columnas grandes
  ligaStatsRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: "8px 4px", background: "#f9fafb", borderRadius: 12 },
  ligaStat: { textAlign: "center" },
  ligaStatVal: { fontSize: 24, fontWeight: 900, color: GREEN, letterSpacing: -0.6, lineHeight: 1 },
  ligaStatLbl: { fontSize: 10.5, color: "#6b7280", fontWeight: 700, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  // Card de posición de goleo (color ámbar/oro)
  ligaPosCard: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)", border: "1.5px solid #fcd34d", borderRadius: 12, boxShadow: "0 2px 6px rgba(245,158,11,0.15)" },
  ligaPosLeft: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  ligaPosIcon: { fontSize: 26, lineHeight: 1 },
  ligaPosLbl: { fontSize: 12.5, fontWeight: 800, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.4 },
  ligaPosSub: { fontSize: 11.5, color: "#a16207", marginTop: 2 },
  ligaPosVal: { fontSize: 32, fontWeight: 900, color: "#b45309", letterSpacing: -1, lineHeight: 1, flexShrink: 0 },
  ligaPosCardEmpty: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10 },
  // V/E/D chips grandes
  ligaVEDRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 },
  ligaVEDChip: { display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 6px", borderRadius: 12, border: "1px solid", gap: 2 },
  ligaVEDChipNum: { fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.4 },
  ligaVEDChipLbl: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 },
  // Acordeón de detalle
  detalleToggle: { width: "100%", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 16px", color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left" },
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