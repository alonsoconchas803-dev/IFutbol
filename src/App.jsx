import { useState, useEffect } from "react";
import "./ifutbol.css";
import SuperAdmin from "./pages/SuperAdmin";
import LeagueAdmin from "./pages/LeagueAdmin";
import Referee from "./pages/Referee";
import PlayerProfile from "./pages/PlayerProfile";
import Viewer from "./pages/Viewer";

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

const authApi = async (path, body) => {
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: "POST",
    headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
};

const POSITIONS = ["Portero", "Defensa", "Mediocampista", "Delantero"];

const ROLES_INFO = {
  super_admin:  { label: "Super Admin",    icon: "👑", color: "#4f8f2f" },
  league_admin: { label: "Admin de Liga",  icon: "🏟️", color: "#3b82f6" },
  referee:      { label: "Árbitro",        icon: "🟡", color: "#f59e0b" },
  player:       { label: "Jugador",        icon: "⚽", color: "#8b5cf6" },
  viewer:       { label: "Espectador",     icon: "👁️", color: "#6b7280" },
};

// ── MENU ITEMS POR ROL ────────────────────────────────────────────
function getMenuItems(rol) {
  const common = [
    { icon: "🏆", label: "Ligas" },
    { icon: "📊", label: "Clasificación" },
    { icon: "📅", label: "Partidos" },
  ];
  const byRole = {
    super_admin:  [{ icon: "👑", label: "Panel Admin" }, { icon: "🏟️", label: "Canchas" }, ...common, { icon: "👥", label: "Usuarios" }],
    league_admin: [{ icon: "🏟️", label: "Mi Liga" }, { icon: "👕", label: "Equipos" }, ...common, { icon: "👥", label: "Jugadores" }],
    referee:      [{ icon: "🟡", label: "Mis Partidos" }, { icon: "📝", label: "Ficha de Partido" }, { icon: "📅", label: "Jornada" }],
    player:       [{ icon: "⚽", label: "Mi Perfil" }, { icon: "👕", label: "Mi Equipo" }, ...common],
    viewer:       common,
  };
  return byRole[rol] || common;
}

