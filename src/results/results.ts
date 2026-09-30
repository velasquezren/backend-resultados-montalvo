import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Actor } from '../auth/auth';
import { AppConfig, CONFIG } from '../config';
import { Database, Prisma, Transaction } from '../database';
import { CrearInformeDto, InformesCrmDto, ListarDto, PanoramaCrmDto, PublicarDto, RetirarDto } from '../dto';
import { problem } from '../errors';
import { PrivateFiles, PdfScanner, validatePdf } from '../files/files';
import { DURACION_REVISION_MS, firmarRevision, leerRevision } from './revision';

export function scope(actor: Actor): Prisma.InformeWhereInput { return actor.rol === 'ADMIN' ? {} : { medicoId: actor.id }; }
const detail = { acceso: { select: { id: true, expiraEn: true, revocadoEn: true } }, paciente: { select: { id: true, nombre: true, ci: true, pac: true } }, medico: { select: { id: true, nombre: true } }, archivo: { select: { id: true, bytes: true, paginas: true, sha256: true } } } satisfies Prisma.InformeInclude;
/**
 * La lista solo pinta paciente, estudio, fecha y estado. Traer el detalle
 * completo obligaba a Prisma a consultar cinco relaciones por página para
 * descartarlas en el cliente.
 */
/**
 * Tope del conjunto de trabajo que el panorama devuelve entero. Ese conjunto
 * —vigentes y sin abrir— lo acota el negocio: un enlace dura 30 días. Con
 * 50 informes al día son ~1.500; el tope deja margen de sobra y, si algún día
 * se supera, se DICE (`truncado`) en vez de cortar callado.
 */
export const TOPE_TRABAJO_CRM = 5000;

/** Lo publicado que la cola del CRM puede ver: con su acceso de paciente. */
const PUBLICADO_CON_ACCESO = { estado: 'PUBLICADO', acceso: { isNot: null } } satisfies Prisma.InformeWhereInput;

/**
 * Prisma traduce `contains` a `LIKE '%…%'` SIN escapar lo tecleado: buscar `%`
 * devolvía todo, y `_` casa con cualquier letra. Mismo fallo —y mismo arreglo—
 * que en el CRM (`common/dto/busqueda.ts`). La barra se escapa primero.
 */
export function escaparComodinesLike(termino: string): string {
  return termino.replace(/[\\%_]/g, caracter => `\\${caracter}`);
}

/** Nombre, PAC o CI: lo que la asistente teclea para encontrar a alguien. */
function coincideCon(buscar: string): Prisma.InformeWhereInput {
  const contiene = { contains: escaparComodinesLike(buscar), mode: 'insensitive' } as const;
  return { paciente: { OR: [{ nombre: contiene }, { pac: contiene }, { ci: contiene }] } };
}

/** Enlace que sirve hoy (`true`) o que venció o se revocó (`false`). */
function segunVigencia(vigente: boolean, ahora: Date): Prisma.AccesoPacienteWhereInput {
  return vigente
    ? { revocadoEn: null, expiraEn: { gt: ahora } }
    : { OR: [{ revocadoEn: { not: null } }, { expiraEn: { lte: ahora } }] };
}

const summary = { id: true, revision: true, estudio: true, fechaEstudio: true, estado: true, archivoId: true, publicadoEn: true, paciente: { select: { id: true, nombre: true } } } satisfies Prisma.InformeSelect;

