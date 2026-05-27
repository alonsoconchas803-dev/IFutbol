// Helpers de red y utilidades para el módulo de sanciones disciplinarias.
// Se mantienen aquí (no dentro del componente PanelSanciones) para que el
// componente pueda exportarse solo como default y mantener Fast Refresh.

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

const _fetch = async (path, token, opts = {}) => {
  const method = (opts.method || "GET").toUpperCase();
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(method !== "GET" ? { Prefer: "return=representation" } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
};

export async function cargarSancionesDelPartido(token, partidoId) {
  if (!partidoId) return [];
  return await _fetch(
    `/sanciones?partido_origen_id=eq.${partidoId}&select=*,jugadores(nombre_completo,numero_afiliado)&order=created_at`,
    token,
  );
}

export async function cargarBloqueosActivos(token, equipoIds, partidoActualId) {
  if (!equipoIds?.length) return {};
  const lista = await _fetch(
    `/sanciones?equipo_id=in.(${equipoIds.join(",")})&partidos_pendientes=gt.0&select=jugador_id,partidos_pendientes,partido_origen_id`,
    token,
  );
  const m = {};
  for (const s of (lista || [])) {
    if (s.partido_origen_id === partidoActualId) continue;
    m[s.jugador_id] = (m[s.jugador_id] || 0) + s.partidos_pendientes;
  }
  return m;
}

export async function insertarSancion(token, payload) {
  const data = await _fetch(`/sanciones`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return Array.isArray(data) ? data[0] : data;
}

export async function eliminarSancionDB(token, id) {
  await _fetch(`/sanciones?id=eq.${id}`, token, { method: "DELETE" });
}

export function textoSancionParaObservaciones(s) {
  return `🟥 Sanción: ${s.nombre} (${s.partidos} ${s.partidos === 1 ? "partido" : "partidos"}) — ${s.motivo}`;
}
