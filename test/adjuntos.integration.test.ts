import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../src/app';
import { AuthService } from '../src/auth/auth';
import { Database } from '../src/database';
import { MAX_ADJUNTO_BYTES, MAX_ADJUNTOS_POR_INFORME } from '../src/files/medios';
import { TROZO } from '../src/files/sellado';
import { Mantenimiento } from '../src/mantenimiento/mantenimiento';

/**
 * Videos e imágenes del informe, de punta a punta: HTTP real, PostgreSQL real
 * y el almacenamiento CIFRADO de producción (`local-encrypted`), que es donde
 * vive el formato por trozos que permite servir un video por tramos.
 */
let app: Awaited<ReturnType<typeof createApp>>;
let db: Database;
let base: string;
let carpeta: string;
const tokens: Record<'medico' | 'otro', string> = { medico: '', otro: '' };
let pdf: Buffer;

type Adjunto = { id: string; tipo: string; mime: string; nombre: string; bytes: number };
type Informe = { id: string; revision: number; estado: string; adjuntos: Adjunto[] };
type Creado = { informe: Informe; acceso: { id: string } };

/** Un MP4 sintético: la cabecera `ftyp` de verdad y relleno. Tres trozos y pico, para cruzar fronteras. */
const video = (bytes = 3 * TROZO + 777) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), randomBytes(bytes - 12)]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(2048)]);

async function json<T>(path: string, method = 'GET', body?: unknown, token = tokens.medico) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() as T };
}
async function subir(informeId: string, contenido: Buffer, nombre = 'eco.mp4', token = tokens.medico, tipoDeclarado = 'video/mp4') {
  const form = new FormData(); form.set('archivo', new Blob([new Uint8Array(contenido)], { type: tipoDeclarado }), nombre);
  const response = await fetch(`${base}/v1/informes/${informeId}/adjuntos`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: response.status, data: await response.json() as Informe & { error?: { codigo: string; mensaje: string } } };
}
async function nuevoInforme(publicado = false): Promise<Creado> {
  const sufijo = randomUUID().slice(0, 12);
  const paciente = await json<{ id: string }>('/v1/pacientes', 'POST', { nombre: 'Paciente sintético', pac: `PAC-${sufijo}` });
  const creado = await json<Creado>('/v1/informes', 'POST', { pacienteId: paciente.data.id, estudio: 'Ecografía 4D', fechaEstudio: '2026-01-01' });
  assert.equal(creado.status, 201);
  if (!publicado) return creado.data;
  const form = new FormData(); form.set('revision', String(creado.data.informe.revision)); form.set('archivo', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), 'informe.pdf');
  const conPdf = await fetch(`${base}/v1/informes/${creado.data.informe.id}/pdf`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.medico}` }, body: form });
  const informe = await conPdf.json() as Informe;
  const publicadoRes = await json<Informe>(`/v1/informes/${informe.id}/publicar`, 'POST', { revision: informe.revision, pacienteYPdfConfirmados: true });
  assert.equal(publicadoRes.status, 200);
  return { ...creado.data, informe: publicadoRes.data };
}
async function sesionPaciente(accesoId: string): Promise<string> {
  const ingreso = await json<{ token: string }>(`/v1/portal/accesos/${accesoId}/ingresar`, 'POST', undefined, '');
  assert.equal(ingreso.status, 200);
  return ingreso.data.token;
}
async function pedir(path: string, token: string, rango?: string) {
  const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}`, ...(rango ? { Range: rango } : {}) } });
  return { status: response.status, headers: response.headers, cuerpo: Buffer.from(await response.arrayBuffer()) };
}
const subidasPendientes = async () => (await readdir(join(carpeta, '.subidas')).catch(() => [])).length;

