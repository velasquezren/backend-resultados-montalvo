import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { accessCode, digest, hashPassword, verifyPassword } from '../src/auth/crypto';
import { validatePdf } from '../src/files/files';
import { readConfig } from '../src/config';

test('las contraseñas usan sal y nunca se conservan como texto', async () => {
  const hash = await hashPassword('contraseña-sintetica-123');
  assert.notEqual(hash, await hashPassword('contraseña-sintetica-123'));
  assert.equal(await verifyPassword('contraseña-sintetica-123', hash), true);
  assert.equal(await verifyPassword('otra', hash), false);
});
test('códigos de paciente independientes de CI/PAC y digests vinculados a la clave', () => {
  const codes = new Set(Array.from({ length: 100 }, accessCode));
  assert.equal(codes.size, 100);
  for (const code of codes) assert.match(code, /^[A-Z2-9]{12}$/);
  assert.notEqual(digest('mismo', 'clave-1'), digest('mismo', 'clave-2'));
});
test('PDF válido: cuenta páginas y calcula integridad', async () => {
  const pdf = await PDFDocument.create(); pdf.addPage();
  const result = await validatePdf(Buffer.from(await pdf.save()));
  assert.equal(result.paginas, 1); assert.match(result.sha256, /^[a-f0-9]{64}$/);
});
test('rechaza extensiones falsas, PDFs vacíos y JavaScript dentro de un PDF válido', async () => {
  await assert.rejects(validatePdf(Buffer.from('<html>no es PDF</html>')));
  const empty = await PDFDocument.create();
  await assert.rejects(validatePdf(Buffer.from(await empty.save({ addDefaultPage: false }))));
  const pdf = await PDFDocument.create(); pdf.addPage();
  pdf.catalog.set(PDFName.of('OpenAction'), pdf.context.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of('app.alert(1)') }));
  await assert.rejects(validatePdf(Buffer.from(await pdf.save())));
});
test('acepta el destino de página que FileMaker añade al exportar', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.catalog.set(PDFName.of('OpenAction'), pdf.context.obj([pdf.getPage(0).ref, PDFName.of('XYZ'), null, null, 1]));
  const result = await validatePdf(Buffer.from(await pdf.save()));
  assert.equal(result.paginas, 1);
});
test('la configuración rechaza explícitamente la base del CRM', () => {
  const before = process.env.RESULTADOS_DATABASE_URL;
  process.env.RESULTADOS_DATABASE_URL = 'postgresql://local@localhost/crm';
  assert.throws(readConfig, /base debe ser exclusiva/);
  if (before === undefined) delete process.env.RESULTADOS_DATABASE_URL; else process.env.RESULTADOS_DATABASE_URL = before;
});


import { sealPdf, openPdf } from '../src/files/encryption';
test('cifrado autenticado: confidencialidad, nonce único, integridad y vínculo con archivo', () => {
  const key = '12'.repeat(32), pdf = Buffer.from('%PDF-documento-sintetico');
  const encrypted = sealPdf(pdf, key, 'objeto-a');
  assert.equal(encrypted.includes(pdf), false);
  assert.notDeepEqual(encrypted, sealPdf(pdf, key, 'objeto-a'));
  assert.deepEqual(openPdf(encrypted, key, 'objeto-a'), pdf);
  assert.throws(() => openPdf(encrypted, '34'.repeat(32), 'objeto-a'));
  assert.throws(() => openPdf(encrypted, key, 'objeto-b'));
  const changed = Buffer.from(encrypted); changed[changed.length-1] = changed[changed.length-1]! ^ 1;
  assert.throws(() => openPdf(changed, key, 'objeto-a'));
  assert.throws(() => openPdf(pdf, key, 'objeto-a'));
});

import { templatePayload } from '../src/notifications/meta';
test('la plantilla se arma según la variante aprobada, con botón y sin él', () => {
  const claves = ['WHATSAPP_TEMPLATE', 'WHATSAPP_TEMPLATE_LANGUAGE', 'WHATSAPP_TEMPLATE_BOTON', 'RESULTADOS_DATABASE_URL', 'SESSION_HMAC_KEY', 'PATIENT_PORTAL_URL', 'CORS_ORIGINS'] as const;
  const previos = Object.fromEntries(claves.map(clave => [clave, process.env[clave]]));
  const entrada = { id: 'aviso-1', intento: 1, telefono: '+59170000000', accesoId: '3d300296-db32-4238-85e4-58d02aeb534a' };
  try {
    process.env.WHATSAPP_TEMPLATE = 'montalvo_resultado_disponible';
    delete process.env.WHATSAPP_TEMPLATE_LANGUAGE;

    // Variante A: por omisión lleva el botón URL en índice 0 con el ID de acceso.
    delete process.env.WHATSAPP_TEMPLATE_BOTON;
    const conBoton = templatePayload(entrada);
    assert.deepEqual(conBoton, {
      name: 'montalvo_resultado_disponible',
      language: { code: 'es' },
      components: [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: entrada.accesoId }] }],
    });

    // El código de acceso NUNCA viaja en el mensaje: solo el identificador.
    assert.equal(JSON.stringify(conBoton).includes('codigo'), false);

    // Variante B: sin botón no se manda ningún componente, o Meta rechazaría el envío.
    process.env.WHATSAPP_TEMPLATE_BOTON = 'false';
    const sinBoton = templatePayload(entrada);
    assert.deepEqual(sinBoton, { name: 'montalvo_resultado_disponible', language: { code: 'es' } });
    assert.equal('components' in sinBoton, false);
    assert.equal(JSON.stringify(sinBoton).includes(entrada.accesoId), false);

    // Un valor que no sea true/false es un typo y debe fallar al arrancar.
    // `readConfig` valida en orden, así que hay que darle lo previo para llegar aquí.
    Object.assign(process.env, {
      RESULTADOS_DATABASE_URL: 'postgresql://local@localhost/resultados_prueba',
      SESSION_HMAC_KEY: 'ab'.repeat(32),
      PATIENT_PORTAL_URL: 'http://localhost:3000/resultados',
      CORS_ORIGINS: 'http://localhost:3000',
    });
    assert.doesNotThrow(readConfig, 'el entorno base debe ser válido antes de probar el typo');
    process.env.WHATSAPP_TEMPLATE_BOTON = 'fasle';
    assert.throws(readConfig, /WHATSAPP_TEMPLATE_BOTON/);
  } finally {
    for (const clave of claves) {
      const valor = previos[clave];
      if (valor === undefined) delete process.env[clave]; else process.env[clave] = valor;
    }
  }
});
