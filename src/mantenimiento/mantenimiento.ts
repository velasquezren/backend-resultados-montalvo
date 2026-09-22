import { Injectable } from '@nestjs/common';
import { Database } from '../database';

/**
 * Limpieza periódica: sesiones vencidas y contadores de intentos viejos.
 *
 * Es lo único que queda del proceso worker. Hasta el 2026-09-22 ese proceso
 * también despachaba avisos de WhatsApp, pero el emisor es el CRM —una sola
 * app de Meta, un solo webhook y el mensaje en la conversación del paciente—
 * y aquel camino se retiró sin haberse encendido nunca.
 */
@Injectable()
export class Mantenimiento {
  constructor(private readonly db: Database) {}

  async limpiar(): Promise<void> {
    await this.db.sesion.deleteMany({ where: { expiraEn: { lt: new Date() } } });
    await this.db.limiteIntentos.deleteMany({ where: { inicio: { lt: new Date(Date.now() - 2 * 86400_000) } } });
  }
}
