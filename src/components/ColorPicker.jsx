// Selector circular de color reutilizable.
// - Cada chip tiene contorno propio (siempre visible aunque el color sea claro).
// - El último círculo es <input type="color"> con borde dashed + ícono de paleta
//   para dejar claro que existe la opción de elegir un color fuera de la paleta.

export default function ColorPicker({
  valor,
  onChange,
  colores,
  size = 30,
  gap = 8,
  showCustom = true,
  customTitle = "Elegir otro color",
}) {
  const styleChip = (c) => {
    const seleccionado = (valor || "").toLowerCase() === c.toLowerCase();
    return {
      width: size,
      height: size,
      borderRadius: "50%",
      background: c,
      cursor: "pointer",
      // Borde interior blanco + anillo exterior gris para que el círculo nunca se
      // pierda contra el fondo, incluso si el color es blanco o muy claro.
      border: "2px solid #ffffff",
      boxShadow: seleccionado
        ? `0 0 0 2px ${c}, 0 2px 6px rgba(0,0,0,0.18)`
        : "0 0 0 1px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.06)",
      transition: "transform 0.12s, box-shadow 0.15s",
      transform: seleccionado ? "scale(1.08)" : "scale(1)",
      flexShrink: 0,
    };
  };

  return (
    <div style={{ display: "flex", gap, flexWrap: "wrap", alignItems: "center" }}>
      {colores.map(c => (
        <div key={c}
          onClick={() => onChange(c)}
          style={styleChip(c)}
          title={c} />
      ))}

      {showCustom && (
        // Wrapper que muestra el ícono 🎨 superpuesto al input type=color para
        // que se reconozca a simple vista como "otro color".
        <label
          title={customTitle}
          style={{
            position: "relative",
            width: size,
            height: size,
            borderRadius: "50%",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ffffff",
            border: "2px dashed #4f8f2f",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            flexShrink: 0,
          }}>
          <span aria-hidden="true" style={{ fontSize: Math.round(size * 0.5), lineHeight: 1, pointerEvents: "none" }}>🎨</span>
          <input
            type="color"
            value={valor || "#4f8f2f"}
            onChange={e => onChange(e.target.value)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: "pointer",
              border: "none",
              padding: 0,
            }}
            title={customTitle}
            aria-label={customTitle}
          />
        </label>
      )}
    </div>
  );
}
