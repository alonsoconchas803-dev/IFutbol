// Helper compartido para subir archivos al bucket de Supabase Storage.
// Antes vivía duplicado en SuperAdmin/LeagueAdmin/PlayerProfile; se unificó
// aquí para que la compresión de imágenes >4.5 MB aplique en todos los roles.

const SUPABASE_URL = "https://qemsqvbwlfnaogdcwcrs.supabase.co";
const SUPABASE_KEY = "sb_publishable_jtbK9HuCWeZnok12oaWm6Q_t4dXOIUW";

// El bucket "imagenes" tiene un límite de 5 MB. Las fotos modernas del rollo
// del celular suelen pesar 4-8 MB, así que cuando se supera el umbral
// re-encodeamos a JPEG y reducimos las dimensiones máximas a 1600px.
// SVG y archivos chicos se suben tal cual.
const comprimirImagenSiAplica = async (file) => {
  if (!file || !file.type?.startsWith("image/")) return file;
  if (file.type === "image/svg+xml") return file;
  if (file.size <= 4.5 * 1024 * 1024) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const MAX_DIM = 1600;
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
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: "image/jpeg" });
  } catch {
    return file;
  }
};

export const uploadFile = async (bucket, path, file, token) => {
  const finalFile = await comprimirImagenSiAplica(file);
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
