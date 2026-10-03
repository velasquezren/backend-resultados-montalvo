import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { mkdir } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { diskStorage } from 'multer';
import { Attempts, AuthRequest, AuthService, bearer, Public } from './auth/auth';
import { equalSecret } from './auth/crypto';
import { Database } from './database';
import { BuscarPacienteDto, CrearInformeDto, FileMakerInformeDto, InformesCrmDto, ListarDto, LoginDto, PanoramaCrmDto, PasswordDto, PacienteDto, PublicarDto, RetirarDto, RevisionDto, UserDto } from './dto';
import { problem } from './errors';
import { MAX_PDF_BYTES } from './files/files';
import { MAX_ADJUNTO_BYTES, MAX_ADJUNTOS_POR_INFORME } from './files/medios';
import { Rango, rangoPedido } from './files/rango';
import { directorioSubidas } from './config';
import { AdjuntoParaServir, Adjuntos, descartarSubida, nombreDeDescarga } from './results/adjuntos';
import { Patients } from './results/patients';
import { PatientPortal } from './results/portal';
import { Results } from './results/results';
import { FileMakerGuard, FileMakerIntake } from './results/filemaker';

function fileResponse(response: Response, file: Buffer, disposition: 'inline' | 'attachment' = 'attachment'): void {
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `${disposition}; filename="informe.pdf"`);
  response.setHeader('Content-Length', file.length);
  response.send(file);
}

/**
 * Un adjunto, entero o por tramos (`Range`). Safari en el iPhone no reproduce
 * un video que no responda 206 al primer tramo, y los demás lo usan para
 * adelantar sin bajar todo. Si el reproductor aborta —pasa en cada salto— el
 * flujo se destruye y deja de descifrar.
 */
async function enviarAdjunto(request: Request, response: Response, adjunto: AdjuntoParaServir, leer: (rango: Rango) => Promise<Readable>, guardar: boolean): Promise<void> {
  const pedido = rangoPedido(request.headers.range, adjunto.bytes);
  response.setHeader('Accept-Ranges', 'bytes');
  if (pedido === 'invalido') {
    response.status(416).setHeader('Content-Range', `bytes */${adjunto.bytes}`);
    response.end();
    return;
  }
  const rango = pedido ?? { inicio: 0, fin: adjunto.bytes - 1 };
  const flujo = await leer(rango);
  response.status(pedido ? 206 : 200);
  if (pedido) response.setHeader('Content-Range', `bytes ${rango.inicio}-${rango.fin}/${adjunto.bytes}`);
  response.setHeader('Content-Type', adjunto.mime);
  response.setHeader('Content-Length', rango.fin - rango.inicio + 1);
  response.setHeader('Content-Disposition', `${guardar ? 'attachment' : 'inline'}; filename="${nombreDeDescarga(adjunto)}"`);
  await pipeline(flujo, response).catch((error: NodeJS.ErrnoException) => {
    // Que el reproductor corte un tramo es lo normal; lo otro es un archivo que no verificó.
    if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') process.stderr.write(JSON.stringify({ evento: 'adjunto_no_servido', adjunto: adjunto.id, error: error.message }) + '\n');
  });
}

