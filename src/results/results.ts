import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Actor } from '../auth/auth';
import { accessCode, digest } from '../auth/crypto';
import { AppConfig, CONFIG } from '../config';
import { Database, Prisma, Transaction } from '../database';
import { CrearInformeDto, ListarDto, NotificarDto, PublicarDto, RetirarDto } from '../dto';
import { problem } from '../errors';
import { PrivateFiles, PdfScanner, validatePdf } from '../files/files';

export function scope(actor: Actor): Prisma.InformeWhereInput { return actor.rol === 'ADMIN' ? {} : { medicoId: actor.id }; }
const detail = { acceso: { select: { id: true, expiraEn: true, revocadoEn: true } }, paciente: { select: { id: true, nombre: true, ci: true, pac: true, telefono: true } }, medico: { select: { id: true, nombre: true } }, archivo: { select: { id: true, bytes: true, paginas: true, sha256: true } }, aviso: { select: { estado: true, codigoError: true, intentos: true } } } satisfies Prisma.InformeInclude;
/**
 * La lista solo pinta paciente, estudio, fecha y estado. Traer el detalle
 * completo obligaba a Prisma a consultar cinco relaciones por página para
 * descartarlas en el cliente.
 */
const summary = { id: true, revision: true, estudio: true, fechaEstudio: true, estado: true, archivoId: true, publicadoEn: true, paciente: { select: { id: true, nombre: true } } } satisfies Prisma.InformeSelect;

