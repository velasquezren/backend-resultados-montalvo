import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
import {
  allowed,
  esSubidaDeAdjunto,
  LIMITE_SUBIDA_ADJUNTO,
  sameOrigin,
} from "@/lib/proxy-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
};
/**
 * El cuerpo de una subida de adjunto, en flujo y con tope: cuenta los bytes a
 * medida que pasan y corta al superar el límite. Juntarlo en memoria —como
 * los PDF de 10 MB— serían 100 MB por subida en este proceso.
 */
function cuerpoConTope(cuerpo: ReadableStream<Uint8Array>, limite: number, alExceder: () => void) {
  let total = 0;
  return cuerpo.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(trozo, control) {
        total += trozo.byteLength;
        if (total > limite) {
          alExceder();
          control.error(new Error("El archivo supera el tamaño permitido."));
        } else control.enqueue(trozo);
      },
    }),
  );
}

/** Lo que el reproductor de video necesita de vuelta para adelantar y retroceder. */
const CABECERAS_DE_TRAMO = ["accept-ranges", "content-range"] as const;

function error(status: number, mensaje: string) {
  return NextResponse.json(
    { error: { mensaje } },
    { status, headers: noStore },
  );
}
async function handler(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (!allowed(path, request.method))
    return error(404, "Esta acción no está disponible.");
  const origin = process.env.PORTAL_ORIGIN;
  const base = process.env.RESULTADOS_API_URL;
  if (!origin || !base)
    return error(
      503,
      "El portal está en configuración. Contacta con la clínica.",
    );
  if (
    request.method !== "GET" &&
    !sameOrigin(request.headers.get("origin"), origin)
  )
    return error(
      403,
      "La solicitud no es válida. Recarga esta página para continuar.",
    );
  const patient = path.startsWith("v1/portal/");
  const cookieName = patient ? "montalvo_paciente" : "montalvo_medico";
  const login =
    path === "v1/auth/login" ||
    /^v1\/portal\/accesos\/[^/]+\/ingresar$/.test(path);
  const logout = path === "v1/auth/logout" || path === "v1/auth/password" || path === "v1/portal/salir";
  /* El enlace de revisión del CRM: la firma de la URL es la credencial. Ni
     pide ni reenvía cookies —un médico con sesión abierta en esta computadora
     no la presta a la revisión— y un enlace vencido no le cierra la sesión. */
  const revision = path.startsWith("v1/revision/");
  const token = revision ? undefined : request.cookies.get(cookieName)?.value;
  if (!login && !revision && !token)
    return error(401, "Tu sesión terminó. Vuelve a ingresar para continuar.");
  const multipart =
    request.headers.get("content-type")?.startsWith("multipart/form-data") ??
    false;
  const subidaAdjunto = multipart && esSubidaDeAdjunto(path, request.method);
  let excedido = false;
  try {
    const headers: Record<string, string> = {};
    if (token && !login) headers.Authorization = `Bearer ${token}`;
    if (request.headers.get("content-type"))
      headers["Content-Type"] = request.headers.get("content-type")!;
    // El despliegue debe sobrescribir X-Real-IP y mantener Next en loopback.
    const ip = request.headers.get("x-real-ip");
    if (ip && isIP(ip)) headers["X-Forwarded-For"] = ip;
    /* El video se pide por tramos (`Range`): sin reenviarla, el iPhone no lo reproduce. */
    const rango = request.headers.get("range");
    if (request.method === "GET" && rango) headers.Range = rango;
    let body: Uint8Array | ReadableStream<Uint8Array> | undefined;
    if (subidaAdjunto) {
      if (Number(request.headers.get("content-length") ?? 0) > LIMITE_SUBIDA_ADJUNTO)
        return error(413, "Cada video o imagen puede pesar hasta 100 MB.");
      if (request.body)
        body = cuerpoConTope(request.body, LIMITE_SUBIDA_ADJUNTO, () => (excedido = true));
    } else if (request.method === "POST") {
      const limit = multipart ? 11 * 1024 * 1024 : 64 * 1024;
      if (Number(request.headers.get("content-length") ?? 0) > limit)
        return error(413, "El archivo supera el tamaño permitido.");
      const reader = request.body?.getReader();
      const parts: Uint8Array[] = [];
      let size = 0;
      if (reader)
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > limit) {
            await reader.cancel();
            return error(413, "El archivo supera el tamaño permitido.");
          }
          parts.push(part.value);
        }
      if (size) body = Buffer.concat(parts);
    }
    const response = await fetch(
      `${base.replace(/\/$/, "")}/${path}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body: body instanceof ReadableStream ? body : body ? Buffer.from(body) : undefined,
        // Obligatorio en Node para mandar un cuerpo en flujo.
        ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
        cache: "no-store",
        redirect: "error",
        /* Un video de 100 MB por la conexión de la clínica tarda minutos; el
           resto de llamadas conserva sus tiempos de siempre. */
        signal: AbortSignal.timeout(subidaAdjunto ? 15 * 60_000 : multipart ? 90000 : 35000),
      } as RequestInit,
    );
    if (login) {
      const data = await response.json();
      if (!response.ok)
        return NextResponse.json(data, {
          status: response.status,
          headers: noStore,
        });
      if (
        typeof data.token !== "string" ||
        !Number.isFinite(Date.parse(data.expiraEn))
      )
        return error(502, "No pudimos iniciar la sesión.");
      const result = NextResponse.json(
        { usuario: data.usuario, expiraEn: data.expiraEn },
        { headers: noStore },
      );
      result.cookies.set(cookieName, data.token, {
        httpOnly: true,
        secure: new URL(origin).protocol === "https:",
        sameSite: "strict",
        path: "/",
        expires: new Date(data.expiraEn),
      });
      return result;
    }
    const result = new NextResponse(response.body, {
      status: response.status,
      headers: {
        ...noStore,
        "Content-Type":
          response.headers.get("content-type") || "application/json",
        /* Con el tamaño, el visor del navegador muestra cuánto falta en vez
           de una página en blanco mientras bajan los MB de una ecografía. */
        ...(response.headers.get("content-length")
          ? { "Content-Length": response.headers.get("content-length")! }
          : {}),
        ...(response.headers.get("content-disposition")
          ? {
              "Content-Disposition": response.headers.get(
                "content-disposition",
              )!,
            }
          : {}),
        ...Object.fromEntries(
          CABECERAS_DE_TRAMO.flatMap((nombre) => {
            const valor = response.headers.get(nombre);
            return valor ? [[nombre, valor]] : [];
          }),
        ),
      },
    });
    if (!revision && ((logout && response.ok) || response.status === 401))
      result.cookies.delete(cookieName);
    return result;
  } catch {
    if (excedido) return error(413, "Cada video o imagen puede pesar hasta 100 MB.");
    return error(
      503,
      "No pudimos confirmar la operación. Revisa el estado antes de repetirla.",
    );
  }
}
export { handler as GET, handler as POST };
