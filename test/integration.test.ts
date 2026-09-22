import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../src/app';
import { Database } from '../src/database';
import { AuthService } from '../src/auth/auth';
import { Notifications } from '../src/notifications/notifications';
import { DeliveryResult, NotificationInput, NotificationTransport, TRANSPORT } from '../src/notifications/meta';
import { AppConfig, CONFIG } from '../src/config';

let app: Awaited<ReturnType<typeof createApp>>;
let db: Database;
let base: string;
let medico: string;
let otroMedico: string;
let admin: string;
let pdf: Buffer;
let transport: NotificationTransport;
let calls: NotificationInput[] = [];
let answer: DeliveryResult = { estado: 'ACEPTADO', metaId: 'wamid.test' };
type Report = { id: string; revision: number; estado: string; archivoId: string | null };
type Created = { informe: Report; acceso: { id: string; codigo: string; url: string } };

async function api<T>(path: string, method = 'GET', body?: unknown, token?: string) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json() as T;
  return { status: response.status, data, headers: response.headers };
}
async function upload(report: Report, token = medico, buffer = pdf) {
  const form = new FormData(); form.set('revision', String(report.revision)); form.set('archivo', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), 'informe.pdf');
  const response = await fetch(`${base}/v1/informes/${report.id}/pdf`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: response.status, data: await response.json() as Report };
}
async function create(crm = false): Promise<Created> {
  const suffix = randomUUID();
  const patient = await api<{ id: string }>('/v1/pacientes', 'POST', { nombre: 'Paciente sintético', ci: `CI-${suffix.slice(0, 12)}`, pac: `PAC-${suffix.slice(0, 12)}`, telefono: '+59170000000', ...(crm ? { referenciaCrm: suffix } : {}) }, crm ? admin : medico);
  assert.equal(patient.status, 201);
  const result = await api<Created>('/v1/informes', 'POST', { pacienteId: patient.data.id, estudio: 'Ecografía de prueba', fechaEstudio: '2026-01-01' }, medico);
  assert.equal(result.status, 201);
  return result.data;
}
async function ready(crm = false): Promise<Created> {
  const created = await create(crm); const uploaded = await upload(created.informe);
  assert.equal(uploaded.status, 201); return { ...created, informe: uploaded.data };
}
async function publish(report: Report, notify = false) {
  return api<Report>(`/v1/informes/${report.id}/publicar`, 'POST', { revision: report.revision, pacienteYPdfConfirmados: true, notificar: notify, ...(notify ? { telefonoConfirmado: true, consentimientoWhatsApp: true, consentimientoVersion: 'resultados-v1' } : {}) }, medico);
}
async function patientLogin(access: Created['acceso']) {
  return api<{ token: string }>(`/v1/portal/accesos/${access.id}/ingresar`, 'POST', { codigo: access.codigo });
}
async function notificationReport() {
  await db.aviso.updateMany({ where: { estado: 'PENDIENTE' }, data: { estado: 'CANCELADO' } });
  const report = await ready(); assert.equal((await publish(report.informe, true)).status, 200); return report;
}

