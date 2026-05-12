/*
  Logo iFutbol — isotipo (campo abstracto) + wordmark.
  Diseño minimalista, flat, geométrico. Sin sombras ni degradados.
  El color se controla con la prop `color` (default: currentColor).
  Versiones canónicas:
    - Sobre fondo verde:  <IFutbolLogo color="#FFFFFF" />
    - Sobre fondo blanco: <IFutbolLogo color="#4f8f2f" />
*/
export default function IFutbolLogo({ color = "currentColor", height = 28, showText = true, style }) {
  // Proporciones del isotipo (campo): viewBox 64x40, ratio 1.6:1.
  const iso = Math.round(height * 1.6);
  const fontSize = Math.round(height * 0.78);
  const gap = Math.round(height * 0.32);

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap,
      color,
      lineHeight: 1,
      ...style,
    }}>
      <svg
        width={iso}
        height={height}
        viewBox="0 0 64 40"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        {/* Campo */}
        <rect x="2" y="2" width="60" height="36" rx="4.5" ry="4.5" strokeWidth="3" />
        {/* Línea central vertical */}
        <line x1="32" y1="2" x2="32" y2="38" strokeWidth="2.5" />
        {/* Círculo central */}
        <circle cx="32" cy="20" r="6" strokeWidth="2.5" />
        {/* Portería izquierda */}
        <rect x="2" y="13" width="5.5" height="14" strokeWidth="2.5" rx="0.5" />
        {/* Portería derecha */}
        <rect x="56.5" y="13" width="5.5" height="14" strokeWidth="2.5" rx="0.5" />
      </svg>

      {showText && (
        <span style={{
          fontFamily: "'Montserrat', 'DM Sans', sans-serif",
          fontWeight: 600,
          fontSize,
          letterSpacing: -0.3,
          color: "currentColor",
          whiteSpace: "nowrap",
        }}>
          iFutbol
        </span>
      )}
    </span>
  );
}
