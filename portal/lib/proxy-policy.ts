const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
/** `<informeId>.<vence>.<firma>`: ver `src/results/revision.ts` en la API. */
const enlaceRevision = `${uuid}\\.\\d{10}\\.[A-Za-z0-9_-]{43}`;
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
      `^v1/informes/${uuid}/(pdf|publicar|retirar|acceso/renovar)$`,
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