@Injectable()
export class Results {
  constructor(private readonly db: Database, private readonly files: PrivateFiles, private readonly scanner: PdfScanner, @Inject(CONFIG) private readonly config: AppConfig) {}
  async list(dto: ListarDto, actor: Actor) {
    const buscar = dto.buscar?.trim();
    const where: Prisma.InformeWhereInput = { ...scope(actor), estado: dto.estado, pacienteId: dto.pacienteId,
      ...(buscar ? { OR: [{ paciente: { nombre: { contains: escaparComodinesLike(buscar), mode: 'insensitive' } } }, { estudio: { contains: escaparComodinesLike(buscar), mode: 'insensitive' } }] } : {}) };
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
  /**
   * Informes publicados, para que el CRM arme la cola de entrega.
   *
   * Lleva los identificadores del paciente —nombre, PAC, CI— porque el
   * vínculo lo resuelve el CRM contra sus propias fichas (PAC; si no hay, CI
   * único) y la asistente compara el nombre antes de enviar. Lleva el ID de
   * acceso, que identifica pero no autoriza, y nunca el código, el PDF ni nada
   * clínico. Si el acceso está vencido o revocado se dice, para que el CRM no
   * mande a un paciente a una puerta cerrada.
   */
  async publishedForCrm(dto: InformesCrmDto) {
    const ahora = new Date();
    const acceso: Prisma.AccesoPacienteWhereInput = {
      ...(dto.abierto === undefined ? {} : { abiertoEn: dto.abierto ? { not: null } : null }),
      ...(dto.vigente === undefined ? {} : segunVigencia(dto.vigente, ahora)),
    };
    const where: Prisma.InformeWhereInput = {
      ...PUBLICADO_CON_ACCESO,
      ...(Object.keys(acceso).length ? { acceso: { is: acceso } } : {}),
      ...(dto.informeId ? { id: dto.informeId } : {}),
      ...(dto.ids ? { id: { in: dto.ids } } : {}),
      ...(dto.buscar ? coincideCon(dto.buscar) : {}),
    };
    const [filas, total] = await this.db.$transaction([
      this.db.informe.findMany({
        where,
        select: { id: true, estudio: true, fechaEstudio: true, publicadoEn: true,
          paciente: { select: { nombre: true, pac: true, ci: true } },
          acceso: { select: { id: true, expiraEn: true, revocadoEn: true, abiertoEn: true } } },
        orderBy: [{ publicadoEn: 'desc' }, { id: 'desc' }],
        skip: (dto.pagina - 1) * dto.limite, take: dto.limite,
      }),
      this.db.informe.count({ where }),
    ]);
    /* Con `ids` se devuelven en el orden pedido: es la página que ya ordenó el CRM. */
    const orden = dto.ids ? new Map(dto.ids.map((id, i) => [id, i])) : null;
    const enOrden = orden ? [...filas].sort((a, b) => orden.get(a.id)! - orden.get(b.id)!) : filas;
    return {
      datos: enOrden.map(fila => ({
        informeId: fila.id,
        paciente: fila.paciente,
        estudio: fila.estudio,
        fechaEstudio: fila.fechaEstudio,
        publicadoEn: fila.publicadoEn,
        accesoId: fila.acceso!.id,
        accesoVigente: !fila.acceso!.revocadoEn && fila.acceso!.expiraEn > ahora,
        accesoExpiraEn: fila.acceso!.expiraEn,
        abiertoEn: fila.acceso!.abiertoEn,
      })),
      total, pagina: dto.pagina, limite: dto.limite, totalPaginas: Math.ceil(total / dto.limite),
    };
  }
  /**
   * Lo que la cola del CRM necesita para sus pestañas, en una sola lectura.
   *
   * Los totales que el portal puede contar solo (todos, abiertos, vencidos sin
   * abrir) y, ENTERO, el conjunto de trabajo: los ids vigentes y sin abrir,
   * ordenados como la cola. «Por avisar» y «esperando lectura» son ese conjunto
   * partido por algo que solo sabe el CRM —si ya se avisó—, así que el CRM
   * los pagina sobre esta lista exacta en vez de filtrar una página ya cortada.
   *
   * `buscar` no cambia los totales —un contador que se mueve mientras escribes
   * no sirve para decidir—: solo marca en `coinciden` qué ids del conjunto
   * responden a la búsqueda.
   */
  async panoramaForCrm(dto: PanoramaCrmDto) {
    const ahora = new Date();
    const trabajo: Prisma.InformeWhereInput = {
      ...PUBLICADO_CON_ACCESO,
      acceso: { is: { abiertoEn: null, ...segunVigencia(true, ahora) } },
    };
    const orden = [{ publicadoEn: 'desc' }, { id: 'desc' }] satisfies Prisma.InformeOrderByWithRelationInput[];
    const [todos, abiertos, vencidosSinAbrir, vigentes] = await this.db.$transaction([
      this.db.informe.count({ where: PUBLICADO_CON_ACCESO }),
      this.db.informe.count({ where: { ...PUBLICADO_CON_ACCESO, acceso: { is: { abiertoEn: { not: null } } } } }),
      this.db.informe.count({ where: { ...PUBLICADO_CON_ACCESO, acceso: { is: { abiertoEn: null, ...segunVigencia(false, ahora) } } } }),
      this.db.informe.findMany({ where: trabajo, select: { id: true }, orderBy: orden, take: TOPE_TRABAJO_CRM + 1 }),
    ]);
    /* Aparte: sin búsqueda no hay nada que marcar. El CRM lo cruza con el
       conjunto de arriba, así que un informe que cambió entre las dos lecturas
       no aparece donde no toca. */
    const coinciden = dto.buscar
      ? await this.db.informe.findMany({ where: { ...trabajo, ...coincideCon(dto.buscar) }, select: { id: true }, orderBy: orden, take: TOPE_TRABAJO_CRM })
      : null;
    return {
      totales: { todos, abiertos, vencidosSinAbrir },
      vigentesSinAbrir: vigentes.slice(0, TOPE_TRABAJO_CRM).map(informe => informe.id),
      truncado: vigentes.length > TOPE_TRABAJO_CRM,
      ...(coinciden ? { coinciden: coinciden.map(informe => informe.id) } : {}),
    };
  }

  /**
   * El enlace para que la clínica compruebe QUÉ va a enviar antes de
   * enviarlo: la vista del portal con el PDF, como la ve el médico.
   *
   * El CRM recibe el enlace, nunca el PDF. Y **no toca `abiertoEn`**: esa
   * marca significa que lo vio la PACIENTE; si la pusiera quien revisa desde el
   * CRM, recepción dejaría de poder distinguir a quién seguir. Ver
   * `revision.ts`.
   */
  async enlaceRevision(informeId: string) {
    const informe = await this.db.informe.findFirst({ where: { id: informeId, estado: 'PUBLICADO' }, select: { id: true } });
    if (!informe) problem(404, 'INFORME_NO_ENCONTRADO', 'No hay un informe publicado con ese identificador.');
    const expiraEn = new Date(Date.now() + DURACION_REVISION_MS);
    return { url: `${new URL(this.config.portalUrl).origin}/revision/${firmarRevision(informe.id, expiraEn, this.config.hmacKey)}`, expiraEn };
  }

  /** El PDF que abre un enlace de revisión vigente: la versión para ver. */
  async pdfRevision(enlace: string): Promise<Buffer> {
    const informeId = leerRevision(enlace, this.config.hmacKey);
    if (!informeId) problem(401, 'REVISION_VENCIDA', 'Este enlace de revisión ya no es válido. Vuelve a abrir el informe desde el CRM.');
    const informe = await this.db.informe.findFirst({ where: { id: informeId, estado: 'PUBLICADO' }, select: { archivoId: true, archivoVistaId: true } });
    if (!informe?.archivoId) problem(404, 'INFORME_NO_ENCONTRADO', 'Este informe ya no está publicado.');
    const pdf = await this.readFile(archivoParaVer(informe));
    await this.db.auditoria.create({ data: { actorId: 'crm', accion: 'PDF_REVISADO_CRM', informeId } });
    return pdf;
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
    const fecha = fechaDeEstudio(dto.fechaEstudio);
    const result = await this.db.$transaction(async tx => {
      if (!await tx.paciente.findUnique({ where: { id: dto.pacienteId } })) problem(404, 'PACIENTE_NO_ENCONTRADO', 'Selecciona un paciente registrado.');
      const report = await tx.informe.create({ data: { ...dto, estudio: dto.estudio.trim(), fechaEstudio: fecha, medicoId: actor.id } });
      const access = await tx.accesoPaciente.create({ data: { informeId: report.id, expiraEn: vencimiento() } });
      await this.audit(tx, actor.id, 'INFORME_CREADO', report.id);
      return { informe: report, acceso: { id: access.id, expiraEn: access.expiraEn, url: `${this.config.portalUrl}/${access.id}` } };
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
    await this.db.$transaction(async tx => {
      const updated = await tx.informe.updateMany({ where: { id, ...scope(actor), revision: dto.revision, estado: 'BORRADOR', archivoId: { not: null } }, data: { estado: 'PUBLICADO', publicadoEn: new Date(), revision: { increment: 1 } } });
      if (!updated.count) problem(409, 'PUBLICACION_NO_DISPONIBLE', 'Adjunta el PDF y actualiza el informe antes de publicar. Puede haber sido publicado por otra persona.');
      const acceso = await tx.accesoPaciente.findUnique({ where: { informeId: id } });
      if (!acceso || acceso.revocadoEn || acceso.expiraEn <= new Date()) problem(409, 'ACCESO_VENCIDO', 'Renueva y entrega el código de acceso al paciente antes de publicar.');
      await this.audit(tx, actor.id, 'INFORME_PUBLICADO', id);
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
      await this.audit(tx, actor.id, 'INFORME_RETIRADO', id);
    });
    return this.get(id, actor);
  }
  /**
   * Extiende el acceso 30 días desde hoy. El enlace es el mismo —es la llave
   * y ya está en el WhatsApp del paciente—, así que renovar no le obliga a
   * esperar otro mensaje. Para cortar un enlace que no debía salir, se retira.
   */
  async renewAccess(id: string, actor: Actor) {
    const report = await this.ensure(id, actor);
    if (report.estado === 'RETIRADO') problem(409, 'INFORME_RETIRADO', 'Un informe retirado no puede volver a habilitarse.');
    const access = await this.db.$transaction(async tx => {
      await tx.informe.update({ where: { id }, data: { revision: { increment: 1 } } });
      const renewed = await this.extender(tx, id);
      await this.audit(tx, actor.id, 'ACCESO_RENOVADO', id);
      return renewed;
    });
    return { id: access.id, expiraEn: access.expiraEn, url: `${this.config.portalUrl}/${access.id}` };
  }
  /**
   * La misma renovación, pedida por el CRM cuando recepción reenvía un aviso
   * cuyo acceso venció. Solo informes publicados: un borrador o un retirado no
   * se reabren desde fuera.
   */
  async renewAccessForCrm(id: string) {
    const renewed = await this.db.$transaction(async tx => {
      const informe = await tx.informe.findUnique({ where: { id }, select: { estado: true } });
      if (informe?.estado !== 'PUBLICADO') problem(404, 'INFORME_NO_ENCONTRADO', 'Ese informe no está publicado.');
      const acceso = await this.extender(tx, id);
      await this.audit(tx, 'crm', 'ACCESO_RENOVADO_CRM', id);
      return acceso;
    });
    return { accesoId: renewed.id, expiraEn: renewed.expiraEn };
  }
  private async extender(tx: Transaction, informeId: string) {
    await tx.$queryRaw`SELECT id FROM "AccesoPaciente" WHERE "informeId" = ${informeId}::uuid FOR UPDATE`;
    const actual = await tx.accesoPaciente.findUniqueOrThrow({ where: { informeId } });
    if (actual.revocadoEn) problem(409, 'ACCESO_REVOCADO', 'El acceso de este informe fue revocado al retirarlo.');
    return tx.accesoPaciente.update({ where: { informeId }, data: { expiraEn: vencimiento() } });
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

/**
 * El archivo que se MUESTRA: la versión liviana si ya existe, si no el
 * original. El médico descarga siempre el original (`download`).
 */
export function archivoParaVer(informe: { archivoId: string | null; archivoVistaId: string | null }): string {
  const archivo = informe.archivoVistaId ?? informe.archivoId;
  if (!archivo) problem(409, 'RESULTADO_EN_PREPARACION', 'El informe todavía está en preparación.');
  return archivo;
}

/** El acceso del paciente dura 30 días desde que se crea o se renueva. */
/**
 * Fecha clínica del estudio, validada contra el calendario de Bolivia.
 *
 * Se exporta porque la entrada de FileMaker crea informes por otra puerta: dos
 * copias de esta regla divergirían y un informe con fecha futura acabaría
 * entrando por la puerta que nadie corrigió.
 */
export function fechaDeEstudio(valor: string): Date {
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (!Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor || valor > hoy || valor < '1900-01-01') problem(400, 'FECHA_INVALIDA', 'Indica la fecha real del estudio, sin usar una fecha futura.');
  return fecha;
}

export function vencimiento(): Date {
  return new Date(Date.now() + 30 * 86400_000);
}
