import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { digest, hashPassword, token, verifyPassword } from '../src/auth/crypto';
import { validatePdf } from '../src/files/files';
import { readConfig } from '../src/config';

test('las contraseñas usan sal y nunca se conservan como texto', async () => {
  const hash = await hashPassword('contraseña-sintetica-123');
  assert.notEqual(hash, await hashPassword('contraseña-sintetica-123'));
  assert.equal(await verifyPassword('contraseña-sintetica-123', hash), true);
  assert.equal(await verifyPassword('otra', hash), false);
});
test('tokens de sesión aleatorios y digests vinculados a la clave', () => {
  const tokens = new Set(Array.from({ length: 100 }, token));
  assert.equal(tokens.size, 100);
  for (const t of tokens) assert.ok(t.length >= 43, 'al menos 256 bits en base64url');
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

import sharp from 'sharp';
import { PDFRawStream } from 'pdf-lib';
import { aligerarPdf } from '../src/files/aligerar';

/** Una «ecografía» sintética: ruido sobre degradado, 1136×852, en calidad máxima como la exporta FileMaker. */
async function fotoSintetica(): Promise<Buffer> {
  const ancho = 1136, alto = 852, px = Buffer.alloc(ancho * alto * 3);
  let semilla = 7;
  for (let i = 0; i < px.length; i++) { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; px[i] = ((i / 3) % ancho) * 200 / ancho + (semilla % 40); }
  return sharp(px, { raw: { width: ancho, height: alto, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
}
async function informeConFotos(cuantas: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const foto = await pdf.embedJpg(await fotoSintetica());
  for (let i = 0; i < cuantas; i++) {
    const pagina = pdf.addPage([595, 842]);
    pagina.drawText(`Informe sintético, página ${i + 1}`, { x: 50, y: 800, size: 12 });
    pagina.drawImage(foto, { x: 50, y: 300, width: 495, height: 371 });
  }
  return Buffer.from(await pdf.save());
}
function fotosDe(pdf: PDFDocument) {
  return [...pdf.context.enumerateIndirectObjects()].map(([, o]) => o)
    .filter((o): o is PDFRawStream => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
}

test('versión liviana: las fotos pesan menos, con las mismas dimensiones, páginas y texto', async () => {
  const original = await informeConFotos(3);
  const liviano = await aligerarPdf(original);
  assert.ok(liviano, 'debía generar una versión liviana');
  assert.ok(liviano.length < original.length * 0.8, `${liviano.length} no es al menos 20 % menor que ${original.length}`);
  const antes = await PDFDocument.load(original), despues = await PDFDocument.load(liviano);
  assert.equal(despues.getPageCount(), antes.getPageCount());
  const [foto] = fotosDe(despues);
  const info = await sharp(Buffer.from(foto!.contents)).metadata();
  assert.deepEqual([info.width, info.height, info.format], [1136, 852, 'jpeg']);
  /* Todo lo que no es foto —el texto de cada página, fuentes, vectores— queda byte a byte igual. */
  const noFotos = (pdf: PDFDocument) => [...pdf.context.enumerateIndirectObjects()]
    .filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image'))
    .map(([ref, o]) => [ref.toString(), Buffer.from((o as PDFRawStream).contents).toString('base64')]);
  assert.ok(noFotos(antes).length >= 3, "debía comparar al menos el texto de las 3 páginas");
  assert.deepEqual(noFotos(despues), noFotos(antes));
  /* Y sigue pasando la misma validación que un PDF subido por el médico. */
  assert.equal((await validatePdf(liviano)).paginas, 3);
});

test('versión liviana: un JPEG CMYK no se toca (se leería con otros colores)', async () => {
  const cmyk = await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } })
    .toColourspace('cmyk').jpeg({ quality: 100 }).toBuffer();
  const pdf = await PDFDocument.create();
  const ref = pdf.context.register(pdf.context.stream(cmyk, {
    Type: 'XObject', Subtype: 'Image', Width: 400, Height: 300, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8, Filter: 'DCTDecode',
  }));
  pdf.addPage().node.setXObject(PDFName.of('Im0'), ref);
  assert.equal(await aligerarPdf(Buffer.from(await pdf.save())), null);
});

test('versión liviana: un PDF sin fotos no genera un segundo archivo', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Solo texto');
  assert.equal(await aligerarPdf(Buffer.from(await pdf.save())), null);
});

import { firmarRevision, leerRevision } from '../src/results/revision';
test('enlace de revisión: vale para su informe, vence a su hora y no se falsifica', () => {
  const clave = 'ab'.repeat(32), informe = '11111111-1111-4111-8111-111111111111';
  const vence = new Date(Date.now() + 60_000);
  const enlace = firmarRevision(informe, vence, clave);
  assert.equal(leerRevision(enlace, clave), informe);
  assert.equal(leerRevision(enlace, clave, new Date(vence.getTime() + 1000)), null, 'vencido');
  assert.equal(leerRevision(enlace, 'cd'.repeat(32)), null, 'otra clave');
  const [id, venceSeg, firma] = enlace.split('.') as [string, string, string];
  assert.equal(leerRevision(`${id}.${Number(venceSeg) + 3600}.${firma}`, clave), null, 'alargar el vencimiento rompe la firma');
  const otraLetra = firma.endsWith('A') ? 'B' : 'A';
  assert.equal(leerRevision(`${id}.${venceSeg}.${firma.slice(0, -1)}${otraLetra}`, clave), null, 'una firma alterada no vale');
  assert.equal(leerRevision('cualquier-cosa', clave), null);
});

import { deflateSync } from 'node:zlib';
/** Un PDF con una imagen guardada SIN pérdida (Flate, píxeles crudos), como la exporta FileMaker 20.1. */
async function pdfConImagenSinPerdida(ancho: number, alto: number, pixel: (i: number) => number): Promise<Buffer> {
  const crudo = Buffer.alloc(ancho * alto * 3);
  for (let i = 0; i < crudo.length; i++) crudo[i] = pixel(i);
  const pdf = await PDFDocument.create();
  const ref = pdf.context.register(pdf.context.stream(deflateSync(crudo), {
    Type: 'XObject', Subtype: 'Image', Width: ancho, Height: alto, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode',
  }));
  const pagina = pdf.addPage([595, 842]);
  pagina.node.setXObject(PDFName.of('Foto'), ref);
  pagina.drawText('Informe sintético', { x: 50, y: 800, size: 12 });
  return Buffer.from(await pdf.save());
}

test('versión liviana: una foto sin pérdida (FileMaker 20.1) pasa a JPEG con las mismas dimensiones', async () => {
  let semilla = 5;
  const original = await pdfConImagenSinPerdida(1264, 880, i => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return ((i / 3) % 1264) * 200 / 1264 + (semilla % 40); });
  const liviano = await aligerarPdf(original);
  assert.ok(liviano && liviano.length < original.length * 0.5, 'una foto sin pérdida debía bajar a menos de la mitad');
  const [foto] = fotosDe(await PDFDocument.load(liviano));
  assert.equal(foto!.dict.get(PDFName.of('Filter')), PDFName.of('DCTDecode'));
  const info = await sharp(Buffer.from(foto!.contents)).metadata();
  assert.deepEqual([info.width, info.height, info.channels], [1264, 880, 3]);
  assert.equal((await validatePdf(liviano)).paginas, 1);
});

test('versión liviana: un gráfico sin pérdida (colores planos) no se pasa a JPEG', async () => {
  /* Franjas de color: en Flate pesan casi nada y en JPEG saldrían con borrones. */
  const grafico = await pdfConImagenSinPerdida(1000, 600, i => (Math.floor((i / 3) / 5000) % 2) * 255);
  assert.equal(await aligerarPdf(grafico), null);
});

test('versión liviana: una imagen sin pérdida pequeña (un logo) no se toca', async () => {
  let semilla = 9;
  const logo = await pdfConImagenSinPerdida(158, 105, () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla % 256; });
  assert.equal(await aligerarPdf(logo), null);
});