before(async () => {
  const url = process.env.TEST_RESULTADOS_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/resultados_test' || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Usa una base local exclusiva resultados_test');
  Object.assign(process.env, { NODE_ENV: 'test', RESULTADOS_DATABASE_URL: url, SESSION_HMAC_KEY: 'ab'.repeat(32),
    CORS_ORIGINS: 'http://localhost:3000', PATIENT_PORTAL_URL: 'http://localhost:3000/resultados', STORAGE_DRIVER: 'local',
    NOTIFICATIONS_ENABLED: 'true', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_TOKEN: 'ficticio', WHATSAPP_TEMPLATE: 'resultado_listo', META_APP_SECRET: 'secreto-ficticio-pruebas', META_VERIFY_TOKEN: 'verificacion-ficticia', CRM_INTEGRATION_TOKEN: 'c'.repeat(40),
    PRIVATE_STORAGE_DIR: await mkdtemp(join(tmpdir(), 'resultados-test-files-')),
  });
  delete process.env.CLAMAV_HOST;
  app = await createApp(); db = app.get(Database);
  // No datos de producción; guardia de nombre/host arriba y servidor aislado.
  await db.$executeRawUnsafe('TRUNCATE TABLE "Sesion", "AccesoPaciente", "Aviso", "Archivo", "Informe", "Paciente", "Usuario", "Auditoria", "EventoIntegracion", "LimiteIntentos", "CuotaAvisos" RESTART IDENTITY CASCADE');
  const auth = app.get(AuthService);
  for (const [email, rol] of [['admin@prueba.test', 'ADMIN'], ['medico@prueba.test', 'MEDICO'], ['otro@prueba.test', 'MEDICO']] as const) await auth.createUser(email, email, 'clave-sintetica-pruebas', rol);
  transport = app.get<NotificationTransport>(TRANSPORT);
  transport.send = async input => { calls.push(input); return answer; };
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  for (const email of ['admin', 'medico', 'otro']) {
    const login = await api<{ token: string }>('/v1/auth/login', 'POST', { email: `${email}@prueba.test`, password: 'clave-sintetica-pruebas' });
    assert.equal(login.status, 200);
    if (email === 'admin') admin = login.data.token; else if (email === 'medico') medico = login.data.token; else otroMedico = login.data.token;
  }
  const document = await PDFDocument.create(); document.addPage(); pdf = Buffer.from(await document.save());
});
after(async () => { await app?.close(); });

test('arranque real: health, validación estricta y sesión requerida', async () => {
  assert.equal((await api('/health/ready')).status, 200);
  assert.equal((await api('/v1/informes')).status, 401);
  assert.equal((await api('/v1/auth/login', 'POST', {})).status, 400);
  assert.equal((await api('/v1/auth/login', 'POST', { email: 'medico@prueba.test', password: 'incorrecta' })).status, 401);
  const protectedResponse = await api('/v1/informes', 'GET', undefined, medico);
  assert.equal(protectedResponse.headers.get('cache-control'), 'no-store, private');
});
test('médico no administra usuarios; sesiones y contraseñas no están en texto', async () => {
  assert.equal((await api('/v1/auth/usuarios', 'POST', { email: 'mal@prueba.test', nombre: 'Otro', password: 'contraseña-prueba', rol: 'ADMIN' }, medico)).status, 403);
  assert.equal(await db.sesion.count({ where: { tokenHash: medico } }), 0);
  assert.equal(await db.usuario.count({ where: { passwordHash: 'clave-sintetica-pruebas' } }), 0);
});
test('pacientes: búsqueda exacta, CI/PAC únicos, sin mezclar fichas', async () => {
  const payload = { nombre: 'Paciente duplicado', ci: 'PRUEBA-100', pac: 'PAC-100' };
  assert.equal((await api('/v1/pacientes', 'POST', payload, medico)).status, 201);
  assert.equal((await api('/v1/pacientes', 'POST', { ...payload, pac: 'PAC-200' }, medico)).status, 409);
  assert.equal((await api('/v1/pacientes/buscar', 'POST', {}, medico)).status, 400);
  assert.equal((await api('/v1/pacientes/buscar', 'POST', { ci: 'PRUEBA-100' }, medico)).status, 200);
  assert.equal((await api('/v1/pacientes', 'POST', { nombre: 'Sin identificador' }, medico)).status, 400);
});

