import { useState, useEffect } from "react";
import "./ifutbol.css";
import SuperAdmin from "./pages/SuperAdmin";
import LeagueAdmin from "./pages/LeagueAdmin";
import Referee from "./pages/Referee";
import PlayerProfile from "./pages/PlayerProfile";
import Solicitudes from "./pages/Solicitudes";
import JerseySVG from "./components/JerseySVG";

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

const api = async (path, options = {}) => {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  return res.json();
};

const db = async (path) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" }
  });
  if (!res.ok) return [];
  return res.json();
};

const dbAuth = async (path, token, options = {}) => {
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
  if (!res.ok) return [];
  return res.status === 204 ? null : res.json();
};

const POSITIONS = ["Portero", "Defensa", "Mediocampista", "Delantero"];

const ROLES_INFO = {
  super_admin:  { label: "Super Admin",   icon: "👑", color: "#4f8f2f" },
  league_admin: { label: "Admin de Unidad", icon: "🏟️", color: "#3b82f6" },
  referee:      { label: "Árbitro",       icon: "🟡", color: "#f59e0b" },
  player:       { label: "Jugador",       icon: "⚽", color: "#8b5cf6" },
};

const MENU = {
  super_admin: [
    { icon:"👑", label:"Panel Admin",         key:"panel" },
    { icon:"🏟️", label:"Unidades Deportivas", key:"canchas" },
    { icon:"🏆", label:"Torneos",             key:"torneos" },
    { icon:"📋", label:"Solicitudes",         key:"solicitudes" },
  ],
  league_admin: [
    { icon:"👕", label:"Equipos",    key:"equipos" },
    { icon:"👥", label:"Jugadores",  key:"jugadores" },
    { icon:"📅", label:"Calendario", key:"calendario" },
    { icon:"🟡", label:"Árbitros",   key:"arbitros" },
    { icon:"📄", label:"Fichas",     key:"fichas" },
  ],
  referee: [
    { icon:"🟡", label:"Mis Partidos", key:"partidos" },
  ],
  player: [
    { icon:"⚽", label:"Mi Perfil",  key:"perfil" },
    { icon:"🏆", label:"Mis Ligas",  key:"ligas" },
  ],
};

// ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession]           = useState(null);
  const [userRole, setUserRole]         = useState(null);
  const [jugadorData, setJugadorData]   = useState(null);
  const [screen, setScreen]             = useState("home");
  const [unidadActiva, setUnidadActiva] = useState(null);
  const [dashSeccion, setDashSeccion]   = useState(null);
  const [modal, setModal]               = useState(null);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [toast, setToast]               = useState(null);
  const [canchas, setCanchas]           = useState([]);

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    db("/canchas?select=*&order=created_at.asc").then(d => setCanchas(d || []));
  }, []);

  const handleLogin = async (email, password) => {
    const data = await api("/auth/v1/token?grant_type=password", {
      method: "POST", body: JSON.stringify({ email, password })
    });
    if (data.access_token) {
      setSession(data);
      await loadUserRole(data.access_token, data.user.id);
      setModal(null);
      showToast("¡Bienvenido!");
      return { ok: true };
    }
    return { ok: false, error: "Correo o contraseña incorrectos" };
  };

  const loadUserRole = async (token, userId) => {
    try {
      const roles = await dbAuth(`/user_roles?user_id=eq.${userId}&select=rol,liga_id,cancha_id&limit=1`, token);
      if (Array.isArray(roles) && roles.length > 0) {
        setUserRole(roles[0]);
        setScreen("dashboard");
        return;
      }
      const jugador = await dbAuth(`/jugadores?user_id=eq.${userId}`, token);
      if (Array.isArray(jugador) && jugador.length > 0) {
        setUserRole({ rol: "player" });
        setJugadorData(jugador[0]);
        setScreen("dashboard");
      }
    } catch (e) { console.error(e); }
  };

  const handleLogout = () => {
    setSession(null); setUserRole(null); setJugadorData(null);
    setScreen("home"); setSidebarOpen(false);
    showToast("Sesión cerrada");
  };

  const initials = () => {
    if (!session) return null;
    if (jugadorData?.foto_url) return jugadorData.foto_url;
    const name = jugadorData?.nombre_completo || session.user?.email || "";
    return name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
  };

  if (screen === "dashboard" && session) {
    return (
      <DashboardLayout
        session={session} userRole={userRole} jugadorData={jugadorData}
        onLogout={handleLogout} toast={toast} showToast={showToast}
        onHome={() => setScreen("home")} initials={initials()}
        seccionInicial={dashSeccion}
      />
    );
  }

  if (screen === "unidad" && unidadActiva) {
    return (
      <PublicLayout session={session} userRole={userRole} sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen} setModal={setModal} onLogout={handleLogout}
        initials={initials()} toast={toast} onHome={() => setScreen("home")}
        onDashboard={sec => { setDashSeccion(sec || null); setScreen("dashboard"); }}>
        <UnidadPage cancha={unidadActiva} onBack={() => setScreen("home")} />
        <Modals modal={modal} setModal={setModal} onLogin={handleLogin} showToast={showToast} />
      </PublicLayout>
    );
  }

  return (
    <PublicLayout session={session} userRole={userRole} sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen} setModal={setModal} onLogout={handleLogout}
      initials={initials()} toast={toast} onHome={() => setScreen("home")}
      onDashboard={sec => { setDashSeccion(sec || null); setScreen("dashboard"); }}>
      <HomePage canchas={canchas} onVerUnidad={c => { setUnidadActiva(c); setScreen("unidad"); setSidebarOpen(false); }} />
      <Modals modal={modal} setModal={setModal} onLogin={handleLogin} showToast={showToast} />
    </PublicLayout>
  );
}

// ─────────────────────────────────────────────────────────────────
// MODALS WRAPPER
// ─────────────────────────────────────────────────────────────────
function Modals({ modal, setModal, onLogin, showToast }) {
  if (modal === "login") return <LoginModal onClose={() => setModal(null)} onLogin={onLogin} onRegister={() => setModal("register_player")} />;
  if (modal === "register_player") return <RegisterPlayerModal onClose={() => setModal(null)} showToast={showToast} onLogin={() => setModal("login")} />;
  if (modal === "register_staff") return <RegisterStaffModal onClose={() => setModal(null)} showToast={showToast} />;
  return null;
}