test('versión liviana: un JPEG pequeño (el logo del encabezado) no se recomprime', async () => {
  let semilla = 13;
  const px = Buffer.alloc(324 * 292 * 3);
  for (let i = 0; i < px.length; i++) { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; px[i] = semilla % 256; }
  const logo = await sharp(px, { raw: { width: 324, height: 292, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
  const pdf = await PDFDocument.create();
  pdf.addPage().drawImage(await pdf.embedJpg(logo), { x: 10, y: 10, width: 100, height: 90 });
  assert.equal(await aligerarPdf(Buffer.from(await pdf.save())), null);
});

/* ── Adjuntos: formato real, tramos y cifrado por trozos ───────────────── */
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile as leerArchivo, writeFile as escribirArchivo } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join as unir } from 'node:path';
import { HttpException } from '@nestjs/common';
import { detectarFormato, nombreVisible } from '../src/files/medios';
import { rangoPedido } from '../src/files/rango';
import { abrirTramo, sellarArchivo, TROZO } from '../src/files/sellado';
import { PdfScanner } from '../src/files/files';
import type { AppConfig } from '../src/config';

const ftyp = (marca: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp' + marca), Buffer.alloc(16)]);
function codigoDe(fn: () => unknown): string | undefined {
  try { fn(); } catch (error) { if (error instanceof HttpException) return (error.getResponse() as { codigo: string }).codigo; throw error; }
  return undefined;
}

test('el formato sale de los bytes, no del nombre: MP4, MOV, WebM, GIF, JPG, PNG y WebP', () => {
  assert.equal(detectarFormato(ftyp('isom')).mime, 'video/mp4');
  assert.equal(detectarFormato(ftyp('mp42')).mime, 'video/mp4');
  assert.equal(detectarFormato(ftyp('qt  ')).mime, 'video/quicktime');
  assert.equal(detectarFormato(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('....B\x82\x84webm')])).mime, 'video/webm');
  assert.equal(detectarFormato(Buffer.from('GIF89a......')).tipo, 'IMAGEN');
  assert.equal(detectarFormato(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])).mime, 'image/jpeg');
  assert.equal(detectarFormato(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])).mime, 'image/png');
  assert.equal(detectarFormato(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')).mime, 'image/webp');
});

