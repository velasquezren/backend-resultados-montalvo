const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
/** `<informeId>.<vence>.<firma>`: ver `src/results/revision.ts` en la API. */
const enlaceRevision = `${uuid}\\.\\d{10}\\.[A-Za-z0-9_-]{43}`;
const subidaAdjunto = new RegExp(`^v1/informes/${uuid}/adjuntos$`, "i");

/** Tope de una subida de adjunto en el proxy: los 100 MB del archivo más el sobre multipart. */
export const LIMITE_SUBIDA_ADJUNTO = 101 * 1024 * 1024;

/**
 * La subida de un video o imagen: es la única que viaja en flujo hasta la API
 * en vez de juntarse en memoria (ver el proxy), porque pesa hasta 100 MB.
 */
export function esSubidaDeAdjunto(path: string, method: string): boolean {
  return method === "POST" && subidaAdjunto.test(path);
}

export function allowed(path: string, method: string): boolean {
  if (method === "GET")
    return (
      [
        "v1/auth/yo",
        "v1/informes",
        "v1/informes/configuracion",
        "v1/portal/informe",
        "v1/portal/informe/pdf",
        "v1/portal/informe/pdf/original",
      ].includes(path) ||
      new RegExp(`^v1/informes/${uuid}(/pdf)?$`, "i").test(path) ||
      new RegExp(`^v1/informes/${uuid}/adjuntos/${uuid}$`, "i").test(path) ||
      new RegExp(`^v1/portal/informe/adjuntos/${uuid}$`, "i").test(path) ||
      new RegExp(`^v1/revision/${enlaceRevision}/pdf$`).test(path)
    );
  if (method !== "POST") return false;
  return (
    [
      "v1/auth/login",
      "v1/auth/logout",
      "v1/auth/password",
      "v1/auth/usuarios",
      "v1/pacientes",
      "v1/pacientes/buscar",
      "v1/informes",
      "v1/portal/salir",
    ].includes(path) ||
    new RegExp(
      `^v1/informes/${uuid}/(pdf|publicar|retirar|acceso/renovar|adjuntos|adjuntos/${uuid}/eliminar)$`,
      "i",
    ).test(path) ||
    new RegExp(`^v1/portal/accesos/${uuid}/ingresar$`, "i").test(path)
  );
}
export function sameOrigin(origin: string | null, configured: string): boolean {
  try {
    return (
      origin !== null && new URL(origin).origin === new URL(configured).origin
    );
  } catch {
    return false;
  }
}
