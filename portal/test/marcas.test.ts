import { test } from "node:test";
import assert from "node:assert/strict";
import { MARCAS, marcaDeTipo, paginaDelPaciente } from "../lib/marcas.ts";
import { pdfDelPaciente } from "../lib/patient-pdf.ts";
import robots from "../app/robots.ts";

const A = "00000000-0000-4000-8000-000000000001";

test("laboratorio lo entrega Laboratorio Climon; lo demás, Clínica Montalvo", () => {
  assert.equal(marcaDeTipo("LABORATORIO"), "climon");
  for (const tipo of ["ECOGRAFIA", "PAPANICOLAU", "OTRO", undefined, null, ""]) assert.equal(marcaDeTipo(tipo), "montalvo");
  assert.equal(MARCAS.climon.nombre, "Laboratorio Climon");
  assert.equal(MARCAS.montalvo.nombre, "Clínica Montalvo");
  assert.equal(paginaDelPaciente("climon", A), `/laboratorio/${A}`);
  assert.equal(paginaDelPaciente("montalvo", A), `/resultados/${A}`);
  /* La ayuda va al número desde el que llegó el aviso: el laboratorio tiene el suyo. */
  assert.equal(MARCAS.climon.whatsapp, "59177385889");
  assert.equal(MARCAS.montalvo.whatsapp, "59175031306");
});

test("si el PDF de laboratorio falla, la ayuda es de Climon y vuelve a su página", async () => {
  const anterior = process.env.RESULTADOS_API_URL;
  delete process.env.RESULTADOS_API_URL;
  try {
    const html = await (await pdfDelPaciente(new Request(`https://resultados.example/laboratorio/${A}/pdf`), A, "climon")).text();
    assert.match(html, /Laboratorio Climon/);
    assert.doesNotMatch(html, /Clínica Montalvo/);
    assert.match(html, new RegExp(`href="/laboratorio/${A}"`));
    const clinica = await (await pdfDelPaciente(new Request(`https://resultados.example/resultados/${A}/pdf`), A)).text();
    assert.match(clinica, /Clínica Montalvo/);
    assert.match(clinica, new RegExp(`href="/resultados/${A}"`));
  } finally {
    if (anterior !== undefined) process.env.RESULTADOS_API_URL = anterior;
  }
});

test("WhatsApp lee la tarjeta de las dos páginas, nunca sus PDF", () => {
  const vista = robots().rules;
  const lector = (Array.isArray(vista) ? vista : [vista]).find(r => [r.userAgent].flat().includes("WhatsApp"))!;
  assert.deepEqual([lector.allow].flat(), ["/resultados/", "/laboratorio/"]);
  for (const ruta of ["/resultados/*/pdf", "/laboratorio/*/pdf"]) assert.ok([lector.disallow].flat().includes(ruta));
});
