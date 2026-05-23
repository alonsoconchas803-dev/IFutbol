// ─────────────────────────────────────────────────────────────────
// BRACKET TREE — esquema tipo árbol horizontal compartido
// ─────────────────────────────────────────────────────────────────
// Geometría fija: cada partido mide 112px de alto. Los márgenes
// verticales centran los partidos de cada ronda entre los de la
// ronda anterior, formando el escalonado clásico de un bracket.
//
// La etiqueta de la ronda se desplaza hacia abajo con el mismo
// margen del primer partido para que quede pegada a éste en vez de
// flotar arriba con un hueco blanco gigante.

const BKT_MARGENES = [10, 76, 208]; // cuartos · semifinales · final

function BracketTeamRow({ equipo, goles, avanza }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
      <span style={{ width:8, height:8, borderRadius:"50%", flexShrink:0, background:equipo?.color_playera||"#cbd5c0", boxShadow:"0 0 0 1.5px #fff" }} />
      <span style={{ flex:1, minWidth:0, fontSize:11.5, fontWeight:avanza?800:600, color:avanza?"var(--green)":"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {equipo?.nombre || "—"}
      </span>
      {goles !== null && goles !== undefined && (
        <span style={{ fontWeight:800, fontSize:12.5, color:avanza?"var(--green)":"var(--text)", flexShrink:0 }}>{goles}</span>
      )}
    </div>
  );
}

function BracketMatchCard({ p, color, getEquipo, onAbrir }) {
  const local = getEquipo(p.equipo_local_id);
  const visitante = getEquipo(p.equipo_visitante_id);
  const gan = getEquipo(p.equipo_avanza_id);
  const clickable = onAbrir && !p.cerrado;
  return (
    <div
      onClick={clickable ? () => onAbrir(p) : undefined}
      className={clickable ? "bracket-clickable" : ""}
      style={{
        height:"100%", boxSizing:"border-box",
        background: `linear-gradient(180deg, #ffffff 0%, ${color}14 100%)`,
        borderRadius:10,
        border:`1.5px solid ${color}55`,
        borderLeft:`4px solid ${color}`,
        padding:"9px 11px", display:"flex", flexDirection:"column", gap:4,
        boxShadow:`0 2px 6px ${color}26`,
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <BracketTeamRow equipo={local} goles={p.goles_local} avanza={p.equipo_avanza_id===local?.id} />
      <BracketTeamRow equipo={visitante} goles={p.goles_visitante} avanza={p.equipo_avanza_id===visitante?.id} />
      <div style={{ marginTop:"auto" }}>
        {p.cerrado
          ? <div style={{ background:"var(--green-light)", color:"var(--green)", fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>✓ Avanza {gan?.nombre || "—"}</div>
          : onAbrir
            ? <div style={{ fontSize:10, color:"var(--text-muted)", fontStyle:"italic" }}>Pendiente — toca para registrar</div>
            : <div style={{ fontSize:10, color:"var(--text-muted)", fontStyle:"italic" }}>Pendiente</div>}
        {p.hora && <div style={{ fontSize:9.5, color:"var(--text-muted)", marginTop:3 }}>⏰ {p.hora}{p.cancha_numero ? ` · C${p.cancha_numero}` : ""}</div>}
      </div>
    </div>
  );
}

function BracketPlaceholder() {
  return (
    <div style={{
      height:"100%", boxSizing:"border-box", borderRadius:10,
      border:"1px dashed var(--border)", background:"#f9fafb",
      display:"flex", alignItems:"center", justifyContent:"center",
      textAlign:"center", padding:"8px 10px",
      color:"var(--text-muted)", fontSize:10, fontStyle:"italic", lineHeight:1.4,
    }}>
      Se definirá al avanzar las rondas
    </div>
  );
}

export default function BracketTree({ titulo, emoji, partidos, colors, getEquipo, onAbrir, topGap, cardStyle }) {
  if (partidos.cuartos.length === 0) return null;
  const semisEsperadas = Math.max(1, Math.ceil(partidos.cuartos.length / 2));
  const rondas = [
    { label:"Cuartos de final", color:colors[0], matches:partidos.cuartos, esperados:partidos.cuartos.length },
    { label:"Semifinales",      color:colors[1], matches:partidos.semis,   esperados:semisEsperadas },
    { label:"Final",            color:colors[2], matches:partidos.final,   esperados:1 },
  ];
  return (
    <div style={{ ...(cardStyle||defaultCardStyle), ...(topGap ? { marginTop:20 } : null) }}>
      <h3 style={defaultTitleStyle}>{emoji} {titulo}</h3>
      <div className="bkt-hint">↔ Desliza para ver el avance de las rondas</div>
      <div className="bkt-scroll">
        <div className="bkt-tree">
          {rondas.map((r, idx) => {
            const celdas = r.matches.length > 0
              ? r.matches
              : Array.from({ length:r.esperados }, () => null);
            return (
              <div key={idx} className={`bkt-round r${idx}`}>
                {/* La etiqueta baja con el mismo margen del primer partido
                    para no quedar despegada en semis y final. */}
                <div className="bkt-round-head" style={{ color:r.color, marginTop:BKT_MARGENES[idx] }}>{r.label}</div>
                {celdas.map((p, i) => (
                  <div
                    key={p ? p.id : `ph-${idx}-${i}`}
                    className={`bkt-match ${i % 2 === 0 ? "bkt-top" : "bkt-bot"}`}
                    style={{ marginTop: i === 0 ? 0 : BKT_MARGENES[idx], marginBottom:BKT_MARGENES[idx] }}
                  >
                    {p
                      ? <BracketMatchCard p={p} color={r.color} getEquipo={getEquipo} onAbrir={onAbrir} />
                      : <BracketPlaceholder />}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {partidos.tercer.length > 0 && (
        <div style={{ marginTop:16, paddingTop:14, borderTop:"1px dashed var(--border)" }}>
          <div className="bkt-round-head" style={{ color:"#cd7f32", textAlign:"left", marginBottom:8 }}>🥉 Tercer lugar</div>
          <div style={{ width:182, height:112 }}>
            <BracketMatchCard p={partidos.tercer[0]} color="#cd7f32" getEquipo={getEquipo} onAbrir={onAbrir} />
          </div>
        </div>
      )}
    </div>
  );
}

const defaultCardStyle = {
  background:"white", borderRadius:"var(--radius-md)", padding:14,
  boxShadow:"var(--shadow-md)", border:"1px solid var(--border)",
  borderTop:"3px solid var(--green)", minWidth:0, overflow:"hidden",
};
const defaultTitleStyle = {
  fontSize:14, fontWeight:800, color:"var(--green-dark)", marginBottom:12, letterSpacing:-0.2,
};
