import { test } from "node:test";
import assert from "node:assert/strict";
import { allowed, sameOrigin } from "../lib/proxy-policy.ts";
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