/** Las subidas de adjuntos van a disco (hasta 100 MB), no a memoria. */
const subidaDeAdjunto = FileInterceptor('archivo', {
  storage: diskStorage({
    destination: (_request, _file, listo) => {
      const destino = directorioSubidas();
      mkdir(destino, { recursive: true, mode: 0o700 }).then(() => listo(null, destino), (error: Error) => listo(error, destino));
    },
  }),
  limits: { fileSize: MAX_ADJUNTO_BYTES, files: 1, fields: 0, parts: 1 },
  /* Los navegadores mandan el nombre en UTF-8; multer lo lee como latin1 por
     defecto y «bebé.mp4» llegaba como «bebÃ©.mp4». */
  defParamCharset: 'utf8',
});

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly db: Database) {}
  @Get() live() { return { status: 'ok', servicio: 'resultados-montalvo' }; }
  @Get('ready') async ready() {
    try { await this.db.$queryRaw`SELECT 1`; return { status: 'ok', baseDatos: 'ok' }; }
    catch { problem(503, 'SERVICIO_NO_DISPONIBLE', 'El servicio no está disponible temporalmente.'); }
  }
}

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly db: Database) {}
  @Public() @Post('login') @HttpCode(200)
  login(@Body() body: LoginDto, @Req() req: Request) { return this.auth.login(body.email, body.password, req.ip ?? 'unknown'); }
  @Get('yo') me(@Req() req: AuthRequest) { return this.db.usuario.findUnique({ where: { id: req.actor.id }, select: { id: true, nombre: true, email: true, rol: true } }); }
  @Post('logout') @HttpCode(200) async logout(@Req() req: AuthRequest) { await this.db.sesion.deleteMany({ where: { id: req.sesionId } }); return { cerrado: true }; }
  @Post('password') @HttpCode(200) password(@Req() req: AuthRequest, @Body() dto: PasswordDto) { return this.auth.changePassword(req.actor, dto.actual, dto.nueva); }
  @Post('usuarios') async create(@Req() req: AuthRequest, @Body() dto: UserDto) {
    if (req.actor.rol !== 'ADMIN') problem(403, 'ADMIN_REQUERIDO', 'Solo un administrador puede crear cuentas.');
    return this.auth.createUser(dto.email, dto.nombre, dto.password, dto.rol);
  }
  @Post('usuarios/:id/desactivar') @HttpCode(200) disable(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.auth.disableUser(id, req.actor); }
}

@Controller('v1/pacientes')
export class PatientsController {
  constructor(private readonly patients: Patients, private readonly attempts: Attempts) {}
  @Post('buscar') @HttpCode(200) async find(@Body() dto: BuscarPacienteDto, @Req() req: AuthRequest) { await this.attempts.consume('buscar-paciente', req.actor.id, 60, 60); return this.patients.find(dto); }
  @Post() create(@Body() dto: PacienteDto, @Req() req: AuthRequest) { return this.patients.create(dto, req.actor); }
}

@Controller('v1/informes')
export class ResultsController {
  constructor(private readonly results: Results, private readonly adjuntos: Adjuntos, private readonly attempts: Attempts) {}
  @Get('configuracion') async configuration() { return { tipo: 'ECOGRAFIA', maxPdfBytes: MAX_PDF_BYTES, maxAdjuntoBytes: MAX_ADJUNTO_BYTES, maxAdjuntos: MAX_ADJUNTOS_POR_INFORME, accesoPaciente: 'CODIGO_ENTREGADO_EN_CLINICA', estudiosFrecuentes: await this.results.studyNames() }; }
  @Get() list(@Query() dto: ListarDto, @Req() req: AuthRequest) { return this.results.list(dto, req.actor); }
  @Post() create(@Body() dto: CrearInformeDto, @Req() req: AuthRequest) { return this.results.create(dto, req.actor); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.results.get(id, req.actor); }
  @Post(':id/pdf')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 1, parts: 2 } }))
  async upload(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevisionDto, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: AuthRequest) {
    await this.attempts.consume('upload-medico', req.actor.id, 30, 60);
    if (!file || file.mimetype !== 'application/pdf') problem(400, 'PDF_REQUERIDO', 'Adjunta el informe como archivo PDF.');
    return this.results.upload(id, dto.revision, file.buffer, req.actor);
  }
  /** Un video o imagen para el paciente. Devuelve el informe, con su lista de adjuntos al día. */
  @Post(':id/adjuntos')
  @UseInterceptors(subidaDeAdjunto)
  async agregarAdjunto(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: AuthRequest) {
    try {
      await this.attempts.consume('adjunto-medico', req.actor.id, 30, 60);
      if (!file) problem(400, 'ARCHIVO_REQUERIDO', 'Elige un video o una imagen para subir.');
      await this.adjuntos.subir(id, file, req.actor);
      return await this.results.get(id, req.actor);
    } finally {
      await descartarSubida(file);
    }
  }
  @Get(':id/adjuntos/:adjuntoId') async verAdjunto(@Param('id', ParseUUIDPipe) id: string, @Param('adjuntoId', ParseUUIDPipe) adjuntoId: string, @Req() req: AuthRequest, @Res() response: Response) {
    // Un video pide decenas de tramos: el cupo es por persona y amplio.
    await this.attempts.consume('adjunto-ver-medico', req.actor.id, 600, 60);
    const adjunto = await this.adjuntos.paraMedico(id, adjuntoId, req.actor);
    await enviarAdjunto(req, response, adjunto, rango => this.adjuntos.leer(adjunto, rango), false);
  }
  @Post(':id/adjuntos/:adjuntoId/eliminar') @HttpCode(200) async quitarAdjunto(@Param('id', ParseUUIDPipe) id: string, @Param('adjuntoId', ParseUUIDPipe) adjuntoId: string, @Req() req: AuthRequest) {
    await this.adjuntos.quitar(id, adjuntoId, req.actor);
    return this.results.get(id, req.actor);
  }
  @Post(':id/publicar') @HttpCode(200) publish(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublicarDto, @Req() req: AuthRequest) { return this.results.publish(id, dto, req.actor); }
  @Post(':id/retirar') @HttpCode(200) withdraw(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RetirarDto, @Req() req: AuthRequest) { return this.results.withdraw(id, dto, req.actor); }
  @Post(':id/acceso/renovar') @HttpCode(200) renew(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.results.renewAccess(id, req.actor); }
  @Get(':id/pdf') async download(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest, @Res() response: Response) {
    await this.attempts.consume('descarga-medico', req.actor.id, 60, 60);
    // `inline` para que el informe se revise dentro del portal, sin salir a otro visor.
    fileResponse(response, await this.results.download(id, req.actor), 'inline');
  }
}