// ─────────────────────────────────────────────────────────────────
// DASHBOARD LAYOUT (con navegación lateral funcional)
// ─────────────────────────────────────────────────────────────────
function DashboardLayout({ session, userRole, jugadorData, onLogout, toast, showToast, onHome, initials, seccionInicial }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const rol = userRole?.rol;
  const roleInfo = ROLES_INFO[rol] || { label:"Usuario", icon:"👤", color:"#666" };
  const menuItems = MENU[rol] || [];
  const [activeSection, setActiveSection] = useState(seccionInicial || menuItems[0]?.key || "panel");

  const SUPER_MAP  = { panel:"stats", canchas:"canchas", torneos:"ligas", solicitudes:"solicitudes" };
  const LEAGUE_MAP = { equipos:"equipos", jugadores:"jugadores", calendario:"calendario", arbitros:"arbitros", fichas:"fichas" };
  const PLAYER_MAP = { perfil:"perfil", ligas:"ligas" };

  const renderContent = () => {
    if (rol === "super_admin") {
      if (activeSection === "solicitudes") return <Solicitudes session={session} />;
      return <SuperAdmin session={session} seccionInicial={SUPER_MAP[activeSection] || "stats"} />;
    }
    if (rol === "league_admin") return <LeagueAdmin session={session} userRole={userRole} seccionInicial={LEAGUE_MAP[activeSection] || "equipos"} />;
    if (rol === "referee") return <Referee session={session} />;
    if (rol === "player") return <PlayerProfile session={session} seccionInicial={PLAYER_MAP[activeSection] || "perfil"} />;
    return null;
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"var(--bg)" }}>
      <style>{css}</style>
      {toast && <div className={`ifutbol-toast ${toast.tipo==="err"?"toast-err":"toast-ok"}`}>{toast.msg}</div>}

      {/* TOPBAR */}
      <header style={s.topbar}>
        <div style={s.topLeft}>
          <button className="ham-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div style={s.brand} onClick={onHome} className="clickable">
            <div style={s.brandIcon}><BallIcon /></div>
            <span style={s.brandName}>IFútbol</span>
          </div>
        </div>
        <div style={s.topRight}>
          <div style={{ ...s.pill, background:"rgba(255,255,255,0.18)", color:"#fff", border:"1px solid rgba(255,255,255,0.35)" }}>
            {roleInfo.icon} {roleInfo.label}
          </div>
        </div>
      </header>

      <div style={{ display:"flex", flex:1 }}>
        {/* SIDEBAR */}
        <aside style={{ width:sidebarOpen?220:0, overflow:"hidden", transition:"width 0.25s ease", background:"white", borderRight:"1px solid var(--border)", display:"flex", flexDirection:"column", position:"sticky", top:60, height:"calc(100vh - 60px)", flexShrink:0 }}>
          <nav style={{ flex:1, padding:"14px 10px", display:"flex", flexDirection:"column", gap:3 }}>
            <div className="nav-item" onClick={onHome}>
              <span style={{ fontSize:17, width:22, textAlign:"center", flexShrink:0 }}>🏠</span>
              <span>Inicio</span>
            </div>
            {menuItems.map(({ icon, label, key }) => (
              <div key={key}
                className={`nav-item ${activeSection === key ? "nav-item-active" : ""}`}
                onClick={() => setActiveSection(key)}>
                <span style={{ fontSize:17, width:22, textAlign:"center", flexShrink:0 }}>{icon}</span>
                <span>{label}</span>
              </div>
            ))}
            <div style={{ flex:1 }} />
            <div className="nav-item" style={{ color:"#ef4444" }} onClick={onLogout}>
              <span style={{ fontSize:17, width:22, textAlign:"center", flexShrink:0 }}>🚪</span>
              <span>Cerrar sesión</span>
            </div>
          </nav>
          <div style={s.sbFooter}>
            <Avatar initials={initials} size={36} />
            <div style={{ overflow:"hidden" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"var(--text)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {session?.user?.email?.split("@")[0]}
              </div>
              <div style={{ fontSize:11, color:"var(--text-muted)" }}>{roleInfo.label}</div>
            </div>
          </div>
        </aside>

        {/* CONTENIDO */}
        <main style={{ flex:1, overflow:"auto", padding:"32px 36px" }}>
          <div style={{ maxWidth:960, margin:"0 auto" }} className="animate-in" key={activeSection}>
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC LAYOUT
// ─────────────────────────────────────────────────────────────────
function PublicLayout({ children, session, userRole, sidebarOpen, setSidebarOpen, setModal, onLogout, initials, toast, onHome, onDashboard }) {
  const roleInfo = ROLES_INFO[userRole?.rol] || null;
  return (
    <div style={s.root}>
      <style>{css}</style>
      {toast && <div className={`ifutbol-toast ${toast.tipo==="err"?"toast-err":"toast-ok"}`}>{toast.msg}</div>}

      <header style={s.topbar}>
        <div style={s.topLeft}>
          <button className="ham-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div style={s.brand} onClick={onHome} className="clickable">
            <div style={{ ...s.brandIcon, background:"rgba(255,255,255,0.2)", border:"1.5px solid rgba(255,255,255,0.35)" }}><BallIcon /></div>
            <span style={{ ...s.brandName, color:"white" }}>IFútbol</span>
          </div>
        </div>
        <div style={s.topRight}>
          {roleInfo && <div style={{ ...s.pill, background:"rgba(255,255,255,0.18)", color:"white", border:"1px solid rgba(255,255,255,0.3)" }}>{roleInfo.icon} {roleInfo.label}</div>}
          {session && <button className="btn btn-outline" style={{ fontSize:13, padding:"7px 16px", color:"white", borderColor:"rgba(255,255,255,0.55)", background:"rgba(255,255,255,0.12)" }} onClick={onDashboard}>Mi panel</button>}
        </div>
      </header>

      {sidebarOpen && <div style={s.overlay} onClick={() => setSidebarOpen(false)} />}

      <aside style={{ ...s.sidebar, transform: sidebarOpen ? "translateX(0)" : "translateX(-110%)" }}>
        <div style={{ padding:"20px 16px 12px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={s.brandIcon}><BallIcon /></div>
            <span style={{ fontSize:16, fontWeight:800, color:"var(--text)" }}>IFútbol</span>
          </div>
        </div>
        <nav style={{ flex:1, padding:"8px 10px", display:"flex", flexDirection:"column", gap:3 }}>
          <button className="sb-btn" onClick={() => { onHome(); setSidebarOpen(false); }}>🏠 Inicio</button>
          {!session ? <>
            <button className="sb-btn" onClick={() => { setModal("login"); setSidebarOpen(false); }}>🔑 Iniciar sesión</button>
            <button className="sb-btn" onClick={() => { setModal("register_player"); setSidebarOpen(false); }}>⚽ Registrarme como jugador</button>
            <button className="sb-btn" onClick={() => { setModal("register_staff"); setSidebarOpen(false); }}>📋 Registrarme</button>
          </> : <>
            {userRole?.rol === "player" ? <>
              <button className="sb-btn" onClick={() => { onDashboard("perfil"); setSidebarOpen(false); }}>⚽ Mi Perfil</button>
              <button className="sb-btn" onClick={() => { onDashboard("ligas"); setSidebarOpen(false); }}>🏆 Mis Ligas</button>
            </> : (
              <button className="sb-btn" onClick={() => { onDashboard(); setSidebarOpen(false); }}>📊 Mi panel</button>
            )}
            <div style={{ flex:1 }} />
            <button className="sb-btn danger" onClick={() => { onLogout(); setSidebarOpen(false); }}>🚪 Cerrar sesión</button>
          </>}
        </nav>
        {session && (
          <div style={s.sbFooter}>
            <Avatar initials={initials} size={38} />
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:"var(--text)" }}>{session.user?.email?.split("@")[0]}</div>
              <div style={{ fontSize:11, color:"var(--text-muted)" }}>{roleInfo?.label || "Usuario"}</div>
            </div>
          </div>
        )}
      </aside>

      <main style={s.main}>{children}</main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// HOME PAGE
// ─────────────────────────────────────────────────────────────────
function HomePage({ canchas, onVerUnidad }) {
  return (
    <div>
      <div style={{ marginBottom:28, padding:"20px 24px", background:"var(--green)", borderRadius:"var(--radius-lg)", boxShadow:"0 4px 16px rgba(79,143,47,0.3)" }}>
        <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.7)", textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>Plataforma de fútbol 7</div>
        <h1 style={{ fontSize:26, fontWeight:900, color:"white", letterSpacing:-0.5, marginBottom:6, margin:"0 0 6px" }}>Unidades deportivas</h1>
        <p style={{ color:"rgba(255,255,255,0.78)", fontSize:14, margin:0 }}>Selecciona una unidad para ver sus torneos y estadísticas</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:16 }}>
        {canchas.map(c => (
          <div key={c.id} className="ud-card" onClick={() => onVerUnidad(c)}>
            <div style={{ width:44, height:44, borderRadius:12, background:"var(--green-light)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, marginBottom:14 }}>🏟️</div>
            <div style={{ fontSize:16, fontWeight:800, color:"var(--text)", marginBottom:5 }}>{c.nombre}</div>
            <div style={{ fontSize:13, color:"var(--text-sub)", marginBottom:14 }}>{c.direccion || "Ver torneos →"}</div>
            <div style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12, color:"var(--green)", fontWeight:700, background:"var(--green-light)", padding:"3px 10px", borderRadius:99 }}>⚽ {c.num_canchas} {c.num_canchas===1?"cancha":"canchas"}</div>
          </div>
        ))}
        <div style={{ background:"white", borderRadius:"var(--radius-md)", padding:20, boxShadow:"var(--shadow-md)", border:"1px solid var(--border)", minHeight:180, display:"flex", flexDirection:"column" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Publicidad</div>
          <div style={{ flex:1, background:"var(--bg)", borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-muted)", fontSize:13, padding:20, textAlign:"center" }}>
            📢 Espacio publicitario
          </div>
        </div>
        {canchas.length === 0 && (
          <div className="empty-state" style={{ gridColumn:"1/-1" }}>
            <div className="empty-state-icon">🏟️</div>
            <div className="empty-state-txt">No hay unidades deportivas registradas aún</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// UNIDAD PAGE
// ─────────────────────────────────────────────────────────────────
function UnidadPage({ cancha, onBack }) {
  const [torneos, setTorneos] = useState([]);
  const [torneoActivo, setTorneoActivo] = useState(null);
  const [seccion, setSeccion] = useState("partidos");
  const [equipos, setEquipos] = useState([]);
  const [clasificacion, setClasificacion] = useState([]);
  const [calendario, setCalendario] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [goleadores, setGoleadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState(null); // [rowIdx, colIdx]

  useEffect(() => {
    db(`/ligas?cancha_id=eq.${cancha.id}&activa=eq.true&select=*&order=nombre`).then(data => {
      setTorneos(data || []);
      setLoading(false);
    });
  }, [cancha.id]);

  const cargarDatos = async (ligaId) => {
    setLoading(true);
    // 1. Jornadas de esta liga + equipos en paralelo
    const [eqs, jornadas] = await Promise.all([
      db(`/equipos?liga_id=eq.${ligaId}&select=*&order=nombre`),
      db(`/jornadas?liga_id=eq.${ligaId}&select=id,numero,fecha&order=numero`),
    ]);
    const eqsF = eqs || [];
    setEquipos(eqsF);
    const jornadaIds = (jornadas||[]).map(j=>j.id);
    const jornadasMap = Object.fromEntries((jornadas||[]).map(j=>[j.id,j]));

    // 2. Partidos de esas jornadas
    let allParts = [];
    if (jornadaIds.length > 0) {
      allParts = await db(
        `/partidos?jornada_id=in.(${jornadaIds.join(",")})&select=*,equipos_local:equipos!partidos_equipo_local_id_fkey(id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url),equipos_visitante:equipos!partidos_equipo_visitante_id_fkey(id,nombre,color_playera,color_camiseta_2,diseno_camiseta,escudo_url),ficha_partido(goles_local,goles_visitante,goleadores,cerrada,faltas_local,faltas_visitante)&order=jornada_id,cancha_numero`
      );
    }
    const parts = (allParts||[]).map(p=>({...p, jornada: jornadasMap[p.jornada_id]||null}));
    setCalendario(parts);

    // PostgREST devuelve ficha_partido como objeto {} (relación 1-a-1), no array
    const fichas = parts.filter(p=>p.ficha_partido?.cerrada);
    setPartidos(fichas);

    // Clasificación usando IDs directos (no búsqueda por nombre)
    const tabla = {};
    eqsF.forEach(eq => { tabla[eq.id] = { equipo:eq, pj:0, g:0, e:0, d:0, gf:0, gc:0, pts:0, faltas:0 }; });
    fichas.forEach(p => {
      const f = p.ficha_partido;
      const lId = p.equipo_local_id, vId = p.equipo_visitante_id;
      if (!tabla[lId]||!tabla[vId]) return;
      tabla[lId].pj++; tabla[vId].pj++;
      tabla[lId].gf+=f.goles_local||0; tabla[lId].gc+=f.goles_visitante||0;
      tabla[vId].gf+=f.goles_visitante||0; tabla[vId].gc+=f.goles_local||0;
      tabla[lId].faltas+=f.faltas_local||0; tabla[vId].faltas+=f.faltas_visitante||0;
      if ((f.goles_local||0)>(f.goles_visitante||0)){tabla[lId].g++;tabla[lId].pts+=3;tabla[vId].d++;}
      else if ((f.goles_local||0)<(f.goles_visitante||0)){tabla[vId].g++;tabla[vId].pts+=3;tabla[lId].d++;}
      else{tabla[lId].e++;tabla[lId].pts++;tabla[vId].e++;tabla[vId].pts++;}
    });
    setClasificacion(Object.values(tabla).sort((a,b)=>b.pts-a.pts||(b.gf-b.gc)-(a.gf-a.gc)));

    const gm={};
    fichas.forEach(p=>(p.ficha_partido?.goleadores||[]).forEach(g=>{
      if(!gm[g.jugador_id])gm[g.jugador_id]={nombre:g.nombre,equipo_nombre:g.equipo_nombre,goles:0};
      gm[g.jugador_id].goles+=g.goles;
    }));
    setGoleadores(Object.values(gm).sort((a,b)=>b.goles-a.goles).slice(0,10));
    setLoading(false);
  };

  const seleccionarTorneo = t => { setTorneoActivo(t); setSeccion("partidos"); cargarDatos(t.id); };
  const tabs = [["partidos","📅 Partidos"],["tabla","📊 Tabla"],["goleadores","🥇 Goleadores"],["equipos","👕 Equipos"],["ofensiva","⚔️ Mejor ofensiva"],["defensiva","🛡️ Mejor defensiva"],["fairplay","🤝 Fair play"]];

  // Vista: selección de torneo (cards)
  if (!torneoActivo) {
    return (
      <div className="animate-in">
        <button className="btn btn-ghost" style={{ fontSize:13, padding:"7px 16px", marginBottom:20 }} onClick={onBack}>← Volver</button>
        <div style={{ display:"flex", alignItems:"center", gap:18, marginBottom:24 }}>
          <div style={{ fontSize:40, width:68, height:68, background:"var(--green-light)", borderRadius:16, display:"flex", alignItems:"center", justifyContent:"center" }}>🏟️</div>
          <div>
            <h1 style={{ fontSize:26, fontWeight:900, color:"var(--text)", letterSpacing:-0.8, marginBottom:4 }}>{cancha.nombre}</h1>
            <p style={{ color:"var(--text-muted)", fontSize:14, margin:0 }}>{cancha.direccion} · {cancha.num_canchas} {cancha.num_canchas===1?"cancha":"canchas"}</p>
          </div>
        </div>
        <div style={{ marginBottom:20, padding:"16px 22px", background:"var(--green)", borderRadius:"var(--radius-lg)", boxShadow:"0 4px 16px rgba(79,143,47,0.3)" }}>
          <h2 style={{ fontSize:17, fontWeight:800, color:"white", margin:"0 0 4px" }}>Torneos activos</h2>
          <p style={{ fontSize:13, color:"rgba(255,255,255,0.78)", margin:0 }}>Selecciona un torneo para ver sus estadísticas</p>
        </div>
        {loading ? <div style={{ padding:60, textAlign:"center" }}><div className="spinner"/></div> : (
          torneos.length === 0
            ? <EmptyState icon="🏆" txt="No hay torneos activos en esta unidad"/>
            : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))", gap:16 }}>
                {torneos.map(t => (
                  <div key={t.id} className="ud-card" onClick={() => seleccionarTorneo(t)}>
                    <div style={{ width:44, height:44, borderRadius:12, background:"var(--green-light)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, marginBottom:14 }}>🏆</div>
                    <div style={{ fontSize:16, fontWeight:800, color:"var(--text)", marginBottom:6 }}>{t.nombre}</div>
                    {(t.dia||t.turno) && <div style={{ fontSize:13, color:"var(--text-sub)", marginBottom:6 }}>{[t.dia, t.turno].filter(Boolean).join(" · ")}</div>}
                    {t.temporada && <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:10 }}>Temporada {t.temporada}</div>}
                    <div style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12, color:"var(--green)", fontWeight:700, background:"var(--green-light)", padding:"3px 10px", borderRadius:99 }}>Ver estadísticas →</div>
                  </div>
                ))}
              </div>
        )}
      </div>
    );
  }

  // Vista: estadísticas del torneo seleccionado
  return (
    <div className="animate-in">
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
        <button className="btn btn-ghost" style={{ fontSize:13, padding:"7px 16px" }} onClick={() => setTorneoActivo(null)}>← {cancha.nombre}</button>
        <button className="btn btn-ghost" style={{ fontSize:13, padding:"7px 14px" }} onClick={() => cargarDatos(torneoActivo.id)} title="Actualizar datos">🔄 Actualizar</button>
      </div>
      <div style={{ background:"linear-gradient(135deg,#4f8f2f 0%,#7fbf4d 100%)", borderRadius:18, padding:"22px 28px", marginBottom:24, boxShadow:"0 4px 16px rgba(79,143,47,0.35)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={{ fontSize:38, width:62, height:62, background:"rgba(255,255,255,0.18)", borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>🏆</div>
          <div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", fontWeight:700, textTransform:"uppercase", letterSpacing:0.6, marginBottom:3 }}>{cancha.nombre}</div>
            <h1 style={{ fontSize:22, fontWeight:900, color:"#fff", letterSpacing:-0.5, margin:"0 0 4px" }}>{torneoActivo.nombre}</h1>
            <p style={{ color:"rgba(255,255,255,0.75)", fontSize:13, margin:0 }}>{[torneoActivo.dia, torneoActivo.turno, torneoActivo.temporada ? `Temp. ${torneoActivo.temporada}` : null].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div style={{ display:"flex", gap:24, flexShrink:0 }}>
          {[[equipos.length,"equipos"],[calendario.length,"partidos"]].map(([n,l])=>(
            <div key={l} style={{ textAlign:"center" }}>
              <div style={{ fontSize:26, fontWeight:900, color:"#fff", lineHeight:1 }}>{n}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", marginTop:3 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="ifutbol-tabs" style={{ overflowX:"auto" }}>
        {tabs.map(([key,label])=><button key={key} className={`ifutbol-tab ${seccion===key?"active":""}`} onClick={()=>setSeccion(key)}>{label}</button>)}
      </div>
      {loading?<div style={{ padding:60, textAlign:"center" }}><div className="spinner"/></div>:<>
          {seccion==="tabla"&&(clasificacion.length===0?<EmptyState icon="📊" txt="No hay partidos jugados aún"/>:
            <div style={{ background:"white", borderRadius:"var(--radius-md)", overflow:"hidden", boxShadow:"var(--shadow-md)" }}
              onClick={e=>{ if(e.target===e.currentTarget||e.target.tagName==="DIV"&&e.target===e.currentTarget) setSelectedCell(null); }}>
              <table className="ifutbol-table" style={{ userSelect:"none" }}>
                <thead><tr>
                  {["#","Equipo","PJ","G","E","D","GF","GC","DIF","PTS"].map((h,ci)=>(
                    <th key={h} style={{ textAlign: ci<=1?"left":"center",
                      background: selectedCell&&selectedCell[1]===ci ? "rgba(0,0,0,0.18)" : undefined,
                      transition:"background 0.15s" }}>
                      {h}
                    </th>
                  ))}
                </tr></thead>
                <tbody>{clasificacion.map((r,ri)=>{
                  const cells = [
                    <td key={0} style={{ background: selectedCell&&(selectedCell[0]===ri||selectedCell[1]===0) ? selectedCell[0]===ri&&selectedCell[1]===0?"rgba(79,143,47,0.2)":"rgba(79,143,47,0.07)" : undefined, transition:"background 0.15s", cursor:"pointer" }} onClick={()=>setSelectedCell(selectedCell&&selectedCell[0]===ri&&selectedCell[1]===0?null:[ri,0])}>
                      <span className="rank-badge" style={{ background:ri===0?"#FFD700":ri===1?"#C0C0C0":ri===2?"#CD7F32":"#f3f4f6",color:ri<3?"#111":"#777" }}>{ri+1}</span>
                    </td>,
                    <td key={1} style={{ background: selectedCell&&(selectedCell[0]===ri||selectedCell[1]===1) ? selectedCell[0]===ri&&selectedCell[1]===1?"rgba(79,143,47,0.2)":"rgba(79,143,47,0.07)" : undefined, transition:"background 0.15s", cursor:"pointer" }} onClick={()=>setSelectedCell(selectedCell&&selectedCell[0]===ri&&selectedCell[1]===1?null:[ri,1])}>
                      <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                        {r.equipo.escudo_url?<img src={r.equipo.escudo_url} style={{ width:28,height:28,borderRadius:6,objectFit:"cover" }} alt=""/>:<div style={{ width:12,height:12,borderRadius:"50%",background:r.equipo.color_playera||"#999" }}/>}
                        <span style={{ fontWeight:600 }}>{r.equipo.nombre}</span>
                      </div>
                    </td>,
                    ...[
                      [r.pj,{}],
                      [r.g,{color:"#16a34a",fontWeight:700}],
                      [r.e,{color:"#ca8a04",fontWeight:700}],
                      [r.d,{color:"#dc2626",fontWeight:700}],
                      [r.gf,{}],
                      [r.gc,{}],
                      [r.gf-r.gc>0?`+${r.gf-r.gc}`:r.gf-r.gc,{color:(r.gf-r.gc)>0?"#16a34a":(r.gf-r.gc)<0?"#dc2626":"#666"}],
                      [r.pts,{fontWeight:800,fontSize:17,color:r.equipo.color_playera||"var(--green)"}],
                    ].map(([val,style],idx)=>{
                      const ci=idx+2;
                      const isRow=selectedCell&&selectedCell[0]===ri;
                      const isCol=selectedCell&&selectedCell[1]===ci;
                      const isBoth=isRow&&isCol;
                      return(
                        <td key={ci} style={{ textAlign:"center", ...style,
                          background: isBoth?"rgba(79,143,47,0.22)":isRow||isCol?"rgba(79,143,47,0.07)":undefined,
                          transition:"background 0.15s", cursor:"pointer" }}
                          onClick={()=>setSelectedCell(isBoth?null:[ri,ci])}>
                          {val}
                        </td>
                      );
                    }),
                  ];
                  return <tr key={r.equipo.id}>{cells}</tr>;
                })}</tbody>
              </table>
            </div>
          )}
          {seccion==="partidos"&&(calendario.length===0?<EmptyState icon="📅" txt="No hay partidos programados aún"/>:
            <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
              {Object.values(calendario.reduce((acc,p)=>{
                const jId=p.jornada_id;
                if(!acc[jId]) acc[jId]={jornada:p.jornada,ps:[]};
                acc[jId].ps.push(p);
                return acc;
              },{})).sort((a,b)=>(a.jornada?.numero||0)-(b.jornada?.numero||0))
              .map(({jornada,ps})=>(
                <div key={jornada?.id||Math.random()} style={{ background:"white",borderRadius:"var(--radius-md)",overflow:"hidden",boxShadow:"var(--shadow-sm)",border:"1px solid var(--border)" }}>
                  <div style={{ background:"var(--surface-soft,#f9fafb)",padding:"10px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid var(--border)" }}>
                    <span style={{ fontWeight:700,fontSize:13 }}>Jornada {jornada?.numero}</span>
                    <span style={{ fontSize:12,color:"var(--text-muted)" }}>{jornada?.fecha||"Fecha por definir"}</span>
                  </div>
                  <div style={{ padding:"10px 14px",display:"flex",flexDirection:"column",gap:8 }}>
                    {ps.map(p=>{
                      const fichaOk=p.ficha_partido?.cerrada;
                      const f=fichaOk?p.ficha_partido:null;
                      return(
                        <div key={p.id} style={{ padding:"12px 14px",background:"#f9fafb",borderRadius:10,border:"1px solid var(--border)" }}>
                          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:4 }}>
                            {/* Equipo local */}
                            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:4,flex:1,minWidth:0 }}>
                              <JerseySVG
                                diseno={p.equipos_local?.diseno_camiseta||"solido"}
                                color1={p.equipos_local?.color_playera||"#999"}
                                color2={p.equipos_local?.color_camiseta_2||"#fff"}
                                escudoUrl={p.equipos_local?.escudo_url||null}
                                size={44}
                              />
                              <span style={{ fontWeight:700,fontSize:13,textAlign:"center",lineHeight:1.2 }}>{p.equipos_local?.nombre}</span>
                            </div>

                            {/* Marcador o VS */}
                            <div style={{ textAlign:"center",padding:"0 8px",flexShrink:0 }}>
                              {f?(
                                <div style={{ fontSize:24,fontWeight:900,lineHeight:1 }}>
                                  <span style={{ color:f.goles_local>f.goles_visitante?"#16a34a":"var(--text)" }}>{f.goles_local}</span>
                                  <span style={{ color:"#d1d5db",fontSize:18,margin:"0 4px" }}>-</span>
                                  <span style={{ color:f.goles_visitante>f.goles_local?"#16a34a":"var(--text)" }}>{f.goles_visitante}</span>
                                </div>
                              ):(
                                <span style={{ fontSize:12,color:"var(--text-muted)",fontWeight:800,letterSpacing:1 }}>VS</span>
                              )}
                              <div style={{ fontSize:10,color:"var(--text-muted)",marginTop:4,whiteSpace:"nowrap" }}>
                                ⏰ {p.hora||"—"} · Campo {p.cancha_numero||"—"}
                              </div>
                              {fichaOk&&<div style={{ fontSize:10,color:"var(--green)",fontWeight:700,marginTop:2 }}>✓ Jugado</div>}
                            </div>

                            {/* Equipo visitante */}
                            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:4,flex:1,minWidth:0 }}>
                              <JerseySVG
                                diseno={p.equipos_visitante?.diseno_camiseta||"solido"}
                                color1={p.equipos_visitante?.color_playera||"#999"}
                                color2={p.equipos_visitante?.color_camiseta_2||"#fff"}
                                escudoUrl={p.equipos_visitante?.escudo_url||null}
                                size={44}
                              />
                              <span style={{ fontWeight:700,fontSize:13,textAlign:"center",lineHeight:1.2 }}>{p.equipos_visitante?.nombre}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {seccion==="goleadores"&&(goleadores.length===0?<EmptyState icon="🥇" txt="No hay goles registrados aún"/>:
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              {goleadores.map((g,i)=>(
                <div key={i} style={{ background:"white",borderRadius:"var(--radius-md)",padding:"13px 20px",boxShadow:"var(--shadow-sm)",border:"1px solid var(--border)",display:"flex",alignItems:"center",gap:14 }}>
                  <span className="rank-badge" style={{ background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#f3f4f6",color:i<3?"#111":"#888",width:28,height:28 }}>{i+1}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700,fontSize:15 }}>{g.nombre}</div>
                    <div style={{ fontSize:12,color:"var(--text-muted)" }}>{g.equipo_nombre}</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:24,fontWeight:900,color:"var(--green)" }}>{g.goles}</div>
                    <div style={{ fontSize:10,color:"var(--text-muted)" }}>goles</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {seccion==="equipos"&&(equipos.length===0?<EmptyState icon="👕" txt="No hay equipos registrados"/>:
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(160px,1fr))",gap:14 }}>
              {equipos.map(eq=>{const st=clasificacion.find(c=>c.equipo.id===eq.id);return(
                <div key={eq.id} style={{ background:"white",borderRadius:"var(--radius-md)",padding:"18px 14px",textAlign:"center",boxShadow:"var(--shadow-md)",borderTop:`4px solid ${eq.color_playera||"var(--green)"}` }}>
                  <div style={{ display:"flex",justifyContent:"center",marginBottom:10 }}>
                    {eq.escudo_url?<img src={eq.escudo_url} style={{ width:52,height:52,borderRadius:10,objectFit:"cover" }} alt=""/>:<div style={{ width:52,height:52,borderRadius:10,background:eq.color_playera||"var(--green)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800,color:"white" }}>{eq.nombre[0]}</div>}
                  </div>
                  <div style={{ fontWeight:700,fontSize:14,marginBottom:10 }}>{eq.nombre}</div>
                  {st&&<div style={{ display:"flex",justifyContent:"center",gap:14 }}>
                    {[[st.pts,"pts","var(--green)"],[st.g,"V","#16a34a"],[st.d,"D","#dc2626"]].map(([n,l,c])=>(
                      <div key={l} style={{ textAlign:"center" }}><div style={{ fontWeight:800,color:c,fontSize:16 }}>{n}</div><div style={{ fontSize:10,color:"var(--text-muted)" }}>{l}</div></div>
                    ))}
                  </div>}
                </div>
              );})}
            </div>
          )}
          {seccion==="ofensiva"&&<TablaEspecial titulo="⚔️ Mejor ofensiva" datos={[...clasificacion].sort((a,b)=>(b.pj>0?b.gf/b.pj:0)-(a.pj>0?a.gf/a.pj:0))} campo="gf" label="Goles anotados"/>}
          {seccion==="defensiva"&&<TablaEspecial titulo="🛡️ Mejor defensiva" datos={[...clasificacion].sort((a,b)=>(a.pj>0?a.gc/a.pj:999)-(b.pj>0?b.gc/b.pj:999))} campo="gc" label="Goles concedidos"/>}
          {seccion==="fairplay"&&<TablaEspecial titulo="🤝 Fair play" datos={[...clasificacion].sort((a,b)=>(a.pj>0?a.faltas/a.pj:999)-(b.pj>0?b.faltas/b.pj:999))} campo="faltas" label="Faltas cometidas"/>}
        </>}
    </div>
  );
}

function TablaEspecial({ titulo, datos, campo, label }) {
  if (!datos.length) return <EmptyState icon="📊" txt="No hay datos suficientes aún"/>;
  return (
    <div style={{ background:"white",borderRadius:"var(--radius-md)",overflow:"hidden",boxShadow:"var(--shadow-md)" }}>
      <div style={{ padding:"14px 20px",borderBottom:"1px solid var(--border)",fontWeight:700,fontSize:15 }}>{titulo}</div>
      <table className="ifutbol-table">
        <thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>{label}</th><th>Promedio/partido</th></tr></thead>
        <tbody>{datos.map((r,i)=>{const val=r[campo]||0;const prom=r.pj>0?(val/r.pj).toFixed(1):"0.0";return(
          <tr key={r.equipo.id}>
            <td><span className="rank-badge" style={{ background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#f3f4f6",color:i<3?"#111":"#888" }}>{i+1}</span></td>
            <td><div style={{ display:"flex",alignItems:"center",gap:10 }}>
              {r.equipo.escudo_url?<img src={r.equipo.escudo_url} style={{ width:26,height:26,borderRadius:6,objectFit:"cover" }} alt=""/>:<div style={{ width:10,height:10,borderRadius:"50%",background:r.equipo.color_playera||"#999" }}/>}
              <span style={{ fontWeight:600 }}>{r.equipo.nombre}</span>
            </div></td>
            <td style={{ textAlign:"center" }}>{r.pj}</td>
            <td style={{ textAlign:"center",fontWeight:700 }}>{val}</td>
            <td style={{ textAlign:"center",fontWeight:800,color:"var(--green)" }}>{prom}</td>
          </tr>
        );})}</tbody>
      </table>
    </div>
  );
}

function EmptyState({ icon, txt }) {
  return <div className="empty-state"><div className="empty-state-icon">{icon}</div><div className="empty-state-txt">{txt}</div></div>;
}

// ─────────────────────────────────────────────────────────────────
// LOGIN MODAL
// ─────────────────────────────────────────────────────────────────
function LoginModal({ onClose, onLogin, onRegister }) {
  const [form, setForm] = useState({ email:"", password:"" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true); setError("");
    const res = await onLogin(form.email, form.password);
    if (!res.ok) setError(res.error);
    setLoading(false);
  };
  return (
    <div className="ifutbol-overlay" onClick={onClose}>
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:400 }}>
        <ModalHeader title="Bienvenido" subtitle="Inicia sesión en tu cuenta" onClose={onClose}/>
        {error&&<div style={m.err}>⚠️ {error}</div>}
        <Field label="Correo electrónico"><input className="form-input" type="email" placeholder="tu@correo.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field>
        <Field label="Contraseña"><input className="form-input" type="password" placeholder="••••••••" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} onKeyDown={e=>e.key==="Enter"&&handle()}/></Field>
        <div style={{ height:8 }}/>
        <button className="btn btn-premium" style={{ width:"100%",marginBottom:14 }} onClick={handle} disabled={loading}>{loading?"Entrando...":"Entrar →"}</button>
        <p style={{ textAlign:"center",fontSize:13,color:"var(--text-muted)" }}>¿No tienes cuenta? <span style={m.link} onClick={onRegister}>Regístrate como jugador</span></p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// REGISTER PLAYER MODAL
// ─────────────────────────────────────────────────────────────────
function RegisterPlayerModal({ onClose, showToast, onLogin }) {
  const [form, setForm] = useState({ nombre_completo:"",email:"",fecha_nacimiento:"",domicilio:"",posicion_preferida:"Delantero",numero_camiseta:"",nombre_camiseta:"",password:"",confirm:"" });
  const [fotoPreview, setFotoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const handle = async () => {
    if (form.password!==form.confirm) return setError("Las contraseñas no coinciden");
    if (!form.nombre_completo||!form.email||!form.password) return setError("Completa los campos obligatorios");
    setLoading(true); setError("");
    const data = await api("/auth/v1/signup",{method:"POST",body:JSON.stringify({email:form.email,password:form.password})});
    if (data.user||data.id) {
      const token = data.session?.access_token||data.access_token;
      const userId = data.user?.id||data.id;
      if (token) {
        const jugRes = await fetch(`${SUPABASE_URL}/rest/v1/jugadores`,{method:"POST",headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${token}`,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({user_id:userId,nombre_completo:form.nombre_completo,fecha_nacimiento:form.fecha_nacimiento||null,domicilio:form.domicilio,posicion_preferida:form.posicion_preferida})});
        const jugData = await jugRes.json();
        const afiliado = Array.isArray(jugData)?jugData[0]?.numero_afiliado:jugData?.numero_afiliado;
        setSuccess(afiliado||"AF-?????");
      }
    } else { setError(data.msg||data.error_description||"Error al registrarse"); }
    setLoading(false);
  };

  if (success) return (
    <div className="ifutbol-overlay" onClick={onClose}>
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:360,textAlign:"center" }}>
        <div style={{ fontSize:52,marginBottom:14 }}>🎉</div>
        <h3 style={{ fontSize:22,fontWeight:800,marginBottom:8 }}>¡Registro exitoso!</h3>
        <p style={{ color:"var(--text-sub)",marginBottom:20 }}>Tu cuenta ha sido creada correctamente</p>
        <div style={{ background:"var(--green-light)",border:"1px solid #c3e6a3",borderRadius:12,padding:"16px 24px",marginBottom:20 }}>
          <div style={{ fontSize:11,color:"var(--green)",fontWeight:700,marginBottom:4 }}>TU NÚMERO DE AFILIADO</div>
          <div style={{ fontSize:28,fontWeight:900,color:"var(--green)",letterSpacing:2 }}>{success}</div>
        </div>
        <button className="btn btn-premium" style={{ width:"100%" }} onClick={onClose}>Ir al inicio →</button>
      </div>
    </div>
  );

  return (
    <div className="ifutbol-overlay" onClick={onClose}>
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()}>
        <ModalHeader title="Crear cuenta de jugador" subtitle="Tu número de afiliado se genera automáticamente" onClose={onClose}/>
        {error&&<div style={m.err}>⚠️ {error}</div>}
        <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:18,background:"var(--bg)",borderRadius:12,padding:14 }}>
          <div style={{ width:60,height:60,borderRadius:"50%",background:"var(--border)",overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26 }}>
            {fotoPreview?<img src={fotoPreview} style={{ width:"100%",height:"100%",objectFit:"cover" }} alt=""/>:"📷"}
          </div>
          <div>
            <label style={{ display:"inline-block",background:"white",border:"1px solid var(--border)",borderRadius:8,padding:"6px 12px",color:"var(--text-sub)",fontSize:13,cursor:"pointer",marginBottom:3 }}>
              Subir foto de rostro *
              <input type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{const f=e.target.files[0];setFotoPreview(URL.createObjectURL(f));}}/>
            </label>
            <p style={{ fontSize:11,color:"var(--text-muted)",margin:0 }}>Foto de cédula, perfil y estadísticas</p>
          </div>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px" }}>
          <div style={{ gridColumn:"1/-1",marginBottom:14 }}><Field label="Nombre completo *"><input className="form-input" type="text" placeholder="Juan Pérez" value={form.nombre_completo} onChange={e=>setForm({...form,nombre_completo:e.target.value})}/></Field></div>
          <div style={{ marginBottom:14 }}><Field label="Fecha de nacimiento"><input className="form-input" type="date" value={form.fecha_nacimiento} onChange={e=>setForm({...form,fecha_nacimiento:e.target.value})}/></Field></div>
          <div style={{ marginBottom:14 }}><Field label="Posición preferida"><select className="form-input" value={form.posicion_preferida} onChange={e=>setForm({...form,posicion_preferida:e.target.value})}>{POSITIONS.map(p=><option key={p}>{p}</option>)}</select></Field></div>
          <div style={{ marginBottom:14 }}><Field label="Número en camiseta"><input className="form-input" type="number" min="1" max="99" placeholder="ej. 10" value={form.numero_camiseta} onChange={e=>setForm({...form,numero_camiseta:e.target.value})}/></Field></div>
          <div style={{ marginBottom:14 }}><Field label="Nombre al reverso"><input className="form-input" type="text" placeholder="GARCÍA" value={form.nombre_camiseta} onChange={e=>setForm({...form,nombre_camiseta:e.target.value.toUpperCase()})}/></Field></div>
          <div style={{ gridColumn:"1/-1",marginBottom:14 }}><Field label="Domicilio"><input className="form-input" type="text" placeholder="Calle, Ciudad" value={form.domicilio} onChange={e=>setForm({...form,domicilio:e.target.value})}/></Field></div>
          <div style={{ gridColumn:"1/-1",marginBottom:14 }}><Field label="Correo electrónico *"><input className="form-input" type="email" placeholder="tu@correo.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field></div>
          <div style={{ marginBottom:14 }}><Field label="Contraseña *"><input className="form-input" type="password" placeholder="Mín. 6 caracteres" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></Field></div>
          <div style={{ marginBottom:20 }}><Field label="Confirmar contraseña *"><input className="form-input" type="password" placeholder="Repite tu contraseña" value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})}/></Field></div>
        </div>
        <button className="btn btn-premium" style={{ width:"100%",marginBottom:14 }} onClick={handle} disabled={loading}>{loading?"Creando cuenta...":"Crear cuenta de jugador →"}</button>
        <p style={{ textAlign:"center",fontSize:13,color:"var(--text-muted)" }}>¿Ya tienes cuenta? <span style={m.link} onClick={onLogin}>Inicia sesión</span></p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// REGISTER STAFF MODAL
// ─────────────────────────────────────────────────────────────────
function RegisterStaffModal({ onClose, showToast }) {
  const [form, setForm] = useState({ nombre_completo:"",email:"",tipo:"",password:"" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handle = async () => {
  if (!form.tipo) return setError("Selecciona si eres árbitro o admin de liga");
  if (!form.nombre_completo || !form.email || !form.password) return setError("Completa todos los campos");
  setLoading(true); setError("");

  const data = await api("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({ email: form.email, password: form.password })
  });

  if (data.user || data.id) {
    const userId = data.user?.id || data.id;

    // Guardar solicitud usando anon key (no necesita token)
    const solRes = await fetch(`${SUPABASE_URL}/rest/v1/solicitudes_registro`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify({
        user_id: userId,
        nombre_completo: form.nombre_completo,
        tipo_rol: form.tipo,
        estado: "pendiente"
      })
    });

    if (!solRes.ok) {
      const err = await solRes.json();
      console.error("Error solicitud:", err);
    }

    setSuccess(true);
  } else {
    setError(data.msg || data.error_description || "Error al registrarse");
  }
  setLoading(false);
};

  if (success) return (
    <div className="ifutbol-overlay" onClick={onClose}>
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:360,textAlign:"center" }}>
        <div style={{ fontSize:52,marginBottom:14 }}>📋</div>
        <h3 style={{ fontSize:22,fontWeight:800,marginBottom:8 }}>¡Solicitud enviada!</h3>
        <p style={{ color:"var(--text-sub)",marginBottom:24 }}>Tu solicitud ha sido enviada al administrador. Te confirmarán tu acceso pronto.</p>
        <button className="btn btn-premium" style={{ width:"100%" }} onClick={onClose}>Ir al inicio →</button>
      </div>
    </div>
  );

  return (
    <div className="ifutbol-overlay" onClick={onClose}>
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:420 }}>
        <ModalHeader title="Solicitud de registro" subtitle="Tu solicitud será revisada por el administrador" onClose={onClose}/>
        {error&&<div style={m.err}>⚠️ {error}</div>}
        <Field label="Nombre completo *"><input className="form-input" type="text" placeholder="Juan Pérez" value={form.nombre_completo} onChange={e=>setForm({...form,nombre_completo:e.target.value})}/></Field>
        <div style={{ marginBottom:16 }}>
          <label className="form-label">Me registro como *</label>
          <div style={{ display:"flex",gap:10 }}>
            {[["referee","🟡 Árbitro"],["league_admin","🏟️ Admin de Liga"]].map(([val,lbl])=>(
              <button key={val} onClick={()=>setForm({...form,tipo:val})} style={{ flex:1,padding:"12px",borderRadius:"var(--radius-md)",border:`2px solid ${form.tipo===val?"var(--green)":"var(--border)"}`,background:form.tipo===val?"var(--green-light)":"white",color:form.tipo===val?"var(--green)":"var(--text-sub)",fontWeight:700,cursor:"pointer",fontSize:14,transition:"all 0.2s",fontFamily:"'DM Sans',sans-serif" }}>{lbl}</button>
            ))}
          </div>
        </div>
        <Field label="Correo electrónico *"><input className="form-input" type="email" placeholder="tu@correo.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field>
        <div style={{ marginBottom:24 }}><Field label="Contraseña *"><input className="form-input" type="password" placeholder="Mínimo 6 caracteres" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></Field></div>
        <button className="btn btn-premium" style={{ width:"100%" }} onClick={handle} disabled={loading}>{loading?"Enviando...":"Enviar solicitud de registro →"}</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SHARED
// ─────────────────────────────────────────────────────────────────
function ModalHeader({ title, subtitle, onClose }) {
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
        <h3 className="ifutbol-modal-title" style={{ margin:0 }}>{title}</h3>
        <button style={m.closeBtn} onClick={onClose}>✕</button>
      </div>
      {subtitle&&<p style={{ color:"var(--text-sub)",fontSize:13,marginTop:6 }}>{subtitle}</p>}
    </div>
  );
}

function Field({ label, children }) {
  return <div style={{ marginBottom:16 }}><label className="form-label">{label}</label>{children}</div>;
}

function Avatar({ initials, size=38 }) {
  return (
    <div style={{ width:size,height:size,borderRadius:"50%",background:"linear-gradient(135deg,#4f8f2f,#7fbf4d)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,overflow:"hidden" }}>
      {typeof initials==="string"&&initials.startsWith("http")
        ?<img src={initials} style={{ width:"100%",height:"100%",objectFit:"cover" }} alt=""/>
        :<span style={{ fontSize:size*0.35,fontWeight:800,color:"white" }}>{initials}</span>}
    </div>
  );
}

function BallIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      <path d="M2 12h20"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────
const s = {
  root: { display:"flex",flexDirection:"column",minHeight:"100vh",background:"var(--bg)" },
  topbar: { display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 20px",height:60,background:"var(--green)",borderBottom:"1px solid var(--green-dark)",position:"sticky",top:0,zIndex:200,boxShadow:"0 2px 12px rgba(0,0,0,0.18)" },
  topLeft: { display:"flex",alignItems:"center",gap:14 },
  topRight: { display:"flex",alignItems:"center",gap:10 },
  brand: { display:"flex",alignItems:"center",gap:10,cursor:"pointer" },
  brandIcon: { width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,#4f8f2f,#7fbf4d)",display:"flex",alignItems:"center",justifyContent:"center" },
  brandName: { fontSize:19,fontWeight:800,color:"var(--text)",letterSpacing:-0.5 },
  pill: { padding:"5px 12px",borderRadius:"var(--radius-full)",fontSize:12,fontWeight:700 },
  overlay: { position:"fixed",inset:0,background:"rgba(0,0,0,0.28)",zIndex:299,backdropFilter:"blur(2px)" },
  sidebar: { position:"fixed",top:60,left:0,bottom:0,width:260,background:"white",borderRight:"1px solid var(--border)",zIndex:300,display:"flex",flexDirection:"column",transition:"transform 0.25s ease",boxShadow:"4px 0 24px rgba(0,0,0,0.08)" },
  sbFooter: { padding:"14px 16px",borderTop:"1px solid var(--border)",display:"flex",alignItems:"center",gap:12 },
  main: { flex:1,padding:"28px 32px",maxWidth:1100,margin:"0 auto",width:"100%" },
};

const m = {
  closeBtn: { background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-sub)",flexShrink:0 },
  err: { background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"10px 14px",color:"#dc2626",fontSize:13,marginBottom:16 },
  link: { color:"var(--green)",cursor:"pointer",fontWeight:700 },
};

const css = `
  .ham-btn{background:transparent;border:none;cursor:pointer;padding:6px 10px;border-radius:8px;font-size:20px;color:rgba(255,255,255,0.85);display:flex;align-items:center;transition:background 0.15s;}
  .ham-btn:hover{background:rgba(255,255,255,0.12);}
  .clickable{transition:opacity 0.15s;cursor:pointer;}
  .clickable:hover{opacity:0.8;}
  .sb-btn{display:flex;align-items:center;gap:12px;width:100%;padding:11px 14px;border-radius:10px;border:none;background:transparent;color:var(--text);font-size:14px;font-weight:600;cursor:pointer;text-align:left;transition:all 0.15s;font-family:'DM Sans',sans-serif;}
  .sb-btn:hover{background:var(--green-light);color:var(--green);}
  .sb-btn.danger:hover{background:#fef2f2;color:#dc2626;}
  .nav-item{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;cursor:pointer;color:var(--text-sub);font-size:14px;font-weight:500;transition:all 0.15s;font-family:'DM Sans',sans-serif;}
  .nav-item:hover{background:var(--green-light);color:var(--green);}
  .nav-item-active{background:var(--green-light)!important;color:var(--green)!important;font-weight:700!important;}
  .ud-card{background:white;border-radius:var(--radius-md);padding:22px 20px;box-shadow:var(--shadow-md);border:1px solid var(--border);cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;}
  .ud-card:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg);border-color:var(--green-accent);}
  .torneo-btn{background:white;border:1.5px solid var(--border);border-radius:var(--radius-full);padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;color:var(--text-sub);transition:all 0.2s;font-family:'DM Sans',sans-serif;}
  .torneo-btn:hover{border-color:var(--green);color:var(--green);}
  .torneo-btn.active{background:var(--green-light);border-color:var(--green);color:var(--green);}
  @media(max-width:640px){.hide-mobile{display:none!important;}}
`;