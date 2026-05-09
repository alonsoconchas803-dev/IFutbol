import Solicitudes from "./Solicitudes";
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
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Error en la base de datos");
  }
  return res.status === 204 ? null : res.json();
};

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const TURNOS = ["Mañana", "Tarde", "Noche"];
const COLORES = ["#e53e3e","#dd6b20","#d69e2e","#38a169","#3182ce","#805ad5","#d53f8c","#2d3748","#319795","#e53e8c"];

export default function SuperAdmin({ session }) {
  const [seccion, setSeccion] = useState("canchas");
  const [canchas, setCanchas] = useState([]);
  const [ligas, setLigas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // "cancha" | "liga" | "equipo"

  // Formulario canchas
  const [canchaForm, setCanchaForm] = useState({ nombre: "", direccion: "", num_canchas: 1 });
  const [editCanchaId, setEditCanchaId] = useState(null);

  // Equipos
  const [equipos, setEquipos] = useState([]);
  const [ligaEquipos, setLigaEquipos] = useState(null);
  const [equipoForm, setEquipoForm] = useState({ nombre: "", color_playera: "#3182ce" });
  const [editEquipoId, setEditEquipoId] = useState(null);

  // Formulario ligas
  const [ligaForm, setLigaForm] = useState({ nombre: "", dia: "Lunes", turno: "Noche", cancha_id: "", temporada: "" });
  const [editLigaId, setEditLigaId] = useState(null);

  const token = session?.access_token;

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  // ── CARGAR DATOS ──────────────────────────────────────────────
  const cargarCanchas = async () => {
    try {
      const data = await db("/canchas?select=*&order=created_at.asc", token);
      setCanchas(data || []);
    } catch (e) { showToast(e.message, "err"); }
  };

  const cargarLigas = async () => {
    try {
      const data = await db("/ligas?select=*,canchas(nombre)&order=created_at.asc", token);
      setLigas(data || []);
    } catch (e) { showToast(e.message, "err"); }
  };

  useEffect(() => { cargarCanchas(); cargarLigas(); }, []);

  // ── CANCHAS ───────────────────────────────────────────────────
  const guardarCancha = async () => {
    if (!canchaForm.nombre) return showToast("El nombre es obligatorio", "err");
    setLoading(true);
    try {
      if (editCanchaId) {
        await db(`/canchas?id=eq.${editCanchaId}`, token, { method: "PATCH", body: JSON.stringify(canchaForm) });
        showToast("Cancha actualizada ✓");
      } else {
        await db("/canchas", token, { method: "POST", body: JSON.stringify(canchaForm) });
        showToast("Cancha registrada ✓");
      }
      setCanchaForm({ nombre: "", direccion: "", num_canchas: 1 });
      setEditCanchaId(null);
      setModal(null);
      cargarCanchas();
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const eliminarCancha = async (id) => {
    if (!confirm("¿Eliminar esta cancha? Se eliminarán también sus ligas.")) return;
    try {
      await db(`/canchas?id=eq.${id}`, token, { method: "DELETE" });
      showToast("Cancha eliminada");
      cargarCanchas();
    } catch (e) { showToast(e.message, "err"); }
  };

  const editarCancha = (c) => {
    setCanchaForm({ nombre: c.nombre, direccion: c.direccion || "", num_canchas: c.num_canchas });
    setEditCanchaId(c.id);
    setModal("cancha");
  };

  // ── LIGAS ─────────────────────────────────────────────────────
  const guardarLiga = async () => {
    if (!ligaForm.nombre || !ligaForm.cancha_id) return showToast("Nombre y cancha son obligatorios", "err");
    setLoading(true);
    try {
      if (editLigaId) {
        await db(`/ligas?id=eq.${editLigaId}`, token, { method: "PATCH", body: JSON.stringify(ligaForm) });
        showToast("Liga actualizada ✓");
      } else {
        await db("/ligas", token, { method: "POST", body: JSON.stringify({ ...ligaForm, activa: true }) });
        showToast("Liga creada ✓");
      }
      setLigaForm({ nombre: "", dia: "Lunes", turno: "Noche", cancha_id: "", temporada: "" });
      setEditLigaId(null);
      setModal(null);
      cargarLigas();
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const eliminarLiga = async (id) => {
    if (!confirm("¿Eliminar esta liga?")) return;
    try {
      await db(`/ligas?id=eq.${id}`, token, { method: "DELETE" });
      showToast("Liga eliminada");
      cargarLigas();
    } catch (e) { showToast(e.message, "err"); }
  };

  const editarLiga = (l) => {
    setLigaForm({ nombre: l.nombre, dia: l.dia, turno: l.turno, cancha_id: l.cancha_id, temporada: l.temporada || "" });
    setEditLigaId(l.id);
    setModal("liga");
  };

  const toggleLiga = async (liga) => {
    try {
      await db(`/ligas?id=eq.${liga.id}`, token, { method: "PATCH", body: JSON.stringify({ activa: !liga.activa }) });
      showToast(liga.activa ? "Liga desactivada" : "Liga activada ✓");
      cargarLigas();
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── EQUIPOS ───────────────────────────────────────────────────
  const cargarEquipos = async (ligaId) => {
    if (!ligaId) return;
    try {
      const data = await db(`/equipos?liga_id=eq.${ligaId}&order=nombre`, token);
      setEquipos(data || []);
    } catch (e) { showToast(e.message, "err"); }
  };

  const guardarEquipo = async () => {
    if (!equipoForm.nombre) return showToast("El nombre es obligatorio", "err");
    if (!ligaEquipos) return showToast("Selecciona una liga primero", "err");
    setLoading(true);
    try {
      const payload = { nombre: equipoForm.nombre, color_playera: equipoForm.color_playera, liga_id: ligaEquipos.id };
      if (editEquipoId) {
        await db(`/equipos?id=eq.${editEquipoId}`, token, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Equipo actualizado ✓");
      } else {
        await db("/equipos", token, { method: "POST", body: JSON.stringify(payload) });
        showToast("Equipo registrado ✓");
      }
      setEquipoForm({ nombre: "", color_playera: "#3182ce" });
      setEditEquipoId(null);
      setModal(null);
      cargarEquipos(ligaEquipos.id);
    } catch (e) { showToast(e.message, "err"); }
    setLoading(false);
  };

  const eliminarEquipo = async (id) => {
    if (!confirm("¿Eliminar este equipo?")) return;
    try {
      await db(`/equipos?id=eq.${id}`, token, { method: "DELETE" });
      showToast("Equipo eliminado");
      cargarEquipos(ligaEquipos.id);
    } catch (e) { showToast(e.message, "err"); }
  };

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {toast && <div style={{ ...s.toast, background: toast.tipo === "err" ? "#ef4444" : "#4ade80", color: toast.tipo === "err" ? "#fff" : "#0d0d1a" }}>{toast.msg}</div>}

      {/* ENCABEZADO */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Panel Super Admin 👑</h2>
          <p style={s.sub}>Control total sobre canchas, ligas y usuarios</p>
        </div>
      </div>

      {/* TABS */}
      <div style={s.tabs}>
        {[["canchas","🏟️","Canchas"],["ligas","🏆","Ligas"],["equipos","👕","Equipos"],["stats","📊","Resumen"],["solicitudes","📋","Solicitudes"]].map(([key, icon, label]) => (
          <button key={key} onClick={() => setSeccion(key)}
            style={{ ...s.tab, ...(seccion === key ? s.tabActive : {}) }}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── SECCIÓN CANCHAS ── */}
      {seccion === "canchas" && (
        <div>
          <div style={s.secHeader}>
            <span style={s.secCount}>{canchas.length} canchas registradas</span>
            <button style={s.btnAdd} onClick={() => { setCanchaForm({ nombre: "", direccion: "", num_canchas: 1 }); setEditCanchaId(null); setModal("cancha"); }}>
              + Nueva cancha
            </button>
          </div>

          {canchas.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>🏟️</div>
              <div style={s.emptyTxt}>No hay canchas registradas aún</div>
              <button style={s.btnAdd} onClick={() => setModal("cancha")}>Agregar primera cancha</button>
            </div>
          ) : (
            <div style={s.grid}>
              {canchas.map(c => (
                <div key={c.id} style={s.card} className="sa-card">
                  <div style={s.cardTop}>
                    <div style={s.cardIcon}>🏟️</div>
                    <div style={s.cardActions}>
                      <button style={s.btnEdit} onClick={() => editarCancha(c)}>✏️</button>
                      <button style={s.btnDel} onClick={() => eliminarCancha(c.id)}>🗑️</button>
                    </div>
                  </div>
                  <div style={s.cardName}>{c.nombre}</div>
                  <div style={s.cardMeta}>{c.direccion || "Sin dirección"}</div>
                  <div style={s.cardBadge}>{c.num_canchas} {c.num_canchas === 1 ? "cancha" : "canchas"}</div>
                  <div style={s.cardLigas}>
                    {ligas.filter(l => l.cancha_id === c.id).length} ligas activas
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SECCIÓN LIGAS ── */}
      {seccion === "ligas" && (
        <div>
          <div style={s.secHeader}>
            <span style={s.secCount}>{ligas.length} ligas registradas</span>
            <button style={s.btnAdd} onClick={() => { setLigaForm({ nombre: "", dia: "Lunes", turno: "Noche", cancha_id: "", temporada: "" }); setEditLigaId(null); setModal("liga"); }}
              disabled={canchas.length === 0}>
              + Nueva liga
            </button>
          </div>

          {canchas.length === 0 && (
            <div style={s.warningBox}>⚠️ Primero debes registrar al menos una cancha para poder crear ligas.</div>
          )}

          {ligas.length === 0 && canchas.length > 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>🏆</div>
              <div style={s.emptyTxt}>No hay ligas registradas aún</div>
              <button style={s.btnAdd} onClick={() => setModal("liga")}>Crear primera liga</button>
            </div>
          ) : (
            <div style={s.ligaList}>
              {ligas.map(l => (
                <div key={l.id} style={{ ...s.ligaRow, opacity: l.activa ? 1 : 0.5 }} className="sa-card">
                  <div style={s.ligaLeft}>
                    <div style={{ ...s.ligaDot, background: l.activa ? "#4ade80" : "#666" }} />
                    <div>
                      <div style={s.ligaNombre}>{l.nombre}</div>
                      <div style={s.ligaMeta}>
                        {l.dia} · {l.turno} · {l.canchas?.nombre || "Sin cancha"}
                        {l.temporada && ` · Temp. ${l.temporada}`}
                      </div>
                    </div>
                  </div>
                  <div style={s.ligaRight}>
                    <span style={{ ...s.statusBadge, background: l.activa ? "#0d2a0d" : "#1a1a1a", color: l.activa ? "#4ade80" : "#666", border: `1px solid ${l.activa ? "#1a4a1a" : "#333"}` }}>
                      {l.activa ? "Activa" : "Inactiva"}
                    </span>
                    <button style={s.btnToggle} onClick={() => toggleLiga(l)}>{l.activa ? "Desactivar" : "Activar"}</button>
                    <button style={s.btnEdit} onClick={() => editarLiga(l)}>✏️</button>
                    <button style={s.btnDel} onClick={() => eliminarLiga(l.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SECCIÓN RESUMEN ── */}
      {seccion === "stats" && (
        <div style={s.statsGrid}>
          {[
            ["🏟️", "Canchas", canchas.length, "registradas"],
            ["🏆", "Ligas totales", ligas.length, "registradas"],
            ["✅", "Ligas activas", ligas.filter(l => l.activa).length, "en curso"],
            ["⏸️", "Ligas inactivas", ligas.filter(l => !l.activa).length, "pausadas"],
          ].map(([icon, label, val, sub]) => (
            <div key={label} style={s.statCard}>
              <div style={s.statIcon}>{icon}</div>
              <div style={s.statVal}>{val}</div>
              <div style={s.statLabel}>{label}</div>
              <div style={s.statSub}>{sub}</div>
            </div>
          ))}
          <div style={{ ...s.statCard, gridColumn: "1/-1" }}>
            <div style={s.statLabel}>Ligas por cancha</div>
            {canchas.map(c => (
              <div key={c.id} style={s.barRow}>
                <span style={s.barLabel}>{c.nombre}</span>
                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, width: `${Math.min((ligas.filter(l => l.cancha_id === c.id).length / Math.max(ligas.length, 1)) * 100, 100)}%` }} />
                </div>
                <span style={s.barCount}>{ligas.filter(l => l.cancha_id === c.id).length}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECCIÓN EQUIPOS ── */}
      {seccion === "equipos" && (
        <div>
          <div style={s.field}>
            <label style={s.label}>Liga</label>
            <select style={s.input} value={ligaEquipos?.id || ""} onChange={e => {
              const liga = ligas.find(l => l.id === e.target.value) || null;
              setLigaEquipos(liga);
              if (liga) cargarEquipos(liga.id);
              else setEquipos([]);
            }}>
              <option value="">Selecciona una liga...</option>
              {ligas.map(l => <option key={l.id} value={l.id}>{l.nombre} · {l.dia} {l.turno}</option>)}
            </select>
          </div>

          {!ligaEquipos && (
            <div style={s.empty}>
              <div style={s.emptyIcon}>👆</div>
              <div style={s.emptyTxt}>Selecciona una liga para ver o agregar equipos</div>
            </div>
          )}

          {ligaEquipos && (
            <>
              <div style={s.secHeader}>
                <span style={s.secCount}>{equipos.length} equipos en {ligaEquipos.nombre}</span>
                <button style={s.btnAdd} onClick={() => { setEquipoForm({ nombre: "", color_playera: "#3182ce" }); setEditEquipoId(null); setModal("equipo"); }}>
                  + Nuevo equipo
                </button>
              </div>

              {equipos.length === 0 ? (
                <div style={s.empty}>
                  <div style={s.emptyIcon}>👕</div>
                  <div style={s.emptyTxt}>No hay equipos en esta liga</div>
                  <button style={s.btnAdd} onClick={() => { setEquipoForm({ nombre: "", color_playera: "#3182ce" }); setEditEquipoId(null); setModal("equipo"); }}>
                    Agregar primer equipo
                  </button>
                </div>
              ) : (
                <div style={s.grid}>
                  {equipos.map(eq => (
                    <div key={eq.id} style={{ ...s.card, borderTop: `3px solid ${eq.color_playera}` }} className="sa-card">
                      <div style={s.cardTop}>
                        <div style={{ ...s.cardIcon, background: eq.color_playera }}>👕</div>
                        <div style={s.cardActions}>
                          <button style={s.btnEdit} onClick={() => { setEquipoForm({ nombre: eq.nombre, color_playera: eq.color_playera }); setEditEquipoId(eq.id); setModal("equipo"); }}>✏️</button>
                          <button style={s.btnDel} onClick={() => eliminarEquipo(eq.id)}>🗑️</button>
                        </div>
                      </div>
                      <div style={s.cardName}>{eq.nombre}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: eq.color_playera, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: "#6b7280" }}>{eq.color_playera}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {seccion === "solicitudes" && (
  <Solicitudes session={session} />
)}

      {/* ── MODAL CANCHA ── */}
      {modal === "cancha" && (
        <div style={s.overlay} onClick={() => setModal(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>{editCanchaId ? "Editar cancha" : "Nueva cancha"}</h3>
            <div style={s.field}>
              <label style={s.label}>Nombre de las canchas *</label>
              <input style={s.input} placeholder="ej. Canchas Manzano"
                value={canchaForm.nombre} onChange={e => setCanchaForm({ ...canchaForm, nombre: e.target.value })} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Dirección</label>
              <input style={s.input} placeholder="ej. Calle Reforma #45, Tonalá"
                value={canchaForm.direccion} onChange={e => setCanchaForm({ ...canchaForm, direccion: e.target.value })} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Número de canchas disponibles</label>
              <input style={s.input} type="number" min="1" max="20"
                value={canchaForm.num_canchas} onChange={e => setCanchaForm({ ...canchaForm, num_canchas: +e.target.value })} />
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button style={s.btnSave} onClick={guardarCancha} disabled={loading}>
                {loading ? "Guardando..." : editCanchaId ? "Guardar cambios" : "Crear cancha"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EQUIPO ── */}
      {modal === "equipo" && (
        <div style={s.overlay} onClick={() => setModal(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>{editEquipoId ? "Editar equipo" : "Nuevo equipo"}</h3>
            <div style={s.field}>
              <label style={s.label}>Nombre del equipo *</label>
              <input style={s.input} placeholder="ej. Tigres FC"
                value={equipoForm.nombre} onChange={e => setEquipoForm({ ...equipoForm, nombre: e.target.value })} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Color de playera</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {COLORES.map(c => (
                  <div key={c} onClick={() => setEquipoForm({ ...equipoForm, color_playera: c })}
                    style={{ width: 30, height: 30, borderRadius: "50%", background: c, cursor: "pointer", transition: "box-shadow 0.15s",
                      boxShadow: equipoForm.color_playera === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : "none" }} />
                ))}
                <input type="color" value={equipoForm.color_playera}
                  onChange={e => setEquipoForm({ ...equipoForm, color_playera: e.target.value })}
                  style={{ width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0 }}
                  title="Color personalizado" />
              </div>
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button style={s.btnSave} onClick={guardarEquipo} disabled={loading}>
                {loading ? "Guardando..." : editEquipoId ? "Guardar cambios" : "Crear equipo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL LIGA ── */}
      {modal === "liga" && (
        <div style={s.overlay} onClick={() => setModal(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>{editLigaId ? "Editar liga" : "Nueva liga"}</h3>
            <div style={s.field}>
              <label style={s.label}>Nombre de la liga *</label>
              <input style={s.input} placeholder="ej. Liga Miércoles Noche"
                value={ligaForm.nombre} onChange={e => setLigaForm({ ...ligaForm, nombre: e.target.value })} />
            </div>
            <div style={s.formRow}>
              <div style={s.field}>
                <label style={s.label}>Día</label>
                <select style={s.input} value={ligaForm.dia} onChange={e => setLigaForm({ ...ligaForm, dia: e.target.value })}>
                  {DIAS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div style={s.field}>
                <label style={s.label}>Turno</label>
                <select style={s.input} value={ligaForm.turno} onChange={e => setLigaForm({ ...ligaForm, turno: e.target.value })}>
                  {TURNOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={s.field}>
              <label style={s.label}>Cancha *</label>
              <select style={s.input} value={ligaForm.cancha_id} onChange={e => setLigaForm({ ...ligaForm, cancha_id: e.target.value })}>
                <option value="">Selecciona una cancha</option>
                {canchas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Temporada (opcional)</label>
              <input style={s.input} placeholder="ej. 2025-A"
                value={ligaForm.temporada} onChange={e => setLigaForm({ ...ligaForm, temporada: e.target.value })} />
            </div>
            <div style={s.modalActions}>
              <button style={s.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button style={s.btnSave} onClick={guardarLiga} disabled={loading}>
                {loading ? "Guardando..." : editLigaId ? "Guardar cambios" : "Crear liga"}
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
  wrap: { padding: "0" },
  header: { marginBottom: 28 },
  title: { fontSize: 26, fontWeight: 800, color: "#111827", letterSpacing: -0.8, marginBottom: 4 },
  sub: { color: "#6b7280", fontSize: 14 },
  tabs: { display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${BORDER}`, paddingBottom: 0 },
  tab: { background: "transparent", border: "none", borderBottom: "2px solid transparent", color: "#6b7280", padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.2s", marginBottom: -1 },
  tabActive: { color: GREEN, borderBottomColor: GREEN },
  secHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  secCount: { color: "#6b7280", fontSize: 13 },
  btnAdd: { background: GREEN, color: "#ffffff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 },
  card: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, boxShadow: "0 2px 8px rgba(79,143,47,0.08)", borderTop: `3px solid ${GREEN}` },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  cardIcon: { width: 44, height: 44, background: "linear-gradient(135deg, #4f8f2f, #7fbf4d)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 3px 8px rgba(79,143,47,0.3)" },
  cardActions: { display: "flex", gap: 6 },
  cardName: { fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 4 },
  cardMeta: { fontSize: 12, color: "#6b7280", marginBottom: 10 },
  cardBadge: { display: "inline-block", background: "#f0fdf4", color: GREEN, fontSize: 11, padding: "3px 10px", borderRadius: 6, marginBottom: 8, border: "1px solid #c3e6a3" },
  cardLigas: { fontSize: 12, color: GREEN, fontWeight: 600 },
  ligaList: { display: "flex", flexDirection: "column", gap: 10 },
  ligaRow: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  ligaLeft: { display: "flex", alignItems: "center", gap: 14 },
  ligaDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  ligaNombre: { fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 3 },
  ligaMeta: { fontSize: 12, color: "#6b7280" },
  ligaRight: { display: "flex", alignItems: "center", gap: 8 },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6 },
  btnToggle: { background: "#f3f4f6", color: "#6b7280", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "5px 12px", fontSize: 11, cursor: "pointer" },
  btnEdit: { background: "#f3f4f6", color: "#6b7280", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "5px 9px", fontSize: 13, cursor: "pointer" },
  btnDel: { background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 7, padding: "5px 9px", fontSize: 13, cursor: "pointer" },
  warningBox: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", color: "#ca8a04", fontSize: 13, marginBottom: 20 },
  empty: { textAlign: "center", padding: "60px 20px" },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTxt: { color: "#6b7280", fontSize: 15, marginBottom: 20 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 },
  statCard: { background: "linear-gradient(135deg, #f0fdf4 0%, #e8f5e1 100%)", border: "1px solid #c3e6a3", borderRadius: 14, padding: 22, boxShadow: "0 2px 8px rgba(79,143,47,0.1)" },
  statIcon: { width: 52, height: 52, background: "linear-gradient(135deg, #4f8f2f, #7fbf4d)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 12, boxShadow: "0 3px 10px rgba(79,143,47,0.3)" },
  statVal: { fontSize: 32, fontWeight: 900, color: GREEN, marginBottom: 4 },
  statLabel: { fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 2 },
  statSub: { fontSize: 11, color: "#6b7280" },
  barRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 14 },
  barLabel: { fontSize: 13, color: "#6b7280", width: 160, flexShrink: 0 },
  barTrack: { flex: 1, height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", background: GREEN, borderRadius: 4, transition: "width 0.5s ease" },
  barCount: { fontSize: 13, fontWeight: 700, color: "#111827", width: 20, textAlign: "right" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.28)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modalBox: { background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 32, width: "100%", maxWidth: 460, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 24 },
  field: { marginBottom: 16, flex: 1 },
  formRow: { display: "flex", gap: 16 },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 },
  input: { width: "100%", background: BASE, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "10px 14px", color: "#111827", fontSize: 14, outline: "none", boxSizing: "border-box" },
  modalActions: { display: "flex", gap: 10, marginTop: 24 },
  btnCancel: { flex: 1, background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, color: "#6b7280", fontSize: 14, cursor: "pointer" },
  btnSave: { flex: 2, background: GREEN, color: "#ffffff", border: "none", borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer" },
  toast: { position: "fixed", bottom: 28, right: 28, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999 },
};

const css = `
  .sa-card { transition: transform 0.18s, box-shadow 0.18s; }
  .sa-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
  input:focus, select:focus { border-color: #4f8f2f !important; }
`;
