// Helper compartido para subir archivos al bucket de Supabase Storage.
// Antes vivía duplicado en SuperAdmin/LeagueAdmin/PlayerProfile; se unificó
// aquí para que la compresión de imágenes >4.5 MB aplique en todos los roles.

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

// El bucket "imagenes" tiene un límite de 5 MB. Según el tipo de imagen
// aplicamos un perfil de compresión distinto. Todo se re-encodea a WebP, que
// pesa ~30% menos que JPEG a igual calidad y conserva transparencia (clave
// para los escudos PNG). Si el navegador no soporta encodear WebP, toBlob
// devuelve null y se sube el archivo original sin tocar.
//
// - "original": comportamiento histórico. Solo re-encodea fotos enormes
//   (>4.5 MB) y a 1600px. Es el default si no se indica perfil (logos de
//   unidad, patrocinadores).
// - "portada": se muestra EN GRANDE, así que se mantiene a 1600px/0.85 (misma
//   calidad de siempre) pero ahora se comprime SIEMPRE, para que las que hoy
//   suben sin tocar (2-4 MB) bajen a ~400 KB sin pérdida visible.
// - "jugador": retratos que se muestran chicos/medianos. Se comprimen SIEMPRE
//   a máx 900px (~80 KB), para no agotar el storage con 17 fotos por equipo.
// - "escudo": logos de equipo, se ven a 18-38px. Se reescalan a 256px (~15 KB).
//
// SVG y archivos que no encojan se suben tal cual.
const PERFILES = {
  original: { maxDim: 1600, calidad: 0.85, umbralBytes: 4.5 * 1024 * 1024, formato: "webp" },
  portada:  { maxDim: 1600, calidad: 0.85, umbralBytes: 0, formato: "webp" },
  jugador:  { maxDim: 900, calidad: 0.80, umbralBytes: 0, formato: "webp" },
  escudo:   { maxDim: 256, calidad: 0.85, umbralBytes: 0, formato: "webp" },
};

const comprimirImagenSiAplica = async (file, perfil) => {
  if (!file || !file.type?.startsWith("image/")) return file;
  if (file.type === "image/svg+xml") return file;
  if (file.size <= perfil.umbralBytes) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const MAX_DIM = perfil.maxDim;
    let { width, height } = img;
    if (width > MAX_DIM || height > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);
    const mime = `image/${perfil.formato}`;
    const blob = await new Promise(res => canvas.toBlob(res, mime, perfil.calidad));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: mime });
  } catch {
    return file;
  }
};

export const uploadFile = async (bucket, path, file, token, perfil = "original") => {
  const finalFile = await comprimirImagenSiAplica(file, PERFILES[perfil] || PERFILES.original);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": finalFile.type,
      // Caché de 6 meses (~lo que dura un torneo). Las imágenes con nombre
      // basado en Date.now() (portadas, escudos, logos, patrocinadores) cambian
      // de URL al reemplazarse, así que un caché largo nunca muestra una vieja.
      "cache-control": "max-age=15552000",
      "x-upsert": "true",
    },
    body: finalFile,
  });
  if (!res.ok) {
    // Mostramos el detalle real que devuelve Supabase Storage (suele ser un
    // mensaje de RLS o de bucket) para facilitar diagnosticar problemas.
    const detalle = await res.text().catch(() => "");
    throw new Error(`Error al subir imagen (${res.status}): ${detalle || res.statusText}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
};
