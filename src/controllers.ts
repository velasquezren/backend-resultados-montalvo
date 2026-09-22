import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, RawBodyRequest, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { createHmac } from 'node:crypto';
import { Attempts, AuthRequest, AuthService, bearer, Public } from './auth/auth';
import { equalSecret } from './auth/crypto';
import { CONFIG, AppConfig } from './config';
import { Database } from './database';
import { BuscarPacienteDto, CodigoDto, CrearInformeDto, EventosDto, InformesCrmDto, ListarDto, LoginDto, PasswordDto, NotificarDto, PacienteDto, PublicarDto, RetirarDto, RevisionDto, UserDto } from './dto';
import { problem } from './errors';
import { MAX_PDF_BYTES } from './files/files';
import { Notifications } from './notifications/notifications';
import { Patients } from './results/patients';
import { PatientPortal } from './results/portal';
import { Results } from './results/results';

function fileResponse(response: Response, file: Buffer, disposition: 'inline' | 'attachment' = 'attachment'): void {
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `${disposition}; filename="informe.pdf"`);
  response.setHeader('Content-Length', file.length);
  response.send(file);
}

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
  constructor(private readonly results: Results, private readonly attempts: Attempts, @Inject(CONFIG) private readonly config: AppConfig) {}
  @Get('configuracion') async configuration() { return { tipo: 'ECOGRAFIA', maxPdfBytes: MAX_PDF_BYTES, notificacionesHabilitadas: this.config.notifications, limiteAvisosDiario: this.config.dailyLimit, avisoCosto: 'WhatsApp puede generar cargos. Revisa el destinatario y confirma el aviso antes de publicar.', accesoPaciente: 'CODIGO_ENTREGADO_EN_CLINICA', estudiosFrecuentes: await this.results.studyNames() }; }
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
  @Post(':id/publicar') @HttpCode(200) publish(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublicarDto, @Req() req: AuthRequest) { return this.results.publish(id, dto, req.actor); }
  @Post(':id/notificar') @HttpCode(200) notify(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NotificarDto, @Req() req: AuthRequest) { return this.results.notify(id, dto, req.actor); }
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
  constructor(private readonly portal: PatientPortal, private readonly attempts: Attempts) {}
  @Post('accesos/:id/ingresar') @HttpCode(200) login(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CodigoDto, @Req() req: Request) { return this.portal.login(id, dto.codigo, req.ip ?? 'unknown'); }
  @Get('informe') async detail(@Req() req: Request) { await this.attempts.consume('portal', req.ip ?? 'unknown', 120, 60); return this.portal.detail(bearer(req)); }
  @Get('informe/pdf') async download(@Req() req: Request, @Res() response: Response) { await this.attempts.consume('descarga-paciente', req.ip ?? 'unknown', 30, 60); fileResponse(response, await this.portal.download(bearer(req))); }
  @Post('salir') @HttpCode(200) logout(@Req() req: Request) { return this.portal.logout(bearer(req)); }
}

@Public()
@Controller('webhooks/whatsapp')
export class MetaWebhookController {
  constructor(private readonly notifications: Notifications) {}
  @Get() verify(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const secret = process.env.META_VERIFY_TOKEN;
    if (!secret || query['hub.mode'] !== 'subscribe' || typeof query['hub.verify_token'] !== 'string' || !equalSecret(query['hub.verify_token'], secret) || typeof query['hub.challenge'] !== 'string') problem(403, 'VERIFICACION_INVALIDA', 'Verificación no autorizada.');
    res.status(200).type('text/plain').send(query['hub.challenge']);
  }
  @Post() @HttpCode(200) async receive(@Req() req: RawBodyRequest<Request>, @Headers('x-hub-signature-256') signature?: string) {
    const secret = process.env.META_APP_SECRET;
    if (!secret || !req.rawBody || !signature || !equalSecret(signature, `sha256=${createHmac('sha256', secret).update(req.rawBody).digest('hex')}`)) problem(401, 'FIRMA_INVALIDA', 'Evento no autorizado.');
    await this.notifications.receive(req.body as unknown);
    return { recibido: true };
  }
}

@Public()
@Controller('v1/integraciones/crm')
export class CrmEventsController {
  constructor(private readonly db: Database, private readonly results: Results, private readonly attempts: Attempts) {}
  /** Una sola definición de la credencial: dos copias divergen. */
  private authorize(req: Request): void {
    const expected = process.env.CRM_INTEGRATION_TOKEN;
    if (!expected || expected.length < 32 || !equalSecret(bearer(req), expected)) problem(401, 'INTEGRACION_NO_AUTORIZADA', 'Integración no autorizada.');
  }
  /** Cola de avisos pendientes para el CRM: qué informes publicados hay y a qué enlace apuntan. */
  @Get('informes') async reports(@Query() dto: InformesCrmDto, @Req() req: Request) {
    this.authorize(req);
    await this.attempts.consume('crm-informes', 'consumer', 60, 60);
    return this.results.publishedForCrm(dto);
  }
  @Get('eventos') async events(@Query() dto: EventosDto, @Req() req: Request) {
    this.authorize(req);
    await this.attempts.consume('crm-eventos', 'consumer', 60, 60);
    const datos = await this.db.eventoIntegracion.findMany({ where: { secuencia: { gt: dto.despues } }, orderBy: { secuencia: 'asc' }, take: dto.limite });
    return { datos, siguiente: datos.at(-1)?.secuencia ?? dto.despues };
  }
}
