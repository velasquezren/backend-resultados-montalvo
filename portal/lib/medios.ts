/**
 * Videos e imágenes del informe, del lado del navegador.
 *
 * El servidor decide de verdad —lee los primeros bytes del archivo y lo pasa
 * por el antivirus—; esto solo evita esperar una subida de 100 MB para
 * enterarse de que el formato no sirve.
 */

/** Lo que un teléfono reproduce sin instalar nada. Espejo de `src/files/medios.ts`. */
const EXTENSIONES = ["mp4", "m4v", "mov", "webm", "gif", "jpg", "jpeg", "png", "webp"];
export const ACEPTA_ADJUNTOS =
  "video/mp4,video/quicktime,video/webm,image/gif,image/jpeg,image/png,image/webp," +
  EXTENSIONES.map((e) => `.${e}`).join(",");

/** Si el archivo no va a entrar, por qué; `null` si se puede intentar. */
export function motivoParaNoSubir(archivo: File, limiteBytes: number): string | null {
  const extension = archivo.name.split(".").pop()?.toLowerCase() ?? "";
  if (archivo.size === 0) return `«${archivo.name}» está vacío.`;
  if (archivo.size > limiteBytes)
    return `«${archivo.name}» pesa ${tamano(archivo.size)}; el máximo es ${tamano(limiteBytes)}.`;
  if (extension === "avi" || extension === "mkv" || extension === "3gp")
    return `«${archivo.name}» no se reproduce en todos los teléfonos. Expórtalo como MP4.`;
  if (extension === "heic" || extension === "heif")
    return `«${archivo.name}» es una foto HEIC. Expórtala como JPG o PNG.`;
  if (!EXTENSIONES.includes(extension))
    return `«${archivo.name}» no es un video MP4, MOV o WebM ni una imagen JPG, PNG, GIF o WebP.`;
  return null;
}

/** «820 KB», «12,4 MB». */
export function tamano(bytes: number): string {
  const formato = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 });
  return bytes < 1024 * 1024
    ? `${formato.format(Math.max(1, Math.round(bytes / 1024)))} KB`
    : `${formato.format(bytes / 1024 / 1024)} MB`;
}

/** El nombre que propone el servidor en `Content-Disposition`, para guardar o compartir. */
export function nombreDeArchivo(cabecera: string | null, respaldo: string): string {
  return /filename="([^"]+)"/.exec(cabecera ?? "")?.[1] ?? respaldo;
}