/* Aceptarlos dejaría al paciente frente a un reproductor negro: se dice cómo convertirlos. */
test('lo que un teléfono no reproduce se rechaza con cómo convertirlo', () => {
  assert.equal(codigoDe(() => detectarFormato(Buffer.from('RIFF\0\0\0\0AVI LIST'))), 'FORMATO_NO_ADMITIDO');
  assert.equal(codigoDe(() => detectarFormato(ftyp('heic'))), 'FORMATO_NO_ADMITIDO');
  assert.equal(codigoDe(() => detectarFormato(ftyp('3gp4'))), 'FORMATO_NO_ADMITIDO');
  assert.equal(codigoDe(() => detectarFormato(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('....matroska')]))), 'FORMATO_NO_ADMITIDO');
  assert.equal(codigoDe(() => detectarFormato(Buffer.from('%PDF-1.7'))), 'FORMATO_NO_ADMITIDO');
  assert.equal(codigoDe(() => detectarFormato(Buffer.from('<html>'))), 'FORMATO_NO_ADMITIDO');
  assert.equal(codigoDe(() => detectarFormato(Buffer.alloc(0))), 'FORMATO_NO_ADMITIDO');
});

test('el nombre que ve el médico llega sin rutas ni caracteres de control', () => {
  const mp4 = detectarFormato(ftyp('isom'));
  assert.equal(nombreVisible('C:\\eco\\bebé 4D.mp4', mp4), 'bebé 4D.mp4');
  assert.equal(nombreVisible('../../x\u0000.mp4', mp4), 'x.mp4');
  assert.equal(nombreVisible('', mp4), 'Video.mp4');
});

test('Range: abierto, cerrado, sufijo, fuera del archivo y varios tramos', () => {
  assert.equal(rangoPedido(undefined, 100), null);
  assert.deepEqual(rangoPedido('bytes=0-1', 100), { inicio: 0, fin: 1 });
  assert.deepEqual(rangoPedido('bytes=90-', 100), { inicio: 90, fin: 99 });
  assert.deepEqual(rangoPedido('bytes=90-500', 100), { inicio: 90, fin: 99 });
  assert.deepEqual(rangoPedido('bytes=-10', 100), { inicio: 90, fin: 99 });
  assert.deepEqual(rangoPedido('bytes=-500', 100), { inicio: 0, fin: 99 });
  assert.equal(rangoPedido('bytes=100-', 100), 'invalido');
  assert.equal(rangoPedido('bytes=5-2', 100), 'invalido');
  assert.equal(rangoPedido('bytes=-0', 100), 'invalido');
  assert.equal(rangoPedido('bytes=-', 100), 'invalido');
  assert.equal(rangoPedido('items=0-1', 100), 'invalido');
  assert.equal(rangoPedido('bytes=0-1,5-9', 100), null);
});

async function tramo(ruta: string, clave: string, objeto: string, inicio: number, fin: number): Promise<Buffer> {
  const partes: Buffer[] = [];
  for await (const parte of abrirTramo(ruta, clave, objeto, inicio, fin)) partes.push(parte);
  return Buffer.concat(partes);
}