before(async () => {
  const url = process.env.TEST_RESULTADOS_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/resultados_test' || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Usa una base local exclusiva resultados_test');
  carpeta = await mkdtemp(join(tmpdir(), 'resultados-adjuntos-'));
  Object.assign(process.env, { NODE_ENV: 'test', RESULTADOS_DATABASE_URL: url, SESSION_HMAC_KEY: 'ab'.repeat(32),
    CORS_ORIGINS: 'http://localhost:3000', PATIENT_PORTAL_URL: 'http://localhost:3000/resultados',
    STORAGE_DRIVER: 'local-encrypted', STORAGE_ENCRYPTION_KEY: '12'.repeat(32), PRIVATE_STORAGE_DIR: carpeta,
    CRM_INTEGRATION_TOKEN: 'c'.repeat(40), FILEMAKER_API_TOKEN: 'f'.repeat(40) });
  delete process.env.CLAMAV_HOST;
  app = await createApp(); db = app.get(Database);
  await db.$executeRawUnsafe('TRUNCATE TABLE "Sesion", "AccesoPaciente", "Adjunto", "Archivo", "Informe", "Paciente", "Usuario", "Auditoria", "LimiteIntentos" RESTART IDENTITY CASCADE');
  const auth = app.get(AuthService);
  for (const email of ['medico', 'otro']) await auth.createUser(`${email}@prueba.test`, email, 'clave-sintetica-pruebas', 'MEDICO');
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  for (const email of ['medico', 'otro'] as const) {
    const login = await json<{ token: string }>('/v1/auth/login', 'POST', { email: `${email}@prueba.test`, password: 'clave-sintetica-pruebas' }, '');
    tokens[email] = login.data.token;
  }
  const documento = await PDFDocument.create(); documento.addPage(); pdf = Buffer.from(await documento.save());
});
after(async () => { await app?.close(); });

test('el médico sube un video: queda cifrado en disco, con su tipo real y sin restos temporales', async () => {
  const { informe } = await nuevoInforme();
  const contenido = video();
  const subido = await subir(informe.id, contenido, 'C:\\eco\\bebé.mp4');
  assert.equal(subido.status, 201);
  assert.equal(subido.data.adjuntos.length, 1);
  assert.deepEqual({ ...subido.data.adjuntos[0], id: undefined, createdAt: undefined }, { id: undefined, createdAt: undefined, tipo: 'VIDEO', mime: 'video/mp4', nombre: 'bebé.mp4', bytes: contenido.length });
  const fila = await db.adjunto.findFirstOrThrow({ where: { informeId: informe.id } });
  assert.equal(fila.sha256, createHash('sha256').update(contenido).digest('hex'));
  const enDisco = await readFile(join(carpeta, fila.clave));
  assert.equal(enDisco.subarray(0, 5).toString(), 'MNTV2');
  assert.equal(enDisco.includes(contenido.subarray(5000, 5064)), false, 'nada en claro');
  assert.equal(await subidasPendientes(), 0);
  assert.equal(await db.auditoria.count({ where: { informeId: informe.id, accion: 'ADJUNTO_AGREGADO' } }), 1);
});

test('el tipo sale de los bytes: un PNG llamado .mp4 se guarda como imagen; AVI y PDF se rechazan sin restos', async () => {
  const { informe } = await nuevoInforme();
  const disfrazado = await subir(informe.id, png(), 'video.mp4');
  assert.equal(disfrazado.status, 201);
  assert.equal(disfrazado.data.adjuntos[0]!.mime, 'image/png');
  for (const contenido of [Buffer.from('RIFF\0\0\0\0AVI LIST' + 'x'.repeat(100)), pdf]) {
    const rechazo = await subir(informe.id, contenido, 'archivo.mp4');
    assert.equal(rechazo.status, 400);
    assert.equal(rechazo.data.error?.codigo, 'FORMATO_NO_ADMITIDO');
  }
  assert.equal(await subidasPendientes(), 0);
});

