import { test } from "node:test";
import assert from "node:assert/strict";
import { allowed, esSubidaDeAdjunto, sameOrigin } from "../lib/proxy-policy.ts";
test("el proxy no expone webhooks ni credenciales de integración CRM", () => {
  for (const path of [
    "webhooks/whatsapp",
    "v1/integraciones/crm/eventos",
    "../health",
    "https://otro.example",
    "v1/auth/usuarios/otra/desactivar",
  ]) {
    assert.equal(allowed(path, "GET"), false);
    assert.equal(allowed(path, "POST"), false);
  }
});
test("rutas y métodos permitidos se limitan al portal", () => {
  assert.equal(allowed("v1/auth/login", "POST"), true);
  assert.equal(allowed("v1/auth/login", "GET"), false);
  assert.equal(
    allowed("v1/informes/00000000-0000-4000-8000-000000000000/pdf", "POST"),
    true,
  );
  assert.equal(allowed("v1/informes/invalid/pdf", "POST"), false);
  assert.equal(allowed("v1/informes", "DELETE"), false);
});
test("CSRF requiere origen explícito exacto", () => {
  assert.equal(
    sameOrigin("https://resultados.example", "https://resultados.example"),
    true,
  );
  for (const origin of [
    null,
    "null",
    "https://malicioso.example",
    "https://resultados.example.malicioso.example",
    "http://resultados.example",
  ])
    assert.equal(sameOrigin(origin, "https://resultados.example"), false);
});
test("el enlace de revisión del CRM: solo GET y solo con su forma exacta", () => {
  const enlace = `00000000-0000-4000-8000-000000000000.1790000000.${"a".repeat(43)}`;
  assert.equal(allowed(`v1/revision/${enlace}/pdf`, "GET"), true);
  assert.equal(allowed(`v1/revision/${enlace}/pdf`, "POST"), false);
  for (const malo of ["cualquiera", `${enlace}x`, enlace.replace(".1790000000.", ".179.")])
    assert.equal(allowed(`v1/revision/${malo}/pdf`, "GET"), false);
  assert.equal(allowed("v1/portal/informe/pdf/original", "GET"), true);
});

test("videos e imágenes: subir y quitar por POST, ver por GET, solo con ids válidos", () => {
  const informe = "00000000-0000-4000-8000-000000000000";
  const adjunto = "11111111-1111-4111-8111-111111111111";
  assert.equal(allowed(`v1/informes/${informe}/adjuntos`, "POST"), true);
  assert.equal(allowed(`v1/informes/${informe}/adjuntos/${adjunto}/eliminar`, "POST"), true);
  assert.equal(allowed(`v1/informes/${informe}/adjuntos/${adjunto}`, "GET"), true);
  assert.equal(allowed(`v1/portal/informe/adjuntos/${adjunto}`, "GET"), true);
  assert.equal(allowed(`v1/informes/${informe}/adjuntos/${adjunto}`, "POST"), false);
  assert.equal(allowed(`v1/portal/informe/adjuntos/${adjunto}`, "POST"), false);
  assert.equal(allowed(`v1/portal/informe/adjuntos/../pdf`, "GET"), false);
  assert.equal(allowed(`v1/informes/${informe}/adjuntos/x/eliminar`, "POST"), false);
  /* Solo la subida viaja en flujo con el tope grande; el PDF sigue con el suyo. */
  assert.equal(esSubidaDeAdjunto(`v1/informes/${informe}/adjuntos`, "POST"), true);
  assert.equal(esSubidaDeAdjunto(`v1/informes/${informe}/pdf`, "POST"), false);
  assert.equal(esSubidaDeAdjunto(`v1/informes/${informe}/adjuntos`, "GET"), false);
});