test('el identificador único resuelve CI o PAC sin elegir el tipo de antemano', async () => {
  const suffix = randomUUID().slice(0, 12);
  const created = await api<{ id: string }>('/v1/pacientes', 'POST', { nombre: 'Paciente identificador', ci: `CI-${suffix}`, pac: `PAC-${suffix}` }, medico);
  assert.equal(created.status, 201);
  for (const value of [`CI-${suffix}`, `PAC-${suffix}`, `  ci-${suffix}  `]) {
    const found = await api<{ id: string }>('/v1/pacientes/buscar', 'POST', { identificador: value }, medico);
    assert.equal(found.status, 200, `no resolvió ${value}`);
    assert.equal(found.data.id, created.data.id);
  }
  // Sigue siendo exacto: un fragmento no debe devolver la ficha de nadie.
  assert.equal((await api('/v1/pacientes/buscar', 'POST', { identificador: suffix.slice(0, 6) }, medico)).status, 404);
  // Mezclar los dos modos es ambiguo y se rechaza.
  assert.equal((await api('/v1/pacientes/buscar', 'POST', { identificador: `CI-${suffix}`, ci: `CI-${suffix}` }, medico)).status, 400);
});

test('la lista filtra por nombre de paciente y por estudio, dentro del alcance del médico', async () => {
  const marca = `Zeta${randomUUID().slice(0, 8)}`;
  const patient = await api<{ id: string }>('/v1/pacientes', 'POST', { nombre: `${marca} Apellido`, ci: `CI-B-${randomUUID().slice(0, 12)}` }, medico);
  assert.equal(patient.status, 201);
  const report = await api<Created>('/v1/informes', 'POST', { pacienteId: patient.data.id, estudio: 'Ecografía mamaria de control', fechaEstudio: '2026-01-02' }, medico);
  assert.equal(report.status, 201);

  const porNombre = await api<{ datos: Report[]; total: number }>(`/v1/informes?buscar=${encodeURIComponent(marca.toLowerCase())}`, 'GET', undefined, medico);
  assert.equal(porNombre.status, 200);
  assert.equal(porNombre.data.total, 1);
  assert.equal(porNombre.data.datos[0]!.id, report.data.informe.id);

  const porEstudio = await api<{ datos: Report[] }>('/v1/informes?buscar=mamaria', 'GET', undefined, medico);
  assert.equal(porEstudio.status, 200);
  assert.ok(porEstudio.data.datos.some(item => item.id === report.data.informe.id));

  // La búsqueda no puede saltarse el alcance: otro médico no ve este informe.
  const ajeno = await api<{ total: number }>(`/v1/informes?buscar=${encodeURIComponent(marca)}`, 'GET', undefined, otroMedico);
  assert.equal(ajeno.data.total, 0);

  assert.equal((await api(`/v1/informes?buscar=${'x'.repeat(200)}`, 'GET', undefined, medico)).status, 400);
});

