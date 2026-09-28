import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfig, CONFIG } from '../config';
import { Database, Prisma } from '../database';
import { FileMakerInformeDto } from '../dto';
import { problem } from '../errors';
import { PrivateFiles, PdfScanner, validatePdf } from '../files/files';
import { normalizeId } from './patients';
import { fechaDeEstudio, vencimiento } from './results';

/**
 * Entrada desde FileMaker: una sola llamada deja el informe listo para que el
 * médico lo revise y publique.
 *
 * **Deja el informe en BORRADOR a propósito.** Publicar exige confirmar que el
 * PDF corresponde a ese paciente, y eso no lo puede afirmar un guion: que
 * FileMaker genere el PDF correcto no es lo mismo que comprobar que se adjuntó
 * a la ficha correcta, y publicar no tiene vuelta atrás —el enlace del paciente
 * queda vivo al instante—. El médico abre el portal, ve el informe ya montado
 * y publica de un clic.
 */
@Injectable()
export class FileMakerIntake {
  constructor(
    private readonly db: Database,
    private readonly files: PrivateFiles,
    private readonly scanner: PdfScanner,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async recibir(dto: FileMakerInformeDto, buffer: Buffer) {
    /* 1. Idempotencia: el mismo registro de FileMaker devuelve su informe. */
    if (dto.referencia) {
      const previo = await this.db.informe.findUnique({ where: { referenciaExterna: dto.referencia }, select: this.seleccion });
      if (previo) return this.respuesta(previo, true);
    }

    /* 2. El informe es de un médico concreto: es quien lo verá en su portal. */
    const medico = await this.db.usuario.findFirst({ where: { email: dto.medico.trim().toLowerCase(), activo: true }, select: { id: true } });
    if (!medico) problem(404, 'MEDICO_NO_ENCONTRADO', 'Ese correo no corresponde a un médico activo del portal.');

    const fecha = fechaDeEstudio(dto.fechaEstudio);

    /* 3. El PDF se valida y se analiza ANTES de crear nada: un archivo
       rechazado no debe dejar un borrador huérfano en el portal. */
    const [validacion, antivirus] = await Promise.allSettled([validatePdf(buffer), this.scanner.scan(buffer)]);
    if (validacion.status === 'rejected') throw validacion.reason;
    if (antivirus.status === 'rejected') throw antivirus.reason;

    const paciente = await this.pacienteDe(dto, medico.id);

    const clave = `${randomUUID()}.pdf`;
    await this.files.put(clave, buffer);
    try {
      const informe = await this.db.$transaction(async tx => {
        const creado = await tx.informe.create({
          data: { pacienteId: paciente.id, medicoId: medico.id, estudio: dto.estudio.trim(), fechaEstudio: fecha, referenciaExterna: dto.referencia ?? null },
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
        return tx.informe.findUniqueOrThrow({ where: { id: creado.id }, select: this.seleccion });
      });
      return this.respuesta(informe, false);
    } catch (error) {
      await this.files.delete(clave).catch(() => process.stderr.write(JSON.stringify({ evento: 'archivo_huerfano', clave }) + '\n'));
      throw error;
    }
  }

  /**
   * Busca al paciente por sus identificadores y, si no está, lo registra.
   *
   * `create` y luego releer ante un choque del índice único, en vez de
   * comprobar antes: entre el SELECT y el INSERT cabe otra llamada, y bajo dos
   * botones pulsados a la vez uno de los dos chocaría igual.
   */
  private async pacienteDe(dto: FileMakerInformeDto, actorId: string) {
    const pac = normalizeId(dto.pac);
    const ci = normalizeId(dto.ci);
    if (!pac && !ci) problem(400, 'IDENTIFICADOR_REQUERIDO', 'Manda el PAC o el CI del paciente.');
    const buscar = { OR: [...(pac ? [{ pac }] : []), ...(ci ? [{ ci }] : [])] };

    const encontrado = await this.db.paciente.findFirst({ where: buscar });
    if (encontrado) return encontrado;
    try {
      return await this.db.$transaction(async tx => {
        const nuevo = await tx.paciente.create({ data: { nombre: dto.nombre.trim(), pac, ci } });
        await tx.auditoria.create({ data: { actorId, accion: 'PACIENTE_REGISTRADO' } });
        return nuevo;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const yaCreado = await this.db.paciente.findFirst({ where: buscar });
        if (yaCreado) return yaCreado;
      }
      throw error;
    }
  }

  private readonly seleccion = {
    id: true, estado: true, estudio: true, fechaEstudio: true,
    paciente: { select: { id: true, nombre: true, ci: true, pac: true } },
    acceso: { select: { id: true, expiraEn: true } },
    archivo: { select: { paginas: true, bytes: true } },
  } satisfies Prisma.InformeSelect;

  private respuesta(informe: Prisma.InformeGetPayload<{ select: FileMakerIntake['seleccion'] }>, repetido: boolean) {
    return {
      informeId: informe.id,
      estado: informe.estado,
      /** `true` = esta referencia ya se había cargado; no se creó nada nuevo. */
      repetido,
      paciente: informe.paciente,
      estudio: informe.estudio,
      fechaEstudio: informe.fechaEstudio,
      archivo: informe.archivo,
      acceso: informe.acceso && { id: informe.acceso.id, expiraEn: informe.acceso.expiraEn, url: `${this.config.portalUrl}/${informe.acceso.id}` },
    };
  }
}
