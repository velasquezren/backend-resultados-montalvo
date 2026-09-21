import { Inject, Injectable } from '@nestjs/common';
import { AppConfig, CONFIG } from '../config';
import { Database } from '../database';
import { NotificationTransport, record, TRANSPORT } from './meta';
import { EstadoAviso } from '../generated/prisma/client';

@Injectable()
export class Notifications {
  constructor(private readonly db: Database, @Inject(CONFIG) private readonly config: AppConfig, @Inject(TRANSPORT) private readonly transport: NotificationTransport) {}
  /** Se ejecuta solo desde el proceso worker, nunca al cargar la web. */
  async tick(): Promise<boolean> {
    await this.db.aviso.updateMany({ where: { estado: 'ENVIANDO', updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } }, data: { estado: 'INCIERTO' } });
    if (!this.config.notifications) return false;
    const job = await this.db.$transaction(async tx => {
      // Límite de intentos diarios compartido por todas las instancias.
      // No representa un precio; incluye los intentos de resultado incierto.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(4927101)`;
      const dia = new Date().toISOString().slice(0, 10);
      const quota = await tx.cuotaAvisos.upsert({ where: { dia }, create: { dia }, update: {} });
      if (quota.intentos >= this.config.dailyLimit) return null;
      const ids = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Aviso" WHERE estado = 'PENDIENTE' AND "proximoIntento" <= (NOW() AT TIME ZONE 'UTC') AND intentos < 3
        ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!ids[0]) return null;
      await tx.cuotaAvisos.update({ where: { dia }, data: { intentos: { increment: 1 } } });
      return tx.aviso.update({ where: { id: ids[0].id }, data: { estado: 'ENVIANDO', intentos: { increment: 1 } }, include: { informe: { include: { acceso: true } } } });
    });
    if (!job) return false;
    if (job.informe.estado !== 'PUBLICADO' || !job.informe.acceso || job.informe.acceso.revocadoEn || job.informe.acceso.expiraEn <= new Date()) {
      await this.db.aviso.updateMany({ where: { id: job.id, estado: 'ENVIANDO' }, data: { estado: 'CANCELADO' } }); return true;
    }
    const result = await this.transport.send({ id: job.id, intento: job.intentos, telefono: job.telefono, accesoId: job.informe.acceso.id });
    if (result.estado === 'ACEPTADO') {
      // Un webhook puede llegar antes del HTTP: no sobrescribir su estado.
      await this.db.aviso.updateMany({ where: { id: job.id, intentos: job.intentos, estado: 'ENVIANDO' }, data: { estado: 'ACEPTADO', metaId: result.metaId, codigoError: null } });
    } else if (result.estado === 'FALLIDO') {
      await this.db.aviso.updateMany({ where: { id: job.id, intentos: job.intentos, estado: 'ENVIANDO' }, data: {
        estado: result.reintentable && job.intentos < 3 ? 'PENDIENTE' : 'FALLIDO', codigoError: result.codigo ?? null,
        proximoIntento: new Date(Date.now() + job.intentos * 60_000),
      } });
    } else {
      // Un timeout pudo ocurrir DESPUÉS de la aceptación. Repetir cobraría dos veces.
      await this.db.aviso.updateMany({ where: { id: job.id, intentos: job.intentos, estado: 'ENVIANDO' }, data: { estado: 'INCIERTO' } });
    }
    return true;
  }
  async receive(payload: unknown): Promise<void> {
    if (!record(payload) || !Array.isArray(payload.entry)) return;
    for (const entry of payload.entry.slice(0, 100)) {
      if (!record(entry) || !Array.isArray(entry.changes)) continue;
      for (const change of entry.changes.slice(0, 100)) {
        if (!record(change) || !record(change.value)) continue;
        const value = change.value;
        if (!record(value.metadata) || value.metadata.phone_number_id !== process.env.WHATSAPP_PHONE_NUMBER_ID || !Array.isArray(value.statuses)) continue;
        for (const item of value.statuses.slice(0, 100)) {
          if (!record(item) || typeof item.id !== 'string' || typeof item.status !== 'string') continue;
          const callback = typeof item.biz_opaque_callback_data === 'string' ? item.biz_opaque_callback_data.split(':') : [];
          const id = callback[0]; const attempt = Number(callback[1]);
          let job = await this.db.aviso.findUnique({ where: { metaId: item.id } });
          if (!job && id && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id) && Number.isInteger(attempt)) job = await this.db.aviso.findFirst({ where: { id, intentos: attempt, estado: { in: ['ENVIANDO', 'INCIERTO'] } } });
          if (!job) continue;
          const state: Partial<Record<string, EstadoAviso>> = { sent: 'ACEPTADO', delivered: 'ENTREGADO', read: 'LEIDO', failed: 'FALLIDO' };
          const next = state[item.status]; if (!next) continue;
          const allowed: Record<EstadoAviso, EstadoAviso[]> = {
            PENDIENTE: [], ENVIANDO: [], CANCELADO: [], INCIERTO: [],
            ACEPTADO: ['ENVIANDO', 'INCIERTO'],
            ENTREGADO: ['ENVIANDO', 'INCIERTO', 'ACEPTADO', 'FALLIDO'],
            LEIDO: ['ENVIANDO', 'INCIERTO', 'ACEPTADO', 'ENTREGADO', 'FALLIDO'],
            FALLIDO: ['ENVIANDO', 'INCIERTO', 'ACEPTADO'],
          };
          const error = Array.isArray(item.errors) && record(item.errors[0]) ? item.errors[0] : undefined;
          await this.db.aviso.updateMany({ where: { id: job.id, intentos: job.intentos, estado: { in: allowed[next] } }, data: { estado: next, metaId: item.id, codigoError: next === 'FALLIDO' && typeof error?.code === 'number' ? error.code : null } });
        }
      }
    }
  }
  async cleanup(): Promise<void> {
    await this.db.sesion.deleteMany({ where: { expiraEn: { lt: new Date() } } });
    await this.db.limiteIntentos.deleteMany({ where: { inicio: { lt: new Date(Date.now() - 2 * 86400_000) } } });
  }
}
