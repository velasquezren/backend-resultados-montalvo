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