test('la configuración ofrece el vocabulario de estudios ya registrados', async () => {
  // Autónoma: no depende de lo que hayan dejado otras pruebas.
  const nombreEstudio = `Ecografía ${randomUUID().slice(0, 8)}`;
  const patient = await api<{ id: string }>('/v1/pacientes', 'POST', { nombre: 'Paciente vocabulario', ci: `CI-V-${randomUUID().slice(0, 12)}` }, medico);
  assert.equal(patient.status, 201);
  assert.equal((await api('/v1/informes', 'POST', { pacienteId: patient.data.id, estudio: nombreEstudio, fechaEstudio: '2026-01-03' }, medico)).status, 201);
  const config = await api<{ estudiosFrecuentes: string[] }>('/v1/informes/configuracion', 'GET', undefined, medico);
  assert.equal(config.status, 200);
  assert.ok(Array.isArray(config.data.estudiosFrecuentes));
  assert.ok(config.data.estudiosFrecuentes.includes(nombreEstudio));
  assert.ok(config.data.estudiosFrecuentes.length <= 25);
});
test('autorización real: otro médico no lista, lee, publica ni descarga el informe', async () => {
  const report = await ready();
  assert.equal((await api(`/v1/informes/${report.informe.id}`, 'GET', undefined, otroMedico)).status, 404);
  assert.equal((await upload(report.informe, otroMedico)).status, 404);
  assert.equal((await api(`/v1/informes/${report.informe.id}/publicar`, 'POST', { revision: report.informe.revision, pacienteYPdfConfirmados: true, notificar: false }, otroMedico)).status, 404);
  assert.equal((await fetch(`${base}/v1/informes/${report.informe.id}/pdf`, { headers: { Authorization: `Bearer ${otroMedico}` } })).status, 404);
  const list = await api<{ total: number }>('/v1/informes', 'GET', undefined, otroMedico); assert.equal(list.data.total, 0);
  assert.equal((await api(`/v1/informes/${report.informe.id}`, 'GET', undefined, admin)).status, 200);
});
test('no publica sin PDF ni acepta un archivo disfrazado', async () => {
  const report = await create();
  assert.equal((await publish(report.informe)).status, 409);
  assert.equal((await upload(report.informe, medico, Buffer.from('no soy PDF'))).status, 400);
  assert.equal((await db.informe.findUniqueOrThrow({ where: { id: report.informe.id } })).archivoId, null);
});
test('dos cargas simultáneas no sobrescriben silenciosamente el mismo borrador', async () => {
  const report = await create();
  const results = await Promise.all([upload(report.informe), upload(report.informe)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(await db.archivo.count({ where: { informeId: report.informe.id } }), 1);
});
test('publicación concurrente: un informe publicado, un aviso y un evento para CRM', async () => {
  const report = await ready(true);
  const results = await Promise.all([publish(report.informe, true), publish(report.informe, true)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(await db.aviso.count({ where: { informeId: report.informe.id } }), 1);
  assert.equal(await db.eventoIntegracion.count({ where: { informeId: report.informe.id } }), 1);
});
test('consentimiento y avisos desactivados: no se publica a medias', async () => {
  const report = await ready();
  assert.equal((await api(`/v1/informes/${report.informe.id}/publicar`, 'POST', { revision: report.informe.revision, pacienteYPdfConfirmados: true, notificar: true }, medico)).status, 400);
  const config = app.get<AppConfig>(CONFIG); config.notifications = false;
  assert.equal((await publish(report.informe, true)).status, 409);
  config.notifications = true;
  assert.equal((await db.informe.findUniqueOrThrow({ where: { id: report.informe.id } })).estado, 'BORRADOR');
  assert.equal(await db.aviso.count({ where: { informeId: report.informe.id } }), 0);
});
test('paciente: borrador privado, publicación descargable y token ajeno al portal médico', async () => {
  const report = await ready(); const login = await patientLogin(report.acceso);
  assert.equal(login.status, 200);
  assert.equal((await api('/v1/informes', 'GET', undefined, login.data.token)).status, 401);
  assert.equal((await api('/v1/portal/informe/pdf', 'GET', undefined, login.data.token)).status, 409);
  assert.equal((await publish(report.informe)).status, 200);
  const response = await fetch(`${base}/v1/portal/informe/pdf`, { headers: { Authorization: `Bearer ${login.data.token}` } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store, private');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  const detail = await api<Record<string, unknown>>(`/v1/informes/${report.informe.id}`, 'GET', undefined, medico);
  assert.equal('codigoHash' in detail.data, false); assert.equal('codigoHash' in (detail.data.acceso as object), false); assert.equal('codigo' in (detail.data.acceso as object), false);
});
test('retirar bloquea enlaces y sesiones existentes; no elimina el historial', async () => {
  const report = await ready(); const published = await publish(report.informe, true); const login = await patientLogin(report.acceso);
  assert.equal((await api(`/v1/informes/${report.informe.id}/retirar`, 'POST', { revision: published.data.revision, motivo: 'Documento incorrecto de prueba' }, medico)).status, 200);
  assert.equal((await api('/v1/portal/informe', 'GET', undefined, login.data.token)).status, 401);
  assert.equal((await patientLogin(report.acceso)).status, 401);
  assert.equal((await db.aviso.findUniqueOrThrow({ where: { informeId: report.informe.id } })).estado, 'CANCELADO');
  assert.equal(await db.archivo.count({ where: { informeId: report.informe.id } }), 1);
});
test('rotar código revoca código y sesión anteriores', async () => {
  const report = await ready(); const login = await patientLogin(report.acceso);
  const renewed = await api<Created['acceso']>(`/v1/informes/${report.informe.id}/acceso/renovar`, 'POST', undefined, medico);
  assert.equal(renewed.status, 200);
  assert.equal((await patientLogin(report.acceso)).status, 401);
  assert.equal((await api('/v1/portal/informe', 'GET', undefined, login.data.token)).status, 401);
  assert.equal((await patientLogin(renewed.data)).status, 200);
});
test('worker concurrente reclama una sola vez y no envía el PDF ni el código', async () => {
  await notificationReport(); calls = []; answer = { estado: 'ACEPTADO', metaId: `wamid.${randomUUID()}` };
  await Promise.all([app.get(Notifications).tick(), app.get(Notifications).tick()]);
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]!).sort(), ['accesoId', 'id', 'intento', 'telefono']);
});
test('timeout queda incierto: volver a barrer no duplica ni cobra otro aviso', async () => {
  const report = await notificationReport(); calls = []; answer = { estado: 'INCIERTO' };
  await app.get(Notifications).tick(); await app.get(Notifications).tick();
  assert.equal(calls.length, 1);
  assert.equal((await db.aviso.findUniqueOrThrow({ where: { informeId: report.informe.id } })).estado, 'INCIERTO');
});
test('rechazo permanente no se reintenta', async () => {
  const report = await notificationReport(); calls = []; answer = { estado: 'FALLIDO', codigo: 130497, reintentable: false };
  await app.get(Notifications).tick(); await app.get(Notifications).tick();
  assert.equal(calls.length, 1);
  const job = await db.aviso.findUniqueOrThrow({ where: { informeId: report.informe.id } });
  assert.equal(job.estado, 'FALLIDO'); assert.equal(job.codigoError, 130497);
});
test('reintento transitorio limitado a tres intentos totales', async () => {
  const report = await notificationReport(); calls = []; answer = { estado: 'FALLIDO', codigo: 130429, reintentable: true };
  for (let i = 0; i < 4; i++) {
    await db.aviso.updateMany({ where: { informeId: report.informe.id }, data: { proximoIntento: new Date(0) } });
    await app.get(Notifications).tick();
  }
  assert.equal(calls.length, 3);
  assert.equal((await db.aviso.findUniqueOrThrow({ where: { informeId: report.informe.id } })).estado, 'FALLIDO');
});
test('límite diario impide nuevos envíos y conserva el aviso pendiente', async () => {
  const report = await notificationReport(); calls = [];
  const config = app.get<AppConfig>(CONFIG); const old = config.dailyLimit; config.dailyLimit = 1;
  await app.get(Notifications).tick(); config.dailyLimit = old;
  assert.equal(calls.length, 0);
  assert.equal((await db.aviso.findUniqueOrThrow({ where: { informeId: report.informe.id } })).estado, 'PENDIENTE');
});
test('webhook firmado temprano y fuera de orden conserva el estado más avanzado', async () => {
  const report = await notificationReport(); const service = app.get(Notifications);
  transport.send = async input => {
    const payload = { entry: [{ changes: [{ value: { metadata: { phone_number_id: '123' }, statuses: [{ id: 'wamid.temprano', status: 'read', biz_opaque_callback_data: `${input.id}:${input.intento}` }] } }] }] };
    const json = JSON.stringify(payload);
    const signature = `sha256=${createHmac('sha256', 'secreto-ficticio-pruebas').update(json).digest('hex')}`;
    assert.equal((await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature }, body: json })).status, 200);
    return { estado: 'ACEPTADO', metaId: 'wamid.temprano' };
  };
  await service.tick();
  await service.receive({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '123' }, statuses: [{ id: 'wamid.temprano', status: 'failed', errors: [{ code: 130497 }] }] } }] }] });
  assert.equal((await db.aviso.findUniqueOrThrow({ where: { informeId: report.informe.id } })).estado, 'LEIDO');
  assert.equal((await api('/webhooks/whatsapp', 'POST', { entry: [] })).status, 401);
  transport.send = async input => { calls.push(input); return answer; };
});
test('CRM solo consulta eventos mínimos y su credencial no abre informes', async () => {
  const denied = await api('/v1/integraciones/crm/eventos', 'GET', undefined, medico); assert.equal(denied.status, 401);
  const events = await api<{ datos: Array<Record<string, unknown>> }>('/v1/integraciones/crm/eventos', 'GET', undefined, 'c'.repeat(40));
  assert.equal(events.status, 200); assert.ok(events.data.datos.length > 0);
  for (const event of events.data.datos) for (const key of ['ci', 'pac', 'pdf', 'codigo', 'telefono']) assert.equal(key in event, false);
  assert.equal((await api('/v1/informes', 'GET', undefined, 'c'.repeat(40))).status, 401);
});
test('desactivar al médico revoca inmediatamente sus sesiones', async () => {
  const user = await db.usuario.findUniqueOrThrow({ where: { email: 'otro@prueba.test' } });
  assert.equal((await api(`/v1/auth/usuarios/${user.id}/desactivar`, 'POST', undefined, admin)).status, 200);
  assert.equal((await api('/v1/auth/yo', 'GET', undefined, otroMedico)).status, 401);
});

