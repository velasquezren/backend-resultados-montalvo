import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { pdfDelPaciente } from "../lib/patient-pdf.ts";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const anterior = process.env.RESULTADOS_API_URL;
let modo = "ok";
let solicitudes: { url: string; authorization?: string; cookie?: string; ip?: string }[] = [];
const servidor = createServer((req, res) => {
  const url = req.url!;
  solicitudes.push({ url, authorization: req.headers.authorization, cookie: req.headers.cookie, ip: req.headers["x-forwarded-for"] as string | undefined });
  if (url.endsWith("/ingresar")) {
    assert.equal(req.method, "POST");
    const status = modo.startsWith("login-") ? Number(modo.slice(6)) : 200;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status === 200 ? {
      token: modo === "token-invalido" ? null : `sintetico-${url.split("/")[4]}`,
      expiraEn: new Date(Date.now() + (modo === "sesion-vencida" ? -60_000 : 900_000)).toISOString(),
    } : { error: { mensaje: "No debe salir HTML del upstream <script>" } }));
    return;
  }
  const status = modo.startsWith("pdf-") ? Number(modo.slice(4)) : 200;
  const bytes = Buffer.from(modo === "no-pdf" ? '{"error":"no es PDF"}' : `%PDF-1.4\n${req.headers.authorization}\n${url}\n%%EOF`);
  res.writeHead(status, {
    "Content-Type": modo === "no-pdf" || status !== 200 ? "application/json" : "application/pdf",
    "Content-Length": bytes.length,
  });
  res.end(bytes);
});

before(async () => {
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  process.env.RESULTADOS_API_URL = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
after(async () => {
  if (anterior === undefined) delete process.env.RESULTADOS_API_URL;
  else process.env.RESULTADOS_API_URL = anterior;
  await new Promise<void>((resolve, reject) => servidor.close((err) => err ? reject(err) : resolve()));
});
function peticion(id = A, query = "", cookie?: string) {
  return new Request(`https://resultados.example/resultados/${id}/pdf${query}`, {
    headers: { "x-real-ip": "192.0.2.1", ...(cookie ? { cookie } : {}) },
  });
}

test("visor sin cookie: abre exclusivamente el informe del enlace y conserva privacidad", async () => {
  modo = "ok"; solicitudes = [];
  const respuesta = await pdfDelPaciente(peticion(), A);
  assert.equal(respuesta.status, 200);
  assert.match(await respuesta.text(), new RegExp(`sintetico-${A}`));
  assert.match(respuesta.headers.get("content-disposition")!, /^inline;/);
  assert.equal(respuesta.headers.get("content-type"), "application/pdf");
  assert.equal(respuesta.headers.get("cache-control"), "no-store, private");
  assert.equal(respuesta.headers.get("referrer-policy"), "no-referrer");
  assert.equal(respuesta.headers.get("set-cookie"), null);
  assert.equal(solicitudes.length, 2);
  assert.equal(solicitudes[0].authorization, undefined);
  assert.equal(solicitudes[1].authorization, `Bearer sintetico-${A}`);
  assert.ok(solicitudes.every((s) => s.ip === "192.0.2.1" && !s.cookie));
});

test("sesión antigua o de otro informe no decide qué PDF se descarga", async () => {
  modo = "ok";
  for (const cookie of ["montalvo_paciente=sesion-vencida", `montalvo_paciente=sintetico-${B}`, "montalvo_medico=sesion-medica"]) {
    const respuesta = await pdfDelPaciente(peticion(A, "", cookie), A);
    assert.equal(respuesta.status, 200);
    assert.match(await respuesta.text(), new RegExp(`sintetico-${A}`));
  }
});

test("dos informes abiertos a la vez no intercambian sus PDFs", async () => {
  modo = "ok";
  const [a, b] = await Promise.all([pdfDelPaciente(peticion(A), A), pdfDelPaciente(peticion(B), B)]);
  assert.match(await a.text(), new RegExp(`sintetico-${A}`));
  assert.match(await b.text(), new RegExp(`sintetico-${B}`));
});

test("original usa ruta original y attachment; consultas arbitrarias no se reenvían", async () => {
  modo = "ok"; solicitudes = [];
  const respuesta = await pdfDelPaciente(peticion(A, "?original=1&token=ignorado"), A);
  assert.match(respuesta.headers.get("content-disposition")!, /^attachment;/);
  const bytes = await respuesta.arrayBuffer();
  assert.equal(bytes.byteLength, Number(respuesta.headers.get("content-length")));
  assert.equal(solicitudes[1].url, "/v1/portal/informe/pdf/original");
});

for (const [caso, status] of [
  ["login-401", 401], ["login-404", 404], ["login-429", 429], ["login-500", 503],
  ["pdf-401", 401], ["pdf-409", 409], ["pdf-500", 503],
  ["no-pdf", 502], ["token-invalido", 502], ["sesion-vencida", 502],
] as const) {
  test(`${caso}: respuesta legible, sin entregar JSON como PDF ni omitir autorización`, async () => {
    modo = caso; solicitudes = [];
    const respuesta = await pdfDelPaciente(peticion(), A);
    assert.equal(respuesta.status, status);
    assert.match(respuesta.headers.get("content-type")!, /text\/html/);
    assert.equal(respuesta.headers.get("content-disposition"), null);
    const html = await respuesta.text();
    assert.match(html, /Volver a mi informe/);
    assert.doesNotMatch(html, /sintetico-|<script>|no debe salir/i);
    assert.equal(respuesta.headers.get("cache-control"), "no-store, private");
    if (caso.startsWith("login-") || caso === "token-invalido" || caso === "sesion-vencida")
      assert.equal(solicitudes.length, 1);
  });
}

test("id inválido no llama a la API ni se interpola en HTML", async () => {
  solicitudes = [];
  const respuesta = await pdfDelPaciente(peticion(), '<script>alert(1)</script>');
  assert.equal(respuesta.status, 404);
  assert.equal(solicitudes.length, 0);
  assert.doesNotMatch(await respuesta.text(), /<script>/);
});

test("configuración ausente devuelve ayuda, sin intentar destinos alternativos", async () => {
  const base = process.env.RESULTADOS_API_URL;
  delete process.env.RESULTADOS_API_URL;
  try {
    const respuesta = await pdfDelPaciente(peticion(), A);
    assert.equal(respuesta.status, 503);
  } finally { process.env.RESULTADOS_API_URL = base; }
});
