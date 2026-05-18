import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import FichaGenerator from "./FichaGenerator";

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

const db = async (path, token, options = {}) => {
  const method = (options.method || "GET").toUpperCase();
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      // Prefer solo en mutaciones, no en GETs (evita 406 en PostgREST)
      ...(method !== "GET" ? { "Prefer": "return=representation" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
};

export default function Referee({ session, setTopbarBack, seccionInicial }) {
  // ── Sección actual (partidos | unidades) ───────────────────────
  const [seccion, setSeccion] = useState(seccionInicial || "partidos");

  // ── Navegación dentro de "partidos": unidad → liga → jornada → partido ──
  const [unidadActiva, setUnidadActiva]   = useState(null); // objeto unidad
  const [ligaActiva, setLigaActiva]       = useState(null); // objeto liga
  const [jornadaActiva, setJornadaActiva] = useState(null); // id
  const [partidoActivo, setPartidoActivo] = useState(null);

  // ── Navegación dentro de "fichas": unidad → liga → FichaGenerator readOnly ──
  // Estados independientes para no pisar la navegación de "partidos".
  const [unidadFichas, setUnidadFichas] = useState(null);
  const [ligaFichas, setLigaFichas]     = useState(null);

  // ── Datos cacheados ────────────────────────────────────────────
  const [unidades, setUnidades]       = useState([]); // unidades del árbitro (con ligas accesibles)
  const [partidosLiga, setPartidosLiga] = useState([]); // partidos de la liga activa

  // ── Estados ficha ──────────────────────────────────────────────
  const [ficha, setFicha]                       = useState(null);
  const [jugadoresLocal, setJugadoresLocal]     = useState([]);
  const [jugadoresVisitante, setJugadoresVisitante] = useState([]);
  const [golesLocal, setGolesLocal]             = useState(0);
  const [golesVisitante, setGolesVisitante]     = useState(0);
  const [goleadores, setGoleadores]             = useState([]);
  const [asistencia, setAsistencia]             = useState([]);
  const [faltasLocal, setFaltasLocal]           = useState(0);
  const [faltasVisitante, setFaltasVisitante]   = useState(0);
  const [observaciones, setObservaciones]       = useState("");
  const [cerrada, setCerrada]                   = useState(false);
  const [modalCerrar, setModalCerrar]           = useState(false);

  // ── Mis Unidades ───────────────────────────────────────────────
  const [unidadExpandida, setUnidadExpandida]       = useState(null);
  const [modalSolicitar, setModalSolicitar]         = useState(false);
  const [todasCanchas, setTodasCanchas]             = useState([]);
  const [solicitudesArbitro, setSolicitudesArbitro] = useState([]);
  const [solCanchaId, setSolCanchaId]               = useState("");
  const [enviandoSol, setEnviandoSol]               = useState(false);

  // ── Generales ──────────────────────────────────────────────────
  const [loading, setLoading]     = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast]         = useState(null);

  const token  = session?.access_token;
  const userId = session?.user?.id;

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Sincroniza el topbar back según la profundidad de navegación ──
  useEffect(() => {
    if (!setTopbarBack) return;
    if (seccion === "partidos") {
      if (partidoActivo) {
        setTopbarBack({ label: "Volver a jornadas", onClick: () => setPartidoActivo(null) });
      } else if (ligaActiva) {
        setTopbarBack({ label: "Volver a ligas", onClick: () => { setLigaActiva(null); setJornadaActiva(null); setPartidosLiga([]); } });
      } else if (unidadActiva && unidades.length > 1) {
        setTopbarBack({ label: "Volver a unidades", onClick: () => setUnidadActiva(null) });
      } else {
        setTopbarBack(null);
      }
    } else if (seccion === "fichas") {
      if (ligaFichas) {
        setTopbarBack({ label: "Volver a torneos", onClick: () => setLigaFichas(null) });
      } else if (unidadFichas && unidades.length > 1) {
        setTopbarBack({ label: "Volver a unidades", onClick: () => setUnidadFichas(null) });
      } else {
        setTopbarBack(null);
      }
    } else {
      setTopbarBack(null);
    }
    return () => setTopbarBack(null);
  }, [seccion, partidoActivo, ligaActiva, unidadActiva, unidadFichas, ligaFichas, unidades.length, setTopbarBack]);

  // ── seccionInicial cambia desde la sidebar → resetea vista ─────
  useEffect(() => {
    if (!seccionInicial) return;
    if (seccionInicial !== seccion) {
      setSeccion(seccionInicial);
      setPartidoActivo(null);
      setLigaActiva(null);
      setJornadaActiva(null);
      // Si vamos a "unidades", limpiamos también la unidad activa para verlas todas como tarjetas.
      if (seccionInicial === "unidades") setUnidadActiva(null);
      // Al cambiar de sección, soltamos también la nav de fichas para que vuelva al inicio.
      if (seccionInicial !== "fichas") { setUnidadFichas(null); setLigaFichas(null); }
    }
  }, [seccionInicial]);

  // ── Auto-salto en sección "fichas": si solo hay 1 unidad con 1 liga, entrar directo ──
  useEffect(() => {
    if (seccion !== "fichas") return;
    if (unidadFichas || ligaFichas) return;
    const usables = unidades.filter(u => u.confirmado && u.ligas.length > 0);
    if (usables.length === 1) {
      setUnidadFichas(usables[0]);
      if (usables[0].ligas.length === 1) setLigaFichas(usables[0].ligas[0]);
    }
  }, [seccion, unidades, unidadFichas, ligaFichas]);

  // ── CARGAR UNIDADES DEL ÁRBITRO ───────────────────────────────
  // Devuelve [{cancha_id, nombre, direccion, logo_url, color_marca, acceso_total, confirmado, ligas:[...]}]
  const cargarUnidades = async () => {
    setLoading(true);
    try {
      const accesos = await db(`/arbitro_cancha?user_id=eq.${userId}&select=cancha_id,acceso_total,confirmado`, token);
      if (!accesos || accesos.length === 0) { setUnidades([]); setLoading(false); return; }

      const canchaIds = accesos.map(a => a.cancha_id);
      const canchasInfo = await db(`/canchas?id=in.(${canchaIds.join(",")})&select=id,nombre,direccion,logo_url,color_marca`, token);
      const canchasMap = Object.fromEntries((canchasInfo || []).map(c => [c.id, c]));

      const ligasUni = await db(`/ligas?cancha_id=in.(${canchaIds.join(",")})&select=id,nombre,cancha_id,activa,dia,turno&order=nombre`, token);

      // arbitro_liga: ligas específicas si no tiene acceso_total
      let ligasEspMap = {};
      try {
        const ligasEsp = await db(`/arbitro_liga?user_id=eq.${userId}&select=liga_id`, token);
        ligasEspMap = Object.fromEntries((ligasEsp || []).map(r => [r.liga_id, true]));
      } catch (_) { /* sin filas, continúa */ }

      const result = accesos.map(a => {
        const c = canchasMap[a.cancha_id] || {};
        const ligasDeUnidad = (ligasUni || []).filter(l => l.cancha_id === a.cancha_id);
        const ligasAccesibles = a.acceso_total
          ? ligasDeUnidad.filter(l => l.activa)
          : ligasDeUnidad.filter(l => ligasEspMap[l.id]);
        return {
          cancha_id: a.cancha_id,
          nombre: c.nombre || "Unidad",
          direccion: c.direccion,
          logo_url: c.logo_url,
          color_marca: c.color_marca || "#4f8f2f",
          acceso_total: a.acceso_total,
          confirmado: a.confirmado,
          ligas: ligasAccesibles,
        };
      });
      setUnidades(result);

      // Auto-salto si solo hay una unidad confirmada con ligas accesibles
      if (seccion === "partidos" && !unidadActiva && !ligaActiva && !partidoActivo) {
        const usables = result.filter(u => u.confirmado && u.ligas.length > 0);
        if (usables.length === 1) {
          setUnidadActiva(usables[0]);
          if (usables[0].ligas.length === 1) {
            setLigaActiva(usables[0].ligas[0]);
          }
        }
      }
    } catch (e) {
      showToast(e.message, "err");
    }
    setLoading(false);
  };

  // ── CARGAR PARTIDOS DE LA LIGA ACTIVA ─────────────────────────
  const cargarPartidosDeLiga = async (liga) => {
    setLoading(true);
    try {
      const jornadas = await db(`/jornadas?liga_id=eq.${liga.id}&select=id,numero,fecha&order=numero`, token);
      if (!jornadas || jornadas.length === 0) { setPartidosLiga([]); setJornadaActiva(null); setLoading(false); return; }
      const jornadaIds = jornadas.map(j => j.id);
      const jornadasMap = Object.fromEntries(jornadas.map(j => [j.id, j]));

      const partidos = await db(
        `/partidos?jornada_id=in.(${jornadaIds.join(",")})&equipo_local_id=not.is.null&equipo_visitante_id=not.is.null&select=*,equipos_local:equipos!partidos_equipo_local_id_fkey(id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url),equipos_visitante:equipos!partidos_equipo_visitante_id_fkey(id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url),ficha_partido(cerrada)&order=hora`,
        token
      );
      // Adjuntamos jornadas + ligas a cada partido para mantener compat con FichaView
      const parts = (partidos || []).map(p => ({
        ...p,
        jornadas: { ...(jornadasMap[p.jornada_id] || {}), ligas: { id: liga.id, nombre: liga.nombre } },
      }));
      setPartidosLiga(parts);

      // Calcular jornada prioritaria:
      //   1) Jornada de menor número con al menos un partido cuya ficha no esté cerrada.
      //   2) Si no hay pendientes → última jornada (mayor número) con al menos una ficha registrada.
      //   3) Si nada calza → primera jornada con partidos.
      const porJornada = jornadas.map(j => ({
        jornada: j,
        partidos: parts.filter(p => p.jornada_id === j.id),
      })).filter(g => g.partidos.length > 0);

      const pendiente = porJornada.find(g => g.partidos.some(p => !p.ficha_partido?.cerrada));
      const ultimaConFichas = [...porJornada].reverse().find(g => g.partidos.some(p => p.ficha_partido != null));
      const prioritaria = pendiente || ultimaConFichas || porJornada[0];
      setJornadaActiva(prioritaria?.jornada?.id || null);
    } catch (e) {
      showToast(e.message, "err");
    }
    setLoading(false);
  };

  // ── CARGAR FICHA DEL PARTIDO ──────────────────────────────────
  const cargarFicha = async (partido) => {
    setPartidoActivo(partido);
    try {
      const data = await db(`/ficha_partido?partido_id=eq.${partido.id}`, token);
      if (data && data.length > 0) {
        const f = data[0];
        setFicha(f);
        setGolesLocal(f.goles_local || 0);
        setGolesVisitante(f.goles_visitante || 0);
        setGoleadores(f.goleadores || []);
        setAsistencia(f.asistencia || []);
        setFaltasLocal(f.faltas_local || 0);
        setFaltasVisitante(f.faltas_visitante || 0);
        setObservaciones(f.observaciones || "");
        setCerrada(f.cerrada || false);
      } else {
        setFicha(null);
        setGolesLocal(0); setGolesVisitante(0);
        setGoleadores([]); setAsistencia([]);
        setFaltasLocal(0); setFaltasVisitante(0);
        setObservaciones(""); setCerrada(false);
      }
      await cargarJugadores(partido);
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── CARGAR JUGADORES DE AMBOS EQUIPOS ────────────────────────
  const cargarJugadores = async (partido) => {
    try {
      const ligaId = partido.jornadas?.ligas?.id || ligaActiva?.id || "";
      const [local, visitante] = await Promise.all([
        db(`/jugador_equipo?equipo_id=eq.${partido.equipos_local.id}&liga_id=eq.${ligaId}&select=*,jugadores(nombre_completo,numero_afiliado)&order=dorsal`, token),
        db(`/jugador_equipo?equipo_id=eq.${partido.equipos_visitante.id}&liga_id=eq.${ligaId}&select=*,jugadores(nombre_completo,numero_afiliado)&order=dorsal`, token),
      ]);
      setJugadoresLocal(local || []);
      setJugadoresVisitante(visitante || []);
    } catch (e) { console.error(e); }
  };

  // ── CARGAR SOLICITUDES PROPIAS DEL ÁRBITRO (Mis Unidades) ─────
  const cargarSolicitudesArbitro = async () => {
    try {
      const sols = await db(`/solicitudes_registro?user_id=eq.${userId}&tipo_rol=eq.referee&cancha_id=not.is.null&order=created_at.desc`, token);
      setSolicitudesArbitro(sols || []);
    } catch (_) { setSolicitudesArbitro([]); }
  };

  // ── CARGAR TODAS LAS CANCHAS (para modal de solicitud) ────────
  const cargarTodasCanchas = async () => {
    try {
      const cs = await db(`/canchas?select=id,nombre,direccion&order=nombre`, token);
      setTodasCanchas(cs || []);
    } catch (_) { setTodasCanchas([]); }
  };

  // ── EFECTOS ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    cargarUnidades();
    cargarSolicitudesArbitro();
    cargarTodasCanchas();
  }, [userId]);

  useEffect(() => {
    if (ligaActiva?.id) cargarPartidosDeLiga(ligaActiva);
    else { setPartidosLiga([]); setJornadaActiva(null); }
  }, [ligaActiva?.id]);

  // ── ASISTENCIA / GOLES (igual que antes) ──────────────────────
  const toggleAsistencia = (jugadorId) => {
    setAsistencia(prev => prev.includes(jugadorId) ? prev.filter(id => id !== jugadorId) : [...prev, jugadorId]);
  };
  const estaPresente = (jugadorId) => asistencia.includes(jugadorId);

  const agregarGoleador = (jugador, equipo, equipoNombre) => {
    // Si un jugador anota, lógicamente jugó: lo marcamos presente automáticamente.
    // Usamos updater de setAsistencia para evitar pisar otros toggles del mismo render.
    setAsistencia(prev => prev.includes(jugador.jugador_id) ? prev : [...prev, jugador.jugador_id]);

    const yaExiste = goleadores.findIndex(g => g.jugador_id === jugador.jugador_id && g.equipo === equipo);
    if (yaExiste >= 0) {
      const updated = [...goleadores];
      updated[yaExiste].goles += 1;
      setGoleadores(updated);
    } else {
      setGoleadores([...goleadores, {
        jugador_id: jugador.jugador_id,
        nombre: jugador.jugadores?.nombre_completo,
        equipo,
        equipo_nombre: equipoNombre,
        dorsal: jugador.dorsal,
        goles: 1,
      }]);
    }
    if (equipo === partidoActivo?.equipos_local?.id) setGolesLocal(prev => prev + 1);
    else setGolesVisitante(prev => prev + 1);
  };

  const quitarGoleador = (jugador_id, equipo) => {
    setGoleadores(goleadores.map(g => {
      if (g.jugador_id === jugador_id && g.equipo === equipo) {
        return { ...g, goles: g.goles - 1 };
      }
      return g;
    }).filter(g => g.goles > 0));
    if (equipo === partidoActivo?.equipos_local?.id) setGolesLocal(prev => Math.max(0, prev - 1));
    else setGolesVisitante(prev => Math.max(0, prev - 1));
  };

  const golesDeJugador = (jugador_id, equipo) => {
    const g = goleadores.find(g => g.jugador_id === jugador_id && g.equipo === equipo);
    return g ? g.goles : 0;
  };

  // ── GUARDAR FICHA ────────────────────────────────────────────
  const guardarFicha = async (cerrarFicha = false) => {
    if (!partidoActivo) return;
    setGuardando(true);
    try {
      const payload = {
        partido_id: partidoActivo.id,
        goles_local: golesLocal,
        goles_visitante: golesVisitante,
        goleadores,
        asistencia,
        faltas_local: faltasLocal,
        faltas_visitante: faltasVisitante,
        observaciones,
        cerrada: cerrarFicha,
      };
      if (ficha) {
        await db(`/ficha_partido?id=eq.${ficha.id}`, token, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await db("/ficha_partido", token, { method: "POST", body: JSON.stringify(payload) });
      }
      if (cerrarFicha) {
        setCerrada(true);
        showToast("Ficha cerrada y guardada ✓");
        // refrescar la lista para que la tarjeta del partido refleje "Cerrada"
        if (ligaActiva?.id) cargarPartidosDeLiga(ligaActiva);
        // volver a la lista de partidos para elegir otra ficha de la misma jornada
        setPartidoActivo(null);
      } else {
        showToast("Ficha guardada ✓");
        await cargarFicha(partidoActivo);
        if (ligaActiva?.id) cargarPartidosDeLiga(ligaActiva);
      }
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  // ── ENVIAR SOLICITUD DE UNIDAD NUEVA ─────────────────────────
  const enviarSolicitudUnidad = async () => {
    if (!solCanchaId) return showToast("Selecciona una unidad", "err");
    setEnviandoSol(true);
    try {
      const nombreCompleto = session?.user?.email?.split("@")[0] || "Árbitro";
      // El super admin verá esta solicitud diferenciada por tener cancha_id != null.
      // Usamos el token del árbitro: la policy RLS exige user_id = auth.uid().
      await db(`/solicitudes_registro`, token, {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          nombre_completo: nombreCompleto,
          tipo_rol: "referee",
          cancha_id: solCanchaId,
          estado: "pendiente",
        }),
      });
      showToast("Solicitud enviada ✓");
      setModalSolicitar(false);
      setSolCanchaId("");
      cargarSolicitudesArbitro();
    } catch (e) { showToast(e.message, "err"); }
    setEnviandoSol(false);
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  const confirmadas = unidades.filter(u => u.confirmado);

  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {toast && <div style={{ ...s.toast, background: toast.tipo === "err" ? "#ef4444" : "#4ade80", color: toast.tipo === "err" ? "#fff" : "#0d0d1a" }}>{toast.msg}</div>}

      {/* ───────────────────────────────────────── SECCIÓN "MIS UNIDADES" ── */}
      {seccion === "unidades" && (
        <MisUnidadesView
          unidades={unidades}
          loading={loading}
          unidadExpandida={unidadExpandida}
          setUnidadExpandida={setUnidadExpandida}
          solicitudesArbitro={solicitudesArbitro}
          onSolicitar={() => setModalSolicitar(true)}
        />
      )}

      {/* ──────────────────────────────────── SECCIÓN "PARTIDOS" ─────── */}
      {seccion === "partidos" && (
        <>
          {/* Header del panel */}
          {!partidoActivo && (
            <div style={s.header}>
              <h2 style={s.title}>Panel Árbitro 🟡</h2>
              <p style={s.sub}>
                {!unidadActiva ? "Selecciona la unidad de la que quieres llenar fichas" :
                 !ligaActiva ? "Selecciona el torneo" :
                 "Selecciona la jornada y el partido"}
              </p>
            </div>
          )}

          {loading && !partidoActivo ? (
            <div style={s.empty}><div style={s.spinner} /></div>
          ) : !unidadActiva ? (
            // ─────────── PASO 1: ELEGIR UNIDAD ───────────
            <SeleccionUnidad
              unidades={confirmadas}
              onSelect={(u) => { setUnidadActiva(u); if (u.ligas.length === 1) setLigaActiva(u.ligas[0]); }}
            />
          ) : !ligaActiva ? (
            // ─────────── PASO 2: ELEGIR LIGA ─────────────
            <SeleccionLiga
              unidad={unidadActiva}
              onSelect={(l) => setLigaActiva(l)}
            />
          ) : !partidoActivo ? (
            // ─────────── PASO 3: LISTA POR JORNADAS ──────
            <ListaJornadas
              liga={ligaActiva}
              partidos={partidosLiga}
              jornadaActiva={jornadaActiva}
              setJornadaActiva={setJornadaActiva}
              onSelectPartido={cargarFicha}
            />
          ) : (
            // ─────────── PASO 4: FICHA ───────────────────
            <FichaPartido
              partidoActivo={partidoActivo}
              cerrada={cerrada}
              golesLocal={golesLocal} setGolesLocal={setGolesLocal}
              golesVisitante={golesVisitante} setGolesVisitante={setGolesVisitante}
              jugadoresLocal={jugadoresLocal} jugadoresVisitante={jugadoresVisitante}
              estaPresente={estaPresente} toggleAsistencia={toggleAsistencia}
              golesDeJugador={golesDeJugador}
              agregarGoleador={agregarGoleador} quitarGoleador={quitarGoleador}
              faltasLocal={faltasLocal} setFaltasLocal={setFaltasLocal}
              faltasVisitante={faltasVisitante} setFaltasVisitante={setFaltasVisitante}
              observaciones={observaciones} setObservaciones={setObservaciones}
              guardando={guardando}
              onGuardarBorrador={() => guardarFicha(false)}
              onAbrirCerrar={() => setModalCerrar(true)}
            />
          )}
        </>
      )}

      {/* ──────────────────────────────────── SECCIÓN "FICHAS" ──────── */}
      {/* Acceso solo-lectura al generador: el árbitro puede visualizar
          las fichas de su unidad e imprimirlas / guardarlas como PDF. */}
      {seccion === "fichas" && (
        <>
          {!ligaFichas && (
            <div style={s.header}>
              <h2 style={s.title}>Fichas 📄</h2>
              <p style={s.sub}>
                {!unidadFichas ? "Selecciona la unidad de la que quieres imprimir fichas" : "Selecciona el torneo"}
              </p>
            </div>
          )}

          {loading && !unidadFichas ? (
            <div style={s.empty}><div style={s.spinner} /></div>
          ) : !unidadFichas ? (
            <SeleccionUnidad
              unidades={confirmadas}
              onSelect={(u) => { setUnidadFichas(u); if (u.ligas.length === 1) setLigaFichas(u.ligas[0]); }}
            />
          ) : !ligaFichas ? (
            <SeleccionLiga
              unidad={unidadFichas}
              onSelect={(l) => setLigaFichas(l)}
            />
          ) : (
            <FichaGenerator
              session={session}
              liga={ligaFichas}
              miUnidad={unidadFichas ? { nombre: unidadFichas.nombre, logo_url: unidadFichas.logo_url } : null}
              readOnly
              headerExtra={
                unidadFichas.ligas.length > 1 ? (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-sub)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.7 }}>
                      Torneo
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {unidadFichas.ligas.map(l => (
                        <button key={l.id}
                          onClick={() => setLigaFichas(l)}
                          style={{
                            padding: "8px 14px", cursor: "pointer", fontSize: 13,
                            border: `2px solid ${ligaFichas?.id === l.id ? "#4f8f2f" : "var(--border)"}`,
                            borderRadius: 10,
                            background: ligaFichas?.id === l.id ? "#f0fdf4" : "white",
                            color: ligaFichas?.id === l.id ? "#4f8f2f" : "var(--text)",
                            fontWeight: ligaFichas?.id === l.id ? 700 : 500,
                            minHeight: 44,
                          }}>
                          🏆 {l.nombre}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null
              }
            />
          )}
        </>
      )}

      {/* MODAL CONFIRMAR CIERRE */}
      {modalCerrar && createPortal(
        <div style={s.overlay} onClick={() => setModalCerrar(false)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 10 }}>¿Cerrar la ficha?</h3>
              <p style={{ color: "#6b7280", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
                Ya no podrás editarla después.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                style={{ flex: 1, background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "11px", color: "#6b7280", fontSize: 13, cursor: "pointer", fontWeight: 600 }}
                onClick={() => setModalCerrar(false)}>
                Cancelar
              </button>
              <button
                style={{ flex: 2, background: GREEN, border: "none", borderRadius: 10, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 8px rgba(79,143,47,0.3)" }}
                onClick={() => { setModalCerrar(false); guardarFicha(true); }}
                disabled={guardando}>
                {guardando ? "Cerrando..." : "Sí, cerrar ficha"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL SOLICITAR UNIDAD NUEVA */}
      {modalSolicitar && createPortal(
        <ModalSolicitarUnidad
          unidades={unidades}
          todasCanchas={todasCanchas}
          solicitudesArbitro={solicitudesArbitro}
          solCanchaId={solCanchaId}
          setSolCanchaId={setSolCanchaId}
          enviando={enviandoSol}
          onClose={() => { setModalSolicitar(false); setSolCanchaId(""); }}
          onEnviar={enviarSolicitudUnidad}
        />,
        document.body
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SUB-VISTAS
// ─────────────────────────────────────────────────────────────────

// PASO 1: ELEGIR UNIDAD
function SeleccionUnidad({ unidades, onSelect }) {
  if (unidades.length === 0) {
    return (
      <div style={s.empty}>
        <div style={s.emptyIcon}>🏟️</div>
        <div style={s.emptyTxt}>Aún no tienes unidades confirmadas</div>
        <p style={s.emptyHint}>El admin de la unidad debe confirmar tu acceso. Mientras tanto puedes revisar el estado en "Mis Unidades".</p>
      </div>
    );
  }
  return (
    <div style={s.unidadGrid}>
      {unidades.map(u => (
        <div key={u.cancha_id} style={{ ...s.unidadCard, borderTopColor: u.color_marca }} className="ref-card" onClick={() => onSelect(u)}>
          <div style={s.unidadCardTop}>
            {u.logo_url
              ? <img src={u.logo_url} alt="" style={s.unidadLogo}/>
              : <div style={{ ...s.unidadLogo, background: u.color_marca, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20 }}>{u.nombre[0]?.toUpperCase()}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.unidadNombre}>🏟️ {u.nombre}</div>
              {u.direccion && <div style={s.unidadDir}>{u.direccion}</div>}
            </div>
          </div>
          <div style={s.unidadFooter}>
            <span style={s.ligaCountBadge}>
              {u.ligas.length} {u.ligas.length === 1 ? "torneo accesible" : "torneos accesibles"}
            </span>
            {u.acceso_total && <span style={s.accesoTotalBadge}>Acceso total</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// PASO 2: ELEGIR LIGA
function SeleccionLiga({ unidad, onSelect }) {
  if (unidad.ligas.length === 0) {
    return (
      <div style={s.empty}>
        <div style={s.emptyIcon}>🏆</div>
        <div style={s.emptyTxt}>No tienes torneos accesibles en esta unidad</div>
        <p style={s.emptyHint}>El admin de la unidad aún no te ha asignado torneos. Vuelve más tarde.</p>
      </div>
    );
  }
  return (
    <div>
      <div style={s.unidadHeader}>
        {unidad.logo_url && <img src={unidad.logo_url} style={s.unidadLogoMini} alt=""/>}
        <span style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>🏟️ {unidad.nombre}</span>
      </div>
      <div style={s.ligaGrid}>
        {unidad.ligas.map(l => (
          <div key={l.id} style={s.ligaCard} className="ref-card" onClick={() => onSelect(l)}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>🏆</div>
            <div style={s.ligaNombre}>{l.nombre}</div>
            {(l.dia || l.turno) && (
              <div style={s.ligaMeta}>{[l.dia, l.turno].filter(Boolean).join(" · ")}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// PASO 3: LISTA POR JORNADAS
// Logo del club para las tarjetas de partido. Si no hay escudo_url, dibuja un
// cuadrado del color del equipo con la inicial — coherente con el patrón de
// LeagueAdmin → Equipos.
function LogoEquipo({ equipo, size = 32 }) {
  const color = equipo?.color_playera || "#6b7280";
  const inicial = (equipo?.nombre || "?").trim().charAt(0).toUpperCase();
  if (equipo?.escudo_url) {
    return (
      <img src={equipo.escudo_url} alt={equipo.nombre || "equipo"}
        style={{ width: size, height: size, borderRadius: 8, objectFit: "cover", background: "#fff", border: `1.5px solid ${color}`, flexShrink: 0 }} />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 8, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: Math.round(size * 0.45), flexShrink: 0, border: `1.5px solid ${color}` }}>
      {inicial}
    </div>
  );
}

function ListaJornadas({ liga, partidos, jornadaActiva, setJornadaActiva, onSelectPartido }) {
  // Agrupa por jornada (objeto jornada extraído del primer partido de la jornada)
  const grupos = {};
  for (const p of partidos) {
    const jid = p.jornada_id;
    if (!grupos[jid]) grupos[jid] = { jornada: p.jornadas, partidos: [] };
    grupos[jid].partidos.push(p);
  }
  const jornadasOrdenadas = Object.values(grupos).sort((a, b) => (a.jornada?.numero || 0) - (b.jornada?.numero || 0));

  if (jornadasOrdenadas.length === 0) {
    return (
      <div style={s.empty}>
        <div style={s.emptyIcon}>📅</div>
        <div style={s.emptyTxt}>Aún no hay jornadas con partidos en este torneo</div>
      </div>
    );
  }

  const grupoActivo = grupos[jornadaActiva] || jornadasOrdenadas[0];
  const partidosJornada = grupoActivo?.partidos || [];

  const conteoPendiente = (g) => g.partidos.filter(p => !p.ficha_partido?.cerrada).length;

  return (
    <div>
      <div style={s.ligaHeader}>
        <span style={s.ligaHeaderTitle}>🏆 {liga.nombre}</span>
      </div>

      {/* Tabs de jornadas (scroll horizontal en móvil) */}
      <div style={s.jornadaTabs}>
        {jornadasOrdenadas.map(g => {
          const pendientes = conteoPendiente(g);
          const activa = g.jornada.id === jornadaActiva;
          return (
            <button
              key={g.jornada.id}
              className={`jornada-tab ${activa ? "active" : ""}`}
              onClick={() => setJornadaActiva(g.jornada.id)}>
              <span>Jornada {g.jornada.numero}</span>
              {pendientes > 0
                ? <span style={s.jornadaDot} title={`${pendientes} pendientes`}>{pendientes}</span>
                : <span style={s.jornadaCheck} title="Todas cerradas">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Listado de partidos de la jornada activa */}
      {grupoActivo?.jornada?.fecha && (
        <div style={s.jornadaFecha}>📅 {new Date(grupoActivo.jornada.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}</div>
      )}
      <div style={s.partidoList}>
        {partidosJornada.map(p => {
          const tieneficha = p.ficha_partido != null;
          const fichaCerrada = p.ficha_partido?.cerrada;
          return (
            <div key={p.id} style={s.partidoCard} className="ref-card" onClick={() => onSelectPartido(p)}>
              <div style={s.partidoTop}>
                <div style={s.ligaBadge}>Jornada {p.jornadas?.numero}</div>
                <div style={s.fechaBadge}>⏰ {p.hora || "—"} · Cancha {p.cancha_numero || "—"}</div>
              </div>
              <div style={s.vsRow}>
                <div style={s.equipoVs}>
                  <LogoEquipo equipo={p.equipos_local} size={48} />
                  <span style={s.equipoVsNombre}>{p.equipos_local?.nombre}</span>
                </div>
                <div style={s.vsLabel}>VS</div>
                <div style={{ ...s.equipoVs, justifyContent: "flex-end" }}>
                  <span style={s.equipoVsNombre}>{p.equipos_visitante?.nombre}</span>
                  <LogoEquipo equipo={p.equipos_visitante} size={48} />
                </div>
              </div>
              {/* Footer en una sola fila: estado a la izquierda, CTA chica a la derecha.
                  El click en la tarjeta entera sigue funcionando como atajo. */}
              <div style={s.partidoBottom}>
                {fichaCerrada ? (
                  <span style={{ ...s.statusBadge, background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" }}>🔒 Cerrada</span>
                ) : tieneficha ? (
                  <span style={{ ...s.statusBadge, background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>📝 Borrador</span>
                ) : (
                  <span style={{ ...s.statusBadge, background: "#fef9c3", color: "#854d0e", border: "1px solid #fde68a" }}>⏳ Pendiente</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onSelectPartido(p); }}
                  style={{
                    ...s.partidoCTA,
                    background: fichaCerrada ? "#f3f4f6" : tieneficha ? "#1d4ed8" : GREEN,
                    color: fichaCerrada ? "#374151" : "#fff",
                    border: fichaCerrada ? "1px solid #e5e7eb" : "none",
                  }}>
                  {fichaCerrada ? "👁️ Ver" : tieneficha ? "✏️ Continuar" : "📝 Registrar →"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// PASO 4: FICHA DEL PARTIDO (vista existente extraída a sub-componente)
function FichaPartido({
  partidoActivo, cerrada,
  golesLocal, setGolesLocal, golesVisitante, setGolesVisitante,
  jugadoresLocal, jugadoresVisitante,
  estaPresente, toggleAsistencia,
  golesDeJugador, agregarGoleador, quitarGoleador,
  faltasLocal, setFaltasLocal, faltasVisitante, setFaltasVisitante,
  observaciones, setObservaciones,
  guardando, onGuardarBorrador, onAbrirCerrar,
}) {
  return (
    <div>
      {cerrada && (
        <div style={s.cerradaBanner}>🔒 Esta ficha está cerrada — visualización en modo solo lectura</div>
      )}

      {/* CABECERA DEL PARTIDO — layout mobile-first:
          fila 1: chip de torneo y jornada.
          fila 2: equipo local | VS | equipo visitante (compacto, sin desbordar).
          fila 3: marcador completo (− 0 + : − 0 +) centrado y a ancho completo. */}
      <div style={s.fichaHeader}>
        <div style={s.fichaLiga}>
          <span style={{ background: "rgba(0,0,0,0.22)", color: "#fff", padding: "5px 14px", borderRadius: 99, fontSize: 12.5, fontWeight: 700, letterSpacing: 0.3, textAlign: "center" }}>
            🏆 {partidoActivo.jornadas?.ligas?.nombre} · Jornada {partidoActivo.jornadas?.numero}
          </span>
        </div>

        {/* Equipos en una sola fila compacta */}
        <div style={s.fichaEquiposRow}>
          <div style={s.fichaEquipo}>
            <LogoEquipo equipo={partidoActivo.equipos_local} size={52} />
            <span style={s.fichaEquipoNombre}>{partidoActivo.equipos_local?.nombre}</span>
          </div>
          <div style={s.fichaVsMini}>VS</div>
          <div style={s.fichaEquipo}>
            <LogoEquipo equipo={partidoActivo.equipos_visitante} size={52} />
            <span style={s.fichaEquipoNombre}>{partidoActivo.equipos_visitante?.nombre}</span>
          </div>
        </div>

        {/* Marcador centrado debajo */}
        <div style={s.marcadorBox}>
          <div style={s.marcadorRow}>
            <button style={s.marcadorBtn} onClick={() => !cerrada && setGolesLocal(Math.max(0, golesLocal - 1))} disabled={cerrada}>−</button>
            <div style={s.marcadorNum}>{golesLocal}</div>
            <button style={s.marcadorBtn} onClick={() => !cerrada && setGolesLocal(golesLocal + 1)} disabled={cerrada}>+</button>
            <span style={s.marcadorGuion}>:</span>
            <button style={s.marcadorBtn} onClick={() => !cerrada && setGolesVisitante(Math.max(0, golesVisitante - 1))} disabled={cerrada}>−</button>
            <div style={s.marcadorNum}>{golesVisitante}</div>
            <button style={s.marcadorBtn} onClick={() => !cerrada && setGolesVisitante(golesVisitante + 1)} disabled={cerrada}>+</button>
          </div>
          <div style={s.marcadorLabel}>Marcador final</div>
        </div>
      </div>

      {/* JUGADORES */}
      <div style={s.seccion}>
        <h3 style={s.seccionTitle}>📋 Jugadores</h3>
        <div style={s.dosCol}>
          {[
            { equipo: partidoActivo.equipos_local, jugadores: jugadoresLocal },
            { equipo: partidoActivo.equipos_visitante, jugadores: jugadoresVisitante },
          ].map(({ equipo, jugadores }) => (
            <div key={equipo.id}>
              <div style={{ ...s.colHeader, borderColor: equipo.color_playera || GREEN }}>
                <span>{equipo.nombre}</span>
                <span style={s.contadorBadge}>
                  {jugadores.filter(j => estaPresente(j.jugador_id)).length}/{jugadores.length} presentes
                </span>
              </div>
              {jugadores.length === 0
                ? <p style={s.sinJugadores}>Sin jugadores registrados</p>
                : jugadores.map(j => {
                  const presente = estaPresente(j.jugador_id);
                  const goles = golesDeJugador(j.jugador_id, equipo.id);
                  return (
                    <div key={j.id} style={{
                      ...s.jugadorRow,
                      background: goles > 0 ? "rgba(22,163,74,0.15)" : presente ? "rgba(22,163,74,0.05)" : "transparent",
                    }}>
                      <span style={{ ...s.dorsalMin, background: equipo.color_playera || GREEN }}>{j.dorsal || "—"}</span>
                      <div style={s.jugadorInfo}>
                        <span style={s.jugadorCamiseta}>{j.nombre_camiseta || j.jugadores?.nombre_completo?.split(" ")[0]?.toUpperCase()}</span>
                        <span style={s.jugadorNombre}>{j.jugadores?.nombre_completo}</span>
                        {j.jugadores?.numero_afiliado && <span style={s.jugadorAfiliado}>#{j.jugadores.numero_afiliado}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <span
                          style={{ ...s.checkBox, background: presente ? "#16a34a" : "transparent", borderColor: presente ? "#16a34a" : "#6b7280", cursor: cerrada ? "default" : "pointer" }}
                          onClick={() => !cerrada && toggleAsistencia(j.jugador_id)}
                        >{presente ? "✓" : ""}</span>
                        {!cerrada ? (
                          <div style={s.golBtns}>
                            {goles > 0 && <button style={s.golBtnMinus} onClick={() => quitarGoleador(j.jugador_id, equipo.id)}>−</button>}
                            <button style={s.golBtnPlus} onClick={() => agregarGoleador(j, equipo.id, equipo.nombre)}>⚽</button>
                            {goles > 0 && <span style={s.golCount}>{goles}</span>}
                          </div>
                        ) : (
                          goles > 0 && <span style={s.golCountCerrada}>{goles}⚽</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      {/* FALTAS */}
      <div style={s.seccion}>
        <h3 style={s.seccionTitle}>🟨 Faltas cometidas</h3>
        <div style={s.dosCol}>
          {[
            { nombre: partidoActivo.equipos_local?.nombre, color: partidoActivo.equipos_local?.color_playera, val: faltasLocal, set: setFaltasLocal },
            { nombre: partidoActivo.equipos_visitante?.nombre, color: partidoActivo.equipos_visitante?.color_playera, set: setFaltasVisitante, val: faltasVisitante },
          ].map(({ nombre, color, val, set }) => (
            <div key={nombre} style={{ ...s.faltasCard, borderTop: `3px solid ${color || GREEN}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>{nombre}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <button style={s.faltaBtn} onClick={() => !cerrada && set(prev => Math.max(0, prev - 1))} disabled={cerrada}>−</button>
                <span style={s.faltaNum}>{val}</span>
                <button style={s.faltaBtn} onClick={() => !cerrada && set(prev => prev + 1)} disabled={cerrada}>+</button>
                <span style={{ fontSize: 12, color: "#6b7280" }}>faltas</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* OBSERVACIONES */}
      <div style={s.seccion}>
        <h3 style={s.seccionTitle}>📝 Observaciones del partido</h3>
        <textarea
          style={{ ...s.textarea, opacity: cerrada ? 0.6 : 1 }}
          placeholder="Tarjetas amarillas, rojas, incidencias, notas importantes..."
          value={observaciones}
          onChange={e => !cerrada && setObservaciones(e.target.value)}
          rows={4}
          disabled={cerrada}
        />
      </div>

      {/* ACCIONES */}
      {!cerrada && (
        <div style={s.acciones}>
          <button style={s.btnGuardar} onClick={onGuardarBorrador} disabled={guardando}>
            {guardando ? "Guardando..." : "💾 Guardar borrador"}
          </button>
          <button style={s.btnCerrar} onClick={onAbrirCerrar} disabled={guardando}>
            🔒 Cerrar ficha final
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MIS UNIDADES
// ─────────────────────────────────────────────────────────────────
function MisUnidadesView({ unidades, loading, unidadExpandida, setUnidadExpandida, solicitudesArbitro, onSolicitar }) {
  const pendientesPorCancha = {};
  for (const s of solicitudesArbitro) {
    if (s.estado === "pendiente" && s.cancha_id) pendientesPorCancha[s.cancha_id] = true;
  }

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.title}>Mis Unidades 🏟️</h2>
        <p style={s.sub}>Unidades a las que perteneces y los torneos a los que tienes acceso</p>
      </div>

      {loading ? (
        <div style={s.empty}><div style={s.spinner} /></div>
      ) : unidades.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>🏟️</div>
          <div style={s.emptyTxt}>Aún no perteneces a ninguna unidad</div>
          <p style={s.emptyHint}>Solicita acceso a una unidad con el botón de abajo</p>
        </div>
      ) : (
        <div style={s.unidadesList}>
          {unidades.map(u => {
            const expandida = unidadExpandida === u.cancha_id;
            return (
              <div key={u.cancha_id} style={{ ...s.miUnidadCard, borderLeftColor: u.color_marca }}>
                <div style={s.miUnidadHeader} onClick={() => setUnidadExpandida(expandida ? null : u.cancha_id)}>
                  {u.logo_url
                    ? <img src={u.logo_url} alt="" style={s.miUnidadLogo} />
                    : <div style={{ ...s.miUnidadLogo, background: u.color_marca, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18 }}>{u.nombre[0]?.toUpperCase()}</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.miUnidadNombre}>🏟️ {u.nombre}</div>
                    <div style={s.miUnidadMeta}>
                      {u.confirmado
                        ? <span style={{ ...s.estadoChip, background: "#dcfce7", color: "#15803d" }}>✓ Activo</span>
                        : <span style={{ ...s.estadoChip, background: "#fef9c3", color: "#854d0e" }}>⏳ Esperando confirmación del admin</span>}
                      <span style={{ ...s.estadoChip, background: "#f3f4f6", color: "#374151" }}>
                        {u.ligas.length} {u.ligas.length === 1 ? "torneo" : "torneos"}
                      </span>
                    </div>
                  </div>
                  <span style={{ ...s.chevron, transform: expandida ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
                </div>
                {expandida && (
                  <div style={s.ligasDespliegue}>
                    {u.ligas.length === 0 ? (
                      <div style={s.sinLigas}>
                        {u.confirmado
                          ? "Sin torneos asignados todavía"
                          : "El admin de la unidad debe confirmarte y asignarte torneos"}
                      </div>
                    ) : (
                      u.ligas.map(l => (
                        <div key={l.id} style={s.ligaItem}>
                          <span>🏆 {l.nombre}</span>
                          {(l.dia || l.turno) && (
                            <span style={s.ligaItemMeta}>{[l.dia, l.turno].filter(Boolean).join(" · ")}</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Solicitudes pendientes (informativo) */}
      {solicitudesArbitro.filter(s => s.estado === "pendiente").length > 0 && (
        <div style={s.solInfoBox}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#854d0e", marginBottom: 6 }}>⏳ Solicitudes pendientes</div>
          <div style={{ fontSize: 12, color: "#854d0e" }}>
            Tienes {solicitudesArbitro.filter(s => s.estado === "pendiente").length} solicitud(es) esperando aprobación del super admin.
          </div>
        </div>
      )}

      {/* BOTÓN SOLICITAR */}
      <button style={s.btnSolicitar} onClick={onSolicitar}>
        ➕ Solicitar acceso a otra unidad
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MODAL: SOLICITAR ACCESO A UNIDAD NUEVA
// ─────────────────────────────────────────────────────────────────
function ModalSolicitarUnidad({ unidades, todasCanchas, solicitudesArbitro, solCanchaId, setSolCanchaId, enviando, onClose, onEnviar }) {
  // Excluir unidades a las que ya pertenece o ya tiene solicitud pendiente
  const yaTiene = new Set(unidades.map(u => u.cancha_id));
  const yaSolicitadas = new Set(solicitudesArbitro.filter(s => s.estado === "pendiente").map(s => s.cancha_id));
  const disponibles = todasCanchas.filter(c => !yaTiene.has(c.id) && !yaSolicitadas.has(c.id));

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modalBox} onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 6 }}>Solicitar acceso a otra unidad</h3>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            El super admin revisará tu solicitud. No perderás el acceso a las unidades que ya tienes.
          </p>
        </div>

        {disponibles.length === 0 ? (
          <div style={{ background: "#f9fafb", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, textAlign: "center", color: "#6b7280", fontSize: 13 }}>
            No hay unidades disponibles para solicitar — ya perteneces o tienes solicitudes pendientes en todas las unidades registradas.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, maxHeight: 280, overflowY: "auto" }}>
            {disponibles.map(c => {
              const sel = solCanchaId === c.id;
              return (
                <div key={c.id} onClick={() => setSolCanchaId(c.id)} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                  border: `2px solid ${sel ? GREEN : BORDER}`,
                  background: sel ? "#f0fdf4" : "white",
                  transition: "all 0.15s",
                }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 99, flexShrink: 0,
                    border: `2px solid ${sel ? GREEN : "#d1d5db"}`,
                    background: sel ? GREEN : "white",
                  }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>🏟️ {c.nombre}</div>
                    {c.direccion && <div style={{ fontSize: 11, color: "#6b7280" }}>{c.direccion}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            style={{ flex: 1, background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "11px", color: "#6b7280", fontSize: 13, cursor: "pointer", fontWeight: 600 }}
            onClick={onClose}>
            Cancelar
          </button>
          <button
            style={{ flex: 2, background: GREEN, border: "none", borderRadius: 10, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: solCanchaId && !enviando ? "pointer" : "not-allowed", opacity: solCanchaId && !enviando ? 1 : 0.5, boxShadow: "0 2px 8px rgba(79,143,47,0.3)" }}
            onClick={onEnviar}
            disabled={!solCanchaId || enviando}>
            {enviando ? "Enviando..." : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────────
const BASE    = "#f9fafb";
const SURFACE = "#ffffff";
const BORDER  = "#e5e7eb";
const GREEN   = "#4f8f2f";

const s = {
  wrap: {},
  header: { marginBottom: 24, padding: "20px 24px", background: `linear-gradient(135deg, ${GREEN} 0%, #7fbf4d 100%)`, borderRadius: 16, boxShadow: "0 4px 16px rgba(79,143,47,0.3)" },
  title: { fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: -0.8, marginBottom: 4 },
  sub: { color: "rgba(255,255,255,0.78)", fontSize: 14, margin: 0 },
  empty: { textAlign: "center", padding: "60px 20px" },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTxt: { color: "#6b7280", fontSize: 16, marginBottom: 8, fontWeight: 600 },
  emptyHint: { color: "#9ca3af", fontSize: 13, maxWidth: 340, margin: "0 auto", lineHeight: 1.5 },
  spinner: { width: 32, height: 32, border: `3px solid ${BORDER}`, borderTop: `3px solid ${GREEN}`, borderRadius: "50%", margin: "0 auto", animation: "spin 0.7s linear infinite" },

  // PASO 1: GRID DE UNIDADES
  unidadGrid: { display: "flex", flexDirection: "column", gap: 12 },
  unidadCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", borderTop: "3px solid", display: "flex", flexDirection: "column", gap: 12 },
  unidadCardTop: { display: "flex", alignItems: "center", gap: 12 },
  unidadLogo: { width: 48, height: 48, borderRadius: 12, objectFit: "cover", flexShrink: 0 },
  unidadNombre: { fontSize: 15, fontWeight: 800, color: "#111827" },
  unidadDir: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  unidadFooter: { display: "flex", gap: 8, flexWrap: "wrap" },
  ligaCountBadge: { background: "#f3f4f6", color: "#374151", padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700 },
  accesoTotalBadge: { background: "#dcfce7", color: "#15803d", padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700 },

  // PASO 2: GRID DE LIGAS
  unidadHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "8px 14px", background: "#f3f4f6", borderRadius: 10 },
  unidadLogoMini: { width: 24, height: 24, borderRadius: 6, objectFit: "cover" },
  ligaGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  ligaCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 14px", cursor: "pointer", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  ligaNombre: { fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 4 },
  ligaMeta: { fontSize: 11, color: "#6b7280" },

  // PASO 3: JORNADAS
  ligaHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#f3f4f6", borderRadius: 10, marginBottom: 14 },
  ligaHeaderTitle: { fontSize: 14, fontWeight: 800, color: "#374151" },
  jornadaTabs: { display: "flex", gap: 8, marginBottom: 14, overflowX: "auto", paddingBottom: 6 },
  jornadaDot: { background: "#fbbf24", color: "#78350f", borderRadius: 99, fontSize: 10, fontWeight: 800, padding: "1px 7px", minWidth: 16, textAlign: "center" },
  jornadaCheck: { color: "#16a34a", fontSize: 13, fontWeight: 800 },
  jornadaFecha: { fontSize: 12, color: "#6b7280", marginBottom: 10, paddingLeft: 4 },

  // PARTIDOS
  partidoList: { display: "flex", flexDirection: "column", gap: 12 },
  partidoCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 20px", cursor: "pointer", boxShadow: "0 2px 8px rgba(79,143,47,0.08)", borderTop: `3px solid ${GREEN}` },
  partidoCTA: { padding: "8px 14px", borderRadius: 10, fontSize: 12.5, fontWeight: 800, cursor: "pointer", minHeight: 36, letterSpacing: 0.2, flexShrink: 0, transition: "transform 0.12s, box-shadow 0.12s" },
  partidoTop: { display: "flex", justifyContent: "space-between", marginBottom: 14 },
  ligaBadge: { fontSize: 12, color: "#6b7280", fontWeight: 600 },
  fechaBadge: { fontSize: 12, color: "#6b7280" },
  vsRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  equipoVs: { display: "flex", alignItems: "center", gap: 10, flex: 1 },
  equipoVsNombre: { fontSize: 16, fontWeight: 700, color: "#111827" },
  vsLabel: { fontSize: 12, color: "#9ca3af", fontWeight: 700, padding: "0 16px" },
  partidoBottom: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 6 },

  // FICHA
  cerradaBanner: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 18px", color: "#ca8a04", fontSize: 13, marginBottom: 20 },
  fichaHeader: { background: "linear-gradient(135deg, #4f8f2f 0%, #7fbf4d 100%)", borderRadius: 18, padding: "20px 16px", marginBottom: 20, boxShadow: "0 4px 16px rgba(79,143,47,0.35)" },
  fichaLiga: { fontSize: 13, fontWeight: 700, marginBottom: 16, textAlign: "center", display: "flex", justifyContent: "center" },
  // Equipos en fila compacta, con VS chico en el centro
  fichaEquiposRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 16 },
  fichaVsMini: { fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.7)", letterSpacing: 1.2, padding: "0 4px", flexShrink: 0 },
  fichaEquipo: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  fichaEquipoNombre: { fontSize: 13, fontWeight: 800, color: "#fff", textAlign: "center", textShadow: "0 1px 4px rgba(0,0,0,0.4)", wordBreak: "break-word", lineHeight: 1.2 },
  marcadorBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  marcadorRow: { display: "flex", alignItems: "center", gap: 4, flexWrap: "nowrap" },
  marcadorBtn: { width: 30, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  marcadorNum: { width: 44, height: 50, background: "rgba(255,255,255,0.95)", border: "none", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, color: "#111827", boxShadow: "0 2px 12px rgba(0,0,0,0.2)", flexShrink: 0 },
  marcadorGuion: { fontSize: 22, color: "rgba(255,255,255,0.55)", padding: "0 2px", flexShrink: 0 },
  marcadorLabel: { fontSize: 11, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, fontWeight: 600 },
  seccion: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 16px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  seccionTitle: { fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 16 },
  // En mobile apilamos los dos equipos en columna — antes era grid 1fr 1fr y
  // los jugadores quedaban cortados. Ahora cada equipo usa el ancho completo.
  dosCol: { display: "flex", flexDirection: "column", gap: 18 },
  colHeader: { fontSize: 13, fontWeight: 700, color: "#111827", paddingBottom: 8, marginBottom: 6, borderBottom: "2px solid", display: "flex", justifyContent: "space-between", alignItems: "center" },
  contadorBadge: { fontSize: 11, background: "#f3f4f6", borderRadius: 6, padding: "2px 7px", color: "#6b7280", fontWeight: 700 },
  jugadorRow: { display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, transition: "background 0.15s" },
  jugadorInfo: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 },
  jugadorCamiseta: { fontSize: 12, fontWeight: 800, color: "#111827", letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1.2 },
  jugadorNombre: { fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  jugadorAfiliado: { fontSize: 10, color: "#9ca3af" },
  checkBox: { width: 22, height: 22, borderRadius: 6, border: "2px solid", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", flexShrink: 0, transition: "all 0.15s" },
  dorsalMin: { width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 },
  golBtns: { display: "flex", alignItems: "center", gap: 6 },
  golBtnPlus: { background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 6, color: GREEN, fontSize: 14, cursor: "pointer", padding: "3px 8px", fontWeight: 700 },
  golBtnMinus: { background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, color: "#dc2626", fontSize: 14, cursor: "pointer", padding: "3px 8px", fontWeight: 700 },
  golCount: { fontSize: 14, fontWeight: 800, color: GREEN, minWidth: 16, textAlign: "center" },
  golCountCerrada: { fontSize: 13, fontWeight: 700, color: GREEN },
  sinJugadores: { fontSize: 12, color: "#9ca3af", fontStyle: "italic" },
  faltasCard: { background: BASE, borderRadius: 10, padding: "16px 18px" },
  faltaBtn: { width: 34, height: 34, borderRadius: 8, background: SURFACE, border: `1px solid ${BORDER}`, color: "#374151", fontSize: 20, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" },
  faltaNum: { fontSize: 32, fontWeight: 900, color: "#111827", minWidth: 36, textAlign: "center" },
  textarea: { width: "100%", background: BASE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", color: "#111827", fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" },
  acciones: { display: "flex", gap: 12 },
  btnGuardar: { flex: 1, background: "#f3f4f6", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px", color: "#374151", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  btnCerrar: { flex: 1, background: GREEN, border: "none", borderRadius: 12, padding: "14px", color: "#ffffff", fontSize: 14, fontWeight: 800, cursor: "pointer" },

  // MIS UNIDADES
  unidadesList: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 },
  miUnidadCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: "4px solid", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  miUnidadHeader: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" },
  miUnidadLogo: { width: 42, height: 42, borderRadius: 10, objectFit: "cover", flexShrink: 0 },
  miUnidadNombre: { fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 4 },
  miUnidadMeta: { display: "flex", gap: 6, flexWrap: "wrap" },
  estadoChip: { fontSize: 11, padding: "2px 9px", borderRadius: 99, fontWeight: 700 },
  chevron: { fontSize: 22, color: "#9ca3af", fontWeight: 800, transition: "transform 0.2s" },
  ligasDespliegue: { borderTop: `1px solid ${BORDER}`, padding: "10px 16px 14px", background: "#fafafa" },
  ligaItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", fontSize: 13, color: "#111827", borderBottom: `1px solid ${BORDER}` },
  ligaItemMeta: { fontSize: 11, color: "#6b7280" },
  sinLigas: { fontSize: 12, color: "#9ca3af", fontStyle: "italic", padding: "8px 0" },
  solInfoBox: { background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", marginBottom: 12 },
  btnSolicitar: { width: "100%", background: GREEN, border: "none", borderRadius: 12, padding: "14px", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 8px rgba(79,143,47,0.3)", marginTop: 8 },

  // OVERLAYS / MODALES
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modalBox: { background: "#fff", borderRadius: 18, padding: "26px 24px", width: "100%", maxWidth: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", border: `1px solid ${BORDER}` },

  toast: { position: "fixed", bottom: 28, right: 28, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999 },
};

const css = `
  .ref-card { transition: transform 0.18s, box-shadow 0.18s; }
  .ref-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
  input:focus, textarea:focus { border-color: #4f8f2f !important; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .jornada-tab { display:inline-flex; align-items:center; gap:8px; padding:9px 16px; border-radius:99px; border:1.5px solid #e5e7eb; background:#fff; color:#374151; font-size:13px; font-weight:700; cursor:pointer; white-space:nowrap; transition:all 0.15s; font-family:inherit; flex-shrink:0; }
  .jornada-tab:hover { border-color: #4f8f2f; color: #4f8f2f; }
  .jornada-tab.active { background:#4f8f2f; border-color:#4f8f2f; color:#fff; }
  .jornada-tab.active .jornada-dot, .jornada-tab.active .jornada-check { color:#fff; }
`;