@Public()
@Controller('v1/portal')
export class PortalController {
  constructor(private readonly portal: PatientPortal, private readonly adjuntos: Adjuntos, private readonly attempts: Attempts) {}
  @Post('accesos/:id/ingresar') @HttpCode(200) login(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) { return this.portal.login(id, req.ip ?? 'unknown'); }
  @Get('informe') async detail(@Req() req: Request) { await this.attempts.consume('portal', req.ip ?? 'unknown', 120, 60); return this.portal.detail(bearer(req)); }
  @Get('informe/pdf') async download(@Req() req: Request, @Res() response: Response) { await this.attempts.consume('descarga-paciente', req.ip ?? 'unknown', 30, 60); fileResponse(response, await this.portal.download(bearer(req)), 'inline'); }
  /** El PDF tal cual lo publicó el médico, en la máxima calidad. El de arriba es la versión liviana. */
  @Get('informe/pdf/original') async original(@Req() req: Request, @Res() response: Response) { await this.attempts.consume('descarga-paciente', req.ip ?? 'unknown', 30, 60); fileResponse(response, await this.portal.download(bearer(req), true), 'attachment'); }
  /**
   * Un video o imagen del informe. `?descargar=1` lo entrega para guardar
   * (`attachment`); si no, para verlo en la página. Cupo propio y amplio: un
   * video son decenas de tramos y no puede gastar el de la descarga del PDF.
   */
  @Get('informe/adjuntos/:adjuntoId') async adjunto(@Param('adjuntoId', ParseUUIDPipe) adjuntoId: string, @Query('descargar') descargar: string | undefined, @Req() req: Request, @Res() response: Response) {
    await this.attempts.consume('adjunto-paciente', req.ip ?? 'unknown', 600, 60);
    const { adjunto, accesoId, informeId } = await this.portal.adjunto(bearer(req), adjuntoId);
    const guardar = descargar === '1';
    if (guardar && !req.headers.range) await this.portal.registrarDescarga(accesoId, informeId);
    await enviarAdjunto(req, response, adjunto, rango => this.adjuntos.leer(adjunto, rango), guardar);
  }
  @Post('salir') @HttpCode(200) logout(@Req() req: Request) { return this.portal.logout(bearer(req)); }
}