test('publicar sin aviso permite autorizarlo después una sola vez', async () => {
  const report = await ready(); const published = await publish(report.informe);
  const payload = { revision: published.data.revision, telefonoConfirmado: true, consentimientoWhatsApp: true, consentimientoVersion: 'resultados-v1' };
  const responses = await Promise.all([api(`/v1/informes/${report.informe.id}/notificar`, 'POST', payload, medico), api(`/v1/informes/${report.informe.id}/notificar`, 'POST', payload, medico)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(await db.aviso.count({ where: { informeId: report.informe.id } }), 1);
});

test('un acceso vencido impide iniciar sesión y descargar con sesión anterior', async () => {
  const report = await ready(); await publish(report.informe); const login = await patientLogin(report.acceso);
  await db.accesoPaciente.update({ where: { id: report.acceso.id }, data: { expiraEn: new Date(0) } });
  assert.equal((await patientLogin(report.acceso)).status, 401);
  assert.equal((await api('/v1/portal/informe/pdf', 'GET', undefined, login.data.token)).status, 401);
});
test('autorizar WhatsApp exige confirmar teléfono y no admite confirmación implícita', async () => {
  const report = await ready();
  const result = await api(`/v1/informes/${report.informe.id}/publicar`, 'POST', { revision: report.informe.revision, pacienteYPdfConfirmados: true, notificar: true, consentimientoWhatsApp: true, consentimientoVersion: 'v1' }, medico);
  assert.equal(result.status, 400);
  assert.equal((await db.informe.findUniqueOrThrow({ where: { id: report.informe.id } })).estado, 'BORRADOR');
});

test('cambiar contraseña revoca sesiones y exige conocer la contraseña anterior', async () => {
  const auth = app.get(AuthService);
  await auth.createUser('cambio@prueba.test', 'Cambio', 'clave-inicial-pruebas', 'MEDICO');
  const login = await api<{token:string}>('/v1/auth/login', 'POST', { email:'cambio@prueba.test', password:'clave-inicial-pruebas' });
  assert.equal((await api('/v1/auth/password','POST',{actual:'incorrecta',nueva:'clave-nueva-pruebas'},login.data.token)).status,400);
  assert.equal((await api('/v1/auth/password','POST',{actual:'clave-inicial-pruebas',nueva:'clave-nueva-pruebas'},login.data.token)).status,200);
  assert.equal((await api('/v1/auth/yo','GET',undefined,login.data.token)).status,401);
  assert.equal((await api('/v1/auth/login','POST',{email:'cambio@prueba.test',password:'clave-inicial-pruebas'})).status,401);
  assert.equal((await api('/v1/auth/login','POST',{email:'cambio@prueba.test',password:'clave-nueva-pruebas'})).status,200);
});

test('el vínculo con el CRM se deriva del PAC en forma canónica', async () => {
  const n = randomUUID().slice(0, 8).toUpperCase();
  // El médico teclea el PAC a mano: guiones y minúsculas no deben romper el cruce.
  const conGuion = await api<{ id: string }>('/v1/pacientes', 'POST', { nombre: 'Paciente guion', pac: `pac-${n}` }, medico);
  assert.equal(conGuion.status, 201);
  assert.equal((await db.paciente.findUniqueOrThrow({ where: { id: conGuion.data.id } })).referenciaCrm, `PAC${n}`);

  // Sin PAC no hay vínculo: el CRM identifica por PAC, no por CI.
  const soloCi = await api<{ id: string }>('/v1/pacientes', 'POST', { nombre: 'Paciente sin pac', ci: `CI-X-${n}` }, medico);
  assert.equal(soloCi.status, 201);
  assert.equal((await db.paciente.findUniqueOrThrow({ where: { id: soloCi.data.id } })).referenciaCrm, null);

  // Un médico no puede imponer el vínculo a mano; sigue siendo de ADMIN.
  assert.equal((await api('/v1/pacientes', 'POST', { nombre: 'Paciente ajeno', pac: `PAC-Z-${n}`, referenciaCrm: 'INVENTADO' }, medico)).status, 403);
});

test('la cola del CRM lista informes publicados vinculados, sin filtrar el código', async () => {
  const informe = await ready();
  assert.equal((await publish(informe.informe)).status, 200);

  assert.equal((await api('/v1/integraciones/crm/informes', 'GET')).status, 401);
  assert.equal((await api('/v1/integraciones/crm/informes', 'GET', undefined, 'token-corto')).status, 401);

  type Fila = { informeId: string; referenciaCrm: string; accesoId: string; accesoVigente: boolean; estudio: string };
  const cola = await api<{ datos: Fila[]; total: number; totalPaginas: number }>('/v1/integraciones/crm/informes?limite=100', 'GET', undefined, 'c'.repeat(40));
  assert.equal(cola.status, 200);
  const fila = cola.data.datos.find(item => item.informeId === informe.informe.id);
  assert.ok(fila, 'el informe publicado debe aparecer en la cola');
  assert.equal(fila.accesoId, informe.acceso.id);
  assert.equal(fila.accesoVigente, true);

  // Lo que NO puede viajar al CRM.
  const crudo = JSON.stringify(cola.data);
  assert.equal(crudo.includes(informe.acceso.codigo), false, 'el código de acceso no puede salir');
  for (const clave of ['codigo', 'codigoHash', 'pdf', 'sha256', 'telefono', 'ci']) assert.equal(clave in fila, false, `sobra ${clave}`);

  // Un borrador no está publicado: no debe aparecer.
  const borrador = await ready();
  assert.equal(cola.data.datos.some(item => item.informeId === borrador.informe.id), false);

  // Retirar lo saca de la cola.
  assert.equal((await api(`/v1/informes/${informe.informe.id}/retirar`, 'POST', { revision: (await api<{ revision: number }>(`/v1/informes/${informe.informe.id}`, 'GET', undefined, medico)).data.revision, motivo: 'prueba de cola' }, medico)).status, 200);
  const despues = await api<{ datos: Fila[] }>('/v1/integraciones/crm/informes?limite=100', 'GET', undefined, 'c'.repeat(40));
  assert.equal(despues.data.datos.some(item => item.informeId === informe.informe.id), false);
});