test('cifrado por trozos: cualquier tramo sale idéntico sin descifrar el archivo entero', async () => {
  const carpeta = await mkdtemp(unir(tmpdir(), 'sellado-'));
  const claro = randomBytes(3 * TROZO + 123);
  const origen = unir(carpeta, 'claro'); const destino = unir(carpeta, 'sellado');
  await escribirArchivo(origen, claro);
  const clave = 'cd'.repeat(32);
  const { sha256, bytes } = await sellarArchivo(origen, destino, clave, 'objeto.mp4');
  assert.equal(bytes, claro.length);
  assert.equal(sha256, (await import('node:crypto')).createHash('sha256').update(claro).digest('hex'));
  assert.equal((await leerArchivo(destino)).includes(claro.subarray(1000, 1064)), false, 'en disco no queda nada en claro');
  for (const [inicio, fin] of [[0, 1], [0, claro.length - 1], [TROZO - 3, TROZO + 3], [2 * TROZO, 3 * TROZO + 122], [claro.length - 1, claro.length - 1]] as const)
    assert.deepEqual(await tramo(destino, clave, 'objeto.mp4', inicio, fin), claro.subarray(inicio, fin + 1));
});

test('cifrado por trozos: un byte cambiado, otra clave de objeto o un archivo cortado no se entregan', async () => {
  const carpeta = await mkdtemp(unir(tmpdir(), 'sellado-'));
  const origen = unir(carpeta, 'claro'); const destino = unir(carpeta, 'sellado');
  await escribirArchivo(origen, randomBytes(2 * TROZO + 10));
  const clave = 'ef'.repeat(32);
  await sellarArchivo(origen, destino, clave, 'a.mp4');
  await assert.rejects(tramo(destino, clave, 'b.mp4', 0, 10), 'otro objeto: el AAD no coincide');
  const sellado = await leerArchivo(destino);
  const alterado = Buffer.from(sellado); const posicion = 25 + TROZO + 16 + 5; alterado.writeUInt8(alterado.readUInt8(posicion) ^ 1, posicion);
  await escribirArchivo(destino, alterado);
  await assert.rejects(tramo(destino, clave, 'a.mp4', TROZO, TROZO + 20), 'trozo alterado');
  await escribirArchivo(destino, sellado.subarray(0, sellado.length - 30));
  await assert.rejects(tramo(destino, clave, 'a.mp4', 2 * TROZO, 2 * TROZO + 9), 'cortado');
  await assert.rejects(sellarArchivo(origen, destino, clave, 'a.mp4'), 'nunca pisa un archivo existente');
});

/** Un clamd de mentira que contesta lo que se le pida, para probar las tres salidas. */
async function clamdFalso(respuesta: string): Promise<{ puerto: number; cerrar: () => void }> {
  const servidor = createServer(socket => {
    let recibido = Buffer.alloc(0);
    socket.on('data', dato => {
      recibido = Buffer.concat([recibido, dato]);
      if (recibido.subarray(-4).equals(Buffer.alloc(4))) socket.end(respuesta);
    });
  });
  await new Promise<void>(listo => servidor.listen(0, '127.0.0.1', listo));
  return { puerto: (servidor.address() as { port: number }).port, cerrar: () => servidor.close() };
}

test('antivirus de adjuntos: limpio pasa, infectado es 400 y pasarse del límite de clamd es 503, no un virus', async () => {
  const carpeta = await mkdtemp(unir(tmpdir(), 'clamd-'));
  const archivo = unir(carpeta, 'video'); await escribirArchivo(archivo, randomBytes(200_000));
  const escaner = new PdfScanner({ production: true } as AppConfig);
  const anterior = { host: process.env.CLAMAV_HOST, puerto: process.env.CLAMAV_PORT };
  const silencio = process.stderr.write; process.stderr.write = () => true;
  try {
    for (const [respuesta, esperado] of [['stream: OK\0', undefined], ['stream: Eicar-Signature FOUND\0', 400], ['INSTREAM size limit exceeded. ERROR\0', 503]] as const) {
      const clamd = await clamdFalso(respuesta);
      process.env.CLAMAV_HOST = '127.0.0.1'; process.env.CLAMAV_PORT = String(clamd.puerto);
      try {
        if (esperado === undefined) await escaner.scanFile(archivo);
        else await assert.rejects(escaner.scanFile(archivo), (error: HttpException) => error.getStatus() === esperado);
      } finally { clamd.cerrar(); }
    }
  } finally {
    process.stderr.write = silencio;
    if (anterior.host === undefined) delete process.env.CLAMAV_HOST; else process.env.CLAMAV_HOST = anterior.host;
    if (anterior.puerto === undefined) delete process.env.CLAMAV_PORT; else process.env.CLAMAV_PORT = anterior.puerto;
  }
});
