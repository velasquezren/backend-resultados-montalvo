import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Database } from '../database';
import { aligerarPdf } from '../files/aligerar';
import { PrivateFiles, validatePdf } from '../files/files';
import { Results } from './results';

/**
 * Genera la versión liviana —la que se VE— de cada informe publicado.
 *
 * La corre el worker, no la publicación: recomprimir las fotos tarda un par
 * de segundos y la publicación es una transacción que el médico espera. Hasta
 * que exista, paciente y recepción ven el original, así que un retraso nunca
 * deja a nadie sin informe.
 *
 * El original sigue intacto (archivo publicado inmutable). La versión liviana
 * es un `Archivo` más del mismo informe, con su propio SHA-256, cifrado igual
 * que el original y verificado igual al leerlo.
 */
@Injectable()
export class VistasLivianas {
  constructor(private readonly db: Database, private readonly files: PrivateFiles, private readonly results: Results) {}

  /** Procesa hasta `limite` informes publicados sin versión para ver. Devuelve cuántos miró. */
  async generarPendientes(limite = 5): Promise<number> {
    const pendientes = await this.db.informe.findMany({
      where: { estado: 'PUBLICADO', archivoId: { not: null }, archivoVistaId: null },
      select: { id: true, archivoId: true, archivo: { select: { paginas: true } } },
      orderBy: [{ publicadoEn: 'desc' }, { id: 'desc' }],
      take: limite,
    });
    for (const informe of pendientes) {
      try {
        await this.generar(informe.id, informe.archivoId!, informe.archivo!.paginas);
      } catch {
        /* Un fallo de almacenamiento es pasajero: se deja pendiente y se
           reintenta en la próxima vuelta. No se registra el informe entero. */
        process.stderr.write(JSON.stringify({ evento: 'vista_liviana_no_generada', informeId: informe.id }) + '\n');
      }
    }
    return pendientes.length;
  }

  private async generar(informeId: string, archivoId: string, paginasOriginal: number): Promise<void> {
    /* `readFile` verifica el SHA-256: nunca se aligera un original alterado. */
    const original = await this.results.readFile(archivoId);
    const liviano = await this.aligerar(original, paginasOriginal);

    if (!liviano) {
      /* Nada que ganar (o no se pudo sin riesgo): la vista ES el original. */
      await this.db.informe.updateMany({ where: { id: informeId, archivoId, archivoVistaId: null }, data: { archivoVistaId: archivoId } });
      return;
    }

    const clave = `${randomUUID()}.pdf`;
    await this.files.put(clave, liviano.buffer);
    try {
      await this.db.$transaction(async tx => {
        const archivo = await tx.archivo.create({ data: { informeId, clave, bytes: liviano.buffer.length, paginas: liviano.paginas, sha256: liviano.sha256 } });
        /* Si entretanto lo retiraron o le cambiaron el PDF, esta versión ya no
           corresponde a nada: se descarta. Sin tocar `revision`: es un
           derivado, no un cambio del informe que deba invalidar lo que el
           médico tiene abierto. */
        const actualizado = await tx.informe.updateMany({
          where: { id: informeId, archivoId, archivoVistaId: null, estado: 'PUBLICADO' },
          data: { archivoVistaId: archivo.id },
        });
        if (!actualizado.count) throw new Error('informe_cambio');
        await tx.auditoria.create({ data: { actorId: 'sistema', accion: 'PDF_VISTA_GENERADA', informeId } });
      });
    } catch (error) {
      await this.files.delete(clave).catch(() => process.stderr.write(JSON.stringify({ evento: 'archivo_huerfano', clave }) + '\n'));
      if (error instanceof Error && error.message === 'informe_cambio') return;
      throw error;
    }
  }

  /**
   * La versión liviana, solo si sale sana: mismas páginas y pasa la misma
   * validación que un PDF subido por el médico. Si algo no cuadra, `null`.
   */
  private async aligerar(original: Buffer, paginasOriginal: number) {
    try {
      const buffer = await aligerarPdf(original);
      if (!buffer) return null;
      const { paginas, sha256 } = await validatePdf(buffer);
      return paginas === paginasOriginal ? { buffer, paginas, sha256 } : null;
    } catch {
      return null;
    }
  }
}
