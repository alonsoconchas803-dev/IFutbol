// Flujo OAuth con PKCE contra los endpoints REST de Supabase (GoTrue), sin el
// SDK de supabase-js. Lo usamos para "Continuar con Google".
//
// Secuencia:
//  1. iniciarLoginOAuth() genera un code_verifier aleatorio, calcula su
//     code_challenge (S256), guarda el verifier en localStorage y redirige a
//     /auth/v1/authorize.
//  2. Google devuelve al usuario a la app con ?code=... en la URL.
//  3. intercambiarCodigoOAuth() canjea ese code + el verifier por una sesión en
//     /auth/v1/token?grant_type=pkce.
//
// El verifier vive solo en el navegador que inició el flujo: por eso PKCE exige
// el MISMO dispositivo/navegador (y por eso un preescaneo de un bot no puede
// completar el login).

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

const STORAGE_KEY = "ifutbol_pkce_verifier";

// Codifica un ArrayBuffer/Uint8Array a base64url (sin padding), como exige PKCE.
const base64url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// code_verifier: 64 bytes aleatorios → ~86 chars (dentro del rango 43-128 de RFC 7636).
const generarVerifier = () => base64url(crypto.getRandomValues(new Uint8Array(64)));

// code_challenge = base64url( SHA-256( verifier ) ).
const generarChallenge = async (verifier) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(digest);
};

// Arranca el login: redirige el navegador a Supabase, que a su vez va a Google.
export const iniciarLoginOAuth = async (provider = "google") => {
  const verifier = generarVerifier();
  const challenge = await generarChallenge(verifier);
  localStorage.setItem(STORAGE_KEY, verifier);
  const redirectTo = `${window.location.origin}/`;
  const url =
    `${SUPABASE_URL}/auth/v1/authorize?provider=${encodeURIComponent(provider)}` +
    `&code_challenge=${challenge}&code_challenge_method=s256` +
    `&redirect_to=${encodeURIComponent(redirectTo)}`;
  window.location.href = url;
};

// Procesa el retorno de OAuth. Devuelve:
//   - null            → no hay ?code en la URL (no es un callback)
//   - { ok:true, session }  → sesión lista (mismo shape que el login por password)
//   - { ok:false, error }   → falló el canje
export const intercambiarCodigoOAuth = async () => {
  const code = new URLSearchParams(window.location.search).get("code");
  if (!code) return null;

  const verifier = localStorage.getItem(STORAGE_KEY);
  if (!verifier) {
    return { ok: false, error: "No encontramos el verificador en este navegador. Vuelve a intentar el inicio de sesión." };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    const data = await res.json();
    localStorage.removeItem(STORAGE_KEY);
    if (!res.ok || !data.access_token) {
      return { ok: false, error: data.error_description || data.msg || data.error || "No se pudo completar el inicio de sesión con Google." };
    }
    return { ok: true, session: data };
  } catch (e) {
    localStorage.removeItem(STORAGE_KEY);
    return { ok: false, error: e.message || "Error de red al iniciar sesión." };
  }
};
