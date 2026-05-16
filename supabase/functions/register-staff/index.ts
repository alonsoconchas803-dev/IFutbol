// Edge Function: register-staff
// ─────────────────────────────────────────────────────────────────
// Crea cuenta de staff (referee / league_admin) y su solicitud de
// registro de forma atómica. Si algo falla, hace rollback del usuario
// para que el correo no quede ocupado ni se envíe email de confirmación.
//
// Se invoca desde el cliente sin sesión (verify_jwt = false) porque
// el usuario aún no existe en el momento del registro.
// ─────────────────────────────────────────────────────────────────
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  let payload: { email?: string; password?: string; nombre_completo?: string; tipo_rol?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Datos inválidos." }, 400);
  }

  const email = (payload.email || "").trim().toLowerCase();
  const password = payload.password || "";
  const nombre_completo = (payload.nombre_completo || "").trim();
  const tipo_rol = payload.tipo_rol || "";

  if (!email || !password || !nombre_completo || !tipo_rol) {
    return json({ error: "Completa todos los campos." }, 400);
  }
  if (!["referee", "league_admin"].includes(tipo_rol)) {
    return json({ error: "Tipo de registro inválido." }, 400);
  }
  if (password.length < 6) {
    return json({ error: "La contraseña debe tener al menos 6 caracteres." }, 400);
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json({ error: "El correo no tiene un formato válido." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno de la function.");
    return json({ error: "Error de configuración del servidor." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Crear usuario con email_confirm=true: confirma el correo internamente
  //    y NO envía ningún email. El admin de unidad es quien aprueba el acceso.
  const { data: userData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !userData?.user) {
    const msg = (createErr?.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return json({ error: "Ya existe una cuenta con ese correo. Inicia sesión o usa otro." }, 409);
    }
    console.error("createUser falló:", createErr);
    return json({ error: "No pudimos crear tu cuenta. Inténtalo de nuevo más tarde." }, 500);
  }

  const userId = userData.user.id;

  // 2) Crear solicitud de registro pendiente
  const { error: insertErr } = await admin
    .from("solicitudes_registro")
    .insert({
      user_id: userId,
      nombre_completo,
      tipo_rol,
      estado: "pendiente",
      cancha_id: null,
    });

  if (insertErr) {
    // Rollback: borrar usuario para que el correo quede libre y no se envíe nada
    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
    if (deleteErr) console.error("Rollback fallido (usuario quedó huérfano):", deleteErr, "userId:", userId);
    console.error("Insert solicitudes_registro falló:", insertErr);
    return json({ error: "No pudimos registrar tu solicitud. Inténtalo de nuevo más tarde." }, 500);
  }

  return json({ success: true });
});
