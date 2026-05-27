import { useState } from "react";
import { createPortal } from "react-dom";

// Panel UI: lista de sanciones aplicadas en la ficha + modal de captura.
// Los helpers de red viven en src/lib/sanciones.js para mantener este archivo
// solo con componentes (Fast Refresh).
export default function PanelSanciones({
  sanciones,           // arreglo del estado local de la ficha
  jugadoresLocal,
  jugadoresVisitante,
  equipoLocal,
  equipoVisitante,
  onAdd,               // (sancionItem) => void
  onRemove,            // (id, esNueva) => void
  cerrada,
  puedeRevertir,       // bool — admin/super pueden borrar sanciones existentes
}) {
  const [modal, setModal] = useState(null); // { equipoId, equipoNombre }
  const [equipoSel, setEquipoSel] = useState("");
  const [jugadorSel, setJugadorSel] = useState("");
  const [partidos, setPartidos] = useState(1);
  const [motivo, setMotivo] = useState("");

  const abrirModal = () => {
    setEquipoSel("");
    setJugadorSel("");
    setPartidos(1);
    setMotivo("");
    setModal({});
  };

  const jugadoresDelEquipo = equipoSel === equipoLocal?.id
    ? jugadoresLocal
    : equipoSel === equipoVisitante?.id
      ? jugadoresVisitante
      : [];

  const confirmar = () => {
    if (!equipoSel || !jugadorSel || !motivo.trim() || partidos < 1) return;
    const jugInfo = jugadoresDelEquipo.find(j => j.jugador_id === jugadorSel);
    if (!jugInfo) return;
    const equipoNombre = equipoSel === equipoLocal?.id ? equipoLocal?.nombre : equipoVisitante?.nombre;
    onAdd({
      jugador_id: jugadorSel,
      equipo_id: equipoSel,
      equipo_nombre: equipoNombre,
      nombre: jugInfo.jugadores?.nombre_completo,
      partidos: Number(partidos),
      motivo: motivo.trim(),
      _nueva: true,
    });
    setModal(null);
  };

  return (
    <div style={st.wrap}>
      <div style={st.headRow}>
        <h3 style={st.title}>🟥 Sanciones del partido</h3>
        {!cerrada && (
          <button style={st.addBtn} onClick={abrirModal} type="button">+ Sancionar</button>
        )}
      </div>

      {sanciones.length === 0 ? (
        <div style={st.vacio}>Sin sanciones registradas en este partido.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sanciones.map(s => {
            const id = s.id || `tmp-${s.jugador_id}-${s.created_at || ""}`;
            return (
              <div key={id} style={st.item}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={st.itemTitulo}>
                    <span style={st.dotRojo} />
                    <span style={st.itemNombre}>{s.nombre}</span>
                    <span style={st.itemEquipo}>{s.equipo_nombre}</span>
                  </div>
                  <div style={st.itemMotivo}>
                    <strong>{s.partidos} {s.partidos === 1 ? "partido" : "partidos"}</strong> · {s.motivo}
                  </div>
                </div>
                {(!cerrada || puedeRevertir) && (s._nueva || puedeRevertir) && (
                  <button
                    type="button"
                    style={st.delBtn}
                    title={s._nueva ? "Quitar sanción no guardada" : "Eliminar sanción"}
                    onClick={() => onRemove(s.id, !!s._nueva)}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && createPortal(
        <div style={st.overlay} onClick={() => setModal(null)}>
          <div style={st.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={st.modalTitle}>Registrar sanción</h3>

            <label style={st.lbl}>Equipo</label>
            <select style={st.input} value={equipoSel} onChange={e => { setEquipoSel(e.target.value); setJugadorSel(""); }}>
              <option value="">Seleccionar...</option>
              {equipoLocal && <option value={equipoLocal.id}>{equipoLocal.nombre}</option>}
              {equipoVisitante && <option value={equipoVisitante.id}>{equipoVisitante.nombre}</option>}
            </select>

            <label style={st.lbl}>Jugador</label>
            <select style={st.input} value={jugadorSel} onChange={e => setJugadorSel(e.target.value)} disabled={!equipoSel}>
              <option value="">{equipoSel ? "Seleccionar..." : "Elige un equipo primero"}</option>
              {jugadoresDelEquipo.map(j => (
                <option key={j.id || j.jugador_id} value={j.jugador_id}>
                  {j.dorsal ? `#${j.dorsal} · ` : ""}{j.jugadores?.nombre_completo}
                </option>
              ))}
            </select>

            <label style={st.lbl}>Partidos de sanción</label>
            <input type="number" min={1} max={20} style={st.input}
              value={partidos} onChange={e => setPartidos(Math.max(1, Number(e.target.value) || 1))} />

            <label style={st.lbl}>Motivo</label>
            <textarea style={{ ...st.input, minHeight: 70, resize: "vertical" }}
              placeholder="Tarjeta roja por agresión, conducta antideportiva..."
              value={motivo} onChange={e => setMotivo(e.target.value)} />

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button type="button" style={st.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button type="button" style={st.btnSave} onClick={confirmar}
                disabled={!equipoSel || !jugadorSel || !motivo.trim() || partidos < 1}>
                Registrar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const st = {
  wrap: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, marginTop: 14 },
  headRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" },
  title: { fontSize: 14, fontWeight: 800, color: "#7f1d1d", margin: 0 },
  addBtn: { background: "#fee2e2", border: "1px solid #fca5a5", color: "#7f1d1d", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" },
  vacio: { padding: "12px", textAlign: "center", color: "#9ca3af", fontSize: 12, fontStyle: "italic", background: "#fafafa", borderRadius: 8 },
  item: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 10 },
  itemTitulo: { display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" },
  itemNombre: { fontWeight: 800, fontSize: 13, color: "#7f1d1d" },
  itemEquipo: { fontSize: 11, color: "#6b7280", background: "#fff", padding: "2px 8px", borderRadius: 99, border: "1px solid #e5e7eb" },
  itemMotivo: { fontSize: 12, color: "#4b5563", lineHeight: 1.4 },
  dotRojo: { width: 10, height: 10, borderRadius: "50%", background: "#dc2626", flexShrink: 0, boxShadow: "0 0 0 2px #fff" },
  delBtn: { background: "transparent", border: "1px solid #e5e7eb", color: "#9ca3af", width: 28, height: 28, borderRadius: 6, cursor: "pointer", fontSize: 14, flexShrink: 0 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modalBox: { background: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: 420, boxShadow: "0 20px 50px rgba(0,0,0,0.3)" },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#111827", margin: "0 0 14px" },
  lbl: { display: "block", fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5, marginTop: 10 },
  input: { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" },
  btnCancel: { flex: 1, background: "transparent", border: "1px solid #d1d5db", color: "#6b7280", padding: "11px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" },
  btnSave: { flex: 2, background: "#7f1d1d", border: "none", color: "#fff", padding: "11px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" },
};
