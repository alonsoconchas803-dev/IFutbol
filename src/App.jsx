import { useState, useEffect, useCallback, useMemo } from "react";
import "./ifutbol.css";
import SuperAdmin from "./pages/SuperAdmin";
import LeagueAdmin from "./pages/LeagueAdmin";
import Referee from "./pages/Referee";
import PlayerProfile from "./pages/PlayerProfile";
import JerseySVG from "./components/JerseySVG";
import IFutbolLogo from "./components/IFutbolLogo";
import BracketTree from "./components/BracketTree";
import { iniciarLoginOAuth, intercambiarCodigoOAuth } from "./lib/pkce";

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

// Capitaliza la primera letra de cada palabra (respeta tildes y ñ; soporta guión)
export const toTitleCase = (s) =>
  String(s || "").replace(/(^|[\s-])(\p{Ll})/gu, (_, sep, c) => sep + c.toUpperCase());

// Valida que la contraseña cumpla la política de Supabase Auth:
// mínimo 8 caracteres, con mayúscula, minúscula y número.
// Devuelve null si es válida o un mensaje de error en caso contrario.
export const validarPassword = (pwd) => {
  if (!pwd || pwd.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (!/[A-Z]/.test(pwd)) return "Incluye al menos una letra mayúscula";
  if (!/[a-z]/.test(pwd)) return "Incluye al menos una letra minúscula";
  if (!/[0-9]/.test(pwd)) return "Incluye al menos un número";
  return null;
};

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
  player:       { label: "Jugador",       icon: "🏃", color: "#8b5cf6" },
};

const MENU = {
  super_admin: [
    { icon:"🏟️", label:"Unidades Deportivas", key:"canchas" },
    { icon:"👕", label:"Equipos",             key:"equipos" },
    { icon:"📊", label:"Resumen",             key:"stats" },
    { icon:"📨", label:"Solicitudes",         key:"solicitudes" },
    { icon:"⚽", label:"Resultados",          key:"resultados" },
    { icon:"📜", label:"Registro de acciones", key:"auditoria" },
  ],
  league_admin: [
    { icon:"🏆", label:"Torneos",    key:"torneos" },
    { icon:"👕", label:"Equipos",    key:"equipos" },
    { icon:"👥", label:"Jugadores",  key:"jugadores" },
    { icon:"📅", label:"Calendario", key:"calendario" },
    { icon:"🟡", label:"Árbitros",   key:"arbitros" },
    { icon:"📄", label:"Fichas",     key:"fichas" },
    { icon:"📋", label:"Resultados", key:"resultados" },
    { icon:"🎨", label:"Personalizar mi unidad", key:"personalizar" },
  ],
  referee: [
    { icon:"🟡", label:"Mis Partidos", key:"partidos" },
    { icon:"📄", label:"Fichas",       key:"fichas" },
    { icon:"🏟️", label:"Mis Unidades", key:"unidades" },
  ],
  player: [
    { icon:"🏃", label:"Mi Perfil",        key:"perfil" },
    { icon:"🏆", label:"Mis Torneos",      key:"ligas" },
    { icon:"📊", label:"Mis Estadísticas", key:"estadisticas" },
  ],
};

// ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession]           = useState(null);
  const [userRole, setUserRole]         = useState(null);
  const [jugadorData, setJugadorData]   = useState(null);
  const [userName, setUserName]         = useState(null); // nombre completo para mostrar en la sidebar
  const [screen, setScreen]             = useState("home");
  const [unidadActiva, setUnidadActiva] = useState(null);
  const [dashSeccion, setDashSeccion]   = useState(null);
  const [modal, setModal]               = useState(null);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [toast, setToast]               = useState(null);
  const [canchas, setCanchas]           = useState([]);
  const [topbarBack, setTopbarBack]     = useState(null);
  const [recoveryToken, setRecoveryToken] = useState(null);
  // Cuando se crea el perfil de jugador por primera vez (auto-creado desde
  // user_metadata o desde el modal de completar perfil) mostramos un modal
  // de bienvenida con el número de afiliado y la instrucción al capitán.
  const [welcomeAfiliado, setWelcomeAfiliado] = useState(null);
  // Si la sesión es válida pero no hay rol ni jugador ni metadata para
  // auto-crear, abrimos un modal donde el usuario completa lo mínimo.
  const [needsPlayerProfile, setNeedsPlayerProfile] = useState(false);

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3500);
  };

  // Callbacks estables — evitan que useEffect en hijos entren en loop infinito
  const goHome = useCallback(() => setScreen("home"), []);
  const goDashboard = useCallback((sec) => { setDashSeccion(sec || null); setScreen("dashboard"); }, []);

  useEffect(() => {
    db("/canchas?select=*&order=created_at.asc").then(d => setCanchas(d || []));
  }, []);

  // Detectar enlaces de recuperación de contraseña de Supabase.
  // Caso éxito: hash trae #access_token=...&type=recovery → abrir modal de reset.
  // Caso error: Supabase redirige con ?error=...&error_code=... cuando el token
  // expiró o fue consumido (común si Gmail preescanea el link). Mostrar aviso
  // y abrir el modal de "olvidé contraseña" para pedir otro enlace.
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);
    const errorCode = hashParams.get("error_code") || queryParams.get("error_code");
    const errorParam = hashParams.get("error") || queryParams.get("error");
    const limpiarUrl = () => window.history.replaceState(null, "", window.location.pathname);

    if (errorParam) {
      if (errorCode === "otp_expired" || errorParam === "access_denied") {
        showToast("El enlace ya no es válido. Solicita uno nuevo.", "err");
      } else {
        showToast("No pudimos procesar el enlace. Intenta de nuevo.", "err");
      }
      setModal("forgot_password");
      setScreen("home");
      limpiarUrl();
      return;
    }

    // Retorno de OAuth (PKCE): la URL trae ?code=... → canjearlo por una sesión.
    // El usuario nuevo de Google no tiene rol ni fila en jugadores, así que
    // loadUserRole lo manda al flujo de "completar perfil" automáticamente.
    if (queryParams.get("code")) {
      (async () => {
        const res = await intercambiarCodigoOAuth();
        if (res?.ok) {
          setSession(res.session);
          await loadUserRole(res.session.access_token, res.session.user.id, res.session.user?.user_metadata);
          showToast("¡Bienvenido!");
        } else if (res) {
          showToast(res.error, "err");
          setScreen("home");
        }
        limpiarUrl();
      })();
      return;
    }

    const token = hashParams.get("access_token");
    if (hashParams.get("type") === "recovery" && token) {
      setRecoveryToken(token);
      setModal("reset_password");
      setScreen("home");
      limpiarUrl();
    }
  }, []);

  const handleLogin = async (email, password) => {
    const data = await api("/auth/v1/token?grant_type=password", {
      method: "POST", body: JSON.stringify({ email, password })
    });
    if (data.access_token) {
      setSession(data);
      await loadUserRole(data.access_token, data.user.id, data.user?.user_metadata);
      setModal(null);
      showToast("¡Bienvenido!");
      return { ok: true };
    }
    return { ok: false, error: "Correo o contraseña incorrectos" };
  };

  // Crea la fila en jugadores con los datos de player_signup (vienen de
  // user_metadata cuando el usuario se registra por el modal o del modal de
  // "completar perfil" cuando se quedó en limbo).
  // Devuelve el jugador creado o null. Despeja errores comunes y muestra toast.
  const crearJugadorDesdeDatos = async (token, userId, datos) => {
    try {
      const payload = {
        user_id: userId,
        nombre_completo: datos.nombre_completo,
        fecha_nacimiento: datos.fecha_nacimiento || null,
        domicilio: datos.domicilio || null,
        posicion_preferida: datos.posicion_preferida || "Delantero",
        numero_preferido: datos.numero_preferido ?? null,
        nombre_camiseta_preferido: datos.nombre_camiseta_preferido || null,
      };
      const created = await dbAuth("/jugadores", token, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (Array.isArray(created) && created[0]?.numero_afiliado) return created[0];
      return null;
    } catch (e) {
      console.error("crearJugadorDesdeDatos:", e);
      return null;
    }
  };

  const loadUserRole = async (token, userId, userMeta) => {
    try {
      const roles = await dbAuth(`/user_roles?user_id=eq.${userId}&select=rol,liga_id,cancha_id&limit=1`, token);
      if (Array.isArray(roles) && roles.length > 0) {
        setUserRole(roles[0]);
        // Para staff (super_admin, league_admin, referee), el nombre completo está en solicitudes_registro
        try {
          const sol = await dbAuth(`/solicitudes_registro?user_id=eq.${userId}&select=nombre_completo&order=created_at.asc&limit=1`, token);
          if (Array.isArray(sol) && sol.length > 0 && sol[0].nombre_completo) setUserName(sol[0].nombre_completo);
        } catch (_) { /* sin solicitud, falla silenciosa */ }
        setScreen("dashboard");
        return;
      }
      const jugador = await dbAuth(`/jugadores?user_id=eq.${userId}`, token);
      if (Array.isArray(jugador) && jugador.length > 0) {
        setUserRole({ rol: "player" });
        setJugadorData(jugador[0]);
        if (jugador[0].nombre_completo) setUserName(jugador[0].nombre_completo);
        setScreen("dashboard");
        return;
      }
      // Sin jugador todavía: intentamos auto-crearlo desde la metadata del signup.
      // Esto cubre el caso donde se requiere confirmar correo: el insert en
      // jugadores no se hizo durante el signup porque no había token, pero los
      // datos quedaron guardados en user_metadata.player_signup.
      const datos = userMeta?.player_signup;
      if (datos?.nombre_completo) {
        const creado = await crearJugadorDesdeDatos(token, userId, datos);
        if (creado) {
          setUserRole({ rol: "player" });
          setJugadorData(creado);
          setUserName(creado.nombre_completo);
          setScreen("dashboard");
          setWelcomeAfiliado(creado.numero_afiliado);
          return;
        }
      }
      // Sin rol, sin jugador y sin metadata utilizable: pedirle al usuario que
      // complete su perfil para no dejarlo en limbo.
      setNeedsPlayerProfile(true);
      setScreen("dashboard");
    } catch (e) { console.error(e); }
  };

  const handleLogout = () => {
    setSession(null); setUserRole(null); setJugadorData(null); setUserName(null);
    setWelcomeAfiliado(null); setNeedsPlayerProfile(false);
    setScreen("home"); setSidebarOpen(false);
    showToast("Sesión cerrada");
  };

  // Tras restablecer la contraseña: limpiar token de recovery, cerrar modal,
  // abrir login para que el usuario entre con la contraseña nueva.
  const handleResetSuccess = () => {
    setRecoveryToken(null);
    setModal("login");
    showToast("Contraseña actualizada. Inicia sesión con la nueva.");
  };

  const initials = () => {
    if (!session) return null;
    if (jugadorData?.foto_url) return jugadorData.foto_url;
    const name = jugadorData?.nombre_completo || session.user?.email || "";
    return name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
  };

  // Nombre a mostrar: nombre completo si lo tenemos, si no el prefijo del email
  const displayName = userName || session?.user?.email?.split("@")[0] || "";

  if (screen === "dashboard" && session) {
    return (
      <>
        <DashboardLayout
          session={session} userRole={userRole} jugadorData={jugadorData}
          displayName={displayName}
          onLogout={handleLogout} toast={toast} showToast={showToast}
          onHome={goHome} initials={initials()}
          seccionInicial={dashSeccion}
          topbarBack={topbarBack} setTopbarBack={setTopbarBack}
        />
        {welcomeAfiliado && (
          <WelcomeAfiliadoModal
            afiliado={welcomeAfiliado}
            onClose={() => setWelcomeAfiliado(null)}
          />
        )}
        {needsPlayerProfile && (
          <CompletarPerfilJugadorModal
            session={session}
            onCancel={handleLogout}
            onCreated={(jug) => {
              setNeedsPlayerProfile(false);
              setUserRole({ rol: "player" });
              setJugadorData(jug);
              setUserName(jug.nombre_completo);
              setWelcomeAfiliado(jug.numero_afiliado);
            }}
          />
        )}
      </>
    );
  }

  if (screen === "unidad" && unidadActiva) {
    return (
      <PublicLayout session={session} userRole={userRole} sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen} setModal={setModal} onLogout={handleLogout}
        displayName={displayName}
        initials={initials()} toast={toast} onHome={goHome}
        onDashboard={goDashboard}
        topbarBack={topbarBack}>
        <UnidadPage cancha={unidadActiva} onBack={goHome} setTopbarBack={setTopbarBack} />
        <Modals modal={modal} setModal={setModal} onLogin={handleLogin} showToast={showToast} recoveryToken={recoveryToken} onResetSuccess={handleResetSuccess} />
      </PublicLayout>
    );
  }

  return (
    <PublicLayout session={session} userRole={userRole} sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen} setModal={setModal} onLogout={handleLogout}
      displayName={displayName}
      initials={initials()} toast={toast} onHome={goHome}
      onDashboard={goDashboard}
      topbarBack={topbarBack}>
      <HomePage canchas={canchas} onVerUnidad={c => { setUnidadActiva(c); setScreen("unidad"); setSidebarOpen(false); setTopbarBack(null); }} />
      <Modals modal={modal} setModal={setModal} onLogin={handleLogin} showToast={showToast} />
    </PublicLayout>
  );
}

