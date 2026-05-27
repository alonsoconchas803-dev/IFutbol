import { useState, useEffect } from "react";
import BracketTree from "../components/BracketTree";
import { generarUnaJornada } from "../lib/roundRobin";

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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Error en la base de datos");
  }
  return res.status === 204 ? null : res.json();
};

// El algoritmo de round-robin vive en src/lib/roundRobin.js (compartido con
// FichaGenerator para la regeneración de jornadas futuras tras intercambios).

// Reparte cancha + hora a los partidos. Admite "compra de horario":
// turnoComprado es un mapa { equipoId: turno (1-indexed) } con preferencias fijas.
// Regla cuando AMBOS equipos compraron turno: se honra al LOCAL — como el
// round-robin alterna ida/vuelta, en la vuelta el otro equipo será local y se
// usará su turno automáticamente, sin necesidad de guardar estado extra.
function asignarHorarios(partidos, numCanchas, intervalo, horaInicio, turnoComprado = {}) {
  const [h, m] = horaInicio.split(":").map(Number);
  const tiempoTotal = intervalo;

  const entradas = partidos.map((p, idx) => {
    const tl = p.local?.id ? (turnoComprado[p.local.id] || null) : null;
    const tv = p.visitante?.id ? (turnoComprado[p.visitante.id] || null) : null;
    return { p, idx, preferido: tl || tv || null };
  });

  const turnoMaxPref = Math.max(0, ...entradas.map(e => e.preferido || 0));
  const turnosBase = Math.max(1, Math.ceil(partidos.length / numCanchas));
  const numTurnos = Math.max(turnosBase, turnoMaxPref);

  // Grilla: turno → Set de canchas libres. Trabajo con Sets para tomar la cancha
  // menor disponible y borrar al asignar sin tener que mantener índices.
  const grilla = {};
  for (let t = 1; t <= numTurnos; t++) {
    grilla[t] = new Set();
    for (let c = 1; c <= numCanchas; c++) grilla[t].add(c);
  }

  const buscarCercano = (t) => {
    if (grilla[t]?.size > 0) return t;
    for (let d = 1; d <= numTurnos; d++) {
      if (grilla[t + d]?.size > 0) return t + d;
      if (t - d >= 1 && grilla[t - d]?.size > 0) return t - d;
    }
    return null;
  };
  const primerLibre = () => {
    for (let t = 1; t <= numTurnos; t++) {
      if (grilla[t].size > 0) return t;
    }
    return null;
  };

  // Primero las preferencias (turno asc), luego los partidos sin preferencia.
  const conPref = entradas.filter(e => e.preferido !== null)
                          .sort((a, b) => a.preferido - b.preferido);
  const sinPref = entradas.filter(e => e.preferido === null);
  const asignados = new Array(partidos.length);

  const colocar = (entrada, turno) => {
    const cancha = Math.min(...grilla[turno]);
    grilla[turno].delete(cancha);
    asignados[entrada.idx] = { p: entrada.p, turno, cancha };
  };

  for (const e of conPref) {
    const t = buscarCercano(e.preferido) || primerLibre();
    if (t) colocar(e, t);
  }
  for (const e of sinPref) {
    const t = primerLibre();
    if (t) colocar(e, t);
  }

  return asignados.map(({ p, turno, cancha }) => {
    const mins = h * 60 + m + (turno - 1) * tiempoTotal;
    const hh = Math.floor(mins / 60) % 24;
    const mm = mins % 60;
    return { ...p, cancha, hora: `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}` };
  });
}

