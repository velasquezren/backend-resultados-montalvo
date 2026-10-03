import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { bearer } from '../auth/auth';
import { equalSecret } from '../auth/crypto';
import { randomUUID } from 'node:crypto';
import { AppConfig, CONFIG } from '../config';
import { Database, Prisma } from '../database';
import { FileMakerInformeDto } from '../dto';
import { problem } from '../errors';
import { PrivateFiles, PdfScanner, validatePdf } from '../files/files';
import { normalizeId } from './patients';
import { fechaDeEstudio, vencimiento } from './results';

/**
 * La credencial, comprobada en un GUARD y no dentro del handler.
 *
 * En Nest los guards corren antes que los interceptores y los pipes. Con la
 * comprobación dentro del handler, una llamada sin credencial recibía primero
 * la validación del cuerpo —un 400 que enumera los campos del endpoint a quien
 * no se ha identificado— y, peor, el servidor ya había aceptado y procesado su
 * multipart de hasta 10 MB. Aquí se rechaza antes de leer nada.
 */
@Injectable()
export class FileMakerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const esperado = process.env.FILEMAKER_API_TOKEN;
    const recibido = bearer(context.switchToHttp().getRequest<Request>());
    if (!esperado || esperado.length < 32 || !equalSecret(recibido, esperado)) problem(401, 'INTEGRACION_NO_AUTORIZADA', 'Integración no autorizada.');
    return true;
  }
}

/** FileMaker crea el informe o sustituye su PDF por la misma referencia. */
const ESTUDIO_POR_DEFECTO = 'Ecografía';

