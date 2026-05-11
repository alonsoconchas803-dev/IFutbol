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
        <span style={s.ligaLabel}>Liga activa:</span>
        <div style={s.ligaTabs}>
          {ligas.map(l => (
            <button key={l.id}
              onClick={() => { setLigaSeleccionada(l); setEquipoDetalle(null); setSeccion("equipos"); }}
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
          {/* TABS */}
          <div style={s.tabs}>
            {[["equipos","👕","Equipos"],["jugadores","👥","Jugadores"],["calendario","📅","Calendario"],["arbitros","🟡","Árbitros"],["fichas","📄","Fichas"]].map(([key, icon, label]) => (
              <button key={key} onClick={() => { setSeccion(key); setEquipoDetalle(null); }}
                style={{ ...s.tab, ...(seccion === key || (seccion === "detalle" && key === "equipos") ? s.tabActive : {}) }}>
                {icon} {label}
              </button>
            ))}
          </div>

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
          {seccion === "detalle" && equipoDetalle && (
            <div>
              <div style={{ ...s.detalleHeader, borderLeft: `5px solid ${equipoDetalle.color_playera || "#3182ce"}` }}>
                <div style={s.escudoWrapLg}>
                  {equipoDetalle.escudo_url
                    ? <img src={equipoDetalle.escudo_url} alt="escudo" style={s.escudoImgLg} />
                    : <div style={{ ...s.escudoPlaceholderLg, background: equipoDetalle.color_playera || "#3182ce" }}>{equipoDetalle.nombre[0]}</div>}
                </div>
                <div>
                  <h3 style={s.detalleNombre}>{equipoDetalle.nombre}</h3>
                  <p style={s.detalleMeta}>{ligaSeleccionada.nombre} · {jugadoresEquipo.length} jugadores</p>
                </div>
              </div>

              {jugadoresEquipo.length === 0 ? (
                <div style={s.empty}>
                  <div style={s.emptyIcon}>👤</div>
                  <div style={s.emptyTxt}>No hay jugadores inscritos en este equipo aún</div>
                  <p style={{ color: "#555", fontSize: 13 }}>Los jugadores se inscriben ellos mismos desde su perfil</p>
                </div>
              ) : (
                <div style={s.jugadorList}>
                  {jugadoresEquipo.map(je => (
                    <div key={je.id} style={s.jugadorRow}>
                      <div style={s.jugadorAvatar}>
                        {je.jugadores?.foto_url
                          ? <img src={je.jugadores.foto_url} alt="foto" style={s.jugadorFoto} />
                          : <div style={s.jugadorFotoPlaceholder}>⚽</div>}
                      </div>
                      <div style={s.jugadorInfo}>
                        <div style={s.jugadorNombre}>{je.jugadores?.nombre_completo}</div>
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
                          : <div style={s.jugadorFotoPlaceholder}>⚽</div>}
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
  ligaTab: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "7px 16px", color: "#6b7280", fontSize: 13, cursor: "pointer", fontWeight: 500 },
  ligaTabActive: { background: "#f0fdf4", borderColor: GREEN, color: GREEN },
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
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.28)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modalBox: { background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 32, width: "100%", maxWidth: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" },
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
};

const css = `
  .la-card { transition: transform 0.18s, box-shadow 0.18s; }
  .la-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
  input:focus, select:focus { border-color: #4f8f2f !important; }
`;