/* Los informes llegan publicados desde FileMaker: si solo se pudiera en borrador, nadie lo usaría. */
test('un informe ya publicado admite videos; uno retirado, no', async () => {
  const { informe } = await nuevoInforme(true);
  assert.equal((await subir(informe.id, video())).status, 201);
  const actual = await json<Informe>(`/v1/informes/${informe.id}`);
  const retirado = await json<Informe>(`/v1/informes/${informe.id}/retirar`, 'POST', { revision: actual.data.revision, motivo: 'Prueba de retiro' });
  assert.equal(retirado.status, 200);
  const rechazo = await subir(informe.id, video());
  assert.equal(rechazo.status, 409);
  assert.equal(rechazo.data.error?.codigo, 'INFORME_RETIRADO');
});

test('el paciente ve sus videos solo con el informe publicado, y por tramos como los pide el iPhone', async () => {
  const { informe, acceso } = await nuevoInforme();
  const contenido = video();
  await subir(informe.id, contenido);
  let token = await sesionPaciente(acceso.id);
  const enPreparacion = await json<{ adjuntos: Adjunto[] }>('/v1/portal/informe', 'GET', undefined, token);
  assert.deepEqual(enPreparacion.data.adjuntos, [], 'un borrador no muestra sus adjuntos');

  const conPdf = new FormData(); conPdf.set('revision', String((await json<Informe>(`/v1/informes/${informe.id}`)).data.revision)); conPdf.set('archivo', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), 'i.pdf');
  const conArchivo = await (await fetch(`${base}/v1/informes/${informe.id}/pdf`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.medico}` }, body: conPdf })).json() as Informe;
  assert.equal((await json(`/v1/informes/${informe.id}/publicar`, 'POST', { revision: conArchivo.revision, pacienteYPdfConfirmados: true })).status, 200);
  token = await sesionPaciente(acceso.id);
  const detalle = await json<{ adjuntos: Adjunto[] }>('/v1/portal/informe', 'GET', undefined, token);
  assert.equal(detalle.data.adjuntos.length, 1);
  const adjunto = detalle.data.adjuntos[0]!;
  assert.equal('nombre' in adjunto, false, 'el nombre que le puso el médico no viaja al paciente');
  const ruta = `/v1/portal/informe/adjuntos/${adjunto.id}`;

  const primero = await pedir(ruta, token, 'bytes=0-1');
  assert.equal(primero.status, 206);
  assert.equal(primero.headers.get('content-range'), `bytes 0-1/${contenido.length}`);
  assert.equal(primero.headers.get('accept-ranges'), 'bytes');
  assert.equal(primero.headers.get('content-type'), 'video/mp4');
  assert.deepEqual(primero.cuerpo, contenido.subarray(0, 2));
  const cruzando = await pedir(ruta, token, `bytes=${TROZO - 10}-${2 * TROZO + 10}`);
  assert.deepEqual(cruzando.cuerpo, contenido.subarray(TROZO - 10, 2 * TROZO + 11));
  const final = await pedir(ruta, token, 'bytes=-100');
  assert.deepEqual(final.cuerpo, contenido.subarray(contenido.length - 100));
  const entero = await pedir(ruta, token);
  assert.equal(entero.status, 200);
  assert.match(entero.headers.get('content-disposition') ?? '', /^inline; filename="clinica-montalvo-video-\d{4}-\d{2}-\d{2}-[a-f0-9]{6}\.mp4"$/);
  assert.equal(createHash('sha256').update(entero.cuerpo).digest('hex'), createHash('sha256').update(contenido).digest('hex'));
  assert.equal((await pedir(ruta, token, `bytes=${contenido.length}-`)).status, 416);

  const guardar = await pedir(`${ruta}?descargar=1`, token);
  assert.match(guardar.headers.get('content-disposition') ?? '', /^attachment; /);
  assert.equal(await db.auditoria.count({ where: { informeId: informe.id, accion: 'ADJUNTO_DESCARGADO_PACIENTE' } }), 1);
});

test('nadie ve ni toca adjuntos ajenos: otro médico ni el paciente de otro informe', async () => {
  const a = await nuevoInforme(true);
  const b = await nuevoInforme(true);
  const subido = await subir(a.informe.id, video());
  const adjuntoId = subido.data.adjuntos[0]!.id;
  assert.equal((await subir(a.informe.id, video(), 'x.mp4', tokens.otro)).status, 404);
  assert.equal((await pedir(`/v1/informes/${a.informe.id}/adjuntos/${adjuntoId}`, tokens.otro)).status, 404);
  assert.equal((await json(`/v1/informes/${a.informe.id}/adjuntos/${adjuntoId}/eliminar`, 'POST', undefined, tokens.otro)).status, 404);
  const tokenB = await sesionPaciente(b.acceso.id);
  assert.equal((await pedir(`/v1/portal/informe/adjuntos/${adjuntoId}`, tokenB)).status, 404);
  assert.equal((await pedir(`/v1/informes/${a.informe.id}/adjuntos/${adjuntoId}`, tokens.medico, 'bytes=0-9')).status, 206);
});

test(`hasta ${MAX_ADJUNTOS_POR_INFORME} por informe, también si dos subidas llegan a la vez`, async () => {
  const { informe } = await nuevoInforme();
  for (let i = 0; i < MAX_ADJUNTOS_POR_INFORME - 1; i++) assert.equal((await subir(informe.id, png())).status, 201);
  const [uno, otro] = await Promise.all([subir(informe.id, png()), subir(informe.id, png())]);
  assert.deepEqual([uno.status, otro.status].sort(), [201, 409]);
  assert.equal(await db.adjunto.count({ where: { informeId: informe.id, eliminadoEn: null } }), MAX_ADJUNTOS_POR_INFORME);
  assert.equal((await readdir(carpeta)).filter(n => n.endsWith('.png')).length >= MAX_ADJUNTOS_POR_INFORME, true);
  assert.equal(await subidasPendientes(), 0);
});

test('quitar borra los bytes en el acto y deja el rastro; el paciente ya no lo encuentra', async () => {
  const { informe, acceso } = await nuevoInforme(true);
  const subido = await subir(informe.id, video());
  const adjuntoId = subido.data.adjuntos[0]!.id;
  const { clave } = await db.adjunto.findUniqueOrThrow({ where: { id: adjuntoId } });
  const quitado = await json<Informe>(`/v1/informes/${informe.id}/adjuntos/${adjuntoId}/eliminar`, 'POST');
  assert.equal(quitado.status, 200);
  assert.deepEqual(quitado.data.adjuntos, []);
  await assert.rejects(stat(join(carpeta, clave)), 'el archivo ya no existe');
  assert.notEqual((await db.adjunto.findUniqueOrThrow({ where: { id: adjuntoId } })).eliminadoEn, null);
  assert.equal(await db.auditoria.count({ where: { informeId: informe.id, accion: 'ADJUNTO_ELIMINADO' } }), 1);
  const token = await sesionPaciente(acceso.id);
  assert.equal((await pedir(`/v1/portal/informe/adjuntos/${adjuntoId}`, token)).status, 404);
  assert.equal((await json(`/v1/informes/${informe.id}/adjuntos/${adjuntoId}/eliminar`, 'POST')).status, 404, 'quitarlo dos veces no es un error silencioso');
});

test('más de 100 MB se corta en la subida, sin dejar el archivo a medias en disco', async () => {
  const { informe } = await nuevoInforme();
  const respuesta = await subir(informe.id, video(MAX_ADJUNTO_BYTES + 1));
  assert.equal(respuesta.status, 413);
  assert.match(respuesta.data.error?.mensaje ?? '', /100 MB/);
  assert.equal(await subidasPendientes(), 0);
});

test('el mantenimiento borra subidas huérfanas de más de una hora, no las recientes', async () => {
  const subidas = join(carpeta, '.subidas');
  await writeFile(join(subidas, 'vieja'), 'x'); await writeFile(join(subidas, 'reciente'), 'x');
  const hace2h = new Date(Date.now() - 2 * 3600_000);
  await utimes(join(subidas, 'vieja'), hace2h, hace2h);
  assert.equal(await app.get(Mantenimiento).borrarSubidasHuerfanas(), 1);
  assert.deepEqual(await readdir(subidas), ['reciente']);
});
