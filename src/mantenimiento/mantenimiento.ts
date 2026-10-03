import { Injectable } from '@nestjs/common';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { directorioSubidas } from '../config';
import { Database } from '../database';

/** Una subida de adjunto tarda minutos como mucho; lo que pasa de una hora quedó de un corte. */
const VIGENCIA_SUBIDA_MS = 60 * 60_000;

/**
 * Limpieza periódica: sesiones vencidas, contadores de intentos viejos y
 * subidas de adjuntos que quedaron a medias.
 *
 * La corre el worker una vez por hora, junto a la generación de versiones
 * livianas (`VistasLivianas`), que corre cada 30 s. Hasta el 2026-09-22 ese
 * proceso también despachaba avisos de WhatsApp, pero el emisor es el CRM —una sola
 * app de Meta, un solo webhook y el mensaje en la conversación del paciente—
 * y aquel camino se retiró sin haberse encendido nunca.
 */
@Injectable()
export class Mantenimiento {
  constructor(private readonly db: Database) {}

  async limpiar(): Promise<void> {
    await this.db.sesion.deleteMany({ where: { expiraEn: { lt: new Date() } } });
    await this.db.limiteIntentos.deleteMany({ where: { inicio: { lt: new Date(Date.now() - 2 * 86400_000) } } });
    await this.borrarSubidasHuerfanas();
  }

  /**
   * Subidas de adjuntos que quedaron en disco: la API las borra al terminar
   * cada una, pero un reinicio a mitad de la verificación las deja. Son videos
   * de pacientes sin cifrar; no pueden quedarse.
   */
  async borrarSubidasHuerfanas(ahora = Date.now()): Promise<number> {
    const carpeta = directorioSubidas();
    const nombres = await readdir(carpeta).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [] as string[];
      throw error;
    });
    let borradas = 0;
    for (const nombre of nombres) {
      const ruta = join(carpeta, nombre);
      const datos = await stat(ruta).catch(() => null);
      if (datos?.isFile() && ahora - datos.mtimeMs > VIGENCIA_SUBIDA_MS) {
        await unlink(ruta).catch(() => undefined);
        borradas++;
      }
    }
    return borradas;
  }
}
