// Campos de personalización de la tarjeta de la unidad deportiva.
// Reutilizado por SuperAdmin (al crear/editar) y LeagueAdmin (al personalizar la propia).

import ColorPicker from "./ColorPicker";
import { recortarCuadradoCentrado } from "../utils/recorteImagen";

const COLORES_MARCA = ["#4f8f2f","#3182ce","#e53e3e","#dd6b20","#d69e2e","#805ad5","#d53f8c","#0ea5e9","#14b8a6","#1f2937"];

const TAMANOS_LOGO = [
  { val: "pequeno", titulo: "Pequeño", px: 56 },
  { val: "mediano", titulo: "Mediano", px: 72 },
  { val: "grande",  titulo: "Grande",  px: 96 },
];

const FORMAS_LOGO = [
  { val: "cuadrado", titulo: "Cuadrado redondeado" },
  { val: "circulo",  titulo: "Círculo" },
];

const INTENSIDADES = [
  { val: "claro",  titulo: "Claro" },
  { val: "medio",  titulo: "Medio" },
  { val: "oscuro", titulo: "Oscuro" },
];

const ESTILOS_TARJETA = [
  { val: "logo_arriba",  titulo: "Logo arriba",      desc: "Logo grande junto al nombre" },
  { val: "fondo_esquina", titulo: "Fondo + esquina", desc: "Imagen de fondo y logo en la esquina" },
];