@Public()
@Controller('v1/integraciones/crm')
export class CrmIntegrationController {
  constructor(private readonly results: Results, private readonly attempts: Attempts) {}
  /** Una sola definición de la credencial: dos copias divergen. */
  private authorize(req: Request): void {
    const expected = process.env.CRM_INTEGRATION_TOKEN;
    if (!expected || expected.length < 32 || !equalSecret(bearer(req), expected)) problem(401, 'INTEGRACION_NO_AUTORIZADA', 'Integración no autorizada.');
  }
  /** Cola de entrega del CRM: qué informes publicados hay, de quién, a qué enlace apuntan y si ya se abrieron. */
  @Get('informes') async reports(@Query() dto: InformesCrmDto, @Req() req: Request) {
    this.authorize(req);
    await this.attempts.consume('crm-informes', 'consumer', 60, 60);
    return this.results.publishedForCrm(dto);
  }
  /**
   * Totales y conjunto de trabajo de la cola, para las pestañas del CRM. Ver
   * `Results.panoramaForCrm`. Cupo propio: la cola lo pide en cada recarga.
   */
  @Get('informes/panorama') async panorama(@Query() dto: PanoramaCrmDto, @Req() req: Request) {
    this.authorize(req);
    await this.attempts.consume('crm-panorama', 'consumer', 60, 60);
    return this.results.panoramaForCrm(dto);
  }
  /**
   * El enlace para que la asistente vea qué informe va a enviar, en el visor
   * del portal. El CRM recibe el enlace, nunca el PDF (ver `revision.ts`).
   */
  @Post('informes/:id/revision') @HttpCode(200) async revision(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    this.authorize(req);
    await this.attempts.consume('crm-revision', 'consumer', 120, 60);
    return this.results.enlaceRevision(id);
  }

  /** Recepción reenvía un aviso cuyo acceso venció: 30 días más, mismo enlace. */
  @Post('informes/:id/acceso/renovar') @HttpCode(200) async renew(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    this.authorize(req);
    await this.attempts.consume('crm-renovar', 'consumer', 30, 60);
    return this.results.renewAccessForCrm(id);
  }
}

/**
 * El PDF que abre un enlace de revisión del CRM. La firma del enlace es la
 * credencial: sin sesión, válida 10 minutos y solo para informes publicados.
 */
@Public()
@Controller('v1/revision')
export class RevisionController {
  constructor(private readonly results: Results, private readonly attempts: Attempts) {}
  @Get(':enlace/pdf') async pdf(@Param('enlace') enlace: string, @Req() req: Request, @Res() response: Response) {
    await this.attempts.consume('revision-ip', req.ip ?? 'unknown', 60, 60);
    fileResponse(response, await this.results.pdfRevision(enlace), 'inline');
  }
}

/**
 * Entrada desde FileMaker: el médico pulsa un botón y el informe queda montado
 * en el portal, en borrador.
 *
 * Credencial propia y fija —no una sesión de médico— porque un guion no es una
 * persona: no debe cargar con la contraseña de nadie ni heredar sus permisos.
 * El médico al que se atribuye el informe viaja en el cuerpo, así que cada uno
 * sigue viendo lo suyo y la auditoría dice quién fue.
 */
@Public()
/* ─── Este guard es lo único que hay que quitar para dejar la ruta abierta ───
   Sin él, cualquiera que dé con la URL puede crear pacientes y subir PDFs a
   fichas reales, y esos informes acaban en la cola desde la que se le manda el
   enlace por WhatsApp a una paciente. Va como guard y no dentro del handler
   porque los guards corren ANTES de leer el cuerpo. */
@UseGuards(FileMakerGuard)
@Controller('v1/integraciones/filemaker')
export class FileMakerController {
  constructor(private readonly intake: FileMakerIntake, private readonly attempts: Attempts) {}

  @Post('informe')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 10, parts: 11 } }))
  async informe(@Body() dto: FileMakerInformeDto, @UploadedFile() file: Express.Multer.File | undefined) {
    await this.attempts.consume('filemaker', 'guion', 60, 60);
    if (!file || file.mimetype !== 'application/pdf') problem(400, 'PDF_REQUERIDO', 'Adjunta el informe como archivo PDF en el campo «archivo».');
    return this.intake.recibir(dto, file.buffer);
  }
}
