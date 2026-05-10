import { useId } from "react";

// Silueta de camiseta de fútbol (viewBox 0 0 100 120)
const PATH =
  "M22,10 L0,34 L13,42 L25,34 L25,110 L75,110 L75,34 L87,42 L100,34 L78,10 " +
  "Q66,2 60,9 Q55,16 50,16 Q45,16 40,9 Q34,2 22,10 Z";

export const DISEÑOS = [
  { key: "solido",    label: "Sólido" },
  { key: "mitad",     label: "Mitad" },
  { key: "rayas_v",   label: "Rayas vert." },
  { key: "franjas_v", label: "Franjas" },
  { key: "rayas_h",   label: "Rayas horiz." },
  { key: "diagonal",  label: "Diagonal" },
  { key: "cuadros",   label: "Cuadros" },
  { key: "mangas",    label: "Mangas" },
];

function Patron({ diseno, c1, c2 }) {
  switch (diseno) {
    case "mitad":
      return <>
        <rect x="0"  y="0" width="50"  height="120" fill={c1} />
        <rect x="50" y="0" width="50"  height="120" fill={c2} />
      </>;
    case "rayas_v":
      return <>{Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={i * 10} y="0" width="10" height="120" fill={i % 2 === 0 ? c1 : c2} />
      ))}</>;
    case "franjas_v":
      return <>
        <rect x="0"  y="0" width="100" height="120" fill={c1} />
        <rect x="22" y="0" width="18"  height="120" fill={c2} />
        <rect x="60" y="0" width="18"  height="120" fill={c2} />
      </>;
    case "rayas_h":
      return <>{Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="0" y={i * 15} width="100" height="15" fill={i % 2 === 0 ? c1 : c2} />
      ))}</>;
    case "diagonal":
      return <>
        <rect x="0" y="0" width="100" height="120" fill={c1} />
        <polygon points="0,22 100,0 100,58 0,80" fill={c2} />
      </>;
    case "cuadros":
      return <>{Array.from({ length: 8 }, (_, row) =>
        Array.from({ length: 5 }, (_, col) => (
          <rect
            key={`${row}-${col}`}
            x={col * 20} y={row * 15} width="20" height="15"
            fill={(row + col) % 2 === 0 ? c1 : c2}
          />
        ))
      )}</>;
    case "mangas":
      return <>
        <rect x="0"  y="0" width="100" height="120" fill={c2} />
        <rect x="25" y="0" width="50"  height="120" fill={c1} />
      </>;
    default: // solido
      return <rect x="0" y="0" width="100" height="120" fill={c1} />;
  }
}

export default function JerseySVG({
  diseno = "solido",
  color1 = "#3182ce",
  color2 = "#ffffff",
  size   = 50,
}) {
  const uid    = useId().replace(/:/g, "");
  const clipId = `jc${uid}`;

  return (
    <svg
      viewBox="0 0 100 120"
      width={size}
      height={Math.round(size * 1.2)}
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={PATH} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <Patron diseno={diseno} c1={color1} c2={color2} />
      </g>

      <path d={PATH} fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth="1.5" />
    </svg>
  );
}

// Selector de diseños para usar en formularios
export function JerseyDesignPicker({ diseno, color1, color2, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {DISEÑOS.map(d => (
        <button
          key={d.key}
          type="button"
          title={d.label}
          onClick={() => onChange({ diseno: d.key })}
          style={{
            padding: "6px 8px",
            border: `2px solid ${diseno === d.key ? "#4f8f2f" : "#e5e7eb"}`,
            borderRadius: 10,
            background: diseno === d.key ? "#f0fdf4" : "white",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            transition: "all 0.15s",
          }}
        >
          <JerseySVG diseno={d.key} color1={color1} color2={color2} size={36} />
          <span style={{ fontSize: 10, color: diseno === d.key ? "#4f8f2f" : "#6b7280", fontWeight: diseno === d.key ? 700 : 400 }}>
            {d.label}
          </span>
        </button>
      ))}
    </div>
  );
}