// ─────────────────────────────────────────────────────────────────
// MODALS WRAPPER
// ─────────────────────────────────────────────────────────────────
function Modals({ modal, setModal, onLogin, showToast, recoveryToken, onResetSuccess }) {
  if (modal === "login") return <LoginModal onClose={() => setModal(null)} onLogin={onLogin} onRegister={() => setModal("register_player")} onForgotPassword={() => setModal("forgot_password")} />;
  if (modal === "register_player") return <RegisterPlayerModal onClose={() => setModal(null)} showToast={showToast} onLogin={() => setModal("login")} />;
  if (modal === "register_staff") return <RegisterStaffModal onClose={() => setModal(null)} showToast={showToast} />;
  if (modal === "forgot_password") return <ForgotPasswordModal onClose={() => setModal(null)} onBackToLogin={() => setModal("login")} />;
  if (modal === "reset_password" && recoveryToken) return <ResetPasswordModal accessToken={recoveryToken} onClose={() => setModal(null)} onSuccess={onResetSuccess} />;
  return null;
}

// ─────────────────────────────────────────────────────────────────
// DASHBOARD LAYOUT (con navegación lateral funcional)
// ─────────────────────────────────────────────────────────────────
function DashboardLayout({ session, userRole, jugadorData, displayName, onLogout, toast, showToast, onHome, initials, seccionInicial, topbarBack, setTopbarBack }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const rol = userRole?.rol;
  const roleInfo = ROLES_INFO[rol] || { label:"Usuario", icon:"👤", color:"#666" };
  const menuItems = MENU[rol] || [];
  const [activeSection, setActiveSection] = useState(seccionInicial || menuItems[0]?.key || "panel");

  const SUPER_MAP  = { canchas:"canchas", ligas:"ligas", equipos:"equipos", stats:"stats", solicitudes:"solicitudes", resultados:"resultados", auditoria:"auditoria" };
  const LEAGUE_MAP = { torneos:"torneos", equipos:"equipos", jugadores:"jugadores", calendario:"calendario", arbitros:"arbitros", fichas:"fichas", resultados:"resultados", personalizar:"personalizar" };
  const REFEREE_MAP = { partidos:"partidos", fichas:"fichas", unidades:"unidades" };
  const PLAYER_MAP = { perfil:"perfil", ligas:"ligas", estadisticas:"estadisticas" };

  const renderContent = () => {
    if (rol === "super_admin") {
      return <SuperAdmin session={session} seccionInicial={SUPER_MAP[activeSection] || "stats"} setTopbarBack={setTopbarBack} />;
    }
    if (rol === "league_admin") return <LeagueAdmin session={session} userRole={userRole} seccionInicial={LEAGUE_MAP[activeSection] || "equipos"} setTopbarBack={setTopbarBack} />;
    if (rol === "referee") return <Referee session={session} setTopbarBack={setTopbarBack} seccionInicial={REFEREE_MAP[activeSection] || "partidos"} />;
    if (rol === "player") return <PlayerProfile session={session} seccionInicial={PLAYER_MAP[activeSection] || "perfil"} setTopbarBack={setTopbarBack} />;
    return null;
  };

  const goTo = (key) => { setActiveSection(key); setDrawerOpen(false); };

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", paddingTop:56, background:"var(--bg)" }}>
      <style>{css}</style>
      {toast && <div className={`ifutbol-toast ${toast.tipo==="err"?"toast-err":"toast-ok"}`}>{toast.msg}</div>}

      {/* TOPBAR */}
      <header style={s.topbar}>
        <div style={s.topLeft}>
          <button className="ham-btn" onClick={() => setDrawerOpen(true)} aria-label="Abrir menú">☰</button>
          <div style={s.brand} onClick={onHome} className="clickable">
            <IFutbolLogo color="#FFFFFF" height={26} />
          </div>
        </div>
        <div style={s.topRight}>
          {topbarBack && <TopbarBackBtn back={topbarBack} />}
        </div>
      </header>

      {/* OVERLAY del drawer */}
      {drawerOpen && <div style={s.overlay} onClick={() => setDrawerOpen(false)} />}

      {/* DRAWER */}
      <aside style={{ ...s.sidebar, transform: drawerOpen ? "translateX(0)" : "translateX(-110%)" }}>
        {/* Header del drawer con avatar + usuario + rol */}
        <div style={s.drawerHeader}>
          <Avatar initials={initials} size={44} />
          <div style={{ overflow:"hidden", flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--text)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {displayName || session?.user?.email?.split("@")[0]}
            </div>
            <div style={{ fontSize:11, color:roleInfo.color, fontWeight:600, marginTop:2 }}>
              {roleInfo.icon} {roleInfo.label}
            </div>
          </div>
          <button onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú"
            style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:16, color:"var(--text-sub)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
        </div>

        <nav style={{ flex:1, padding:"10px 10px", display:"flex", flexDirection:"column", gap:3, overflowY:"auto" }}>
          <div className="nav-item" onClick={() => { onHome(); setDrawerOpen(false); }}>
            <span style={{ fontSize:17, width:22, textAlign:"center", flexShrink:0 }}>🏠</span>
            <span>Inicio</span>
          </div>
          {menuItems.map(({ icon, label, key }) => (
            <div key={key}
              className={`nav-item ${activeSection === key ? "nav-item-active" : ""}`}
              onClick={() => goTo(key)}>
              <span style={{ fontSize:17, width:22, textAlign:"center", flexShrink:0 }}>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
          <div style={{ flex:1 }} />
          <div className="nav-item" style={{ color:"#ef4444" }} onClick={() => { onLogout(); setDrawerOpen(false); }}>
            <span style={{ fontSize:17, width:22, textAlign:"center", flexShrink:0 }}>🚪</span>
            <span>Cerrar sesión</span>
          </div>
        </nav>
      </aside>

      {/* CONTENIDO */}
      <main style={s.main}>
        <div className="animate-in" key={activeSection}>
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC LAYOUT
// ─────────────────────────────────────────────────────────────────
function TopbarBackBtn({ back }) {
  // Solo flecha (SVG con stroke grueso, en línea con el logo iFutbol).
  return (
    <button onClick={back.onClick} title={back.label || "Volver"} aria-label={back.label || "Volver"}
      style={{ background:"rgba(255,255,255,0.16)", border:"1px solid rgba(255,255,255,0.32)", color:"#fff", borderRadius:6, width:28, height:26, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
  );
}

function PublicLayout({ children, session, userRole, displayName, sidebarOpen, setSidebarOpen, setModal, onLogout, initials, toast, onHome, onDashboard, topbarBack }) {
  const roleInfo = ROLES_INFO[userRole?.rol] || null;
  return (
    <div style={s.root}>
      <style>{css}</style>
      {toast && <div className={`ifutbol-toast ${toast.tipo==="err"?"toast-err":"toast-ok"}`}>{toast.msg}</div>}

      <header style={s.topbar}>
        <div style={s.topLeft}>
          <button className="ham-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div style={s.brand} onClick={onHome} className="clickable">
            <IFutbolLogo color="#FFFFFF" height={26} />
          </div>
        </div>
        <div style={s.topRight}>
          {topbarBack && <TopbarBackBtn back={topbarBack} />}
        </div>
      </header>

      {sidebarOpen && <div style={s.overlay} onClick={() => setSidebarOpen(false)} />}

      <aside style={{ ...s.sidebar, transform: sidebarOpen ? "translateX(0)" : "translateX(-110%)" }}>
        <div style={{ padding:"20px 16px 12px" }}>
          <IFutbolLogo color="#4f8f2f" height={24} />
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
            </> : (MENU[userRole?.rol] || []).map(item => (
              <button key={item.key} className="sb-btn" onClick={() => { onDashboard(item.key); setSidebarOpen(false); }}>
                {item.icon} {item.label}
              </button>
            ))}
            <div style={{ flex:1 }} />
            <button className="sb-btn danger" onClick={() => { onLogout(); setSidebarOpen(false); }}>🚪 Cerrar sesión</button>
          </>}
        </nav>
        {session && (
          <div style={s.sbFooter}>
            <Avatar initials={initials} size={38} />
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:"var(--text)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{displayName || session.user?.email?.split("@")[0]}</div>
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
// UNIDAD CARD (tarjeta de la unidad en HomePage)
// ─────────────────────────────────────────────────────────────────
const TAMANO_LOGO_PX = { pequeno: 56, mediano: 72, grande: 96 };
const INTENSIDAD_FONDO_CFG = {
  claro:  { blur: 6,  brightness: 0.75, alphaTop: 0.05, alphaBot: 0.35 },
  medio:  { blur: 10, brightness: 0.55, alphaTop: 0.15, alphaBot: 0.55 },
  oscuro: { blur: 14, brightness: 0.35, alphaTop: 0.30, alphaBot: 0.75 },
};

// Hex → rgb para usar opacidades del color de marca sin perder cuerpo
function hexToRgb(hex) {
  const h = (hex || "#4f8f2f").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Aclara un color mezclándolo con blanco (pct: 0=igual, 1=blanco)
function lightenHex(hex, pct) {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c) => Math.round(c + (255 - c) * pct);
  return "#" + [mix(r), mix(g), mix(b)].map(n => n.toString(16).padStart(2, "0")).join("");
}

function UnidadCard({ c, onClick }) {
  const estilo  = c.estilo_tarjeta || "logo_arriba";
  const color   = c.color_marca || "#4f8f2f";
  const tamano  = TAMANO_LOGO_PX[c.tamano_logo] || TAMANO_LOGO_PX.mediano;
  const radius  = c.forma_logo === "circulo" ? "50%" : 14;
  const fondoSrc = estilo === "fondo_esquina" ? (c.portada_url || c.logo_url) : null;
  const fondo    = !!fondoSrc;
  const intCfg   = INTENSIDAD_FONDO_CFG[c.intensidad_fondo] || INTENSIDAD_FONDO_CFG.medio;
  const [r, g, b] = hexToRgb(color);
  const colorBg10 = `rgba(${r},${g},${b},0.12)`;

  // ── Variante FONDO + ESQUINA ──
  if (fondo) {
    return (
      <div className="ud-card" onClick={onClick} style={{ position:"relative", overflow:"hidden", borderTop:`3px solid ${color}` }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:`url(${fondoSrc})`, backgroundSize:"cover", backgroundPosition:"center", filter:`blur(${intCfg.blur}px) brightness(${intCfg.brightness})`, transform:"scale(1.1)", zIndex:0 }} />
        <div style={{ position:"absolute", inset:0, background:`linear-gradient(180deg, rgba(0,0,0,${intCfg.alphaTop}) 0%, rgba(0,0,0,${intCfg.alphaBot}) 100%)`, zIndex:0 }} />
        {c.logo_url && (
          <div style={{ position:"absolute", top:12, right:12, width:48, height:48, borderRadius: c.forma_logo === "circulo" ? "50%" : 10, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.4)", background:"#fff", zIndex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <img src={c.logo_url} alt={c.nombre} style={{ width:"100%", height:"100%", objectFit:"contain" }} />
          </div>
        )}
        <div style={{ position:"relative", zIndex:1, marginTop: 60 }}>
          <div style={{ fontSize:16, fontWeight:800, color:"#fff", marginBottom:3, textShadow:"0 1px 3px rgba(0,0,0,0.6)" }}>{c.nombre}</div>
          {c.lema && <div style={{ fontSize:12, color:"rgba(255,255,255,0.92)", fontStyle:"italic", marginBottom:6, textShadow:"0 1px 2px rgba(0,0,0,0.5)" }}>{c.lema}</div>}
          <div style={{ fontSize:13, color:"rgba(255,255,255,0.85)", textShadow:"0 1px 2px rgba(0,0,0,0.5)" }}>{c.direccion || "Ver torneos →"}</div>
        </div>
      </div>
    );
  }

  // ── Variante LOGO ARRIBA (con portada opcional como banner) ──
  const conPortada = !!c.portada_url;
  return (
    <div className="ud-card" onClick={onClick} style={{ position:"relative", overflow:"hidden", borderTop:`3px solid ${color}`, padding: conPortada ? 0 : undefined }}>
      {conPortada && (
        <div style={{ height:90, backgroundImage:`url(${c.portada_url})`, backgroundSize:"cover", backgroundPosition:"center" }} />
      )}
      <div style={{ padding: conPortada ? "0 18px 18px" : 0 }}>
        <div style={{ width: tamano, height: tamano, borderRadius: radius, background: c.logo_url ? "#fff" : colorBg10, display:"flex", alignItems:"center", justifyContent:"center", fontSize: Math.round(tamano*0.45), marginBottom:14, marginTop: conPortada ? -tamano/2 : 0, overflow:"hidden", boxShadow: conPortada ? "0 4px 12px rgba(0,0,0,0.15)" : "none", border: conPortada ? "3px solid #fff" : "none" }}>
          {c.logo_url
            ? <img src={c.logo_url} alt={c.nombre} style={{ width:"100%", height:"100%", objectFit:"contain" }} />
            : "🏟️"}
        </div>
        <div style={{ fontSize:16, fontWeight:800, color:"var(--text)", marginBottom: c.lema ? 3 : 5 }}>{c.nombre}</div>
        {c.lema && <div style={{ fontSize:12, color: color, fontStyle:"italic", fontWeight:600, marginBottom:6 }}>{c.lema}</div>}
        <div style={{ fontSize:13, color:"var(--text-sub)" }}>{c.direccion || "Ver torneos →"}</div>
      </div>
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
        <h1 style={{ fontSize:26, fontWeight:900, color:"white", letterSpacing:-0.5, marginBottom:6, margin:"0 0 6px" }}>Unidades deportivas</h1>
        <p style={{ color:"rgba(255,255,255,0.78)", fontSize:14, margin:0 }}>Selecciona una unidad para ver sus torneos y estadísticas</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:16 }}>
        {canchas.map(c => <UnidadCard key={c.id} c={c} onClick={() => onVerUnidad(c)} />)}
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
// Banner de patrocinadores que se inserta al pie de las secciones públicas.
// Grid de 2 columnas (la app vive en 480px max, ver DISEÑO §1.2): cada tarjeta
// ocupa ~50% del ancho útil — justamente el tope que pidió el cliente.
function BannerPatrocinadores({ items }) {
  if (!items || items.length === 0) return null;
  const ASPECT = { cuadrado: "1 / 1", horizontal: "16 / 9", vertical: "3 / 4" };
  return (
    <div style={{
      marginTop: 28, marginBottom: 8,
      background: "linear-gradient(135deg, #faf5ff 0%, #fdf4ff 100%)",
      border: "1px solid #e9d5ff",
      borderRadius: "var(--radius-md)",
      padding: "12px 12px 14px",
      boxShadow: "0 2px 10px rgba(139,92,246,0.08)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        marginBottom: 10, paddingBottom: 8,
        borderBottom: "1px dashed #e9d5ff",
      }}>
        <span style={{ fontSize: 13 }}>📢</span>
        <span style={{
          fontSize: 10, fontWeight: 800, color: "#7c3aed",
          textTransform: "uppercase", letterSpacing: 0.8,
        }}>Patrocinadores</span>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 10,
      }}>
        {items.map(p => (
          <div key={p.id} style={{
            background: "#fff",
            borderRadius: 10,
            overflow: "hidden",
            border: "1px solid #f3e8ff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            aspectRatio: ASPECT[p.formato] || "16 / 9",
          }}>
            <img src={p.imagen_url} alt="Patrocinador" loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function UnidadPage({ cancha, onBack, setTopbarBack }) {
  const [torneos, setTorneos] = useState([]);
  const [torneoActivo, setTorneoActivo] = useState(null);
  const [seccion, setSeccion] = useState("partidos");
  const [equipos, setEquipos] = useState([]);
  const [clasificacion, setClasificacion] = useState([]);
  const [calendario, setCalendario] = useState([]);
  const [goleadores, setGoleadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState(null); // [rowIdx, colIdx]
  // Patrocinadores activos de esta unidad — banner al pie de cada sección
  // (excepto goleadores, que compite visualmente con el ranking).
  const [patrocinadores, setPatrocinadores] = useState([]);
  // Vista activa dentro del tab "Partidos":
  //   - número → jornada con ese número
  //   - "liguilla" → bracket de liguilla
  //   - "copa" → bracket de copa
  const [vistaPartidos, setVistaPartidos] = useState(null);
  const [liguilla, setLiguilla] = useState([]);

  useEffect(() => {
    db(`/ligas?cancha_id=eq.${cancha.id}&activa=eq.true&select=*&order=nombre`).then(data => {
      setTorneos(data || []);
      setLoading(false);
    });
    // Solo activos, ordenados. Si la unidad no tiene patrocinadores, el banner
    // simplemente no se renderiza (BannerPatrocinadores devuelve null).
    db(`/patrocinadores?cancha_id=eq.${cancha.id}&activo=eq.true&select=*&order=orden,created_at`)
      .then(data => setPatrocinadores(data || []))
      .catch(() => setPatrocinadores([]));
  }, [cancha.id]);

  // Sincroniza el botón "← back" del topbar con el estado actual
  useEffect(() => {
    if (!setTopbarBack) return;
    if (torneoActivo) {
      setTopbarBack({ label: cancha.nombre, onClick: () => setTorneoActivo(null) });
    } else {
      setTopbarBack({ label: "Inicio", onClick: onBack });
    }
    return () => setTopbarBack(null);
  }, [torneoActivo, cancha.nombre, onBack, setTopbarBack]);

  const cargarDatos = async (ligaId) => {
    setLoading(true);
    // 1. Jornadas, equipos y bracket de esta liga en paralelo
    const [eqs, jornadas, liguillaData] = await Promise.all([
      db(`/equipos?liga_id=eq.${ligaId}&select=*&order=nombre`),
      db(`/jornadas?liga_id=eq.${ligaId}&select=id,numero,fecha&order=numero`),
      db(`/liguilla_partidos?liga_id=eq.${ligaId}&select=*&order=created_at`),
    ]);
    setLiguilla(liguillaData || []);
    const eqsF = eqs || [];
    // La clasificación se calcula con TODOS los equipos (incl. dados de baja)
    // para que las fichas cerradas de sus rivales sigan contando; al estado
    // visible solo van los activos.
    setEquipos(eqsF.filter(e => e.activo !== false));
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

    // PostgREST devuelve ficha_partido como objeto {} (relación 1-a-1), no array.
    // Los partidos marcados con cuenta_estadisticas=false (amistosos creados
    // a mano por el admin) NO impactan tabla ni goleadores, aunque sí se
    // muestran en el calendario y conservan su resultado en la ficha.
    const fichas = parts.filter(p => p.ficha_partido?.cerrada && p.cuenta_estadisticas !== false);

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
    setClasificacion(Object.values(tabla).filter(r=>r.equipo.activo!==false).sort((a,b)=>b.pts-a.pts||(b.gf-b.gc)-(a.gf-a.gc)));

    // Goleadores: acumula goles por jugador desde las fichas cerradas.
    const gm={};
    fichas.forEach(p=>(p.ficha_partido?.goleadores||[]).forEach(g=>{
      if(!g.jugador_id)return;
      if(!gm[g.jugador_id])gm[g.jugador_id]={nombre:g.nombre,equipo_nombre:g.equipo_nombre,goles:0};
      gm[g.jugador_id].goles+=g.goles||0;
    }));
    // El equipo mostrado debe ser el equipo ACTUAL del jugador, no el que quedó
    // congelado en la ficha: si se cambió de club, sus goles lo siguen pero bajo
    // el equipo nuevo. Se resuelve por su inscripción vigente en jugador_equipo.
    const golJugIds=Object.keys(gm);
    if(golJugIds.length>0){
      const inscripciones=await db(`/jugador_equipo?liga_id=eq.${ligaId}&jugador_id=in.(${golJugIds.join(",")})&select=jugador_id,equipo_id,created_at&order=created_at.desc`);
      const equipoActualPorJug={};
      (inscripciones||[]).forEach(i=>{ if(!equipoActualPorJug[i.jugador_id])equipoActualPorJug[i.jugador_id]=i.equipo_id; });
      const nombrePorEquipo=Object.fromEntries(eqsF.map(e=>[e.id,e.nombre]));
      golJugIds.forEach(jid=>{
        const eqActual=equipoActualPorJug[jid];
        // Si no tiene inscripción vigente, se conserva el equipo de la ficha.
        if(eqActual&&nombrePorEquipo[eqActual])gm[jid].equipo_nombre=nombrePorEquipo[eqActual];
      });
    }
    setGoleadores(Object.values(gm).sort((a,b)=>b.goles-a.goles).slice(0,10));
    setLoading(false);
  };

  const seleccionarTorneo = t => { setTorneoActivo(t); setSeccion("partidos"); cargarDatos(t.id); };

  // Click en tab: cambia sección y recarga datos.
  const onTabClick = (key) => {
    setSeccion(key);
    if (torneoActivo) cargarDatos(torneoActivo.id);
  };

  // Partidos agrupados por jornada (ordenados por número de jornada)
  const jornadasAgrupadas = useMemo(() => {
    if (!calendario || calendario.length === 0) return [];
    const porJornada = {};
    calendario.forEach(p => {
      const j = p.jornada;
      if (!j) return;
      if (!porJornada[j.id]) porJornada[j.id] = { jornada: j, partidos: [] };
      porJornada[j.id].partidos.push(p);
    });
    return Object.values(porJornada).sort((a, b) => (a.jornada.numero || 0) - (b.jornada.numero || 0));
  }, [calendario]);

  // Jornada actual = primera con partidos no cerrados; si todas cerradas, la última.
  const jornadaActual = useMemo(() => {
    if (jornadasAgrupadas.length === 0) return null;
    const pendiente = jornadasAgrupadas.find(({ partidos }) => partidos.some(p => !p.ficha_partido?.cerrada));
    return (pendiente?.jornada || jornadasAgrupadas[jornadasAgrupadas.length - 1]?.jornada)?.numero ?? null;
  }, [jornadasAgrupadas]);

  // Bracket agrupado por tipo y fase (sólo lectura para vista pública).
  const liguillaPartidos = useMemo(() => ({
    cuartos: liguilla.filter(p => p.tipo === "liguilla" && p.fase === "cuartos"),
    semis:   liguilla.filter(p => p.tipo === "liguilla" && p.fase === "semis"),
    final:   liguilla.filter(p => p.tipo === "liguilla" && p.fase === "final"),
    tercer:  liguilla.filter(p => p.tipo === "liguilla" && p.fase === "3er_lugar"),
  }), [liguilla]);
  const copaPartidos = useMemo(() => ({
    cuartos: liguilla.filter(p => p.tipo === "copa" && p.fase === "cuartos"),
    semis:   liguilla.filter(p => p.tipo === "copa" && p.fase === "semis"),
    final:   liguilla.filter(p => p.tipo === "copa" && p.fase === "final"),
    tercer:  liguilla.filter(p => p.tipo === "copa" && p.fase === "3er_lugar"),
  }), [liguilla]);
  const hayBracket = useMemo(() => liguilla.length > 0, [liguilla]);

  // Fases del bracket que tienen al menos un partido (en cualquier tipo).
  // Mantienen el orden lógico cuartos → semis → final y sólo aparecen
  // cuando se han generado, de modo que conforme avanza el torneo el
  // selector va ganando opciones. El 3er lugar NO se expone como chip
  // propio: comparte fecha con la final, así que sus partidos se muestran
  // dentro del chip "Final" para no fragmentar la información.
  const FASES_ORDEN = ["cuartos", "semis", "final"];
  const FASES_INFO = {
    cuartos:    { label:"Cuartos de final", emoji:"🥊" },
    semis:      { label:"Semifinales",      emoji:"🥈" },
    final:      { label:"Final",            emoji:"🏆" },
  };
  // Una fase está disponible si tiene partidos propios o, en el caso de
  // "final", también si existen partidos de 3er lugar.
  const fasesConPartidos = useMemo(
    () => FASES_ORDEN.filter(f =>
      liguilla.some(p => p.fase === f) ||
      (f === "final" && liguilla.some(p => p.fase === "3er_lugar"))
    ),
    [liguilla] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Sincroniza vistaPartidos con la jornada actual cuando cambian los datos
  // (siempre que el usuario no haya seleccionado manualmente una vista válida).
  useEffect(() => {
    const esJornadaValida = typeof vistaPartidos === "number"
      && jornadasAgrupadas.some(g => g.jornada.numero === vistaPartidos);
    const esFaseValida = typeof vistaPartidos === "string"
      && fasesConPartidos.includes(vistaPartidos);
    if (esJornadaValida || esFaseValida) return;
    if (jornadaActual != null) setVistaPartidos(jornadaActual);
    else if (fasesConPartidos.length > 0) setVistaPartidos(fasesConPartidos[0]);
    else setVistaPartidos(null);
  }, [jornadaActual, jornadasAgrupadas, fasesConPartidos, vistaPartidos]);

  // Tabs disponibles. "Eliminatoria" aparece automáticamente sólo cuando
  // se ha creado al menos un bracket (liguilla y/o copa).
  const tabs = useMemo(() => {
    const arr = [["partidos", "📅 Partidos"]];
    if (hayBracket) arr.push(["eliminatoria", "🎯 Eliminatoria"]);
    arr.push(
      ["tabla","📊 Tabla"],
      ["goleadores","🥇 Goleadores"],
      ["equipos","👕 Equipos"],
      ["ofensiva","⚔️ Mejor ofensiva"],
      ["defensiva","🛡️ Mejor defensiva"],
      ["fairplay","🤝 Fair play"],
    );
    return arr;
  }, [hayBracket]);

  // Si la sección activa es "eliminatoria" y desaparece el bracket
  // (porque se borraron los partidos), volvemos a "partidos".
  useEffect(() => {
    if (seccion === "eliminatoria" && !hayBracket) setSeccion("partidos");
  }, [seccion, hayBracket]);

  // Vista: selección de torneo (cards)
  if (!torneoActivo) {
    const colorMarca = cancha.color_marca || "#4f8f2f";
    const radiusLogo = cancha.forma_logo === "circulo" ? "50%" : 16;
    return (
      <div className="animate-in">
        {/*
          Patrón "perfil con portada":
          - Imagen como contenedor relativo.
          - Logo absoluto, anclado a la esquina inferior izquierda, sobresaliendo de la imagen.
          - Todo el texto (nombre, lema, dirección) queda DEBAJO de la imagen sobre fondo plano,
            por lo que siempre es legible sin pelear con los colores de la portada.
        */}
        {cancha.portada_url ? (
          /*
            Portada con logo + card glassmorphism al lado.
            Ambos viven sobre la imagen, anclados al borde inferior y sobresaliendo (-30px).
            La card usa backdrop-filter blur para que se intuya la imagen detrás
            pero el texto queda perfectamente legible.
          */
          <div style={{ position:"relative", height:140, borderRadius:"var(--radius-lg)", backgroundImage:`url(${cancha.portada_url})`, backgroundSize:"cover", backgroundPosition:"center", boxShadow:"0 4px 16px rgba(0,0,0,0.12)", marginBottom: 50 }}>
            <div style={{ position:"absolute", left:12, right:12, bottom:-30, display:"flex", alignItems:"flex-end", gap:10 }}>
              {/* Logo */}
              <div style={{ width:75, height:75, background: cancha.logo_url ? "#fff" : `${colorMarca}22`, borderRadius: radiusLogo, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", border:"3px solid #fff", boxShadow:"0 4px 12px rgba(0,0,0,0.22)", fontSize:44, flexShrink:0 }}>
                {cancha.logo_url
                  ? <img src={cancha.logo_url} alt={cancha.nombre} style={{ width:"100%", height:"100%", objectFit:"contain" }} />
                  : "🏟️"}
              </div>
              {/* Card glassmorphism */}
              <div style={{
                flex:1, minWidth:0,
                background:"rgba(255,255,255,0.62)",
                backdropFilter:"blur(14px) saturate(160%)",
                WebkitBackdropFilter:"blur(14px) saturate(160%)",
                border:"1px solid rgba(255,255,255,0.7)",
                borderLeft:`6px solid ${colorMarca}`,
                borderRadius:"var(--radius-md)",
                padding:"7px 10px",
                boxShadow:"0 4px 14px rgba(0,0,0,0.18)",
              }}>
                <h1 style={{ fontSize:14, fontWeight:900, color:"#0f172a", letterSpacing:-0.3, margin:0, marginBottom: cancha.lema?1:2, lineHeight:1.1, wordBreak:"break-word" }}>{cancha.nombre}</h1>
                {cancha.lema && <div style={{ fontSize:10, color:colorMarca, fontStyle:"italic", fontWeight:700, marginBottom:1, lineHeight:1.15 }}>{cancha.lema}</div>}
                <p style={{ color:"#1f2937", fontSize:10.5, margin:0, fontWeight:500, lineHeight:1.2, display:"flex", alignItems:"flex-start", gap:3 }}>
                  <span style={{ fontSize:10 }}>📍</span>
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis" }}>{cancha.direccion}</span>
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Sin portada: logo + card blanca normal en disposición horizontal */
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <div style={{ fontSize:44, width:75, height:75, background: cancha.logo_url ? "#fff" : `${colorMarca}22`, borderRadius: radiusLogo, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
              {cancha.logo_url
                ? <img src={cancha.logo_url} alt={cancha.nombre} style={{ width:"100%", height:"100%", objectFit:"contain" }} />
                : "🏟️"}
            </div>
            <div style={{
              flex:1, minWidth:0,
              background:"#ffffff",
              borderRadius:"var(--radius-md)",
              padding:"8px 12px",
              borderLeft:`6px solid ${colorMarca}`,
              boxShadow:"var(--shadow-md)",
            }}>
              <h1 style={{ fontSize:15, fontWeight:900, color:"var(--text)", letterSpacing:-0.4, margin:0, marginBottom: cancha.lema?2:3, lineHeight:1.15 }}>{cancha.nombre}</h1>
              {cancha.lema && <div style={{ fontSize:11, color:colorMarca, fontStyle:"italic", fontWeight:600, marginBottom:2 }}>{cancha.lema}</div>}
              <p style={{ color:"var(--text-sub)", fontSize:11.5, margin:0, display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ fontSize:11, lineHeight:1 }}>📍</span>
                <span>{cancha.direccion}</span>
              </p>
            </div>
          </div>
        )}
        <div style={{ marginBottom:20, padding:"12px 18px", background:"var(--green)", borderRadius:"var(--radius-lg)", boxShadow:"0 4px 16px rgba(79,143,47,0.3)" }}>
          <h2 style={{ fontSize:17, fontWeight:800, color:"white", margin:0 }}>Torneos</h2>
        </div>
        {loading ? <div style={{ padding:60, textAlign:"center" }}><div className="spinner"/></div> : (
          torneos.length === 0
            ? <EmptyState icon="🏆" txt="No hay torneos activos en esta unidad"/>
            : <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {torneos.map(t => (
                  <div key={t.id} className="ud-card" onClick={() => seleccionarTorneo(t)}
                       style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px" }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:"var(--green-light)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>🏆</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:800, color:"var(--text)", lineHeight:1.2, marginBottom:2, wordBreak:"break-word" }}>{t.nombre}</div>
                      {(() => {
                        const meta = [t.dia, t.turno, t.temporada ? `Temp. ${t.temporada}` : null].filter(Boolean).join(" · ");
                        return meta ? <div style={{ fontSize:11.5, color:"var(--text-sub)", lineHeight:1.25 }}>{meta}</div> : null;
                      })()}
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
                      <polyline points="9 6 15 12 9 18"/>
                    </svg>
                  </div>
                ))}
              </div>
        )}
        <BannerPatrocinadores items={patrocinadores} />
      </div>
    );
  }

  // Vista: estadísticas del torneo seleccionado
  const torneoColor = torneoActivo.color_marca || "#4f8f2f";
  const torneoColorClaro = lightenHex(torneoColor, 0.35);
  const torneoRgb = hexToRgb(torneoColor);
  return (
    <div className="animate-in">
      {/*
        Tarjeta de torneo activo — 3 columnas en una fila:
          [izq] nombre unidad + logo
          [centro] nombre liga + día/turno/temp en líneas
          [der] stats verticales (equipos + jornada actual)
      */}
      <div style={{ background:`linear-gradient(135deg,${torneoColor} 0%,${torneoColorClaro} 100%)`, borderRadius:14, padding:"14px 14px", marginBottom:18, boxShadow:`0 4px 16px rgba(${torneoRgb[0]},${torneoRgb[1]},${torneoRgb[2]},0.3)`, color:"#fff", display:"grid", gridTemplateColumns:"auto 1fr auto", gap:12, alignItems:"center" }}>
        {/* Izquierda: nombre unidad + logo (centrados vertical y horizontalmente) */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, minWidth:0 }}>
          <div style={{ fontSize:10.5, fontWeight:800, textTransform:"uppercase", letterSpacing:0.7, lineHeight:1.15, textAlign:"center", maxWidth:78, wordBreak:"break-word", color:"rgba(255,255,255,0.95)" }}>
            {cancha.nombre}
          </div>
          <div style={{ width:58, height:58, background: cancha.logo_url ? "#fff" : "rgba(255,255,255,0.18)", borderRadius: cancha.forma_logo === "circulo" ? "50%" : 12, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", fontSize:30, flexShrink:0 }}>
            {cancha.logo_url
              ? <img src={cancha.logo_url} alt="" style={{ width:"100%", height:"100%", objectFit:"contain" }} />
              : "🏟️"}
          </div>
        </div>

        {/* Centro: nombre liga + meta en líneas separadas */}
        <div style={{ minWidth:0 }}>
          <h1 style={{ fontSize:16, fontWeight:900, color:"#fff", letterSpacing:-0.3, margin:"0 0 6px", lineHeight:1.15, wordBreak:"break-word" }}>
            {torneoActivo.nombre}
          </h1>
          <div style={{ display:"flex", flexDirection:"column", gap:1, fontSize:11.5, color:"rgba(255,255,255,0.82)", lineHeight:1.3 }}>
            {torneoActivo.dia && <div>{torneoActivo.dia}</div>}
            {torneoActivo.turno && <div>{torneoActivo.turno}</div>}
            {torneoActivo.temporada && <div>Temp. {torneoActivo.temporada}</div>}
          </div>
        </div>

        {/* Derecha: stats verticales */}
        <div style={{ display:"flex", flexDirection:"column", gap:8, flexShrink:0, paddingLeft:6, borderLeft:"1px solid rgba(255,255,255,0.22)", paddingTop:2, paddingBottom:2 }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:20, fontWeight:900, color:"#fff", lineHeight:1 }}>{equipos.length}</div>
            <div style={{ fontSize:9.5, color:"rgba(255,255,255,0.75)", marginTop:1, textTransform:"uppercase", letterSpacing:0.4 }}>equipos</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:20, fontWeight:900, color:"#fff", lineHeight:1 }}>{jornadaActual ?? "—"}</div>
            <div style={{ fontSize:9.5, color:"rgba(255,255,255,0.75)", marginTop:1, textTransform:"uppercase", letterSpacing:0.4 }}>jornada</div>
          </div>
        </div>
      </div>

      <div className="ifutbol-tabs">
        {tabs.map(([key,label])=><button key={key} className={`ifutbol-tab ${seccion===key?"active":""}`} onClick={()=>onTabClick(key)}>{label}</button>)}
      </div>
      {loading?<div style={{ padding:60, textAlign:"center" }}><div className="spinner"/></div>:<>
          {seccion==="tabla"&&(clasificacion.length===0?<EmptyState icon="📊" txt="No hay partidos jugados aún"/>:
            <>
              {/* Hint sutil — sólo si la tabla excede el ancho del marco */}
              <div style={{ fontSize:9, color:"#bcc1c6", textAlign:"center", marginBottom:6, letterSpacing:0.3, fontWeight:500 }}>
                ← desliza para ver más estadísticas →
              </div>
              <div style={{ background:"white", borderRadius:"var(--radius-md)", overflowX:"auto", overflowY:"hidden", boxShadow:"var(--shadow-md)", WebkitOverflowScrolling:"touch" }}
                onClick={e=>{ if(e.target===e.currentTarget||e.target.tagName==="DIV"&&e.target===e.currentTarget) setSelectedCell(null); }}>
                <table className="ifutbol-table" style={{ userSelect:"none", minWidth:440 }}>
                  <thead><tr>
                    {["#","Equipo","PJ","G","E","D","GF","GC","DIF","PTS"].map((h,ci)=>{
                      const pin = ci===0?"pin-rank":ci===1?"pin-equipo":ci===9?"pin-pts":undefined;
                      const selBg = selectedCell&&selectedCell[1]===ci ? "rgba(0,0,0,0.18)" : undefined;
                      return (
                        <th key={h} className={pin} style={{ textAlign: ci<=1?"left":"center",
                          background: selBg || (pin?"#4f8f2f":undefined),
                          transition:"background 0.15s" }}>
                          {h}
                        </th>
                      );
                    })}
                  </tr></thead>
                  <tbody>{clasificacion.map((r,ri)=>{
                    const baseBg = (isRow,isCol,isBoth) => isBoth?"rgba(79,143,47,0.22)":isRow||isCol?"rgba(79,143,47,0.07)":"#ffffff";
                    const cells = [
                      <td key={0} className="pin-rank"
                          style={{ background: baseBg(selectedCell&&selectedCell[0]===ri, selectedCell&&selectedCell[1]===0, selectedCell&&selectedCell[0]===ri&&selectedCell[1]===0), transition:"background 0.15s", cursor:"pointer", textAlign:"center" }}
                          onClick={()=>setSelectedCell(selectedCell&&selectedCell[0]===ri&&selectedCell[1]===0?null:[ri,0])}>
                        <span className="rank-badge" style={{ background:ri===0?"#FFD700":ri===1?"#C0C0C0":ri===2?"#CD7F32":"#f3f4f6",color:ri<3?"#111":"#777" }}>{ri+1}</span>
                      </td>,
                      <td key={1} className="pin-equipo"
                          style={{ background: baseBg(selectedCell&&selectedCell[0]===ri, selectedCell&&selectedCell[1]===1, selectedCell&&selectedCell[0]===ri&&selectedCell[1]===1), transition:"background 0.15s", cursor:"pointer" }}
                          onClick={()=>setSelectedCell(selectedCell&&selectedCell[0]===ri&&selectedCell[1]===1?null:[ri,1])}>
                        <div style={{ display:"flex",alignItems:"center",gap:4 }}>
                          {r.equipo.escudo_url?<img src={r.equipo.escudo_url} loading="lazy" style={{ width:18,height:18,borderRadius:4,objectFit:"cover",flexShrink:0 }} alt=""/>:<div style={{ width:9,height:9,borderRadius:"50%",background:r.equipo.color_playera||"#999",flexShrink:0 }}/>}
                          <span style={{ fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontSize:11 }}>{r.equipo.nombre}</span>
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
                        [r.pts,{fontWeight:800,fontSize:13,color:r.equipo.color_playera||"var(--green)"}],
                      ].map(([val,style],idx)=>{
                        const ci=idx+2;
                        const isRow=selectedCell&&selectedCell[0]===ri;
                        const isCol=selectedCell&&selectedCell[1]===ci;
                        const isBoth=isRow&&isCol;
                        const pin = ci===9 ? "pin-pts" : undefined;
                        return(
                          <td key={ci} className={pin} style={{ textAlign:"center", ...style,
                            background: pin ? baseBg(isRow,isCol,isBoth) : (isBoth?"rgba(79,143,47,0.22)":isRow||isCol?"rgba(79,143,47,0.07)":undefined),
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
            </>
          )}
          {seccion==="partidos"&&((jornadasAgrupadas.length===0 && fasesConPartidos.length===0)?<EmptyState icon="📅" txt="No hay partidos programados aún"/>:
            (() => {
              const tieneVariasOpciones = jornadasAgrupadas.length + fasesConPartidos.length > 1;
              const getEquipo = id => equipos.find(e => e.id === id);
              const chipStyle = (activa) => ({
                border:`1.5px solid ${activa?"var(--green)":"var(--border)"}`,
                background: activa?"var(--green)":"white",
                color: activa?"#fff":"var(--text)",
                borderRadius:99, padding:"6px 14px", fontSize:12, fontWeight:700,
                cursor:"pointer", whiteSpace:"nowrap", flexShrink:0, minHeight:32,
                fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s",
              });
              // Tarjeta de partido común para jornadas y bracket.
              // Acepta equipos por objeto (jornadas trae el join completo;
              // bracket sólo trae el id y aquí lo resolvemos contra `equipos`).
              // Badge "Amistoso" se aplica automáticamente cuando el partido manual
              // no cuenta para estadísticas — mismo estilo gris que el amistoso
              // de liguilla para mantener consistencia visual.
              const BADGE_AMISTOSO = { label:"Amistoso", bg:"#f3f4f6", color:"#6b7280" };
              const renderPartidoCard = ({ key, local, visitante, golesLocal, golesVisitante, mostrarGoles, hora, cancha, jugado, badge, esAmistoso }) => {
                const eqL = local || {};
                const eqV = visitante || {};
                const badgeFinal = badge || (esAmistoso ? BADGE_AMISTOSO : null);
                return (
                  <div key={key} style={{ padding:"8px 10px", background:"#f9fafb", borderRadius:9, border:"1px solid var(--border)" }}>
                    {badgeFinal && (
                      <div style={{ marginBottom:6, display:"flex" }}>
                        <span style={{ fontSize:9.5, fontWeight:800, letterSpacing:0.4, textTransform:"uppercase", padding:"2px 7px", borderRadius:4, background:badgeFinal.bg, color:badgeFinal.color }}>
                          {badgeFinal.label}
                        </span>
                      </div>
                    )}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:4 }}>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, flex:1, minWidth:0 }}>
                        <JerseySVG
                          diseno={eqL.diseno_camiseta||"solido"}
                          color1={eqL.color_playera||"#999"}
                          color2={eqL.color_camiseta_2||"#fff"}
                          escudoUrl={eqL.escudo_url||null}
                          size={34}
                        />
                        <span style={{ fontWeight:700, fontSize:11.5, textAlign:"center", lineHeight:1.15, wordBreak:"break-word" }}>{eqL.nombre||"—"}</span>
                      </div>

                      <div style={{ textAlign:"center", padding:"0 6px", flexShrink:0, minWidth:64 }}>
                        {mostrarGoles ? (
                          <div style={{ fontSize:20, fontWeight:900, lineHeight:1 }}>
                            <span style={{ color:golesLocal>golesVisitante?"#16a34a":"var(--text)" }}>{golesLocal}</span>
                            <span style={{ color:"#d1d5db", fontSize:15, margin:"0 3px" }}>-</span>
                            <span style={{ color:golesVisitante>golesLocal?"#16a34a":"var(--text)" }}>{golesVisitante}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize:11.5, color:"var(--text-muted)", fontWeight:800, letterSpacing:1 }}>VS</span>
                        )}
                        <div style={{ fontSize:9.5, color:"var(--text-muted)", marginTop:3, whiteSpace:"nowrap" }}>
                          ⏰ {hora?.substring(0,5)||"—"} · C{cancha||"—"}
                        </div>
                        {jugado && <div style={{ fontSize:9.5, color:"var(--green)", fontWeight:700, marginTop:1 }}>✓ Jugado</div>}
                      </div>

                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, flex:1, minWidth:0 }}>
                        <JerseySVG
                          diseno={eqV.diseno_camiseta||"solido"}
                          color1={eqV.color_playera||"#999"}
                          color2={eqV.color_camiseta_2||"#fff"}
                          escudoUrl={eqV.escudo_url||null}
                          size={34}
                        />
                        <span style={{ fontWeight:700, fontSize:11.5, textAlign:"center", lineHeight:1.15, wordBreak:"break-word" }}>{eqV.nombre||"—"}</span>
                      </div>
                    </div>
                  </div>
                );
              };
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {/* Selector: chips de jornadas y chips de fases del bracket.
                      Las fases aparecen automáticamente conforme se generan
                      (cuartos → semifinales → final → 3er lugar). */}
                  {tieneVariasOpciones && (
                    <div style={{ display:"flex", gap:6, overflowX:"auto", WebkitOverflowScrolling:"touch", paddingBottom:2 }}>
                      {jornadasAgrupadas.map(({ jornada }) => (
                        <button key={jornada.id} onClick={() => setVistaPartidos(jornada.numero)}
                          style={chipStyle(jornada.numero === vistaPartidos)}>
                          J{jornada.numero}
                        </button>
                      ))}
                      {fasesConPartidos.map(fase => (
                        <button key={fase} onClick={() => setVistaPartidos(fase)}
                          style={chipStyle(vistaPartidos === fase)}>
                          {FASES_INFO[fase].emoji} {FASES_INFO[fase].label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Contenido según la vista activa */}
                  {typeof vistaPartidos === "string" ? (() => {
                    // Vista de fase del bracket: agrupar por tipo.
                    // Orden visual fijo: liguilla → copa → amistosos al final.
                    // En "Final" se anexan después los partidos de 3er lugar
                    // (que se juegan el mismo día), agrupados por tipo bajo
                    // un sub-encabezado propio.
                    const matchFase = (p) => p.fase === vistaPartidos;
                    const partidosFase = liguilla.filter(p => matchFase(p) && p.equipo_local_id && p.equipo_visitante_id);
                    const tercerLugar = vistaPartidos === "final"
                      ? liguilla.filter(p => p.fase === "3er_lugar" && p.equipo_local_id && p.equipo_visitante_id)
                      : [];
                    const tiposPorTipo = [
                      { tipo:"liguilla", label:"🏆 Liguilla", badge:{ label:"Liguilla", bg:"var(--green-light)", color:"var(--green)" } },
                      { tipo:"copa",     label:"🥈 Copa",     badge:{ label:"Copa",     bg:"#fef9c3", color:"#854d0e" } },
                      { tipo:"amistoso", label:"🤝 Amistosos", badge:{ label:"Amistoso", bg:"#f3f4f6", color:"#6b7280" } },
                    ];
                    const renderListaPorTipo = (lista, prefix, badgeOverride) => tiposPorTipo.map(g => {
                      const partidosTipo = lista.filter(p => p.tipo === g.tipo);
                      if (partidosTipo.length === 0) return null;
                      return (
                        <div key={`${prefix}-${g.tipo}`} style={{ display:"flex", flexDirection:"column", gap:6 }}>
                          <div style={{ fontSize:11.5, fontWeight:800, color:"var(--text-sub)", letterSpacing:0.4, textTransform:"uppercase", padding:"2px 2px" }}>
                            {g.label}
                          </div>
                          {partidosTipo.map(p => {
                            // En bracket los goles viven en la misma fila
                            // (no hay ficha_partido). Sólo se muestran si
                            // están registrados.
                            const tieneGoles = p.goles_local != null && p.goles_visitante != null;
                            return renderPartidoCard({
                              key: p.id,
                              local: getEquipo(p.equipo_local_id),
                              visitante: getEquipo(p.equipo_visitante_id),
                              golesLocal: p.goles_local,
                              golesVisitante: p.goles_visitante,
                              mostrarGoles: tieneGoles,
                              hora: p.hora,
                              cancha: p.cancha_numero,
                              jugado: !!p.cerrado,
                              badge: badgeOverride || g.badge,
                            });
                          })}
                        </div>
                      );
                    });
                    return (
                      <div style={{ background:"white", borderRadius:"var(--radius-md)", overflow:"hidden", boxShadow:"var(--shadow-sm)", border:"1px solid var(--border)" }}>
                        <div style={{ background:"#f9fafb", padding:"8px 14px", borderBottom:"1px solid var(--border)" }}>
                          <span style={{ fontWeight:700, fontSize:12.5 }}>
                            {FASES_INFO[vistaPartidos].emoji} {FASES_INFO[vistaPartidos].label}
                          </span>
                        </div>
                        <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:10 }}>
                          {partidosFase.length === 0 && tercerLugar.length === 0 && (
                            <div style={{ padding:"14px 10px", textAlign:"center", color:"var(--text-muted)", fontSize:12, fontStyle:"italic" }}>
                              Sin partidos en esta fase
                            </div>
                          )}
                          {renderListaPorTipo(partidosFase, "fase")}

                          {/* 3er lugar embebido en la final (mismo día). El
                              encabezado separador deja claro qué partidos son. */}
                          {tercerLugar.length > 0 && (
                            <>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4, paddingTop:8, borderTop:"1px dashed var(--border)" }}>
                                <span style={{ fontSize:12, fontWeight:800, color:"#92400e" }}>🥉 3er lugar</span>
                              </div>
                              {renderListaPorTipo(tercerLugar, "tercer", { label:"3er lugar", bg:"#fff7ed", color:"#9a3412" })}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })() : (() => {
                    const grupoSel = jornadasAgrupadas.find(g => g.jornada.numero === vistaPartidos) || jornadasAgrupadas[0];
                    if (!grupoSel) return null;
                    // Solo se muestran partidos con AMBOS equipos asignados.
                    // Los partidos con un solo equipo cuentan como "descanso" para ese equipo.
                    // Los partidos sin equipos (hueco completo) simplemente no aparecen.
                    const partidosLlenos = grupoSel.partidos.filter(p => p.equipo_local_id && p.equipo_visitante_id);
                    const equipoIdsEnPartidos = new Set();
                    partidosLlenos.forEach(p => {
                      equipoIdsEnPartidos.add(p.equipo_local_id);
                      equipoIdsEnPartidos.add(p.equipo_visitante_id);
                    });
                    const descansan = equipos.filter(eq => !equipoIdsEnPartidos.has(eq.id));
                    return (
                      <div style={{ background:"white", borderRadius:"var(--radius-md)", overflow:"hidden", boxShadow:"var(--shadow-sm)", border:"1px solid var(--border)" }}>
                        <div style={{ background:"#f9fafb", padding:"8px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:"1px solid var(--border)" }}>
                          <span style={{ fontWeight:700, fontSize:12.5 }}>Jornada {grupoSel.jornada.numero}</span>
                          <span style={{ fontSize:11, color:"var(--text-muted)" }}>{grupoSel.jornada.fecha||"Fecha por definir"}</span>
                        </div>
                        <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:6 }}>
                          {partidosLlenos.length === 0 && descansan.length === 0 && (
                            <div style={{ padding:"14px 10px", textAlign:"center", color:"var(--text-muted)", fontSize:12, fontStyle:"italic" }}>
                              Sin partidos programados en esta jornada
                            </div>
                          )}
                          {partidosLlenos.map(p => {
                            const fichaOk = p.ficha_partido?.cerrada;
                            const f = fichaOk ? p.ficha_partido : null;
                            return renderPartidoCard({
                              key: p.id,
                              local: p.equipos_local,
                              visitante: p.equipos_visitante,
                              golesLocal: f?.goles_local,
                              golesVisitante: f?.goles_visitante,
                              mostrarGoles: !!f,
                              hora: p.hora,
                              cancha: p.cancha_numero,
                              jugado: !!fichaOk,
                              esAmistoso: p.cuenta_estadisticas === false,
                            });
                          })}

                          {/* Equipos que descansan en esta jornada */}
                          {descansan.map(eq => (
                            <div key={`descansa-${eq.id}`} style={{ padding:"8px 10px", background:"#f9fafb", borderRadius:9, border:"1px dashed #d1d5db", display:"flex", alignItems:"center", gap:10 }}>
                              <span style={{ fontSize:22, lineHeight:1, flexShrink:0 }}>😴</span>
                              <JerseySVG
                                diseno={eq.diseno_camiseta||"solido"}
                                color1={eq.color_playera||"#999"}
                                color2={eq.color_camiseta_2||"#fff"}
                                escudoUrl={eq.escudo_url||null}
                                size={30}
                              />
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:12.5, fontWeight:800, color:"var(--text)", lineHeight:1.15, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{eq.nombre}</div>
                                <div style={{ fontSize:10.5, color:"var(--text-muted)", marginTop:1 }}>Descansa esta jornada</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()
          )}
          {seccion==="eliminatoria"&&(() => {
            // Tab dedicado al esquema tipo árbol del bracket. Aparece sólo
            // cuando ya hay partidos de bracket generados (ver `tabs`).
            const getEquipo = id => equipos.find(e => e.id === id);
            const hayLiguilla = liguillaPartidos.cuartos.length > 0;
            const hayCopa = copaPartidos.cuartos.length > 0;
            return (
              <>
                <BracketTree
                  titulo="Liguilla" emoji="🏆"
                  partidos={liguillaPartidos}
                  colors={["#4f8f2f", "#3b82f6", "#f59e0b"]}
                  getEquipo={getEquipo}
                />
                <BracketTree
                  titulo="Copa" emoji="🥈"
                  partidos={copaPartidos}
                  colors={["#b45309", "#7c3aed", "#dc2626"]}
                  getEquipo={getEquipo}
                  topGap={hayLiguilla}
                />
                {!hayLiguilla && !hayCopa && (
                  <EmptyState icon="🎯" txt="Aún no se generó el bracket"/>
                )}
              </>
            );
          })()}
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
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
              {equipos.map(eq=>{const st=clasificacion.find(c=>c.equipo.id===eq.id);return(
                <div key={eq.id} style={{ background:"white",borderRadius:"var(--radius-md)",padding:"10px 8px",textAlign:"center",boxShadow:"var(--shadow-sm)",border:"1px solid var(--border)",borderTop:`3px solid ${eq.color_playera||"var(--green)"}` }}>
                  <div style={{ display:"flex",justifyContent:"center",marginBottom:6 }}>
                    {eq.escudo_url
                      ? <img src={eq.escudo_url} loading="lazy" style={{ width:38,height:38,borderRadius:8,objectFit:"cover" }} alt=""/>
                      : <div style={{ width:38,height:38,borderRadius:8,background:eq.color_playera||"var(--green)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:800,color:"white" }}>{eq.nombre[0]}</div>}
                  </div>
                  <div style={{ fontWeight:700,fontSize:12,marginBottom:6,lineHeight:1.2,wordBreak:"break-word" }}>{eq.nombre}</div>
                  {st&&<div style={{ display:"flex",justifyContent:"center",gap:10 }}>
                    {[[st.pts,"pts","var(--green)"],[st.g,"V","#16a34a"],[st.d,"D","#dc2626"]].map(([n,l,c])=>(
                      <div key={l} style={{ textAlign:"center" }}>
                        <div style={{ fontWeight:800,color:c,fontSize:13,lineHeight:1 }}>{n}</div>
                        <div style={{ fontSize:9,color:"var(--text-muted)",marginTop:1,textTransform:"uppercase",letterSpacing:0.3 }}>{l}</div>
                      </div>
                    ))}
                  </div>}
                </div>
              );})}
            </div>
          )}
          {seccion==="ofensiva"&&<TablaEspecial titulo="⚔️ Mejor ofensiva" datos={[...clasificacion].sort((a,b)=>(b.pj>0?b.gf/b.pj:0)-(a.pj>0?a.gf/a.pj:0))} campo="gf" labelCorto="GF" labelLargo="Goles a favor"/>}
          {seccion==="defensiva"&&<TablaEspecial titulo="🛡️ Mejor defensiva" datos={[...clasificacion].sort((a,b)=>(a.pj>0?a.gc/a.pj:999)-(b.pj>0?b.gc/b.pj:999))} campo="gc" labelCorto="GC" labelLargo="Goles en contra"/>}
          {seccion==="fairplay"&&<TablaEspecial titulo="🤝 Fair play" datos={[...clasificacion].sort((a,b)=>(a.pj>0?a.faltas/a.pj:999)-(b.pj>0?b.faltas/b.pj:999))} campo="faltas" labelCorto="FC" labelLargo="Faltas cometidas"/>}
          {/* Banner de patrocinadores al pie de cada sección — excepto goleadores,
              donde compite visualmente con la lista de rankings. */}
          {seccion!=="goleadores" && <BannerPatrocinadores items={patrocinadores} />}
        </>}
    </div>
  );
}

function TablaEspecial({ titulo, datos, campo, labelCorto, labelLargo }) {
  if (!datos.length) return <EmptyState icon="📊" txt="No hay datos suficientes aún"/>;
  return (
    <div style={{ background:"white",borderRadius:"var(--radius-md)",overflow:"hidden",boxShadow:"var(--shadow-md)" }}>
      <div style={{ padding:"10px 12px",borderBottom:"1px solid var(--border)" }}>
        <div style={{ fontWeight:700,fontSize:13 }}>{titulo}</div>
        <div style={{ fontSize:10,color:"var(--text-muted)",marginTop:2 }}>
          <b>{labelCorto}</b>: {labelLargo} · <b>PROM</b>: promedio por partido
        </div>
      </div>
      <table className="ifutbol-table">
        <thead><tr>
          <th>#</th>
          <th style={{ textAlign:"left" }}>Equipo</th>
          <th>PJ</th>
          <th>{labelCorto}</th>
          <th>PROM</th>
        </tr></thead>
        <tbody>{datos.map((r,i)=>{const val=r[campo]||0;const prom=r.pj>0?(val/r.pj).toFixed(1):"0.0";return(
          <tr key={r.equipo.id}>
            <td style={{ textAlign:"center" }}><span className="rank-badge" style={{ background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#f3f4f6",color:i<3?"#111":"#888" }}>{i+1}</span></td>
            <td><div style={{ display:"flex",alignItems:"center",gap:6 }}>
              {r.equipo.escudo_url
                ? <img src={r.equipo.escudo_url} loading="lazy" style={{ width:18,height:18,borderRadius:4,objectFit:"cover",flexShrink:0 }} alt=""/>
                : <div style={{ width:9,height:9,borderRadius:"50%",background:r.equipo.color_playera||"#999",flexShrink:0 }}/>}
              <span style={{ fontWeight:600,fontSize:11,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{r.equipo.nombre}</span>
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
// Logo "G" multicolor de Google para el botón de OAuth.
const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink:0 }}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

// Botón "Continuar con Google" + separador "o". Arranca el flujo OAuth PKCE
// (redirige el navegador); el retorno se procesa en el useEffect de App.
// dividerPos: "top" (separador arriba del botón) o "bottom" (debajo).
function BotonGoogle({ label = "Continuar con Google", dividerPos = "top" }) {
  const Separador = () => (
    <div style={{ display:"flex",alignItems:"center",gap:10,margin:"2px 0 14px" }}>
      <div style={{ flex:1,height:1,background:"var(--border)" }}/>
      <span style={{ fontSize:12,color:"var(--text-muted)" }}>o</span>
      <div style={{ flex:1,height:1,background:"var(--border)" }}/>
    </div>
  );
  return (
    <>
      {dividerPos === "top" && <Separador/>}
      <button type="button" onClick={()=>iniciarLoginOAuth("google")}
        style={{ width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          padding:"11px 16px",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",
          background:"#fff",color:"#3c4043",fontWeight:600,fontSize:14,cursor:"pointer",marginBottom:14 }}>
        <GoogleG/>{label}
      </button>
      {dividerPos === "bottom" && <Separador/>}
    </>
  );
}

function LoginModal({ onClose, onLogin, onRegister, onForgotPassword }) {
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
        <div style={{ textAlign:"right",marginTop:6,marginBottom:10 }}>
          <span style={{ ...m.link,fontSize:13 }} onClick={onForgotPassword}>¿Olvidaste tu contraseña?</span>
        </div>
        <button className="btn btn-premium" style={{ width:"100%",marginBottom:14 }} onClick={handle} disabled={loading}>{loading?"Entrando...":"Entrar →"}</button>
        <BotonGoogle/>
        <p style={{ textAlign:"center",fontSize:13,color:"var(--text-muted)" }}>¿No tienes cuenta? <span style={m.link} onClick={onRegister}>Regístrate como jugador</span></p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// FORGOT PASSWORD MODAL — pide email y manda enlace de recuperación
// ─────────────────────────────────────────────────────────────────
function ForgotPasswordModal({ onClose, onBackToLogin }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handle = async () => {
    if (!email) return setError("Ingresa tu correo electrónico");
    setLoading(true); setError("");
    const data = await api("/auth/v1/recover", {
      method: "POST",
      body: JSON.stringify({
        email,
        // Supabase agrega los tokens al fragment de esta URL al hacer clic
        redirect_to: `${window.location.origin}/`,
      }),
    });
    setLoading(false);
    // Supabase responde 200 sin importar si el correo existe (anti-enumeración).
    // Tratamos cualquier respuesta sin error explícito como éxito.
    if (data.error || data.error_description) {
      setError(data.error_description || data.error || "No pudimos enviar el correo. Intenta más tarde.");
      return;
    }
    setSuccess(true);
  };

  if (success) return (
    <div className="ifutbol-overlay" onClick={onClose}>
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:380,textAlign:"center" }}>
        <div style={{ fontSize:52,marginBottom:14 }}>📬</div>
        <h3 style={{ fontSize:22,fontWeight:800,marginBottom:8 }}>Revisa tu correo</h3>
        <p style={{ color:"var(--text-sub)",marginBottom:24,lineHeight:1.5 }}>
          Si <b>{email}</b> tiene una cuenta en iFutbol, te enviamos un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.
        </p>
        <button className="btn btn-premium" style={{ width:"100%" }} onClick={onClose}>Entendido →</button>
      </div>
    </div>
  );

  return (
    <div className="ifutbol-overlay" onClick={onClose}>
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:400 }}>
        <ModalHeader title="Recuperar contraseña" subtitle="Te enviaremos un enlace por correo" onClose={onClose}/>
        {error&&<div style={m.err}>⚠️ {error}</div>}
        <Field label="Correo electrónico">
          <input className="form-input" type="email" placeholder="tu@correo.com" value={email}
            onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} autoFocus/>
        </Field>
        <div style={{ height:8 }}/>
        <button className="btn btn-premium" style={{ width:"100%",marginBottom:14 }} onClick={handle} disabled={loading}>
          {loading?"Enviando...":"Enviar enlace de recuperación →"}
        </button>
        <p style={{ textAlign:"center",fontSize:13,color:"var(--text-muted)" }}>
          ¿Te acordaste? <span style={m.link} onClick={onBackToLogin}>Volver a iniciar sesión</span>
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// RESET PASSWORD MODAL — pide nueva contraseña usando token de recovery
// ─────────────────────────────────────────────────────────────────
function ResetPasswordModal({ accessToken, onClose, onSuccess }) {
  const [form, setForm] = useState({ password:"", confirm:"" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handle = async () => {
    if (!form.password) return setError("Ingresa una nueva contraseña");
    if (form.password !== form.confirm) return setError("Las contraseñas no coinciden");
    const pwdErr = validarPassword(form.password);
    if (pwdErr) return setError(pwdErr);
    setLoading(true); setError("");
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: form.password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      const msg = (data.msg || data.error_description || data.error || "").toLowerCase();
      if (msg.includes("password")) {
        return setError("La contraseña no cumple los requisitos. Revisa los criterios e inténtalo de nuevo.");
      }
      if (msg.includes("expired") || msg.includes("invalid")) {
        return setError("El enlace expiró o no es válido. Solicita uno nuevo desde 'Olvidaste tu contraseña'.");
      }
      return setError(data.msg || data.error_description || "No pudimos cambiar tu contraseña. Intenta más tarde.");
    }
    onSuccess();
  };

  return (
    <div className="ifutbol-overlay">
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:420 }}>
        <ModalHeader title="Nueva contraseña" subtitle="Elige una contraseña segura para tu cuenta" onClose={onClose}/>
        {error&&<div style={m.err}>⚠️ {error}</div>}
        <Field label="Nueva contraseña *">
          <input className="form-input" type="password" placeholder="Mín. 8, con mayús, minús y número"
            value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>
        </Field>
        <Field label="Confirmar contraseña *">
          <input className="form-input" type="password" placeholder="Repite tu contraseña"
            value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})}
            onKeyDown={e=>e.key==="Enter"&&handle()}/>
        </Field>
        <div style={{ height:8 }}/>
        <button className="btn btn-premium" style={{ width:"100%" }} onClick={handle} disabled={loading}>
          {loading?"Guardando...":"Cambiar contraseña →"}
        </button>
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
    if (!form.nombre_completo||!form.email||!form.password) return setError("Completa los campos obligatorios");
    if (form.password!==form.confirm) return setError("Las contraseñas no coinciden");
    const pwdErr = validarPassword(form.password);
    if (pwdErr) return setError(pwdErr);
    setLoading(true); setError("");
    // Guardamos los datos del jugador en user_metadata. Si la confirmación de
    // correo está activa el signup NO devuelve token (no se crea la fila en
    // jugadores ahora mismo); el primer login post-confirmación leerá esta
    // metadata y creará el perfil automáticamente.
    const playerSignup = {
      nombre_completo: form.nombre_completo,
      fecha_nacimiento: form.fecha_nacimiento || null,
      domicilio: form.domicilio,
      posicion_preferida: form.posicion_preferida,
      numero_preferido: form.numero_camiseta ? +form.numero_camiseta : null,
      nombre_camiseta_preferido: form.nombre_camiseta?.trim() ? form.nombre_camiseta.trim().toUpperCase() : null,
    };
    const data = await api("/auth/v1/signup",{
      method:"POST",
      body:JSON.stringify({ email:form.email, password:form.password, data:{ player_signup: playerSignup } })
    });
    if (data.user||data.id) {
      const token = data.session?.access_token||data.access_token;
      const userId = data.user?.id||data.id;
      if (token) {
        const jugRes = await fetch(`${SUPABASE_URL}/rest/v1/jugadores`,{method:"POST",headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${token}`,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({ user_id:userId, ...playerSignup })});
        const jugData = await jugRes.json();
        if (!jugRes.ok) {
          setError(jugData?.message || "No se pudo crear el perfil de jugador");
          setLoading(false);
          return;
        }
        const afiliado = Array.isArray(jugData)?jugData[0]?.numero_afiliado:jugData?.numero_afiliado;
        if (!afiliado) {
          setError("No se generó el número de afiliado. Intenta de nuevo.");
          setLoading(false);
          return;
        }
        setSuccess(afiliado);
      } else {
        // Confirm email activo: el perfil se creará al primer login.
        setSuccess("pending_confirmation");
      }
    } else { setError(data.msg||data.error_description||"Error al registrarse"); }
    setLoading(false);
  };

  if (success === "pending_confirmation") return (
    <div className="ifutbol-overlay" onClick={onClose}>
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:380,textAlign:"center" }}>
        <div style={{ fontSize:52,marginBottom:14 }}>📧</div>
        <h3 style={{ fontSize:22,fontWeight:800,marginBottom:8 }}>Revisa tu correo</h3>
        <p style={{ color:"var(--text-sub)",marginBottom:16,lineHeight:1.5 }}>
          Te enviamos un enlace de confirmación a <b>{form.email}</b>. Confírmalo y vuelve a iniciar sesión.
        </p>
        <p style={{ fontSize:13,color:"var(--text-sub)",marginBottom:22,lineHeight:1.45 }}>
          La primera vez que entres te mostraremos tu <b>número de afiliado</b>.
        </p>
        <button className="btn btn-premium" style={{ width:"100%" }} onClick={onLogin}>Ir a iniciar sesión →</button>
      </div>
    </div>
  );

  if (success) return (
    <div className="ifutbol-overlay" onClick={onClose}>
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:380,textAlign:"center" }}>
        <div style={{ fontSize:52,marginBottom:14 }}>🎉</div>
        <h3 style={{ fontSize:22,fontWeight:800,marginBottom:8 }}>¡Registro exitoso!</h3>
        <p style={{ color:"var(--text-sub)",marginBottom:20 }}>Tu cuenta ha sido creada correctamente</p>
        <div style={{ background:"var(--green-light)",border:"1px solid #c3e6a3",borderRadius:12,padding:"16px 24px",marginBottom:16 }}>
          <div style={{ fontSize:11,color:"var(--green)",fontWeight:700,marginBottom:4 }}>TU NÚMERO DE AFILIADO</div>
          <div style={{ fontSize:28,fontWeight:900,color:"var(--green)",letterSpacing:2 }}>{success}</div>
        </div>
        <p style={{ fontSize:12.5,color:"var(--text-sub)",marginBottom:20,lineHeight:1.45 }}>
          Pásale este código al <b>capitán</b> del equipo donde quieras jugar. Solo él podrá inscribirte.
        </p>
        <button className="btn btn-premium" style={{ width:"100%" }} onClick={onClose}>Ir al inicio →</button>
      </div>
    </div>
  );

  return (
    <div className="ifutbol-overlay" onClick={onClose}>
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()}>
        <ModalHeader title="Crear cuenta de jugador" subtitle="Tu número de afiliado se genera automáticamente" onClose={onClose}/>
        {error&&<div style={m.err}>⚠️ {error}</div>}
        <BotonGoogle label="Registrarse con Google" dividerPos="bottom"/>
        <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:18,background:"var(--bg)",borderRadius:12,padding:14 }}>
          <div style={{ position:"relative", width:60, height:60, flexShrink:0 }}>
            <div style={{ width:60,height:60,borderRadius:"50%",background:"var(--border)",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26 }}>
              {fotoPreview?<img src={fotoPreview} style={{ width:"100%",height:"100%",objectFit:"cover" }} alt=""/>:"📷"}
            </div>
            {fotoPreview && (
              <span title="Foto cargada"
                style={{ position:"absolute", bottom:-2, right:-2, width:20, height:20, borderRadius:"50%", background:"#16a34a", color:"#fff", fontSize:11, fontWeight:900, display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid #fff", boxShadow:"0 2px 6px rgba(0,0,0,0.18)" }}>
                ✓
              </span>
            )}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
              <label style={{ display:"inline-block",background:"white",border:"1px solid var(--border)",borderRadius:8,padding:"6px 12px",color:"var(--text-sub)",fontSize:13,cursor:"pointer" }}>
                {fotoPreview ? "Cambiar foto" : "Subir foto de rostro *"}
                <input type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (typeof fotoPreview === "string" && fotoPreview.startsWith("blob:")) URL.revokeObjectURL(fotoPreview);
                  setFotoPreview(URL.createObjectURL(f));
                  showToast && showToast(`Foto "${f.name}" cargada ✓`);
                }}/>
              </label>
              {fotoPreview && (
                <button type="button"
                  style={{ background:"transparent",border:"1px solid #fecaca",color:"#dc2626",borderRadius:8,padding:"5px 10px",fontSize:11.5,fontWeight:600,cursor:"pointer" }}
                  onClick={()=>{
                    if (typeof fotoPreview === "string" && fotoPreview.startsWith("blob:")) URL.revokeObjectURL(fotoPreview);
                    setFotoPreview(null);
                  }}>
                  ✕ Quitar
                </button>
              )}
            </div>
            {fotoPreview ? (
              <p style={{ fontSize:11,color:"#16a34a",margin:"4px 0 0",fontWeight:600 }}>✓ Foto lista para enviar.</p>
            ) : (
              <p style={{ fontSize:11,color:"var(--text-muted)",margin:"4px 0 0" }}>Foto de cédula, perfil y estadísticas</p>
            )}
          </div>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:"0 14px" }}>
          <div style={{ gridColumn:"1/-1",marginBottom:14 }}><Field label="Nombre completo *"><input className="form-input" type="text" placeholder="Juan Pérez" value={form.nombre_completo} onChange={e=>setForm({...form,nombre_completo:toTitleCase(e.target.value)})}/></Field></div>
          <div style={{ marginBottom:14,minWidth:0 }}><Field label="Fecha de nacimiento"><input className="form-input" type="date" value={form.fecha_nacimiento} onChange={e=>setForm({...form,fecha_nacimiento:e.target.value})}/></Field></div>
          <div style={{ marginBottom:14,minWidth:0 }}><Field label="Posición preferida"><select className="form-input" value={form.posicion_preferida} onChange={e=>setForm({...form,posicion_preferida:e.target.value})}>{POSITIONS.map(p=><option key={p}>{p}</option>)}</select></Field></div>
          <div style={{ marginBottom:14,minWidth:0 }}><Field label="Número preferido (1-99)"><input className="form-input" type="number" min="1" max="99" placeholder="ej. 10" value={form.numero_camiseta} onChange={e=>setForm({...form,numero_camiseta:e.target.value})}/></Field></div>
          <div style={{ marginBottom:14,minWidth:0 }}><Field label="Nombre en camiseta"><input className="form-input" type="text" placeholder="GARCÍA" value={form.nombre_camiseta} onChange={e=>setForm({...form,nombre_camiseta:e.target.value.toUpperCase()})}/></Field></div>
          <div style={{ gridColumn:"1/-1",marginBottom:14 }}><Field label="Domicilio"><input className="form-input" type="text" placeholder="Calle, Ciudad" value={form.domicilio} onChange={e=>setForm({...form,domicilio:e.target.value})}/></Field></div>
          <div style={{ gridColumn:"1/-1",marginBottom:14 }}><Field label="Correo electrónico *"><input className="form-input" type="email" placeholder="tu@correo.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field></div>
          <div style={{ marginBottom:14,minWidth:0 }}><Field label="Contraseña *"><input className="form-input" type="password" placeholder="Mín. 8, con mayús, minús y número" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></Field></div>
          <div style={{ marginBottom:20,minWidth:0 }}><Field label="Confirmar contraseña *"><input className="form-input" type="password" placeholder="Repite tu contraseña" value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})}/></Field></div>
        </div>
        <button className="btn btn-premium" style={{ width:"100%",marginBottom:14 }} onClick={handle} disabled={loading}>{loading?"Creando cuenta...":"Crear cuenta de jugador →"}</button>
        <p style={{ textAlign:"center",fontSize:13,color:"var(--text-muted)" }}>¿Ya tienes cuenta? <span style={m.link} onClick={onLogin}>Inicia sesión</span></p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// WELCOME AFILIADO MODAL
// Aparece la primera vez que el jugador entra al dashboard tras crear su
// perfil (sea por signup inline o por auto-creación desde metadata).
// ─────────────────────────────────────────────────────────────────
function WelcomeAfiliadoModal({ afiliado, onClose }) {
  return (
    <div className="ifutbol-overlay" onClick={onClose}>
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:380, textAlign:"center" }}>
        <div style={{ fontSize:52, marginBottom:14 }}>🎉</div>
        <h3 style={{ fontSize:22, fontWeight:800, marginBottom:8 }}>¡Bienvenido a iFútbol!</h3>
        <p style={{ color:"var(--text-sub)", marginBottom:18, lineHeight:1.45 }}>Tu cuenta de jugador está lista. Este es tu número de afiliado:</p>
        <div style={{ background:"var(--green-light)", border:"1px solid #c3e6a3", borderRadius:12, padding:"20px 24px", marginBottom:18 }}>
          <div style={{ fontSize:11, color:"var(--green)", fontWeight:700, marginBottom:6, letterSpacing:1 }}>TU NÚMERO DE AFILIADO</div>
          <div style={{ fontSize:30, fontWeight:900, color:"var(--green)", letterSpacing:2 }}>{afiliado}</div>
        </div>
        <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"12px 14px", marginBottom:22, textAlign:"left" }}>
          <div style={{ fontSize:12.5, fontWeight:700, color:"#92400e", marginBottom:4 }}>📋 Para que te inscriban a un equipo</div>
          <div style={{ fontSize:12.5, color:"#92400e", lineHeight:1.5 }}>
            Pásale este número al <b>capitán</b> del equipo donde quieras jugar. Solo él puede registrarte usando tu afiliado.
          </div>
        </div>
        <button className="btn btn-premium" style={{ width:"100%" }} onClick={onClose}>Entendido →</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// COMPLETAR PERFIL JUGADOR MODAL
// Fallback para sesiones donde el usuario está autenticado pero no tiene
// perfil de jugador NI metadata utilizable (registros viejos, errores RLS,
// etc.). Pide los datos mínimos para crear el perfil y desbloquear la app.
// ─────────────────────────────────────────────────────────────────
function CompletarPerfilJugadorModal({ session, onCancel, onCreated }) {
  const [form, setForm] = useState({
    nombre_completo: "",
    fecha_nacimiento: "",
    posicion_preferida: "Delantero",
    numero_camiseta: "",
    nombre_camiseta: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const token = session?.access_token;
  const userId = session?.user?.id;

  const handle = async () => {
    if (!form.nombre_completo.trim()) return setError("Escribe tu nombre completo");
    setLoading(true); setError("");
    try {
      const payload = {
        user_id: userId,
        nombre_completo: form.nombre_completo.trim(),
        fecha_nacimiento: form.fecha_nacimiento || null,
        posicion_preferida: form.posicion_preferida,
        numero_preferido: form.numero_camiseta ? +form.numero_camiseta : null,
        nombre_camiseta_preferido: form.nombre_camiseta?.trim() ? form.nombre_camiseta.trim().toUpperCase() : null,
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/jugadores`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "No se pudo crear el perfil. Intenta de nuevo.");
        setLoading(false);
        return;
      }
      const jug = Array.isArray(data) ? data[0] : data;
      if (!jug?.numero_afiliado) {
        setError("No se generó el número de afiliado. Intenta de nuevo.");
        setLoading(false);
        return;
      }
      onCreated(jug);
    } catch (e) {
      setError(e.message || "Error inesperado");
      setLoading(false);
    }
  };

  return (
    <div className="ifutbol-overlay">
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:420 }}>
        <div style={{ marginBottom:18 }}>
          <h3 style={{ fontSize:20, fontWeight:800, marginBottom:6 }}>Completa tu perfil</h3>
          <p style={{ fontSize:13, color:"var(--text-sub)", lineHeight:1.45 }}>
            Necesitamos algunos datos para generar tu número de afiliado y permitirte usar la app.
          </p>
        </div>
        {error && <div style={m.err}>⚠️ {error}</div>}
        <div style={{ marginBottom:14 }}>
          <Field label="Nombre completo *">
            <input className="form-input" type="text" placeholder="Juan Pérez"
              value={form.nombre_completo}
              onChange={e=>setForm({...form, nombre_completo: toTitleCase(e.target.value)})}/>
          </Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:"0 14px" }}>
          <div style={{ marginBottom:14, minWidth:0 }}>
            <Field label="Fecha de nacimiento">
              <input className="form-input" type="date"
                value={form.fecha_nacimiento}
                onChange={e=>setForm({...form, fecha_nacimiento: e.target.value})}/>
            </Field>
          </div>
          <div style={{ marginBottom:14, minWidth:0 }}>
            <Field label="Posición preferida">
              <select className="form-input"
                value={form.posicion_preferida}
                onChange={e=>setForm({...form, posicion_preferida: e.target.value})}>
                {POSITIONS.map(p=><option key={p}>{p}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ marginBottom:14, minWidth:0 }}>
            <Field label="Número preferido (1-99)">
              <input className="form-input" type="number" min="1" max="99" placeholder="ej. 10"
                value={form.numero_camiseta}
                onChange={e=>setForm({...form, numero_camiseta: e.target.value})}/>
            </Field>
          </div>
          <div style={{ marginBottom:14, minWidth:0 }}>
            <Field label="Nombre en camiseta">
              <input className="form-input" type="text" placeholder="GARCÍA"
                value={form.nombre_camiseta}
                onChange={e=>setForm({...form, nombre_camiseta: e.target.value.toUpperCase()})}/>
            </Field>
          </div>
        </div>
        <button className="btn btn-premium" style={{ width:"100%", marginBottom:10 }} onClick={handle} disabled={loading}>
          {loading ? "Creando perfil..." : "Crear mi perfil →"}
        </button>
        <button className="btn btn-ghost" style={{ width:"100%" }} onClick={onCancel}>
          Cerrar sesión
        </button>
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
    const pwdErr = validarPassword(form.password);
    if (pwdErr) return setError(pwdErr);
    setLoading(true); setError("");

    // signUp normal: Supabase envía el correo de confirmación. Guardamos
    // nombre_completo y tipo_rol en raw_user_meta_data; un trigger en la BD
    // creará la solicitud_registro automáticamente cuando el usuario confirme
    // el correo. Así el admin solo ve solicitudes de correos verificados.
    const data = await api("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({
        email: form.email,
        password: form.password,
        data: {
          nombre_completo: form.nombre_completo,
          tipo_rol: form.tipo,
        },
      }),
    });

    if (data.user || data.id) {
      setSuccess(true);
    } else {
      const msg = (data.msg || data.error_description || data.error || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered")) {
        setError("Ya existe una cuenta con ese correo. Inicia sesión o usa otro.");
      } else if (msg.includes("password")) {
        setError("La contraseña no cumple los requisitos: mínimo 8 caracteres, con mayúscula, minúscula y número.");
      } else if (msg.includes("email") && (msg.includes("invalid") || msg.includes("not valid"))) {
        setError("El correo no tiene un formato válido.");
      } else {
        setError("No pudimos registrarte en este momento. Verifica el correo o inténtalo más tarde.");
      }
    }
    setLoading(false);
  };

  if (success) {
    const esArbitro = form.tipo === "referee";
    const rolLabel = esArbitro ? "árbitro" : "administrador de unidad";
    return (
      <div className="ifutbol-overlay" onClick={onClose}>
        <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:440 }}>
          <div style={{ textAlign:"center", marginBottom:18 }}>
            <div style={{ fontSize:52, marginBottom:10 }}>📬</div>
            <h3 style={{ fontSize:22, fontWeight:800, marginBottom:6 }}>Confirma tu correo para continuar</h3>
            <p style={{ color:"var(--text-sub)", fontSize:13.5, lineHeight:1.5, margin:0 }}>
              Tu cuenta de <b>{rolLabel}</b> está casi lista. Aún no puedes iniciar sesión: primero confirma tu correo para que tu solicitud quede activa.
            </p>
          </div>

          {/* Pasos del flujo: deja claro por qué importa confirmar el correo */}
          <div style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:12, padding:"14px 14px 6px", marginBottom:16 }}>
            <Step n={1} title="Abre el correo que te enviamos" desc={<>Va dirigido a <b>{form.email}</b>. Si no lo ves, revisa la carpeta de spam o promociones.</>} />
            <Step n={2} title="Haz click en el enlace de confirmación" desc="Esto verifica que el correo es tuyo. Solo cuando lo confirmes, tu solicitud entrará en revisión." />
            <Step n={3} title="Espera la aprobación de tu solicitud" desc={esArbitro
              ? "Una vez aprobada, tendrás acceso a la unidad y a los torneos en los que vas a arbitrar."
              : "Una vez aprobada, tendrás acceso a tu unidad deportiva."} />
            <Step n={4} title="Inicia sesión" desc="Cuando tu solicitud sea aprobada, podrás entrar con el correo y la contraseña que registraste." last />
          </div>

          <p style={{ fontSize:12, color:"#92400e", background:"#fffbeb", border:"1px solid #fde68a", padding:"8px 12px", borderRadius:8, marginBottom:16, lineHeight:1.45 }}>
            ⚠️ Si no confirmas el correo, tu solicitud <b>no se procesará</b>.
          </p>

          <button className="btn btn-premium" style={{ width:"100%" }} onClick={onClose}>Entendido →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ifutbol-overlay" onClick={onClose}>
      <div className="ifutbol-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:420 }}>
        <ModalHeader title="Solicitud de registro" subtitle="Tu solicitud quedará pendiente de aprobación" onClose={onClose}/>
        {error&&<div style={m.err}>⚠️ {error}</div>}
        <Field label="Nombre completo *"><input className="form-input" type="text" placeholder="Juan Pérez" value={form.nombre_completo} onChange={e=>setForm({...form,nombre_completo:toTitleCase(e.target.value)})}/></Field>
        <div style={{ marginBottom:16 }}>
          <label className="form-label">Me registro como *</label>
          <div style={{ display:"flex",gap:10 }}>
            {[["referee","🟡 Árbitro"],["league_admin","🏟️ Admin de Liga"]].map(([val,lbl])=>(
              <button key={val} onClick={()=>setForm({...form,tipo:val})} style={{ flex:1,padding:"12px",borderRadius:"var(--radius-md)",border:`2px solid ${form.tipo===val?"var(--green)":"var(--border)"}`,background:form.tipo===val?"var(--green-light)":"white",color:form.tipo===val?"var(--green)":"var(--text-sub)",fontWeight:700,cursor:"pointer",fontSize:14,transition:"all 0.2s",fontFamily:"'DM Sans',sans-serif" }}>{lbl}</button>
            ))}
          </div>
        </div>
        <Field label="Correo electrónico *"><input className="form-input" type="email" placeholder="tu@correo.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field>
        <div style={{ marginBottom:24 }}><Field label="Contraseña *"><input className="form-input" type="password" placeholder="Mín. 8, con mayús, minús y número" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></Field></div>
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

// Paso numerado para flujos guiados (modal post-registro, etc.)
function Step({ n, title, desc, last = false }) {
  return (
    <div style={{ display:"flex", gap:12, paddingBottom: last ? 14 : 14, position:"relative" }}>
      <div style={{ flexShrink:0, width:28, height:28, borderRadius:"50%", background:"var(--green)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:13, boxShadow:"0 2px 6px rgba(79,143,47,0.35)" }}>
        {n}
      </div>
      <div style={{ flex:1, minWidth:0, paddingTop:2 }}>
        <div style={{ fontSize:13.5, fontWeight:700, color:"var(--text)", marginBottom:3 }}>{title}</div>
        <div style={{ fontSize:12.5, color:"var(--text-sub)", lineHeight:1.45 }}>{desc}</div>
      </div>
    </div>
  );
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

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────
const s = {
  // padding-top: 56 deja espacio para la topbar fija (su altura es 56).
  root: { display:"flex",flexDirection:"column",minHeight:"100vh",paddingTop:56,background:"var(--bg)" },
  // position:fixed para que la topbar quede anclada al hacer scroll. Respeta el marco de la app
  // (max-width var(--app-max-width)) centrandose con left/right:0 y margin:auto.
  topbar: { display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 12px",height:56,background:"var(--green)",borderBottom:"1px solid var(--green-dark)",position:"fixed",top:0,left:0,right:0,maxWidth:"var(--app-max-width, 480px)",margin:"0 auto",zIndex:200,boxShadow:"0 2px 12px rgba(0,0,0,0.18)" },
  topLeft: { display:"flex",alignItems:"center",gap:10 },
  topRight: { display:"flex",alignItems:"center",gap:8 },
  brand: { display:"flex",alignItems:"center",gap:10,cursor:"pointer" },
  pill: { padding:"5px 12px",borderRadius:"var(--radius-full)",fontSize:12,fontWeight:700 },
  // Overlay del drawer: cubre todo el viewport (no solo el marco) para que clicks fuera del root también cierren.
  overlay: { position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:299,backdropFilter:"blur(2px)" },
  // Drawer: position fixed para no scroll-jacking. 85% del ancho del viewport, anclado al borde izquierdo del marco
  // (en PC con marco visible queda al borde izquierdo del viewport — la vista de PC se ignora por diseño).
  sidebar: { position:"fixed",top:0,left:0,bottom:0,width:"72%",maxWidth:290,background:"white",zIndex:300,display:"flex",flexDirection:"column",transition:"transform 0.25s ease",boxShadow:"4px 0 24px rgba(0,0,0,0.18)" },
  drawerHeader: { padding:"16px 14px 14px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:12,background:"linear-gradient(135deg, rgba(127,191,77,0.10), rgba(79,143,47,0.05))" },
  sbFooter: { padding:"14px 16px",borderTop:"1px solid var(--border)",display:"flex",alignItems:"center",gap:12 },
  main: { flex:1,padding:"16px 14px",width:"100%" },
};

const m = {
  closeBtn: { background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-sub)",flexShrink:0 },
  err: { background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"10px 14px",color:"#dc2626",fontSize:13,marginBottom:16 },
  link: { color:"var(--green)",cursor:"pointer",fontWeight:700 },
};

const css = `
  .ham-btn{background:transparent;border:none;cursor:pointer;padding:0;border-radius:8px;font-size:22px;color:rgba(255,255,255,0.95);display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;transition:background 0.15s;}
  .ham-btn:hover,.ham-btn:active{background:rgba(255,255,255,0.18);}
  .clickable{transition:opacity 0.15s;cursor:pointer;}
  .clickable:hover{opacity:0.8;}
  .sb-btn{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:11px 14px;border-radius:10px;border:none;background:transparent;color:var(--text);font-size:14px;font-weight:600;cursor:pointer;text-align:left;transition:all 0.15s;font-family:'DM Sans',sans-serif;}
  .sb-btn:hover,.sb-btn:active{background:var(--green-light);color:var(--green);}
  .sb-btn.danger:hover,.sb-btn.danger:active{background:#fef2f2;color:#dc2626;}
  .nav-item{display:flex;align-items:center;gap:12px;min-height:44px;padding:11px 14px;border-radius:10px;cursor:pointer;color:var(--text-sub);font-size:14px;font-weight:500;transition:all 0.15s;font-family:'DM Sans',sans-serif;}
  .nav-item:hover,.nav-item:active{background:var(--green-light);color:var(--green);}
  .nav-item-active{background:var(--green-light)!important;color:var(--green)!important;font-weight:700!important;}
  .ud-card{background:white;border-radius:var(--radius-md);padding:14px 14px;box-shadow:var(--shadow-md);border:1px solid var(--border);cursor:pointer;transition:box-shadow 0.18s,background 0.15s,border-color 0.18s;}
  .ud-card:hover{box-shadow:var(--shadow-lg);border-color:var(--green-accent);}
  .ud-card:active{background:#f9fafb;}
  .torneo-btn{background:white;border:1.5px solid var(--border);border-radius:var(--radius-full);padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;color:var(--text-sub);transition:all 0.2s;font-family:'DM Sans',sans-serif;}
  .torneo-btn:hover{border-color:var(--green);color:var(--green);}
  .torneo-btn.active{background:var(--green-light);border-color:var(--green);color:var(--green);}
  @media(max-width:640px){.hide-mobile{display:none!important;}}
`;