import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
import { allowed, sameOrigin } from "@/lib/proxy-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let uploads = 0;
const noStore = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
};
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
  const token = request.cookies.get(cookieName)?.value;
  if (!login && !token)
    return error(401, "Tu sesión terminó. Vuelve a ingresar para continuar.");
  const multipart =
    request.headers.get("content-type")?.startsWith("multipart/form-data") ??
    false;
  if (multipart && uploads >= 2)
    return error(
      503,
      "Estamos procesando otros archivos. Espera unos segundos y vuelve a intentar.",
    );
  if (multipart) uploads++;
  try {
    const headers: Record<string, string> = {};
    if (token && !login) headers.Authorization = `Bearer ${token}`;
    if (request.headers.get("content-type"))
      headers["Content-Type"] = request.headers.get("content-type")!;
    // El despliegue debe sobrescribir X-Real-IP y mantener Next en loopback.
    const ip = request.headers.get("x-real-ip");
    if (ip && isIP(ip)) headers["X-Forwarded-For"] = ip;
    let body: Uint8Array | undefined;
    if (request.method === "POST") {
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
      if (size) body = new Uint8Array(Buffer.concat(parts));
    }
    const response = await fetch(
      `${base.replace(/\/$/, "")}/${path}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body: body ? Buffer.from(body) : undefined,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(multipart ? 90000 : 35000),
      },
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
        ...(response.headers.get("content-disposition")
          ? {
              "Content-Disposition": response.headers.get(
                "content-disposition",
              )!,
            }
          : {}),
      },
    });
    if ((logout && response.ok) || response.status === 401)
      result.cookies.delete(cookieName);
    return result;
  } catch {
    return error(
      503,
      "No pudimos confirmar la operación. Revisa el estado antes de repetirla.",
    );
  } finally {
    if (multipart) uploads--;
  }
}
export { handler as GET, handler as POST };