function formatFecha(fecha) {
  if (!fecha) return "—";
  const [y, mo, d] = fecha.split("-");
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${meses[parseInt(mo)-1]} ${y}`;
}

// Mapa día (texto de la liga) → índice JS (0 = domingo). El campo liga.dia se
// almacena con tilde en "Miércoles" y "Sábado", así que aquí debe coincidir.
const DIAS_SEMANA = {
  "Domingo": 0, "Lunes": 1, "Martes": 2, "Miércoles": 3,
  "Jueves": 4, "Viernes": 5, "Sábado": 6,
};

// Devuelve YYYY-MM-DD evitando desfases de huso horario (toISOString usa UTC).
function fechaISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Próxima ocurrencia estricta del día de la liga: si hoy ya es ese día, salta a
// la semana siguiente. La jornada del día corriente normalmente ya está armada,
// así que el caso útil es preparar la de la próxima semana.
function proximoDiaLiga(diaTexto, base = new Date()) {
  const target = DIAS_SEMANA[diaTexto];
  if (target === undefined) return "";
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const diff = (target - d.getDay() + 7) % 7;
  const offset = diff === 0 ? 7 : diff;
  d.setDate(d.getDate() + offset);
  return fechaISO(d);
}

// Suma días a una fecha YYYY-MM-DD interpretándola como local (sin UTC).
function sumarDias(fechaStr, dias) {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + dias);
  return fechaISO(dt);
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────
export default function ScheduleGenerator({ session, liga, cancha, miUnidad, headerExtra }) {
  const [tab, setTab] = useState("jornada"); // jornada | liguilla | bracket
  const [equipos, setEquipos] = useState([]);
  const [historial, setHistorial] = useState({});
  const [jornadasGuardadas, setJornadasGuardadas] = useState([]);
  const [clasificacion, setClasificacion] = useState([]);
  const [liguilla, setLiguilla] = useState(null);
  const [preview, setPreview] = useState(null);
  const [config, setConfig] = useState({
    // El número de canchas se toma del registro de la unidad (cancha o miUnidad).
    numCanchas: cancha?.num_canchas || miUnidad?.num_canchas || 2,
    intervalo: 60,
    horaInicio: "08:00",
    fecha: "",
  });
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState(null);
  // Edición local del mapa equipoId → turno_comprado. Se hidrata desde equipos
  // y queda "sucia" hasta que el admin confirma con Guardar compras.
  const [compras, setCompras] = useState({});
  const [guardandoCompras, setGuardandoCompras] = useState(false);
  const token = session?.access_token;

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  const cargarTodo = async () => {
    setLoading(true);
    try {
      const [eqs, jors, fichas, liguillaData] = await Promise.all([
        db(`/equipos?liga_id=eq.${liga.id}&select=*&order=nombre`, token),
        // Embebemos los partidos completos: necesitamos los equipos para
        // reconstruir el historial efectivo (fichas cerradas + abiertas), y la
        // hora para sugerir el horario de la próxima jornada.
        db(`/jornadas?liga_id=eq.${liga.id}&select=*,partidos(hora,equipo_local_id,equipo_visitante_id)&order=numero`, token),
        db(`/ficha_partido?select=*,partidos(jornada_id,equipo_local_id,equipo_visitante_id,jornadas(liga_id))`, token),
        db(`/liguilla_partidos?liga_id=eq.${liga.id}&select=*&order=created_at`, token),
      ]);
      // Solo los equipos activos entran al emparejamiento de jornadas nuevas.
      // Los dados de baja se excluyen aquí, pero siguen contando en la
      // clasificación (ver calcularClasificacion) para no alterar a sus rivales.
      const equiposActivos = (eqs || []).filter(e => e.activo !== false);
      setEquipos(equiposActivos);
      setCompras(
        Object.fromEntries(equiposActivos.map(e => [e.id, e.turno_comprado || 0]))
      );
      setJornadasGuardadas(jors || []);

      // Historial efectivo: derivado de los PARTIDOS actuales (no de la tabla
      // historial_enfrentamientos, que se quedaba congelada con la versión
      // inicial). Cuenta tanto fichas cerradas como abiertas: si el admin
      // reorganiza una jornada (intercambia equipos entre slots), el cambio
      // se refleja inmediatamente aquí y la próxima jornada no repite el
      // nuevo enfrentamiento. Las fichas cerradas siguen siendo la fuente
      // definitiva; las abiertas son planeación que también evitamos repetir.
      const h = {};
      (jors || []).forEach(j => {
        (j.partidos || []).forEach(p => {
          if (!p.equipo_local_id || !p.equipo_visitante_id) return;
          const key = [p.equipo_local_id, p.equipo_visitante_id].sort().join("-");
          h[key] = true;
        });
      });
      setHistorial(h);

      // Calcular clasificación desde fichas
      const fichasFiltradas = (fichas || []).filter(f =>
        f.cerrada && f.partidos?.jornadas?.liga_id === liga.id && !f.es_liguilla
      );
      setClasificacion(calcularClasificacion(eqs || [], fichasFiltradas));

      // Liguilla guardada
      if (liguillaData?.length > 0) setLiguilla(liguillaData);

      // Sugerencia automática de fecha y hora para la próxima jornada:
      // - Si ya hay jornadas guardadas: fecha = última + 7 días, hora = la del
      //   primer partido de la última jornada (lo que el usuario suele repetir).
      // - Si no hay jornadas: fecha = próximo día de la semana del torneo
      //   (liga.dia), hora se deja como esté para no pisar lo que el usuario haya
      //   tocado.
      const lista = jors || [];
      if (lista.length > 0) {
        const ultima = lista[lista.length - 1];
        const horas = (ultima.partidos || []).map(p => p.hora).filter(Boolean).sort();
        const horaSugerida = horas[0] ? horas[0].slice(0, 5) : null;
        const fechaSugerida = ultima.fecha ? sumarDias(ultima.fecha, 7) : "";
        setConfig(c => ({
          ...c,
          fecha: fechaSugerida || c.fecha,
          horaInicio: horaSugerida || c.horaInicio,
        }));
      } else if (liga?.dia) {
        const fechaSugerida = proximoDiaLiga(liga.dia);
        if (fechaSugerida) setConfig(c => ({ ...c, fecha: fechaSugerida }));
      }

    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  // Recibe TODOS los equipos (activos + dados de baja) para que las fichas
  // cerradas contra un equipo dado de baja sigan sumando a sus rivales. Los
  // equipos dados de baja se descartan al final, solo de la presentación.
  const calcularClasificacion = (eqs, fichas) => {
    const tabla = {};
    eqs.forEach(eq => { tabla[eq.id] = { equipo: eq, pj:0, g:0, e:0, d:0, gf:0, gc:0, pts:0 }; });
    fichas.forEach(f => {
      const lId = f.partidos?.equipo_local_id;
      const vId = f.partidos?.equipo_visitante_id;
      if (!lId || !vId || !tabla[lId] || !tabla[vId]) return;
      tabla[lId].pj++; tabla[vId].pj++;
      tabla[lId].gf += f.goles_local || 0; tabla[lId].gc += f.goles_visitante || 0;
      tabla[vId].gf += f.goles_visitante || 0; tabla[vId].gc += f.goles_local || 0;
      if ((f.goles_local||0) > (f.goles_visitante||0)) { tabla[lId].g++; tabla[lId].pts+=3; tabla[vId].d++; }
      else if ((f.goles_local||0) < (f.goles_visitante||0)) { tabla[vId].g++; tabla[vId].pts+=3; tabla[lId].d++; }
      else { tabla[lId].e++; tabla[lId].pts++; tabla[vId].e++; tabla[vId].pts++; }
    });
    return Object.values(tabla)
      .filter(r => r.equipo.activo !== false)
      .sort((a,b) => b.pts-a.pts || (b.gf-b.gc)-(a.gf-a.gc));
  };

  useEffect(() => {
    if (liga?.id) { cargarTodo(); }
  }, [liga?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── GENERAR PREVIEW DE JORNADA ──
  const handlePreviewJornada = () => {
    if (equipos.length < 2) return showToast("Necesitas al menos 2 equipos", "err");
    if (!config.fecha) return showToast("Selecciona la fecha de la jornada", "err");
    const numJornada = jornadasGuardadas.length + 1;
    const { partidos, descansos } = generarUnaJornada(equipos, historial, numJornada);
    const turnoComprado = Object.fromEntries(
      equipos.filter(e => e.turno_comprado).map(e => [e.id, e.turno_comprado])
    );
    const conHorarios = asignarHorarios(partidos, config.numCanchas, config.intervalo, config.horaInicio, turnoComprado);
    setPreview({ partidos: conHorarios, descansos, numero: numJornada });
  };

  // ── GUARDAR JORNADA ──
  // Solo se guardan partidos con AMBOS equipos asignados. Los slots con un solo equipo
  // o sin equipos no se persisten; el equipo no asignado aparecerá como "descansa".
  // El historial_enfrentamientos refleja exactamente lo guardado para que las jornadas
  // siguientes generen pareos sin repetir lo ya jugado.
  const handleGuardarJornada = async () => {
    if (!preview) return;
    const partidosCompletos = preview.partidos.filter(p => p.local && p.visitante);
    if (partidosCompletos.length === 0) {
      return showToast("La jornada no tiene partidos completos para guardar", "err");
    }
    setGuardando(true);
    try {
      const jornada = await db("/jornadas", token, {
        method: "POST",
        body: JSON.stringify({ liga_id: liga.id, numero: preview.numero, fecha: config.fecha })
      });
      const jornadaId = Array.isArray(jornada) ? jornada[0]?.id : jornada?.id;

      for (const p of partidosCompletos) {
        await db("/partidos", token, {
          method: "POST",
          body: JSON.stringify({
            jornada_id: jornadaId,
            equipo_local_id: p.local.id,
            equipo_visitante_id: p.visitante.id,
            cancha_numero: p.cancha,
            hora: p.hora,
          })
        });
        await db("/historial_enfrentamientos", token, {
          method: "POST",
          body: JSON.stringify({
            liga_id: liga.id,
            equipo_a_id: p.local.id,
            equipo_b_id: p.visitante.id,
            jornada_numero: preview.numero,
          })
        });
      }
      showToast(`Jornada ${preview.numero} guardada ✓`);
      setPreview(null);
      // No vaciamos fecha/hora: cargarTodo() las recalcula a partir de la jornada
      // recién guardada (próxima fecha = +7 días, misma hora de inicio).
      cargarTodo();
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  // ── EDICIÓN DEL PREVIEW: sacar equipo asignado al pool de descansos ──
  const sacarEquipoPreview = (partidoIdx, lado) => {
    if (!preview) return;
    const partido = preview.partidos[partidoIdx];
    const equipo = partido[lado];
    if (!equipo) return;
    const nuevosPartidos = preview.partidos.map((p, i) =>
      i === partidoIdx ? { ...p, [lado]: null } : p
    );
    setPreview({ ...preview, partidos: nuevosPartidos, descansos: [...preview.descansos, equipo] });
  };

  // ── EDICIÓN DEL PREVIEW: asignar equipo del pool al primer hueco ──
  // Orden: hora más temprana → cancha menor → local antes que visitante en el mismo slot.
  const asignarEquipoPreview = (equipoId) => {
    if (!preview) return;
    const equipo = preview.descansos.find(e => e.id === equipoId);
    if (!equipo) return;
    const indices = preview.partidos.map((p, i) => ({ p, i }))
      .sort((a, b) =>
        (a.p.hora || "").localeCompare(b.p.hora || "") ||
        ((a.p.cancha || 0) - (b.p.cancha || 0))
      );
    let asignadoEnIdx = -1, lado = null;
    for (const { p, i } of indices) {
      if (!p.local)     { asignadoEnIdx = i; lado = "local";     break; }
      if (!p.visitante) { asignadoEnIdx = i; lado = "visitante"; break; }
    }
    if (asignadoEnIdx < 0) {
      return showToast("No hay huecos libres en esta jornada", "err");
    }
    const nuevosPartidos = preview.partidos.map((p, i) =>
      i === asignadoEnIdx ? { ...p, [lado]: equipo } : p
    );
    setPreview({
      ...preview,
      partidos: nuevosPartidos,
      descansos: preview.descansos.filter(e => e.id !== equipoId),
    });
  };

  // ── GENERAR LIGUILLA Y COPA ──
  const handleGenerarLiguilla = async () => {
    if (clasificacion.length < 2) return showToast("No hay suficientes equipos en la tabla", "err");
    if (!config.fecha) return showToast("Selecciona la fecha para la liguilla", "err");
    setGuardando(true);
    try {
      // Crear jornada de cuartos
      const jornada = await db("/jornadas", token, {
        method: "POST",
        body: JSON.stringify({ liga_id: liga.id, numero: jornadasGuardadas.length + 1, fecha: config.fecha })
      });
      const jornadaId = Array.isArray(jornada) ? jornada[0]?.id : jornada?.id;

      const n = clasificacion.length;
      const liguillaPares = [];
      const copaPares = [];
      const amistosos = [];

      // Top 8 → Liguilla
      const top8 = clasificacion.slice(0, Math.min(8, n));
      for (let i = 0; i < Math.floor(top8.length / 2); i++) {
        liguillaPares.push({ local: top8[i], visitante: top8[top8.length - 1 - i], fase: "cuartos", tipo: "liguilla" });
      }

      // 9-16 → Copa
      if (n > 8) {
        const copa = clasificacion.slice(8, Math.min(16, n));
        for (let i = 0; i < Math.floor(copa.length / 2); i++) {
          copaPares.push({ local: copa[i], visitante: copa[copa.length - 1 - i], fase: "cuartos", tipo: "copa" });
        }
      }

      // Más de 16 → Amistosos
      if (n > 16) {
        const resto = clasificacion.slice(16);
        for (let i = 0; i < Math.floor(resto.length / 2); i++) {
          amistosos.push({ local: resto[i*2], visitante: resto[i*2+1], fase: "cuartos", tipo: "amistoso" });
        }
      }

      const todos = [...liguillaPares, ...copaPares, ...amistosos];
      const conHorarios = asignarHorarios(todos, config.numCanchas, config.intervalo, config.horaInicio);

      for (const p of conHorarios) {
        await db("/liguilla_partidos", token, {
          method: "POST",
          body: JSON.stringify({
            liga_id: liga.id,
            jornada_id: jornadaId,
            tipo: p.tipo,
            fase: p.fase,
            equipo_local_id: p.local.equipo.id,
            equipo_visitante_id: p.visitante.equipo.id,
            cancha_numero: p.cancha,
            hora: p.hora,
          })
        });
      }

      showToast("Liguilla y Copa generadas ✓");
      setTab("bracket");
      cargarTodo();
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  // ── COMPRA DE HORARIO ──
  // Número de turnos disponibles esta jornada (ceil de equipos/canchas). Es el
  // tope superior para el select y para el chequeo de capacidad por turno.
  const numTurnosDisponibles = Math.max(
    1, Math.ceil(equipos.length / (config.numCanchas || 1))
  );

  // Hora estimada del turno N a partir de la configuración actual. Es solo
  // referencia visual: la hora real depende del horaInicio de cada jornada.
  const horaEstimadaTurno = (turno) => {
    const [h, m] = (config.horaInicio || "08:00").split(":").map(Number);
    const mins = h * 60 + m + (turno - 1) * config.intervalo;
    const hh = Math.floor(mins / 60) % 24;
    const mm = mins % 60;
    return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
  };

  // Cuenta cuántos equipos están asignados a cada turno según el estado local.
  // Permite bloquear sobreventa: numCanchas equipos máximo por turno.
  const conteoPorTurno = (turno) => {
    let n = 0;
    for (const id in compras) if (compras[id] === turno) n++;
    return n;
  };

  const cambiarCompra = (equipoId, turno) => {
    if (turno > 0 && conteoPorTurno(turno) >= config.numCanchas
        && compras[equipoId] !== turno) {
      return showToast(`Turno ${turno} agotado (${config.numCanchas} cupos)`, "err");
    }
    setCompras(c => ({ ...c, [equipoId]: turno }));
  };

  const guardarCompras = async () => {
    setGuardandoCompras(true);
    try {
      // Solo PATCH los equipos cuyo turno cambió frente a la versión cargada.
      const cambios = equipos.filter(e => (e.turno_comprado || 0) !== (compras[e.id] || 0));
      for (const e of cambios) {
        const nuevo = compras[e.id] > 0 ? compras[e.id] : null;
        await db(`/equipos?id=eq.${e.id}`, token, {
          method: "PATCH",
          body: JSON.stringify({ turno_comprado: nuevo }),
        });
      }
      showToast(cambios.length
        ? `${cambios.length} equipo${cambios.length === 1 ? "" : "s"} actualizado${cambios.length === 1 ? "" : "s"} ✓`
        : "Sin cambios que guardar");
      cargarTodo();
    } catch (e) { showToast(e.message, "err"); }
    setGuardandoCompras(false);
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {toast && <div className={`ifutbol-toast ${toast.tipo==="err"?"toast-err":"toast-ok"}`}>{toast.msg}</div>}

      {/*
        Encabezado de Calendario.
        - El nombre de la unidad pasa a la línea de "label" pequeña arriba
          (antes ocupaba el lugar destacado del hero).
        - El título principal es "Calendario" para que coincida con el nombre
          del apartado en la sidebar.
        - El nombre de la liga NO se muestra aquí: el chip activo del selector
          de torneos (verde) ya lo deja claro, y duplicarlo es ruido.
      */}
      <div style={s.heroCard}>
        <div style={s.heroOverlay} />
        <div style={s.heroInner}>
          <div style={s.heroHeadRow}>
            {miUnidad && (
              <div style={s.heroLogoSmall}>
                {miUnidad.logo_url
                  ? <img src={miUnidad.logo_url} alt={miUnidad.nombre} style={s.heroUnitLogoImg} />
                  : <span style={{ fontSize:20 }}>🏟️</span>}
              </div>
            )}
            <div style={{ flex:1, minWidth:0 }}>
              {miUnidad && <div style={s.heroUnitLabelSmall}>{miUnidad.nombre}</div>}
              <div style={s.heroTitleRow}>
                <span style={s.heroEmoji}>📅</span>
                <h2 style={s.heroTitle}>Calendario</h2>
              </div>
            </div>
            <div style={s.heroBottomRight}>
              <div style={s.heroStatBox}>
                <div style={s.heroStatNumber}>{equipos.length}</div>
                <div style={s.heroStatLabel}>EQUIPOS</div>
              </div>
              <div style={s.heroStatBox}>
                <div style={s.heroStatNumber}>{jornadasGuardadas.length}</div>
                <div style={s.heroStatLabel}>JORNADAS</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selector de torneos: arriba para elegir primero sobre cuál se trabaja */}
      {headerExtra}

      {/* TABS — quedan por debajo del selector de torneos */}
      <div className="ifutbol-tabs">
        {[["jornada","📅 Generar jornada"],["liguilla","🏆 Liguilla y Copa"],["bracket","🎯 Bracket"]].map(([key,label])=>(
          <button key={key} className={`ifutbol-tab ${tab===key?"active":""}`} onClick={()=>setTab(key)}>{label}</button>
        ))}
      </div>

      {loading ? <div style={{ padding:60, textAlign:"center" }}><div className="spinner"/></div> : <>

        {/* ── TAB: GENERAR JORNADA ── */}
        {tab==="jornada" && (
          <div style={s.tabContent}>
            <div style={s.twoCol}>
              {/* CONFIGURACIÓN */}
              <div style={s.card}>
                <h3 style={s.cardTitle}>⚙️ Configuración de la jornada</h3>
                <div style={s.field}>
                  <label style={s.label}>Fecha de la jornada *</label>
                  <input type="date" className="form-input" value={config.fecha} onChange={e=>setConfig({...config,fecha:e.target.value})} />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Hora de inicio</label>
                  <input type="time" className="form-input" value={config.horaInicio} onChange={e=>setConfig({...config,horaInicio:e.target.value})} />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Canchas simultáneas</label>
                  <div style={{ display:"flex", gap:8 }}>
                    {[1,2,3,4].map(n=>(
                      <button key={n} className={`num-btn ${config.numCanchas===n?"active":""}`} onClick={()=>setConfig({...config,numCanchas:n})}>{n}</button>
                    ))}
                  </div>
                </div>
                <div style={s.field}>
                  <label style={s.label}>Tiempo entre partidos: <strong>{config.intervalo} min</strong></label>
                  <input type="range" className="ifutbol-slider" min="30" max="120" step="5"
                    value={config.intervalo}
                    onChange={e=>setConfig({...config,intervalo:+e.target.value})} />
                </div>
                <button className="btn btn-premium" style={{ width:"100%" }} onClick={handlePreviewJornada}>
                  Vista previa jornada {jornadasGuardadas.length+1} →
                </button>
              </div>

              {/* PREVIEW — colocada entre Configuración y Equipos activos para
                  que el resultado aparezca justo debajo del formulario que lo
                  generó (los Equipos activos pasan al final de la columna). */}
              {preview && (
                <div style={s.card}>
                  <div style={s.previewHeader}>
                    <div>
                      <h3 style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>Vista previa — Jornada {preview.numero}</h3>
                      <p style={{ color:"var(--text-muted)", fontSize:13 }}>{formatFecha(config.fecha)} · {preview.partidos.length} partidos</p>
                    </div>
                    <button className="btn btn-ghost" onClick={()=>setPreview(null)}>✕ Descartar</button>
                  </div>
                  <div style={ej.hint}>
                    👆 Edita antes de guardar: toca un equipo para sacarlo al pool de descansos; toca un equipo del pool para colocarlo en el siguiente hueco libre (horario más temprano primero). Una vez guardada, la jornada no podrá modificarse.
                  </div>

                  {Array.from({length:config.numCanchas},(_,ci)=>{
                    // Indices originales en preview.partidos para que sacarEquipoPreview reciba el idx correcto
                    const pcs = preview.partidos
                      .map((p, idx) => ({ p, idx }))
                      .filter(({ p }) => p.cancha === ci+1);
                    if (!pcs.length) return null;
                    return (
                      <div key={ci} style={{ marginBottom:16 }}>
                        <div style={s.canchaLabel}>🏟️ Cancha {ci+1}</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                          {pcs.map(({ p, idx }) => (
                            <div key={idx} style={s.partidoRow}>
                              <span style={s.hora}>{p.hora}</span>
                              <div style={s.vsBlock}>
                                <div style={{ ...ej.slot, ...(p.local ? {} : ej.slotVacio) }}
                                     onClick={() => p.local && sacarEquipoPreview(idx, "local")}
                                     title={p.local ? "Sacar este equipo al pool" : "Hueco vacío"}>
                                  {p.local ? (
                                    <>
                                      <span style={{ ...ej.dot, background: p.local.color_playera || "var(--green)" }}/>
                                      <span style={ej.eqNombre}>{p.local.nombre}</span>
                                    </>
                                  ) : (
                                    <span style={ej.huecoTxt}>+ Hueco</span>
                                  )}
                                </div>
                                <span style={s.vsTag}>VS</span>
                                <div style={{ ...ej.slot, ...(p.visitante ? {} : ej.slotVacio), justifyContent: "flex-end" }}
                                     onClick={() => p.visitante && sacarEquipoPreview(idx, "visitante")}
                                     title={p.visitante ? "Sacar este equipo al pool" : "Hueco vacío"}>
                                  {p.visitante ? (
                                    <>
                                      <span style={ej.eqNombre}>{p.visitante.nombre}</span>
                                      <span style={{ ...ej.dot, background: p.visitante.color_playera || "#999" }}/>
                                    </>
                                  ) : (
                                    <span style={ej.huecoTxt}>+ Hueco</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ paddingTop:12, borderTop:"1px solid var(--border)" }}>
                    <div style={s.canchaLabel}>😴 Descansa esta jornada ({preview.descansos.length})</div>
                    {preview.descansos.length === 0 ? (
                      <div style={ej.poolEmpty}>Sin equipos en descanso</div>
                    ) : (
                      <div style={ej.poolGrid}>
                        {preview.descansos.map(d => (
                          <button key={d.id} style={ej.poolChip} onClick={() => asignarEquipoPreview(d.id)}
                                  title="Asignar al primer hueco disponible">
                            <span style={{ ...ej.dot, background: d.color_playera || "#9ca3af" }}/>
                            <span style={ej.poolChipNombre}>{d.nombre}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16, gap:8, flexWrap:"wrap" }}>
                    <button className="btn btn-ghost" onClick={handlePreviewJornada} disabled={guardando}
                            title="Regenerar enfrentamientos automáticamente">
                      🔄 Regenerar
                    </button>
                    <button className="btn btn-premium" style={{ padding:"12px 28px" }} onClick={handleGuardarJornada} disabled={guardando}>
                      {guardando ? "Guardando..." : "💾 Guardar jornada"}
                    </button>
                  </div>
                </div>
              )}

              {/* El listado de equipos activos se eliminó del calendario: ya hay
                  contadores de equipos y jornadas en el hero, que es suficiente. */}
            </div>

            {/* ── COMPRA DE HORARIO ──
                Se coloca al final de la tab porque se configura una sola vez al
                inicio del torneo y casi nunca se modifica. Los equipos que paguen
                por un turno fijo van a jugarlo siempre, salvo que se enfrenten a
                otro equipo con turno comprado (en ese caso se honra al local y
                el round-robin alterna ida/vuelta de forma natural). */}
            <div style={{ ...s.card, marginTop:14 }}>
              <h3 style={s.cardTitle}>🕐 Compra de horario</h3>
              <div style={{ ...ej.hint, marginBottom:12 }}>
                Cada equipo que haya comprado un horario juega siempre en ese turno.
                Si dos equipos con turno comprado se enfrentan, se honra al local
                — en la vuelta el local cambia y se honra el otro turno automáticamente.
                Máx {config.numCanchas} equipos por turno (= canchas simultáneas).
              </div>
              {equipos.length === 0 ? (
                <div style={ej.poolEmpty}>No hay equipos activos en esta liga.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {[...equipos].sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(eq => {
                    const turnoActual = compras[eq.id] || 0;
                    return (
                      <div key={eq.id} style={{ ...s.equipoRow, gap:10 }}>
                        <span style={{ ...s.dot, background: eq.color_playera || "#999" }}/>
                        <span className="sg-eq-name" style={{ flex:1, fontWeight:700 }}>{eq.nombre}</span>
                        <select
                          className="form-input"
                          style={{ width:"auto", minWidth:140, padding:"6px 10px", fontSize:12 }}
                          value={turnoActual}
                          onChange={e => cambiarCompra(eq.id, Number(e.target.value))}
                        >
                          <option value={0}>Sin compra</option>
                          {Array.from({ length: numTurnosDisponibles }, (_, i) => i + 1).map(t => {
                            const cupos = conteoPorTurno(t);
                            const lleno = cupos >= config.numCanchas && turnoActual !== t;
                            return (
                              <option key={t} value={t} disabled={lleno}>
                                Turno {t} (~{horaEstimadaTurno(t)}){lleno ? " — lleno" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display:"flex", justifyContent:"flex-end", marginTop:14 }}>
                <button
                  className="btn btn-premium"
                  onClick={guardarCompras}
                  disabled={guardandoCompras || equipos.length === 0}
                >
                  {guardandoCompras ? "Guardando..." : "💾 Guardar compras"}
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ── TAB: LIGUILLA Y COPA ── */}
        {tab==="liguilla" && (
          <div style={s.tabContent}>
            <div style={s.card}>
              <h3 style={s.cardTitle}>🏆 Generar Liguilla y Copa</h3>
              <p style={{ color:"var(--text-muted)", fontSize:13, marginBottom:20 }}>
                Se generará en base a la tabla actual. Los cuartos de final se asignarán automáticamente.
              </p>

              {/* TABLA ACTUAL */}
              <div style={{ marginBottom:20 }}>
                <div style={s.label}>Tabla actual ({clasificacion.length} equipos)</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:320, overflowY:"auto" }}>
                  {clasificacion.map((r,i)=>(
                    <div key={r.equipo.id} style={{ ...s.equipoRow, background: i<8?"#f0fdf4":i<16?"#fffbeb":"#f9fafb" }}>
                      <span style={{ ...s.rankBadge, background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":i<8?"var(--green-light)":i<16?"#fef9c3":"#f3f4f6", color:i<3?"#111":i<8?"var(--green)":i<16?"#854d0e":"#888" }}>{i+1}</span>
                      <div style={{ ...s.dot, background:r.equipo.color_playera||"#999" }}/>
                      <span className="sg-eq-name">{r.equipo.nombre}</span>
                      <span style={{ fontSize:11.5, fontWeight:800, color:"var(--green)", flexShrink:0 }}>{r.pts} pts</span>
                      {i < 8 && <span style={s.liguillaChip}>Liguilla</span>}
                      {i >= 8 && i < 16 && <span style={s.copaChip}>Copa</span>}
                      {i >= 16 && <span style={s.amistosChip}>Amistoso</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* PREVIEW CRUCES */}
              {clasificacion.length >= 2 && (
                <div style={{ marginBottom:20 }}>
                  <div style={s.label}>Cruces de cuartos de final</div>
                  <div style={s.crucesGrid}>
                    <div>
                      <div style={s.crucesTitle}>🏆 Liguilla</div>
                      {Array.from({length:Math.min(4,Math.floor(Math.min(8,clasificacion.length)/2))},(_,i)=>{
                        const a = clasificacion[i];
                        const b = clasificacion[Math.min(8,clasificacion.length)-1-i];
                        if (!a||!b) return null;
                        return (
                          <div key={i} style={s.cruceRow}>
                            <span className="sg-eq-name" style={{ fontWeight:700, color:"var(--green)" }}>#{i+1} {a.equipo.nombre}</span>
                            <span style={s.vsTag}>VS</span>
                            <span className="sg-eq-name-r" style={{ fontWeight:700, color:"var(--green)" }}>#{Math.min(8,clasificacion.length)-i} {b.equipo.nombre}</span>
                          </div>
                        );
                      })}
                    </div>
                    {clasificacion.length > 8 && (
                      <div>
                        <div style={s.crucesTitle}>🥈 Copa</div>
                        {Array.from({length:Math.min(4,Math.floor(Math.min(8,clasificacion.length-8)/2))},(_,i)=>{
                          const a = clasificacion[8+i];
                          const b = clasificacion[Math.min(16,clasificacion.length)-1-i];
                          if (!a||!b) return null;
                          return (
                            <div key={i} style={s.cruceRow}>
                              <span className="sg-eq-name" style={{ fontWeight:700, color:"#b45309" }}>#{9+i} {a.equipo.nombre}</span>
                              <span style={s.vsTag}>VS</span>
                              <span className="sg-eq-name-r" style={{ fontWeight:700, color:"#b45309" }}>#{Math.min(16,clasificacion.length)-i} {b.equipo.nombre}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={s.fieldRow}>
                <div style={{ flex:1 }}>
                  <label style={s.label}>Fecha de los cuartos de final *</label>
                  <input type="date" className="form-input" value={config.fecha} onChange={e=>setConfig({...config,fecha:e.target.value})} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={s.label}>Hora de inicio</label>
                  <input type="time" className="form-input" value={config.horaInicio} onChange={e=>setConfig({...config,horaInicio:e.target.value})} />
                </div>
              </div>

              <div style={{ height:16 }}/>
              <button className="btn btn-premium" style={{ width:"100%", fontSize:15 }} onClick={handleGenerarLiguilla} disabled={guardando||clasificacion.length<2||!config.fecha}>
                {guardando ? "Generando..." : "🏆 Generar Liguilla y Copa"}
              </button>
            </div>
          </div>
        )}

        {/* ── TAB: BRACKET ── */}
        {tab==="bracket" && (
          <BracketView liguilla={liguilla} equipos={equipos} token={token} liga={liga} onRefresh={cargarTodo} showToast={showToast} />
        )}
      </>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// BRACKET VIEW — modal de registro + dos árboles (liguilla y copa)
// ─────────────────────────────────────────────────────────────────
// El árbol visual vive en components/BracketTree.jsx para que la
// vista pública (UnidadPage en App.jsx) lo pueda reusar en modo
// solo-lectura.
function BracketView({ liguilla, equipos, token, liga, onRefresh, showToast }) {
  const [modalPartido, setModalPartido] = useState(null);
  const [ganador, setGanador] = useState("");
  const [guardando, setGuardando] = useState(false);

  if (!liguilla || liguilla.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🎯</div>
        <div className="empty-state-txt">No se ha generado la liguilla aún</div>
        <div className="empty-state-hint">Ve a la pestaña "Liguilla y Copa" para generarla</div>
      </div>
    );
  }

  const getEquipo = id => equipos.find(e => e.id === id);

  const porFaseYTipo = (tipo, fase) => liguilla.filter(p => p.tipo === tipo && p.fase === fase);

  const handleAbrirModal = (partido) => {
    setModalPartido(partido);
    setGanador(partido.equipo_avanza_id || "");
  };

  const handleGuardarAvance = async () => {
    if (!ganador) return showToast("Selecciona el equipo que avanza", "err");
    setGuardando(true);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/liguilla_partidos?id=eq.${modalPartido.id}`, {
        method: "PATCH",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ equipo_avanza_id: ganador, cerrado: true })
      });
      showToast("Resultado guardado ✓");
      setModalPartido(null);
      onRefresh();
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  const liguillaPartidos = {
    cuartos: porFaseYTipo("liguilla","cuartos"),
    semis: porFaseYTipo("liguilla","semis"),
    final: porFaseYTipo("liguilla","final"),
    tercer: porFaseYTipo("liguilla","3er_lugar"),
  };
  const copaPartidos = {
    cuartos: porFaseYTipo("copa","cuartos"),
    semis: porFaseYTipo("copa","semis"),
    final: porFaseYTipo("copa","final"),
    tercer: porFaseYTipo("copa","3er_lugar"),
  };

  const hayBracket = liguillaPartidos.cuartos.length > 0 || copaPartidos.cuartos.length > 0;

  return (
    <div style={s.tabContent}>
      {!hayBracket && (
        <div className="empty-state">
          <div className="empty-state-icon">🎯</div>
          <div className="empty-state-txt">Aún no hay cruces de bracket</div>
          <div className="empty-state-hint">Ve a la pestaña "Liguilla y Copa" para generarlos</div>
        </div>
      )}

      {/* LIGUILLA */}
      <BracketTree
        titulo="Liguilla" emoji="🏆"
        partidos={liguillaPartidos}
        colors={["#4f8f2f", "#3b82f6", "#f59e0b"]}
        getEquipo={getEquipo} onAbrir={handleAbrirModal}
        cardStyle={s.card}
      />

      {/* COPA */}
      <BracketTree
        titulo="Copa" emoji="🥈"
        partidos={copaPartidos}
        colors={["#b45309", "#7c3aed", "#dc2626"]}
        getEquipo={getEquipo} onAbrir={handleAbrirModal}
        topGap={liguillaPartidos.cuartos.length > 0}
        cardStyle={s.card}
      />

      {/* MODAL REGISTRAR RESULTADO */}
      {modalPartido && (
        <div className="ifutbol-overlay" onClick={()=>setModalPartido(null)}>
          <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:420 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
              <h3 style={{ fontSize:18, fontWeight:800 }}>Registrar resultado</h3>
              <button style={s.closeBtn} onClick={()=>setModalPartido(null)}>✕</button>
            </div>
            <p style={{ color:"var(--text-muted)", fontSize:13, marginBottom:20 }}>
              {modalPartido.tipo === "liguilla" ? "🏆 Liguilla" : "🥈 Copa"} · {modalPartido.fase}
            </p>
            <div style={s.field}>
              <label style={s.label}>¿Quién avanza a la siguiente ronda?</label>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[modalPartido.equipo_local_id, modalPartido.equipo_visitante_id].map(id => {
                  const eq = equipos.find(e => e.id === id);
                  if (!eq) return null;
                  return (
                    <button key={id} onClick={()=>setGanador(id)}
                      style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderRadius:12, border:`2px solid ${ganador===id?"var(--green)":"var(--border)"}`, background:ganador===id?"var(--green-light)":"white", cursor:"pointer", transition:"all 0.2s", fontFamily:"'DM Sans',sans-serif" }}>
                      <div style={{ ...s.dot, background:eq.color_playera||"#999", width:14, height:14 }}/>
                      <span style={{ fontWeight:700, fontSize:15, color:ganador===id?"var(--green)":"var(--text)" }}>{eq.nombre}</span>
                      {ganador===id && <span style={{ marginLeft:"auto", color:"var(--green)", fontWeight:800 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ height:16 }}/>
            <button className="btn btn-premium" style={{ width:"100%" }} onClick={handleGuardarAvance} disabled={guardando||!ganador}>
              {guardando ? "Guardando..." : "Confirmar y guardar →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────
const s = {
  wrap: { width:"100%", minWidth:0 },
  // ── HERO HEADER COMBINADO (verde gradiente como card-green) ──
  heroCard: { position:"relative", overflow:"hidden", background:"linear-gradient(145deg, #4f8f2f 0%, #3a6b22 100%)", borderRadius:"var(--radius-lg)", padding:"14px 16px", marginBottom:14, boxShadow:"var(--shadow-green)", color:"#fff" },
  heroOverlay: { position:"absolute", top:-30, right:-30, width:160, height:160, borderRadius:"50%", background:"radial-gradient(circle, rgba(127,191,77,0.45) 0%, rgba(127,191,77,0) 70%)", pointerEvents:"none" },
  heroInner: { position:"relative", zIndex:1 },
  // Cabecera compacta: logo a la izquierda, columna central (unidad pequeña + título grande + liga),
  // stats a la derecha. Sustituye al patrón antiguo de dos filas con nombre de unidad enorme.
  heroHeadRow: { display:"flex", alignItems:"center", gap:12 },
  heroLogoSmall: { width:46, height:46, borderRadius:12, background:"rgba(255,255,255,0.20)", border:"2px solid rgba(255,255,255,0.42)", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0, boxShadow:"0 3px 10px rgba(0,0,0,0.20)" },
  heroUnitLogoImg: { width:"100%", height:"100%", objectFit:"cover" },
  heroUnitLabelSmall: { fontSize:10, fontWeight:700, letterSpacing:0.6, color:"rgba(255,255,255,0.82)", textTransform:"uppercase", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  heroBottomRight: { display:"flex", gap:8, flexShrink:0 },
  heroTitleRow: { display:"flex", alignItems:"center", gap:7 },
  heroEmoji: { fontSize:20, lineHeight:1 },
  heroTitle: { fontSize:22, fontWeight:900, letterSpacing:-0.6, color:"#fff", margin:0, lineHeight:1.1 },
  // Stat boxes a la derecha (rellenan el espacio vacío)
  heroStatBox: { width:54, padding:"6px 4px", borderRadius:10, background:"rgba(255,255,255,0.18)", border:"1px solid rgba(255,255,255,0.32)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.18)", backdropFilter:"blur(2px)" },
  heroStatNumber: { fontSize:20, fontWeight:900, color:"#fff", lineHeight:1, letterSpacing:-0.8, textShadow:"0 1px 2px rgba(0,0,0,0.22)" },
  heroStatLabel: { fontSize:8.5, fontWeight:700, letterSpacing:0.6, color:"rgba(255,255,255,0.88)", textTransform:"uppercase", marginTop:3 },
  // ── RESTO ──
  tabContent: { paddingTop:4 },
  twoCol: { display:"flex", flexDirection:"column", gap:14 },
  card: { background:"white", borderRadius:"var(--radius-md)", padding:14, boxShadow:"var(--shadow-md)", border:"1px solid var(--border)", borderTop:"3px solid var(--green)", minWidth:0, overflow:"hidden" },
  cardTitle: { fontSize:14, fontWeight:800, color:"var(--green-dark)", marginBottom:12, letterSpacing:-0.2 },
  field: { marginBottom:14 },
  fieldRow: { display:"flex", flexDirection:"column", gap:12 },
  label: { display:"block", fontSize:10.5, fontWeight:700, color:"var(--green-dark)", textTransform:"uppercase", letterSpacing:0.6, marginBottom:6 },
  equipoRow: { display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8, background:"linear-gradient(90deg, #f0fdf4 0%, #ffffff 100%)", border:"1px solid #e4efd9", minWidth:0, flexWrap:"wrap" },
  dot: { width:12, height:12, borderRadius:"50%", flexShrink:0, boxShadow:"0 0 0 2px #ffffff, 0 0 0 3px rgba(0,0,0,0.05)" },
  rankBadge: { width:22, height:22, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10.5, fontWeight:800, flexShrink:0 },
  infoBox: { background:"linear-gradient(135deg, #eaf4e0 0%, #d6ebc4 100%)", border:"1px solid #b8d99a", borderRadius:10, padding:"10px 12px", color:"var(--green-dark)", fontSize:11.5, lineHeight:1.45 },
  previewHeader: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:14, paddingBottom:12, borderBottom:"2px solid var(--green-light)", flexWrap:"wrap" },
  canchaLabel: { fontSize:11, fontWeight:800, color:"#fff", background:"var(--green)", textTransform:"uppercase", letterSpacing:0.7, padding:"4px 10px", borderRadius:"var(--radius-full)", display:"inline-block", marginBottom:8 },
  partidoRow: { display:"flex", alignItems:"center", gap:8, padding:"9px 10px", borderRadius:10, background:"#ffffff", border:"1px solid var(--border)", borderLeft:"3px solid var(--green-accent)", minWidth:0 },
  hora: { background:"var(--green)", color:"white", fontSize:11, fontWeight:800, padding:"4px 8px", borderRadius:6, flexShrink:0, minWidth:44, textAlign:"center" },
  vsBlock: { flex:1, display:"flex", alignItems:"center", justifyContent:"space-between", gap:6, minWidth:0 },
  vsTag: { fontSize:10, fontWeight:800, color:"var(--text-muted)", padding:"0 4px", flexShrink:0 },
  descansoChip: { background:"#f3f4f6", color:"var(--text-muted)", fontSize:11, fontWeight:600, padding:"4px 10px", borderRadius:6 }, // legacy
  descansaRow: { display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:9, background:"#f9fafb", border:"1px dashed #d1d5db", minWidth:0 },
  crucesGrid: { display:"flex", flexDirection:"column", gap:14, marginBottom:14 },
  crucesTitle: { fontSize:12.5, fontWeight:700, marginBottom:8 },
  cruceRow: { display:"flex", alignItems:"center", gap:6, padding:"7px 10px", borderRadius:8, background:"var(--bg)", marginBottom:5, fontSize:12, flexWrap:"wrap", minWidth:0 },
  liguillaChip: { background:"var(--green-light)", color:"var(--green)", fontSize:9.5, fontWeight:700, padding:"2px 7px", borderRadius:4, flexShrink:0 },
  copaChip: { background:"#fef9c3", color:"#854d0e", fontSize:9.5, fontWeight:700, padding:"2px 7px", borderRadius:4, flexShrink:0 },
  amistosChip: { background:"#f3f4f6", color:"#6b7280", fontSize:9.5, fontWeight:700, padding:"2px 7px", borderRadius:4, flexShrink:0 },
  bracketRow: { display:"flex", flexDirection:"column", gap:14 },
  bracketCol: { display:"flex", flexDirection:"column", gap:8 },
  bracketColTitle: { fontSize:11.5, fontWeight:800, textTransform:"uppercase", letterSpacing:0.7, marginBottom:6 },
  bracketPartido: { background:"var(--bg)", borderRadius:10, padding:"10px 12px", cursor:"default", border:"1px solid var(--border)", minWidth:0 },
  bracketEquipo: { display:"flex", alignItems:"center", gap:7, marginBottom:5, minWidth:0 },
  gol: { marginLeft:"auto", fontWeight:800, fontSize:13, color:"var(--text)", flexShrink:0 },
  ganadorChip: { background:"var(--green-light)", color:"var(--green)", fontSize:10.5, fontWeight:700, padding:"3px 9px", borderRadius:6, marginTop:4 },
  pendienteChip: { fontSize:10.5, color:"var(--text-muted)", fontStyle:"italic", marginTop:4 },
  bracketPendiente: { background:"#f9fafb", borderRadius:10, padding:"14px", textAlign:"center", color:"var(--text-muted)", fontSize:11.5, fontStyle:"italic", border:"1px dashed var(--border)" },
  closeBtn: { background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, width:30, height:30, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-sub)", flexShrink:0 },
};

// ─────────────────────────────────────────────────────────────────
// Estilos del editor del preview (slots clickeables, pool y huecos)
// ─────────────────────────────────────────────────────────────────
const ej = {
  slot: { flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 7, background: "#f9fafb", border: "1px solid #e5e7eb", cursor: "pointer", minWidth: 0, transition: "all 0.15s" },
  slotVacio: { background: "#fffbeb", border: "1px dashed #fbbf24", cursor: "default" },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  eqNombre: { flex: 1, fontSize: 12, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  huecoTxt: { fontSize: 11, fontStyle: "italic", color: "#92400e", fontWeight: 700 },
  poolGrid: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  poolChip: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", background: "#fff", border: "1.5px solid #c3e6a3", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#15803d", maxWidth: 220 },
  poolChipNombre: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  poolEmpty: { background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 9, padding: "10px", textAlign: "center", color: "#9ca3af", fontSize: 11.5, fontStyle: "italic", marginBottom: 8 },
  hint: { background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af", borderRadius: 9, padding: "9px 12px", fontSize: 11, marginBottom: 12, lineHeight: 1.5 },
  sectionLabel: { fontSize: 11, fontWeight: 800, color: "#4f8f2f", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },
};

const css = `
  .num-btn { width:38px; height:38px; border-radius:9px; border:1.5px solid var(--border); background:white; color:var(--text-sub); font-size:15px; font-weight:700; cursor:pointer; transition:all 0.15s; font-family:'DM Sans',sans-serif; }
  .num-btn:hover { border-color:var(--green); color:var(--green); }
  .num-btn.active { background:var(--green); border-color:var(--green); color:white; }
  /* Truncado de nombres largos en filas flexibles */
  .sg-eq-name { flex:1; min-width:0; font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sg-eq-name-r { font-size:13px; font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:right; }
  .sg-vs-team { display:flex; align-items:center; gap:6px; flex:1; min-width:0; }
`;