@Injectable()
export class Results {
  constructor(private readonly db: Database, private readonly files: PrivateFiles, private readonly scanner: PdfScanner, @Inject(CONFIG) private readonly config: AppConfig) {}
  async list(dto: ListarDto, actor: Actor) {
    const buscar = dto.buscar?.trim();
    const where: Prisma.InformeWhereInput = { ...scope(actor), estado: dto.estado, pacienteId: dto.pacienteId,
      ...(buscar ? { OR: [{ paciente: { nombre: { contains: buscar, mode: 'insensitive' } } }, { estudio: { contains: buscar, mode: 'insensitive' } }] } : {}) };
    const [datos, total] = await this.db.$transaction([
      this.db.informe.findMany({ where, select: summary, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (dto.pagina - 1) * dto.limite, take: dto.limite }),
      this.db.informe.count({ where }),
    ]);
    return { datos, total, pagina: dto.pagina, limite: dto.limite, totalPaginas: Math.ceil(total / dto.limite) };
  }
  /** Existencia y alcance, sin traer el detalle: distingue 404 de 409 sin coste. */
  private async ensure(id: string, actor: Actor) {
    const found = await this.db.informe.findFirst({ where: { id, ...scope(actor) }, select: { id: true, estado: true, revision: true, archivoId: true } });
    if (!found) problem(404, 'INFORME_NO_ENCONTRADO', 'No encontramos el informe o no tienes acceso a él.');
    return found;
  }
  /** Los estudios ya registrados, para ofrecerlos como sugerencia al escribir. */
  async studyNames(): Promise<string[]> {
    const rows = await this.db.informe.groupBy({ by: ['estudio'], _count: { estudio: true }, orderBy: { _count: { estudio: 'desc' } }, take: 25 });
    return rows.map(row => row.estudio);
  }
  async get(id: string, actor: Actor) {
    const report = await this.db.informe.findFirst({ where: { id, ...scope(actor) }, include: detail });
    if (!report) problem(404, 'INFORME_NO_ENCONTRADO', 'No encontramos el informe o no tienes acceso a él.');
    return report;
  }
  async create(dto: CrearInformeDto, actor: Actor) {
    const fecha = new Date(`${dto.fechaEstudio}T00:00:00.000Z`);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (!Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== dto.fechaEstudio || dto.fechaEstudio > today || dto.fechaEstudio < '1900-01-01') problem(400, 'FECHA_INVALIDA', 'Indica la fecha real del estudio, sin usar una fecha futura.');
    const codigo = accessCode();
    const result = await this.db.$transaction(async tx => {
      if (!await tx.paciente.findUnique({ where: { id: dto.pacienteId } })) problem(404, 'PACIENTE_NO_ENCONTRADO', 'Selecciona un paciente registrado.');
      const report = await tx.informe.create({ data: { ...dto, estudio: dto.estudio.trim(), fechaEstudio: fecha, medicoId: actor.id } });
      const access = await tx.accesoPaciente.create({ data: { informeId: report.id, codigoHash: digest(codigo, this.config.hmacKey), expiraEn: new Date(Date.now() + 30 * 86400_000) } });
      await this.audit(tx, actor.id, 'INFORME_CREADO', report.id);
      return { informe: report, acceso: { id: access.id, codigo, expiraEn: access.expiraEn, url: `${this.config.portalUrl}/${access.id}` } };
    });
    return result;
  }
  async upload(id: string, revision: number, buffer: Buffer, actor: Actor) {
    const report = await this.ensure(id, actor);
    if (report.estado !== 'BORRADOR' || report.revision !== revision) problem(409, 'INFORME_CAMBIO', 'El informe cambió o ya está publicado. Actualízalo antes de continuar.');
    // Validación y antivirus son independientes: en serie el médico esperaba la
    // suma de ambos. `allSettled` conserva el orden de error anterior y evita
    // que el rechazo perdedor quede sin manejar.
    const [validation, scan] = await Promise.allSettled([validatePdf(buffer), this.scanner.scan(buffer)]);
    if (validation.status === 'rejected') throw validation.reason;
    if (scan.status === 'rejected') throw scan.reason;
    const metadata = validation.value;
    const key = `${randomUUID()}.pdf`;
    await this.files.put(key, buffer);
    try {
      await this.db.$transaction(async tx => {
        const file = await tx.archivo.create({ data: { informeId: id, clave: key, bytes: buffer.length, ...metadata } });
        const updated = await tx.informe.updateMany({ where: { id, ...scope(actor), revision, estado: 'BORRADOR' }, data: { archivoId: file.id, revision: { increment: 1 } } });
        if (!updated.count) problem(409, 'INFORME_CAMBIO', 'El informe cambió mientras cargabas el PDF. Actualízalo y revisa cuál quedó adjunto.');
        await this.audit(tx, actor.id, 'PDF_ADJUNTADO', id);
      });
    } catch (error) {
      await this.files.delete(key).catch(() => process.stderr.write(JSON.stringify({ evento: 'archivo_huerfano', clave: key }) + '\n'));
      throw error;
    }
    return this.get(id, actor);
  }
  async publish(id: string, dto: PublicarDto, actor: Actor) {
    await this.ensure(id, actor);
    if (dto.notificar && !this.config.notifications) problem(409, 'AVISOS_DESACTIVADOS', 'Los avisos aún no están configurados. Puedes publicar sin notificación y entregar el acceso al paciente.');
    if (dto.notificar && !dto.telefonoConfirmado) problem(400, 'TELEFONO_NO_CONFIRMADO', 'Revisa y confirma el número del paciente antes de autorizar el aviso.');
    if (dto.notificar && (!dto.consentimientoWhatsApp || !dto.consentimientoVersion)) problem(400, 'CONSENTIMIENTO_REQUERIDO', 'Confirma que el paciente autorizó este aviso de WhatsApp.');
    await this.db.$transaction(async tx => {
      const updated = await tx.informe.updateMany({ where: { id, ...scope(actor), revision: dto.revision, estado: 'BORRADOR', archivoId: { not: null } }, data: { estado: 'PUBLICADO', publicadoEn: new Date(), revision: { increment: 1 } } });
      if (!updated.count) problem(409, 'PUBLICACION_NO_DISPONIBLE', 'Adjunta el PDF y actualiza el informe antes de publicar. Puede haber sido publicado por otra persona.');
      const report = await tx.informe.findUniqueOrThrow({ where: { id }, include: { paciente: true, acceso: true } });
      if (!report.acceso || report.acceso.revocadoEn || report.acceso.expiraEn <= new Date()) problem(409, 'ACCESO_VENCIDO', 'Renueva y entrega el código de acceso al paciente antes de publicar.');
      if (dto.notificar) {
        if (!report.paciente.telefono) problem(400, 'TELEFONO_REQUERIDO', 'El paciente necesita un teléfono verificado para recibir el aviso.');
        await tx.aviso.create({ data: { informeId: id, telefono: report.paciente.telefono, consentimientoEn: new Date(), consentimientoVersion: dto.consentimientoVersion!, autorizadoPor: actor.id } });
      }
      if (report.paciente.referenciaCrm) await tx.eventoIntegracion.create({ data: { tipo: 'RESULTADO_PUBLICADO', informeId: id, referenciaCrm: report.paciente.referenciaCrm } });
      await this.audit(tx, actor.id, 'INFORME_PUBLICADO', id);
    });
    return this.get(id, actor);
  }
  async notify(id: string, dto: NotificarDto, actor: Actor) {
    await this.ensure(id, actor);
    if (!this.config.notifications) problem(409, 'AVISOS_DESACTIVADOS', 'Los avisos todavía no están configurados.');
    await this.db.$transaction(async tx => {
      const updated = await tx.informe.updateMany({ where: { id, ...scope(actor), estado: 'PUBLICADO', revision: dto.revision }, data: { revision: { increment: 1 } } });
      if (!updated.count) problem(409, 'INFORME_CAMBIO', 'Actualiza el informe publicado antes de autorizar el aviso.');
      const report = await tx.informe.findUniqueOrThrow({ where: { id }, include: { acceso: true, paciente: true, aviso: true } });
      if (report.aviso) problem(409, 'AVISO_YA_REGISTRADO', 'Este informe ya tiene un aviso registrado. Revisa su estado antes de continuar.');
      if (!report.acceso || report.acceso.revocadoEn || report.acceso.expiraEn <= new Date()) problem(409, 'ACCESO_VENCIDO', 'Renueva y entrega el acceso al paciente antes de notificar.');
      if (!report.paciente.telefono) problem(400, 'TELEFONO_REQUERIDO', 'Registra el teléfono del paciente antes de notificar.');
      await tx.aviso.create({ data: { informeId: id, telefono: report.paciente.telefono, consentimientoEn: new Date(), consentimientoVersion: dto.consentimientoVersion, autorizadoPor: actor.id } });
      await this.audit(tx, actor.id, 'AVISO_AUTORIZADO', id);
    });
    return this.get(id, actor);
  }
  async withdraw(id: string, dto: RetirarDto, actor: Actor) {
    await this.ensure(id, actor);
    await this.db.$transaction(async tx => {
      const updated = await tx.informe.updateMany({ where: { id, ...scope(actor), revision: dto.revision, estado: { not: 'RETIRADO' } }, data: { estado: 'RETIRADO', retiradoEn: new Date(), motivoRetiro: dto.motivo, revision: { increment: 1 } } });
      if (!updated.count) problem(409, 'INFORME_CAMBIO', 'El informe cambió. Actualízalo antes de retirarlo.');
      await tx.accesoPaciente.updateMany({ where: { informeId: id }, data: { revocadoEn: new Date() } });
      await tx.sesion.deleteMany({ where: { acceso: { informeId: id } } });
      await tx.aviso.updateMany({ where: { informeId: id, estado: 'PENDIENTE' }, data: { estado: 'CANCELADO' } });
      const report = await tx.informe.findUniqueOrThrow({ where: { id }, include: { paciente: true } });
      if (report.paciente.referenciaCrm) await tx.eventoIntegracion.create({ data: { tipo: 'RESULTADO_RETIRADO', informeId: id, referenciaCrm: report.paciente.referenciaCrm } });
      await this.audit(tx, actor.id, 'INFORME_RETIRADO', id);
    });
    return this.get(id, actor);
  }
  async renewAccess(id: string, actor: Actor) {
    const report = await this.ensure(id, actor);
    if (report.estado === 'RETIRADO') problem(409, 'INFORME_RETIRADO', 'Un informe retirado no puede volver a habilitarse.');
    const codigo = accessCode();
    const access = await this.db.$transaction(async tx => {
      await tx.informe.update({ where: { id }, data: { revision: { increment: 1 } } });
      const current = await tx.informe.findUniqueOrThrow({ where: { id } });
      if (current.estado === 'RETIRADO') problem(409, 'INFORME_RETIRADO', 'Un informe retirado no puede volver a habilitarse.');
      await tx.$queryRaw`SELECT id FROM "AccesoPaciente" WHERE "informeId" = ${id}::uuid FOR UPDATE`;
      await tx.sesion.deleteMany({ where: { acceso: { informeId: id } } });
      const renewed = await tx.accesoPaciente.update({ where: { informeId: id }, data: { codigoHash: digest(codigo, this.config.hmacKey), revocadoEn: null, expiraEn: new Date(Date.now() + 30 * 86400_000) } });
      await this.audit(tx, actor.id, 'ACCESO_RENOVADO', id);
      return renewed;
    });
    return { id: access.id, codigo, expiraEn: access.expiraEn, url: `${this.config.portalUrl}/${access.id}` };
  }
  async download(id: string, actor: Actor) {
    const report = await this.ensure(id, actor);
    if (!report.archivoId) problem(404, 'PDF_PENDIENTE', 'Este informe todavía no tiene PDF.');
    const buffer = await this.readFile(report.archivoId);
    await this.db.auditoria.create({ data: { actorId: actor.id, accion: 'PDF_CONSULTADO_MEDICO', informeId: id } });
    return buffer;
  }
  async readFile(id: string) {
    const file = await this.db.archivo.findUniqueOrThrow({ where: { id } });
    const buffer = await this.files.get(file.clave);
    if (buffer.length !== file.bytes || createHash('sha256').update(buffer).digest('hex') !== file.sha256) problem(503, 'PDF_NO_VERIFICADO', 'No pudimos verificar el documento. Contacta con la clínica.');
    return buffer;
  }
  private audit(tx: Transaction, actorId: string, accion: string, informeId: string) { return tx.auditoria.create({ data: { actorId, accion, informeId } }); }
}
