import { useState, useEffect } from "react";

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

export default function PlayerProfile({ session }) {
  const [jugador, setJugador] = useState(null);
  const [ligas, setLigas] = useState([]);
  const [equiposDisponibles, setEquiposDisponibles] = useState([]);
  const [inscripciones, setInscripciones] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [seccion, setSeccion] = useState("perfil");
  const [editando, setEditando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState(null);
  const [modalInscripcion, setModalInscripcion] = useState(false);

  // Formulario perfil
  const [form, setForm] = useState({
    nombre_completo: "", fecha_nacimiento: "",
    domicilio: "", posicion_preferida: "Delantero"
  });
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);

  // Formulario inscripción
  const [inscForm, setInscForm] = useState({
    liga_id: "", equipo_id: "", dorsal: "", nombre_camiseta: ""
  });

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

  // ── CARGAR LIGAS DISPONIBLES ──────────────────────────────────
  const cargarLigas = async () => {
    try {
      const data = await db("/ligas?activa=eq.true&select=*&order=nombre", token);
      setLigas(data || []);
    } catch (e) { console.error(e); }
  };

  // ── CARGAR EQUIPOS DE LIGA ────────────────────────────────────
  const cargarEquiposLiga = async (ligaId) => {
    if (!ligaId) return;
    try {
      const data = await db(`/equipos?liga_id=eq.${ligaId}&select=*&order=nombre`, token);
      // Filtrar equipos donde ya está inscrito en esa liga
      const yaInscrito = inscripciones.find(i => i.liga_id === ligaId);
      setEquiposDisponibles(yaInscrito ? [] : (data || []));
    } catch (e) { console.error(e); }
  };

  useEffect(() => { cargarPerfil(); cargarLigas(); }, []);

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
      const payload = { ...form, foto_url };
      if (jugador) {
        await db(`/jugadores?id=eq.${jugador.id}`, token, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Perfil actualizado ✓");
      }
      setEditando(false);
      cargarPerfil();
    } catch (e) { showToast(e.message, "err"); }
    setGuardando(false);
  };

  // ── INSCRIBIRSE A EQUIPO ──────────────────────────────────────
  const inscribirse = async () => {
    if (!inscForm.liga_id || !inscForm.equipo_id) return showToast("Selecciona liga y equipo", "err");
    if (!inscForm.dorsal) return showToast("El dorsal es obligatorio", "err");
    setGuardando(true);
    try {
      await db("/jugador_equipo", token, {
        method: "POST",
        body: JSON.stringify({
          jugador_id: jugador.id,
          equipo_id: inscForm.equipo_id,
          liga_id: inscForm.liga_id,
          dorsal: +inscForm.dorsal,
          nombre_camiseta: inscForm.nombre_camiseta || form.nombre_completo.split(" ")[0].toUpperCase(),
          activo: true,
        })
      });
      showToast("¡Inscripción exitosa! ✓");
      setModalInscripcion(false);
      setInscForm({ liga_id: "", equipo_id: "", dorsal: "", nombre_camiseta: "" });
      cargarInscripciones(jugador.id);
    } catch (e) {
      if (e.message.includes("unique")) {
        showToast("Ya estás inscrito en un equipo de esta liga", "err");
      } else {
        showToast(e.message, "err");
      }
    }
    setGuardando(false);
  };

  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
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
        <h2 style={s.title}>Mi Perfil ⚽</h2>
        <p style={s.sub}>Tu identidad en la plataforma</p>
      </div>

      {/* TABS */}
      <div style={s.tabs}>
        {[["perfil","⚽","Mi Perfil"],["ligas","🏆","Mis Ligas"]].map(([key, icon, label]) => (
          <button key={key} onClick={() => setSeccion(key)}
            style={{ ...s.tab, ...(seccion === key ? s.tabActive : {}) }}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── SECCIÓN PERFIL ── */}
      {seccion === "perfil" && (
        <div>
          {/* TARJETA DE JUGADOR */}
          <div style={s.playerCard}>
            <div style={s.playerCardLeft}>
              <div style={s.avatarWrap}>
                {fotoPreview
                  ? <img src={fotoPreview} alt="foto" style={s.avatarImg} />
                  : <div style={s.avatarPlaceholder}>⚽</div>}
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
              {!editando ? (
                <>
                  <div style={s.playerNombre}>{jugador?.nombre_completo || "Sin nombre"}</div>
                  <div style={s.playerPosicion}>{jugador?.posicion_preferida || "—"}</div>
                  <div style={s.playerDatos}>
                    {[["📅","Fecha nac.",jugador?.fecha_nacimiento || "—"],["🏠","Domicilio",jugador?.domicilio || "—"]].map(([icon,lbl,val]) => (
                      <div key={lbl} style={s.playerDato}>
                        <span style={s.playerDatoIcon}>{icon}</span>
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
                        value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
                    </div>
                  ))}
                  <div style={s.field}>
                    <label style={s.label}>Posición preferida</label>
                    <select style={s.input} value={form.posicion_preferida}
                      onChange={e => setForm({ ...form, posicion_preferida: e.target.value })}>
                      {POSICIONES.map(p => <option key={p}>{p}</option>)}
                    </select>
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
                <div style={s.statIcon}>{icon}</div>
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
            <span style={s.secCount}>{inscripciones.length} inscripciones activas</span>
            <button style={s.btnAdd} onClick={() => { setModalInscripcion(true); setInscForm({ liga_id: "", equipo_id: "", dorsal: "", nombre_camiseta: "" }); setEquiposDisponibles([]); }}>
              + Unirme a una liga
            </button>
          </div>

          {inscripciones.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>🏆</div>
              <div style={s.emptyTxt}>Aún no estás inscrito en ninguna liga</div>
              <button style={s.btnAdd} onClick={() => setModalInscripcion(true)}>Unirme a mi primera liga</button>
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
                    <div style={s.dorsalCard}>
                      <div style={{ ...s.dorsalNum, background: ins.equipos?.color_playera || "#3182ce" }}>{ins.dorsal}</div>
                      <div style={s.dorsalNombreCamiseta}>{ins.nombre_camiseta}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL INSCRIPCIÓN ── */}
      {modalInscripcion && (
        <div style={s.overlay} onClick={() => setModalInscripcion(false)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>Unirme a una liga ⚽</h3>
            <div style={s.field}>
              <label style={s.label}>Selecciona la liga *</label>
              <select style={s.input} value={inscForm.liga_id}
                onChange={e => { setInscForm({ ...inscForm, liga_id: e.target.value, equipo_id: "" }); cargarEquiposLiga(e.target.value); }}>
                <option value="">Elige una liga...</option>
                {ligas.map(l => {
                  const yaInscrito = inscripciones.find(i => i.liga_id === l.id);
                  return <option key={l.id} value={l.id} disabled={!!yaInscrito}>{l.nombre} {yaInscrito ? "(ya inscrito)" : ""}</option>;
                })}
              </select>
            </div>
            {inscForm.liga_id && (
              <div style={s.field}>
                <label style={s.label}>Selecciona el equipo *</label>
                {equiposDisponibles.length === 0
                  ? <div style={s.warningBox}>⚠️ No hay equipos disponibles en esta liga o ya estás inscrito</div>
                  : <select style={s.input} value={inscForm.equipo_id}
                      onChange={e => setInscForm({ ...inscForm, equipo_id: e.target.value })}>
                      <option value="">Elige un equipo...</option>
                      {equiposDisponibles.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>}
              </div>
            )}
            {inscForm.equipo_id && (
              <>
                <div style={s.formRow}>
                  <div style={s.field}>
                    <label style={s.label}>Dorsal (número) *</label>
                    <input style={s.input} type="number" min="1" max="99" placeholder="ej. 10"
                      value={inscForm.dorsal} onChange={e => setInscForm({ ...inscForm, dorsal: e.target.value })} />
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Nombre en camiseta</label>
                    <input style={s.input} type="text" placeholder={form.nombre_completo.split(" ")[0].toUpperCase()}
                      value={inscForm.nombre_camiseta} onChange={e => setInscForm({ ...inscForm, nombre_camiseta: e.target.value.toUpperCase() })} />
                  </div>
                </div>
                <div style={s.camisetaPreview}>
                  <div style={{ ...s.camisetaNum, background: equiposDisponibles.find(e => e.id === inscForm.equipo_id)?.color_playera || "#3182ce" }}>
                    {inscForm.dorsal || "?"}
                  </div>
                  <div style={s.camisetaNombrePreview}>
                    {inscForm.nombre_camiseta || form.nombre_completo.split(" ")[0].toUpperCase()}
                  </div>
                  <div style={{ fontSize: 11, color: "#555" }}>Vista previa camiseta</div>
                </div>
              </>
            )}
            <div style={s.modalActions}>
              <button style={s.btnCancelar} onClick={() => setModalInscripcion(false)}>Cancelar</button>
              <button style={s.btnGuardar} onClick={inscribirse} disabled={guardando || !inscForm.equipo_id}>
                {guardando ? "Procesando..." : "Confirmar inscripción"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const BASE = "#090912";
const SURFACE = "#0f0f1e";
const BORDER = "#1e1e3a";
const GREEN = "#4ade80";

const s = {
  wrap: {},
  header: { marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: -0.8, marginBottom: 4 },
  sub: { color: "#666", fontSize: 14 },
  tabs: { display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${BORDER}` },
  tab: { background: "transparent", border: "none", borderBottom: "2px solid transparent", color: "#888", padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: -1 },
  tabActive: { color: GREEN, borderBottomColor: GREEN },
  playerCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "24px 28px", display: "flex", gap: 28, marginBottom: 20 },
  playerCardLeft: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10 },
  avatarWrap: { position: "relative", width: 100, height: 100 },
  avatarImg: { width: 100, height: 100, borderRadius: "50%", objectFit: "cover", border: `3px solid ${BORDER}` },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: "50%", background: "#1e1e3a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, border: `3px solid ${BORDER}` },
  avatarEditBtn: { position: "absolute", bottom: 0, right: 0, width: 30, height: 30, borderRadius: "50%", background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, cursor: "pointer" },
  playerCardRight: { flex: 1 },
  afiliadoBadge: { display: "inline-block", background: "#1a1a2e", color: GREEN, fontSize: 13, fontWeight: 800, padding: "5px 14px", borderRadius: 8, marginBottom: 10, letterSpacing: 1 },
  playerNombre: { fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 },
  playerPosicion: { fontSize: 14, color: "#888", marginBottom: 18 },
  playerDatos: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 },
  playerDato: { display: "flex", alignItems: "center", gap: 10 },
  playerDatoIcon: { fontSize: 16 },
  playerDatoLabel: { fontSize: 11, color: "#666" },
  playerDatoVal: { fontSize: 13, color: "#ccc", fontWeight: 500 },
  btnEditar: { background: "#1e1e3a", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 20px", color: "#ccc", fontSize: 13, cursor: "pointer", fontWeight: 600 },
  editForm: { display: "flex", flexDirection: "column", gap: 0 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 },
  statCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 16px" },
  statIcon: { fontSize: 22, marginBottom: 8 },
  statVal: { fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 4 },
  statLabel: { fontSize: 12, color: "#666" },
  secHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  secCount: { color: "#666", fontSize: 13 },
  btnAdd: { background: GREEN, color: "#0d0d1a", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  empty: { textAlign: "center", padding: "60px 20px" },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTxt: { color: "#aaa", fontSize: 15, marginBottom: 20, fontWeight: 600 },
  inscripcionesList: { display: "flex", flexDirection: "column", gap: 12 },
  inscripcionCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  inscripcionLeft: { display: "flex", alignItems: "center", gap: 16 },
  escudoWrap: { width: 52, height: 52, borderRadius: 12, overflow: "hidden", flexShrink: 0 },
  escudoImg: { width: "100%", height: "100%", objectFit: "cover" },
  escudoPlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff" },
  inscripcionEquipo: { fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 },
  inscripcionLiga: { fontSize: 13, color: "#888" },
  inscripcionRight: {},
  dorsalCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  dorsalNum: { width: 48, height: 48, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: "#fff" },
  dorsalNombreCamiseta: { fontSize: 12, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: 1 },
  field: { marginBottom: 16, flex: 1 },
  formRow: { display: "flex", gap: 16 },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 },
  input: { width: "100%", background: BASE, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "10px 14px", color: "#eee", fontSize: 14, outline: "none", boxSizing: "border-box" },
  editActions: { display: "flex", gap: 10, marginTop: 8 },
  btnCancelar: { flex: 1, background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 10, color: "#888", fontSize: 13, cursor: "pointer" },
  btnGuardar: { flex: 2, background: GREEN, color: "#0d0d1a", border: "none", borderRadius: 10, padding: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" },
  camisetaPreview: { background: BASE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px", textAlign: "center", marginBottom: 16 },
  camisetaNum: { width: 52, height: 52, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: "#fff", margin: "0 auto 8px" },
  camisetaNombrePreview: { fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 },
  warningBox: { background: "#2a1a00", border: "1px solid #4a3000", borderRadius: 10, padding: "10px 14px", color: "#f59e0b", fontSize: 13 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modalBox: { background: "#13132a", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 32, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto" },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 22 },
  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  spinner: { width: 32, height: 32, border: "3px solid #1e1e3a", borderTop: `3px solid ${GREEN}`, borderRadius: "50%", margin: "0 auto", animation: "spin 0.7s linear infinite" },
  toast: { position: "fixed", bottom: 28, right: 28, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999 },
};

const css = `
  * { box-sizing: border-box; }
  input:focus, select:focus { border-color: #4ade80 !important; }
  select option { background: #0f0f1e; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;