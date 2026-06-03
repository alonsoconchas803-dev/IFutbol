// Helper compartido para subir archivos al bucket de Supabase Storage.
// Antes vivía duplicado en SuperAdmin/LeagueAdmin/PlayerProfile; se unificó
// aquí para que la compresión de imágenes >4.5 MB aplique en todos los roles.

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

// El bucket "imagenes" tiene un límite de 5 MB. Según el tipo de imagen
// aplicamos un perfil de compresión distinto:
//
// - "original": comportamiento histórico. Solo re-encodea fotos enormes
//   (>4.5 MB) y a 1600px. Pensado para imágenes que se muestran EN GRANDE,
//   como las portadas de unidad. Es el default si no se indica perfil.
// - "jugador": retratos que se muestran chicos/medianos. Se comprimen SIEMPRE
//   a máx 900px y JPEG 0.80 (~120 KB), para no agotar el storage con 17 fotos
//   por equipo. (Opción "equilibrada".)
//
// SVG y archivos que no encojan se suben tal cual.
const PERFILES = {
  original: { maxDim: 1600, calidad: 0.85, umbralBytes: 4.5 * 1024 * 1024 },
  jugador:  { maxDim: 900, calidad: 0.80, umbralBytes: 0 },
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
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", perfil.calidad));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: "image/jpeg" });
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