const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 };
const fieldStyle = { marginBottom: 16 };
const inputStyle = { width: "100%", background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px", color: "#111827", fontSize: 14, outline: "none" };

// "blob:" indica que el preview vino de un archivo recién seleccionado
// (URL.createObjectURL), no de una URL ya guardada en el backend.
const esPreviewNuevo = (p) => typeof p === "string" && p.startsWith("blob:");

// Fila de subida de imagen reutilizable dentro de este componente.
// Muestra thumb + check verde si hay archivo nuevo, botón "Quitar" y texto de estado.
function UploadFieldRow({
  label, hint, thumb, previewUrl, shape = "square",
  onPickFile, onClear, showToast, tipoLabel,
}) {
  const nuevo = esPreviewNuevo(previewUrl);
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#f9fafb", borderRadius: 12, padding: 12, border: "1px solid #e5e7eb" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          {thumb}
          {nuevo && (
            <span style={{ position: "absolute", bottom: -4, right: -4, width: 20, height: 20, borderRadius: "50%", background: "#16a34a", color: "#fff", fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>✓</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <label style={{ display: "inline-block", background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 12px", color: "#374151", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              {previewUrl ? `Cambiar ${tipoLabel}` : `Subir ${tipoLabel}`}
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  onPickFile(f);
                  if (showToast) showToast(`${tipoLabel[0].toUpperCase()}${tipoLabel.slice(1)} cargada ✓ se guardará al confirmar`);
                }} />
            </label>
            {previewUrl && (
              <button type="button"
                style={{ background: "transparent", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "5px 10px", fontSize: 11.5, cursor: "pointer", fontWeight: 600 }}
                onClick={onClear}>
                ✕ Quitar
              </button>
            )}
          </div>
          {nuevo ? (
            <p style={{ color: "#16a34a", fontSize: 11.5, marginTop: 6, marginBottom: 0, fontWeight: 600 }}>
              ✓ Lista. Se subirá al guardar.
            </p>
          ) : hint ? (
            <p style={{ color: "#888", fontSize: 11, marginTop: 6, marginBottom: 0 }}>{hint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OpcionPicker({ opciones, valor, onChange, columnas = 3 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`, gap: 8 }}>
      {opciones.map(op => (
        <div key={op.val} onClick={() => onChange(op.val)}
          style={{
            cursor: "pointer", padding: 10, borderRadius: 10,
            border: valor === op.val ? "2px solid #4f8f2f" : "1px solid #e5e7eb",
            background: valor === op.val ? "#f0f9eb" : "#fff",
            transition: "all 0.15s", textAlign: "center"
          }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{op.titulo}</div>
          {op.desc && <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{op.desc}</div>}
        </div>
      ))}
    </div>
  );
}

export default function PersonalizacionUnidadFields({
  form, setForm,
  logoPreview, setLogoFile, setLogoPreview,
  portadaPreview, setPortadaFile, setPortadaPreview,
  mostrarEstiloTarjeta = true,
  showToast,
}) {
  const limpiarBlob = (url) => {
    if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
  };

  return (
    <>
      <UploadFieldRow
        label="Logo de la unidad"
        tipoLabel="logo"
        hint="PNG o JPG. Se ve en la portada y los headers."
        previewUrl={logoPreview}
        thumb={
          <div style={{ width: 64, height: 64, borderRadius: form.forma_logo === "circulo" ? "50%" : 12, background: "linear-gradient(135deg, #4f8f2f, #7fbf4d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, overflow: "hidden" }}>
            {logoPreview
              ? <img src={logoPreview} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              : "🏟️"}
          </div>
        }
        onPickFile={async (f) => {
          // Recortamos a cuadrado centrado antes de subir: así el logo se ve
          // completo y sin franjas tanto en círculo como en cuadrado redondeado.
          const cuadrada = await recortarCuadradoCentrado(f);
          limpiarBlob(logoPreview);
          setLogoFile(cuadrada);
          setLogoPreview(URL.createObjectURL(cuadrada));
        }}
        onClear={() => { limpiarBlob(logoPreview); setLogoFile(null); setLogoPreview(null); setForm({ ...form, logo_url: "" }); }}
        showToast={showToast}
      />

      <UploadFieldRow
        label="Imagen de portada / foto del lugar (opcional)"
        tipoLabel="portada"
        hint="Aparece detrás del nombre en la tarjeta de la unidad."
        previewUrl={portadaPreview}
        thumb={
          <div style={{ width: 96, height: 56, borderRadius: 8, background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, overflow: "hidden" }}>
            {portadaPreview
              ? <img src={portadaPreview} alt="portada" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : "🖼️"}
          </div>
        }
        onPickFile={(f) => { limpiarBlob(portadaPreview); setPortadaFile(f); setPortadaPreview(URL.createObjectURL(f)); }}
        onClear={() => { limpiarBlob(portadaPreview); setPortadaFile(null); setPortadaPreview(null); setForm({ ...form, portada_url: "" }); }}
        showToast={showToast}
      />

      {/* LEMA */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Frase o lema (opcional)</label>
        <input style={inputStyle} placeholder="ej. ¡La casa del fútbol 7! · Desde 2010"
          value={form.lema || ""} maxLength={60}
          onChange={e => setForm({ ...form, lema: e.target.value })} />
      </div>

      {/* COLOR DE MARCA */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Color de marca</label>
        <ColorPicker
          colores={COLORES_MARCA}
          valor={form.color_marca}
          onChange={c => setForm({ ...form, color_marca: c })}
        />
        <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginTop: 8 }}>
          🎨 Toca el círculo con paleta para elegir cualquier otro color.
        </div>
      </div>

      {/* TAMAÑO Y FORMA DEL LOGO */}
      {/* flex-wrap: lado a lado cuando hay espacio, apilados (ancho completo)
          cuando el modal es angosto, para que el texto de los botones quepa. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, ...fieldStyle }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <label style={labelStyle}>Tamaño del logo</label>
          <OpcionPicker opciones={TAMANOS_LOGO} valor={form.tamano_logo || "mediano"}
            onChange={v => setForm({ ...form, tamano_logo: v })} columnas={3} />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <label style={labelStyle}>Forma del logo</label>
          <OpcionPicker opciones={FORMAS_LOGO} valor={form.forma_logo || "cuadrado"}
            onChange={v => setForm({ ...form, forma_logo: v })} columnas={2} />
        </div>
      </div>

      {/* ESTILO DE TARJETA */}
      {mostrarEstiloTarjeta && (
        <div style={fieldStyle}>
          <label style={labelStyle}>Estilo de tarjeta en el inicio</label>
          <OpcionPicker opciones={ESTILOS_TARJETA} valor={form.estilo_tarjeta || "logo_arriba"}
            onChange={v => setForm({ ...form, estilo_tarjeta: v })} columnas={2} />
        </div>
      )}

      {/* INTENSIDAD DEL FONDO (solo si estilo es fondo_esquina) */}
      {form.estilo_tarjeta === "fondo_esquina" && (
        <div style={fieldStyle}>
          <label style={labelStyle}>Intensidad del fondo difuminado</label>
          <OpcionPicker opciones={INTENSIDADES} valor={form.intensidad_fondo || "medio"}
            onChange={v => setForm({ ...form, intensidad_fondo: v })} columnas={3} />
        </div>
      )}
    </>
  );
}
