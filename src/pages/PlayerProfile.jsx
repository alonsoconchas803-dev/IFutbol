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

  // Formulario perfil
  const [form, setForm] = useState({
    nombre_completo: "", fecha_nacimiento: "",
    domicilio: "", posicion_preferida: "Delantero"
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
          {seccion === "perfil" ? "Jugador registrado" : "Torneos activos"}
        </div>
        <h2 style={s.title}>{seccion === "perfil" ? "⚽ Mi Perfil" : "🏆 Mis Ligas"}</h2>
        <p style={s.sub}>{seccion === "perfil" ? "Tu identidad en la plataforma" : "Tus inscripciones activas"}</p>
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
                <div style={s.playerNombre}>{jugador?.nombre_completo || "Sin nombre"}</div>
                <div style={s.playerPosicion}>{jugador?.posicion_preferida || "—"}</div>
              </div>
            </div>

            {/* Cuerpo: datos y acciones */}
            <div style={s.playerCardBody}>
              {!editando ? (
                <>
                  <div style={s.playerDatos}>
                    {[["📅","Fecha nac.",jugador?.fecha_nacimiento || "—"],["🏠","Domicilio",jugador?.domicilio || "—"]].map(([icon,lbl,val]) => (
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
  inscripcionRight: {},
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
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.28)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modalBox: { background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 32, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 22 },
  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  spinner: { width: 32, height: 32, border: `3px solid ${BORDER}`, borderTop: `3px solid ${GREEN}`, borderRadius: "50%", margin: "0 auto", animation: "spin 0.7s linear infinite" },
  toast: { position: "fixed", bottom: 28, right: 28, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999 },
};

const css = `
  * { box-sizing: border-box; }
  input:focus, select:focus { border-color: #4f8f2f !important; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;