export default function App() {
  const [screen, setScreen] = useState("login");
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [jugadorData, setJugadorData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [regForm, setRegForm] = useState({
    email: "", password: "", confirm: "",
    nombre_completo: "", fecha_nacimiento: "",
    domicilio: "", posicion_preferida: "Delantero"
  });

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogin = async () => {
    if (!loginForm.email || !loginForm.password) return setError("Completa todos los campos");
    setLoading(true); setError("");
    const data = await authApi("/token?grant_type=password", loginForm);
    if (data.access_token) {
      setSession(data);
      await loadUserRole(data.access_token, data.user.id);
    } else {
      setError("Correo o contraseña incorrectos");
    }
    setLoading(false);
  };

  const loadUserRole = async (token, userId) => {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${userId}&select=rol,liga_id&limit=1`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` } }
      );
      const roles = await res.json();
      if (Array.isArray(roles) && roles.length > 0) {
        setUserRole(roles[0]);
        setScreen("dashboard");
        return;
      }
      const res2 = await fetch(
        `${SUPABASE_URL}/rest/v1/jugadores?user_id=eq.${userId}`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` } }
      );
      const jugador = await res2.json();
      if (Array.isArray(jugador) && jugador.length > 0) {
        setUserRole({ rol: "player" });
        setJugadorData(jugador[0]);
      } else {
        setUserRole({ rol: "viewer" });
      }
    } catch (e) {
      setUserRole({ rol: "viewer" });
    }
    setScreen("dashboard");
  };

  const handleRegister = async () => {
    if (regForm.password !== regForm.confirm) return setError("Las contraseñas no coinciden");
    if (!regForm.nombre_completo || !regForm.email || !regForm.password) return setError("Completa todos los campos");
    setLoading(true); setError("");
    const data = await authApi("/signup", { email: regForm.email, password: regForm.password });
    if (data.user || data.id) {
      const userId = data.user?.id || data.id;
      const token = data.session?.access_token || data.access_token;
      if (token) {
        await fetch(`${SUPABASE_URL}/rest/v1/jugadores`, {
          method: "POST",
          headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Prefer": "return=representation" },
          body: JSON.stringify({ user_id: userId, nombre_completo: regForm.nombre_completo, fecha_nacimiento: regForm.fecha_nacimiento || null, domicilio: regForm.domicilio, posicion_preferida: regForm.posicion_preferida })
        });
        showToast("¡Registro exitoso! Revisa tu correo.");
        setScreen("login");
      }
    } else {
      setError(data.msg || data.error_description || "Error al registrarse");
    }
    setLoading(false);
  };

  const handleLogout = () => {
    setSession(null); setUserRole(null); setJugadorData(null);
    setScreen("login"); setLoginForm({ email: "", password: "" });
  };

  if (screen === "dashboard") return (
    <Dashboard session={session} userRole={userRole} jugadorData={jugadorData}
      onLogout={handleLogout} toast={toast} showToast={showToast}
      sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
  );

  // ── AUTH SCREENS ──────────────────────────────────────────────
  return (
    <div style={auth.root}>
      {toast && <div className={`ifutbol-toast ${toast.tipo === "err" ? "toast-err" : "toast-ok"}`}>{toast.msg}</div>}

      {/* LEFT PANEL */}
      <div style={auth.left}>
        <div style={auth.leftInner}>
          <div style={auth.brand}>
            <div style={auth.brandIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/>
              </svg>
            </div>
            <span style={auth.brandName}>IFútbol</span>
          </div>
          <h1 style={auth.hero}>La plataforma de tu liga</h1>
          <p style={auth.heroSub}>Gestiona ligas, equipos, jugadores y resultados desde un solo lugar, fácil y profesional.</p>
          <div style={auth.features}>
            {[["👑","Super Admin — control total de la plataforma"],["🏟️","Admin de Liga — gestiona tu liga y equipos"],["🟡","Árbitros — fichas de partido digitales"],["⚽","Jugadores — tu perfil y estadísticas"],["👁️","Espectadores — consulta libre y sin registro"]].map(([icon, txt]) => (
              <div key={txt} style={auth.feature}>
                <span style={auth.featureIcon}>{icon}</span>
                <span style={auth.featureTxt}>{txt}</span>
              </div>
            ))}
          </div>
          <div style={auth.statsRow}>
            {[["🏆","Ligas"],["👕","Equipos"],["⚽","Jugadores"]].map(([icon, lbl]) => (
              <div key={lbl} style={auth.statItem}>
                <span style={auth.statIcon}>{icon}</span>
                <span style={auth.statLabel}>{lbl}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={auth.right}>
        <div style={auth.formWrap}>
          {screen === "login" ? (
            <>
              <div style={auth.formHeader}>
                <h2 style={auth.formTitle}>Bienvenido</h2>
                <p style={auth.formSub}>Inicia sesión en tu cuenta</p>
              </div>
              {error && <div style={auth.errorBox}>⚠️ {error}</div>}
              <div style={auth.field}>
                <label className="form-label">Correo electrónico</label>
                <input className="form-input" type="email" placeholder="tu@correo.com"
                  value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} />
              </div>
              <div style={auth.field}>
                <label className="form-label">Contraseña</label>
                <input className="form-input" type="password" placeholder="••••••••"
                  value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                  onKeyDown={e => e.key === "Enter" && handleLogin()} />
              </div>
              <button className="btn btn-premium" style={{ width: "100%", marginBottom: 16 }} onClick={handleLogin} disabled={loading}>
                {loading ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}/> : "Entrar →"}
              </button>
              <p style={auth.switchTxt}>¿No tienes cuenta?{" "}
                <span style={auth.link} onClick={() => { setScreen("register"); setError(""); }}>Regístrate como jugador</span>
              </p>
              <div style={auth.divider}><div style={auth.dividerLine}/><span style={auth.dividerTxt}>o</span><div style={auth.dividerLine}/></div>
              <button className="btn btn-ghost" style={{ width: "100%" }}
                onClick={() => { setUserRole({ rol: "viewer" }); setScreen("dashboard"); }}>
                👁️ Ver ligas sin registrarme
              </button>
            </>
          ) : (
            <>
              <div style={auth.formHeader}>
                <h2 style={auth.formTitle}>Crear cuenta</h2>
                <p style={auth.formSub}>Tu número de afiliado se genera automáticamente</p>
              </div>
              {error && <div style={auth.errorBox}>⚠️ {error}</div>}
              <div style={auth.regGrid}>
                {[["nombre_completo","Nombre completo","text","Juan Pérez"],["email","Correo electrónico","email","tu@correo.com"],["fecha_nacimiento","Fecha de nacimiento","date",""],["domicilio","Domicilio","text","Calle, Ciudad"]].map(([key, lbl, type, ph]) => (
                  <div key={key} style={auth.field}>
                    <label className="form-label">{lbl}</label>
                    <input className="form-input" type={type} placeholder={ph}
                      value={regForm[key]} onChange={e => setRegForm({ ...regForm, [key]: e.target.value })} />
                  </div>
                ))}
                <div style={auth.field}>
                  <label className="form-label">Posición preferida</label>
                  <select className="form-input" value={regForm.posicion_preferida}
                    onChange={e => setRegForm({ ...regForm, posicion_preferida: e.target.value })}>
                    {POSITIONS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div style={auth.field}>
                  <label className="form-label">Contraseña</label>
                  <input className="form-input" type="password" placeholder="Mínimo 6 caracteres"
                    value={regForm.password} onChange={e => setRegForm({ ...regForm, password: e.target.value })} />
                </div>
                <div style={{ ...auth.field, gridColumn: "1/-1" }}>
                  <label className="form-label">Confirmar contraseña</label>
                  <input className="form-input" type="password" placeholder="Repite tu contraseña"
                    value={regForm.confirm} onChange={e => setRegForm({ ...regForm, confirm: e.target.value })} />
                </div>
              </div>
              <button className="btn btn-premium" style={{ width: "100%", marginBottom: 16 }} onClick={handleRegister} disabled={loading}>
                {loading ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}/> : "Crear cuenta de jugador →"}
              </button>
              <p style={auth.switchTxt}>¿Ya tienes cuenta?{" "}
                <span style={auth.link} onClick={() => { setScreen("login"); setError(""); }}>Inicia sesión</span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────
function Dashboard({ session, userRole, jugadorData, onLogout, toast, showToast, sidebarOpen, setSidebarOpen }) {
  const rol = userRole?.rol || "viewer";
  const roleInfo = ROLES_INFO[rol] || ROLES_INFO.viewer;
  const menuItems = getMenuItems(rol);

  return (
    <div style={dash.root}>
      {toast && <div className={`ifutbol-toast ${toast.tipo === "err" ? "toast-err" : "toast-ok"}`}>{toast.msg}</div>}

      {/* TOPBAR */}
      <header style={dash.topbar}>
        <div style={dash.topLeft}>
          <button style={dash.menuBtn} onClick={() => setSidebarOpen(!sidebarOpen)} className="hide-desktop">☰</button>
          <div style={dash.brand}>
            <div style={dash.brandIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/>
              </svg>
            </div>
            <span style={dash.brandName}>IFútbol</span>
          </div>
        </div>
        <div style={dash.topRight}>
          <div style={{ ...dash.rolePill, background: roleInfo.color + "18", color: roleInfo.color, border: `1px solid ${roleInfo.color}30` }}>
            {roleInfo.icon} {roleInfo.label}
          </div>
          {session && (
            <button className="btn btn-ghost" style={{ padding: "8px 16px", fontSize: 13 }} onClick={onLogout}>
              Salir
            </button>
          )}
        </div>
      </header>

      <div style={dash.body}>
        {/* SIDEBAR */}
        <aside style={{ ...dash.sidebar, ...(sidebarOpen ? dash.sidebarOpen : {}) }}>
          {menuItems.map(({ icon, label }) => (
            <div key={label} style={dash.navItem} className="nav-item">
              <span style={dash.navIcon}>{icon}</span>
              <span style={dash.navLabel}>{label}</span>
            </div>
          ))}
          <div style={dash.sidebarFooter}>
            <div style={dash.sidebarFooterDot}/>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>IFútbol v1.0</span>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main style={dash.main}>
          <div style={dash.content} className="animate-in">
            <DashboardContent rol={rol} session={session} jugadorData={jugadorData} showToast={showToast} />
          </div>
        </main>
      </div>

      <style>{`
        .nav-item { display:flex; align-items:center; gap:12px; padding:11px 14px; border-radius:10px; cursor:pointer; color:var(--text-sub); font-size:14px; font-weight:500; transition:all 0.15s; }
        .nav-item:hover { background:var(--green-light); color:var(--green); }
        .hide-desktop { display:none; }
        @media(max-width:768px){ .hide-desktop{display:flex;} }
      `}</style>
    </div>
  );
}

function DashboardContent({ rol, session, jugadorData, showToast }) {
  const panels = {
    super_admin:  <SuperAdmin session={session} />,
    league_admin: <LeagueAdmin session={session} />,
    referee:      <Referee session={session} />,
    player:       <PlayerProfile session={session} />,
    viewer:       <Viewer />,
  };
  return panels[rol] || <Viewer />;
}

// ── STYLES ────────────────────────────────────────────────────────
const auth = {
  root: { display: "flex", minHeight: "100vh", background: "var(--bg)" },
  left: { width: "45%", background: "linear-gradient(145deg, #4f8f2f 0%, #3a6b22 60%, #2d5419 100%)", padding: "60px 52px", display: "flex", alignItems: "center" },
  leftInner: { maxWidth: 400 },
  brand: { display: "flex", alignItems: "center", gap: 12, marginBottom: 52 },
  brandIcon: { width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(10px)" },
  brandName: { fontSize: 26, fontWeight: 800, color: "white", letterSpacing: -0.5 },
  hero: { fontSize: 44, fontWeight: 900, lineHeight: 1.1, color: "white", marginBottom: 18, letterSpacing: -1.5 },
  heroSub: { fontSize: 16, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, marginBottom: 40 },
  features: { display: "flex", flexDirection: "column", gap: 14, marginBottom: 48 },
  feature: { display: "flex", alignItems: "center", gap: 12 },
  featureIcon: { fontSize: 18, width: 32, textAlign: "center", flexShrink: 0 },
  featureTxt: { fontSize: 14, color: "rgba(255,255,255,0.85)", fontWeight: 500 },
  statsRow: { display: "flex", gap: 24, background: "rgba(255,255,255,0.1)", borderRadius: 16, padding: "16px 24px" },
  statItem: { display: "flex", flex: 1, flexDirection: "column", alignItems: "center", gap: 4 },
  statIcon: { fontSize: 20 },
  statLabel: { fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 600 },
  right: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px" },
  formWrap: { width: "100%", maxWidth: 420 },
  formHeader: { marginBottom: 32 },
  formTitle: { fontSize: 30, fontWeight: 800, color: "var(--text)", letterSpacing: -1, marginBottom: 6 },
  formSub: { fontSize: 15, color: "var(--text-sub)" },
  field: { marginBottom: 18 },
  regGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", color: "#dc2626", fontSize: 13, marginBottom: 18 },
  switchTxt: { textAlign: "center", color: "var(--text-muted)", fontSize: 13, marginBottom: 16 },
  link: { color: "var(--green)", cursor: "pointer", fontWeight: 700 },
  divider: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, background: "var(--border)" },
  dividerTxt: { fontSize: 12, color: "var(--text-muted)", fontWeight: 600 },
};

const dash = {
  root: { display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px", height: 64, background: "white", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 100, boxShadow: "var(--shadow-sm)" },
  topLeft: { display: "flex", alignItems: "center", gap: 16 },
  menuBtn: { background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-sub)", padding: "4px 8px" },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  brandIcon: { width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #4f8f2f, #7fbf4d)", display: "flex", alignItems: "center", justifyContent: "center" },
  brandName: { fontSize: 20, fontWeight: 800, color: "var(--text)", letterSpacing: -0.5 },
  topRight: { display: "flex", alignItems: "center", gap: 12 },
  rolePill: { padding: "6px 14px", borderRadius: "var(--radius-full)", fontSize: 12, fontWeight: 700 },
  body: { display: "flex", flex: 1 },
  sidebar: { width: 220, background: "white", borderRight: "1px solid var(--border)", padding: "20px 12px", display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 64, height: "calc(100vh - 64px)", overflowY: "auto" },
  sidebarOpen: { display: "flex" },
  sidebarFooter: { marginTop: "auto", padding: "16px 14px", display: "flex", alignItems: "center", gap: 8 },
  sidebarFooterDot: { width: 8, height: 8, borderRadius: "50%", background: "var(--green-accent)" },
  navIcon: { fontSize: 17, width: 22, textAlign: "center" },
  navLabel: {},
  main: { flex: 1, overflow: "auto", padding: "32px 36px" },
  content: { maxWidth: 960, margin: "0 auto" },
};
