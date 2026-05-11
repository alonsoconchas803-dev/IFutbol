// Campos de personalización de la tarjeta de la unidad deportiva.
// Reutilizado por SuperAdmin (al crear/editar) y LeagueAdmin (al personalizar la propia).

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

function OpcionPicker({ opciones, valor, onChange, columnas = 3 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columnas}, 1fr)`, gap: 8 }}>
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
}) {
  return (
    <>
      {/* LOGO */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Logo de la unidad</label>
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#f9fafb", borderRadius: 12, padding: 12, border: "1px solid #e5e7eb" }}>
          <div style={{ width: 64, height: 64, borderRadius: form.forma_logo === "circulo" ? "50%" : 12, background: "linear-gradient(135deg, #4f8f2f, #7fbf4d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, overflow: "hidden", flexShrink: 0 }}>
            {logoPreview
              ? <img src={logoPreview} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              : "🏟️"}
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "inline-block", background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 12px", color: "#374151", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              {logoPreview ? "Cambiar logo" : "Subir logo"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                const f = e.target.files?.[0];
                if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)); }
              }} />
            </label>
            {logoPreview && (
              <button type="button" style={{ marginLeft: 6, background: "transparent", border: "none", color: "#dc2626", fontSize: 12, cursor: "pointer" }}
                onClick={() => { setLogoFile(null); setLogoPreview(null); setForm({ ...form, logo_url: "" }); }}>
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PORTADA / FOTO DEL LUGAR */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Imagen de portada / foto del lugar (opcional)</label>
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#f9fafb", borderRadius: 12, padding: 12, border: "1px solid #e5e7eb" }}>
          <div style={{ width: 96, height: 56, borderRadius: 8, background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, overflow: "hidden", flexShrink: 0 }}>
            {portadaPreview
              ? <img src={portadaPreview} alt="portada" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : "🖼️"}
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "inline-block", background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 12px", color: "#374151", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              {portadaPreview ? "Cambiar portada" : "Subir portada"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                const f = e.target.files?.[0];
                if (f) { setPortadaFile(f); setPortadaPreview(URL.createObjectURL(f)); }
              }} />
            </label>
            {portadaPreview && (
              <button type="button" style={{ marginLeft: 6, background: "transparent", border: "none", color: "#dc2626", fontSize: 12, cursor: "pointer" }}
                onClick={() => { setPortadaFile(null); setPortadaPreview(null); setForm({ ...form, portada_url: "" }); }}>
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>

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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {COLORES_MARCA.map(c => (
            <div key={c} onClick={() => setForm({ ...form, color_marca: c })}
              style={{ width: 30, height: 30, borderRadius: "50%", background: c, cursor: "pointer",
                boxShadow: form.color_marca === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : "none" }} />
          ))}
          <input type="color" value={form.color_marca || "#4f8f2f"}
            onChange={e => setForm({ ...form, color_marca: e.target.value })}
            style={{ width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0 }}
            title="Color personalizado" />
        </div>
      </div>

      {/* TAMAÑO Y FORMA DEL LOGO */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, ...fieldStyle }}>
        <div>
          <label style={labelStyle}>Tamaño del logo</label>
          <OpcionPicker opciones={TAMANOS_LOGO} valor={form.tamano_logo || "mediano"}
            onChange={v => setForm({ ...form, tamano_logo: v })} columnas={3} />
        </div>
        <div>
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
