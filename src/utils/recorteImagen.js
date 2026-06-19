// Recorte de imágenes en el navegador (canvas), sin librerías.
// Se usa al subir el logo de una unidad para que SIEMPRE quede cuadrado:
// así el contenedor (círculo o cuadrado redondeado) lo recibe perfecto y
// no se ven franjas ni se corta de forma rara en los headers.

// Carga un File de imagen en un objeto Image ya decodificado.
function cargarImagen(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// Recorta la imagen a un cuadrado centrado tomando la dimensión más corta
// (centra y descarta lo que sobra del lado más largo) y la reescala a un
// máximo razonable. Conserva transparencia si el original es PNG.
// Si algo falla, devuelve el archivo original sin tocar (nunca rompe la subida).
export async function recortarCuadradoCentrado(file, maxLado = 512) {
  try {
    if (!file || !file.type?.startsWith("image/")) return file;
    // Los SVG no se pueden recortar por canvas de forma fiable; se dejan igual.
    if (file.type === "image/svg+xml") return file;

    const img = await cargarImagen(file);
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    if (!lado) return file;
    const destino = Math.min(lado, maxLado);

    const canvas = document.createElement("canvas");
    canvas.width = destino;
    canvas.height = destino;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";

    // Origen: cuadrado centrado dentro de la imagen original.
    const sx = (img.naturalWidth - lado) / 2;
    const sy = (img.naturalHeight - lado) / 2;
    ctx.drawImage(img, sx, sy, lado, lado, 0, 0, destino, destino);

    // PNG para conservar transparencia; JPEG solo si el original era JPEG.
    const tipo = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const blob = await new Promise(res => canvas.toBlob(res, tipo, 0.92));
    if (!blob) return file;

    const base = file.name.replace(/\.[^.]+$/, "");
    const ext = tipo === "image/jpeg" ? "jpg" : "png";
    return new File([blob], `${base}.${ext}`, { type: tipo });
  } catch {
    return file;
  }
}