@Injectable()
export class FileMakerIntake {
  constructor(
    private readonly db: Database,
    private readonly files: PrivateFiles,
    private readonly scanner: PdfScanner,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async recibir(dto: FileMakerInformeDto, buffer: Buffer) {
    /* El informe es de un médico concreto: es quien lo verá en su portal.
       FileMaker puede no tener ese dato a mano, así que se admite uno por
       defecto del servidor — con el coste de que todos caigan en esa cuenta. */
    const correo = (dto.medico ?? process.env.FILEMAKER_MEDICO_POR_DEFECTO ?? '').trim().toLowerCase();
    if (!correo) problem(400, 'MEDICO_REQUERIDO', 'Manda el campo «medico», o configura FILEMAKER_MEDICO_POR_DEFECTO en el servidor.');
    const medico = await this.db.usuario.findFirst({ where: { email: correo, activo: true }, select: { id: true } });
    if (!medico) problem(404, 'MEDICO_NO_ENCONTRADO', `«${correo}» no es un médico activo del portal.`);

    const fecha = fechaDeEstudio(dto.fechaEstudio);

    /* El PDF se valida y se analiza ANTES de crear nada: un archivo
       rechazado no debe dejar un borrador huérfano en el portal. */
    const [validacion, antivirus] = await Promise.allSettled([validatePdf(buffer), this.scanner.scan(buffer)]);
    if (validacion.status === 'rejected') throw validacion.reason;
    if (antivirus.status === 'rejected') throw antivirus.reason;

    const pac = normalizeId(dto.pac);
    const ci = normalizeId(dto.ci);
    if (!pac && !ci) problem(400, 'IDENTIFICADOR_REQUERIDO', 'Manda el PAC o el CI del paciente.');

    const clave = `${randomUUID()}.pdf`;
    await this.files.put(clave, buffer);
    let conservarArchivo = false;
    try {
      const resultado = await this.db.$transaction(async tx => {
        // Serializa también el primer envío: dos pulsaciones no crean duplicados.
        if (dto.referencia) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'filemaker:informe:' + dto.referencia}, 0))`;
          const previo = await tx.informe.findUnique({
            where: { referenciaExterna: dto.referencia },
            include: { paciente: true, archivo: true },
          });
          if (previo) {
            if ((pac && pac !== previo.paciente.pac) || (ci && ci !== previo.paciente.ci)
              || previo.medicoId !== medico.id || previo.fechaEstudio.getTime() !== fecha.getTime()
              || (dto.estudio && dto.estudio.trim() !== previo.estudio)) {
              problem(409, 'REFERENCIA_OTRO_ESTUDIO', 'Esta referencia pertenece a otro paciente o estudio. Revisa el PAC, la fecha y la referencia en FileMaker.');
            }
            if (previo.estado === 'RETIRADO') problem(409, 'INFORME_RETIRADO', 'El informe está retirado y no se puede reemplazar desde FileMaker.');
            const actualizado = previo.archivo?.sha256 !== validacion.value.sha256;
            const publicar = dto.publicar && previo.estado === 'BORRADOR';
            if (actualizado || publicar) {
              const archivo = actualizado
                ? await tx.archivo.create({ data: { informeId: previo.id, clave, bytes: buffer.length, ...validacion.value } })
                : null;
              const cambio = await tx.informe.updateMany({
                where: { id: previo.id, revision: previo.revision, estado: previo.estado },
                data: {
                  ...(archivo ? { archivoId: archivo.id, archivoVistaId: null } : {}),
                  ...(publicar ? { estado: 'PUBLICADO' as const, publicadoEn: new Date() } : {}),
                  revision: { increment: 1 },
                },
              });
              if (!cambio.count) problem(409, 'INFORME_MODIFICADO', 'El informe cambió durante el envío. Revisa su estado y vuelve a intentarlo.');
              await tx.auditoria.create({ data: {
                actorId: medico.id, informeId: previo.id,
                accion: actualizado ? 'PDF_REEMPLAZADO_FILEMAKER' : 'INFORME_DESDE_FILEMAKER_PUBLICADO',
              } });
            }
            // Conserva acceso, caducidad, sesiones e historial de archivos.
            const informe = await tx.informe.findUniqueOrThrow({ where: { id: previo.id }, select: this.seleccion });
            return { informe, repetido: true, actualizado, conservarArchivo: actualizado };
          }
        }
        const paciente = await this.pacienteDe(tx, dto, medico.id);
        const creado = await tx.informe.create({
          data: { pacienteId: paciente.id, medicoId: medico.id, estudio: dto.estudio?.trim() || ESTUDIO_POR_DEFECTO, fechaEstudio: fecha, referenciaExterna: dto.referencia ?? null },
        });
        const archivo = await tx.archivo.create({ data: { informeId: creado.id, clave, bytes: buffer.length, ...validacion.value } });
        /* Publicar aquí y no llamando a `Results.publish` porque todo nace en
           esta transacción: no hay un estado intermedio que otra petición
           pudiera ver a medias, ni una `revision` que reconciliar. */
        await tx.informe.update({
          where: { id: creado.id },
          data: { archivoId: archivo.id, revision: { increment: 1 }, ...(dto.publicar ? { estado: 'PUBLICADO' as const, publicadoEn: new Date() } : {}) },
        });
        await tx.accesoPaciente.create({ data: { informeId: creado.id, expiraEn: vencimiento() } });
        await tx.auditoria.create({ data: { actorId: medico.id, accion: dto.publicar ? 'INFORME_DESDE_FILEMAKER_PUBLICADO' : 'INFORME_DESDE_FILEMAKER', informeId: creado.id } });
        const informe = await tx.informe.findUniqueOrThrow({ where: { id: creado.id }, select: this.seleccion });
        return { informe, repetido: false, actualizado: false, conservarArchivo: true };
      });
      conservarArchivo = resultado.conservarArchivo;
      return this.respuesta(resultado.informe, resultado.repetido, resultado.actualizado);
    } finally {
      if (!conservarArchivo) await this.files.delete(clave).catch(() => process.stderr.write(JSON.stringify({ evento: 'archivo_huerfano', clave }) + '\n'));
    }
  }

  /** Resuelve al paciente dentro de la misma transacción que su informe. */
  private async pacienteDe(tx: Prisma.TransactionClient, dto: FileMakerInformeDto, actorId: string) {
    const pac = normalizeId(dto.pac);
    const ci = normalizeId(dto.ci);
    // Orden fijo: distintos estudios del mismo paciente pueden llegar juntos.
    for (const identificador of [pac && `filemaker:pac:${pac}`, ci && `filemaker:ci:${ci}`].filter(Boolean).sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identificador}, 0))`;
    }
    const buscar = { OR: [...(pac ? [{ pac }] : []), ...(ci ? [{ ci }] : [])] };
    const encontrado = await tx.paciente.findFirst({ where: buscar });
    if (encontrado) return encontrado;
    const nuevo = await tx.paciente.create({ data: { nombre: dto.nombre.trim(), pac, ci } });
    await tx.auditoria.create({ data: { actorId, accion: 'PACIENTE_REGISTRADO' } });
    return nuevo;
  }

  private readonly seleccion = {
    id: true, estado: true, estudio: true, fechaEstudio: true,
    paciente: { select: { id: true, nombre: true, ci: true, pac: true } },
    acceso: { select: { id: true, expiraEn: true } },
    archivo: { select: { paginas: true, bytes: true } },
  } satisfies Prisma.InformeSelect;

  private respuesta(informe: Prisma.InformeGetPayload<{ select: FileMakerIntake['seleccion'] }>, repetido: boolean, actualizado: boolean) {
    return {
      informeId: informe.id,
      estado: informe.estado,
      /** `true` = se reutilizó el mismo informe y enlace. */
      repetido,
      actualizado,
      paciente: informe.paciente,
      estudio: informe.estudio,
      fechaEstudio: informe.fechaEstudio,
      archivo: informe.archivo,
      acceso: informe.acceso && { id: informe.acceso.id, expiraEn: informe.acceso.expiraEn, url: `${this.config.portalUrl}/${informe.acceso.id}` },
    };
  }
}
