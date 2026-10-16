import { isIP } from "node:net";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PRIVADO = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
};

function fallo(status: number, accesoId?: string): Response {
  const mensaje = status === 401 || status === 404
    ? "Este enlace ya no está activo. Contacta con la clínica para solicitar ayuda."
    : status === 409
      ? "Tu informe todavía está en preparación. Vuelve a consultar más adelante."
      : status === 429
        ? "Has realizado varios intentos seguidos. Espera unos minutos y vuelve a abrir tu informe."
        : "No pudimos abrir el PDF en este momento. Vuelve a tu informe e intenta de nuevo.";
  // Solo se interpola un UUID validado, nunca mensajes ni HTML del upstream.
  const volver = accesoId && UUID.test(accesoId)
    ? `<p><a href="/resultados/${accesoId}">Volver a mi informe</a></p>` : "";
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tu informe — Clínica Montalvo</title><style>body{font:18px/1.6 system-ui,sans-serif;background:#f7f8fa;color:#263444;margin:0;padding:24px}main{max-width:520px;margin:12vh auto;background:white;padding:28px;border-radius:20px}h1{font-size:26px}a{color:#145b73}a:focus-visible{outline:3px solid #145b73;outline-offset:4px}</style></head><body><main><h1>No pudimos abrir tu informe</h1><p>${mensaje}</p>${volver}<p><a href="https://wa.me/59175031306?text=Necesito%20ayuda%20para%20ver%20mi%20resultado" rel="noreferrer">Pedir ayuda a la clínica</a></p></main></body></html>`, {
    status,
    headers: {
      ...PRIVADO,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
}

/**
 * El enlace del paciente ya es su credencial. Para abrir/guardar el PDF se
 * intercambia en el servidor por una sesión del MISMO informe, usando la API
 * existente. El visor/gestor de descargas no depende de cookies de otra app,
 * de una pestaña abierta hace más de 15 minutos ni de la sesión de otro informe.
 * No se prolonga el acceso: la API conserva vencimiento, retiro y límites.
 * El token queda en esta petición, nunca en URL, cookie ni respuesta al cliente.
 */
export async function pdfDelPaciente(request: Request, accesoId: string): Promise<Response> {
  if (!UUID.test(accesoId)) return fallo(404);
  const base = process.env.RESULTADOS_API_URL?.replace(/\/$/, "");
  if (!base) return fallo(503, accesoId);
  const headers: Record<string, string> = {};
  // Igual que el proxy: el frontal HTTPS debe sobrescribir X-Real-IP.
  const ip = request.headers.get("x-real-ip");
  if (ip && isIP(ip)) headers["X-Forwarded-For"] = ip;
  const opciones = { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(35_000) } as const;
  try {
    const login = await fetch(`${base}/v1/portal/accesos/${accesoId}/ingresar`, {
      ...opciones, method: "POST", headers,
    });
    if (!login.ok) {
      await login.body?.cancel();
      return fallo([401, 404, 429].includes(login.status) ? login.status : 503, accesoId);
    }
    const sesion = await login.json();
    if (typeof sesion.token !== "string" || !sesion.token ||
        !Number.isFinite(Date.parse(sesion.expiraEn)) || Date.parse(sesion.expiraEn) <= Date.now())
      return fallo(502, accesoId);
    const original = new URL(request.url).searchParams.get("original") === "1";
    const pdf = await fetch(`${base}/v1/portal/informe/pdf${original ? "/original" : ""}`, {
      ...opciones, headers: { ...headers, Authorization: `Bearer ${sesion.token}` },
    });
    if (!pdf.ok) {
      await pdf.body?.cancel();
      return fallo([401, 404, 409, 429].includes(pdf.status) ? pdf.status : 503, accesoId);
    }
    if (pdf.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/pdf") {
      await pdf.body?.cancel();
      return fallo(502, accesoId);
    }
    return new Response(pdf.body, {
      headers: {
        ...PRIVADO,
        "Content-Type": "application/pdf",
        "Content-Disposition": `${original ? "attachment" : "inline"}; filename="informe.pdf"`,
        ...(pdf.headers.get("content-length") ? { "Content-Length": pdf.headers.get("content-length")! } : {}),
      },
    });
  } catch {
    return fallo(503, accesoId);
  }
}
