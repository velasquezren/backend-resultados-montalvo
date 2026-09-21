import { Inject, Injectable } from '@nestjs/common';
import { Attempts } from '../auth/auth';
import { digest, equalSecret, token } from '../auth/crypto';
import { AppConfig, CONFIG } from '../config';
import { Database } from '../database';
import { problem } from '../errors';
import { Results } from './results';

@Injectable()
export class PatientPortal {
  constructor(private readonly db: Database, private readonly attempts: Attempts, private readonly results: Results, @Inject(CONFIG) private readonly config: AppConfig) {}
  async login(accesoId: string, codigo: string, ip: string) {
    await this.attempts.consume('paciente-ip', ip, 30);
    await this.attempts.consume('paciente-acceso', accesoId, 10);
    return this.db.$transaction(async tx => {
      // Serializa la autenticación con renovación/revocación del acceso.
      await tx.$queryRaw`SELECT id FROM "AccesoPaciente" WHERE id = ${accesoId}::uuid FOR UPDATE`;
      const access = await tx.accesoPaciente.findUnique({ where: { id: accesoId }, include: { informe: true } });
      const valid = equalSecret(digest(codigo, this.config.hmacKey), access?.codigoHash ?? digest('invalido', this.config.hmacKey));
      if (!valid || !access || access.revocadoEn || access.expiraEn <= new Date() || access.informe.estado === 'RETIRADO') problem(401, 'ACCESO_NO_VALIDO', 'Revisa el enlace y el código entregado por la clínica. Si no puedes ingresar, solicita un acceso nuevo.');
      const secret = token(); const expiraEn = new Date(Math.min(Date.now() + 15 * 60_000, access.expiraEn.getTime()));
      await tx.sesion.create({ data: { accesoId, tokenHash: digest(secret, this.config.hmacKey), expiraEn } });
      return { token: secret, expiraEn };
    });
  }

  private async access(secret: string) {
    const session = await this.db.sesion.findUnique({ where: { tokenHash: digest(secret, this.config.hmacKey) }, include: { acceso: { include: { informe: { include: { medico: { select: { nombre: true } } } } } } } });
    const access = session?.acceso;
    if (!session || !access || session.expiraEn <= new Date() || access.expiraEn <= new Date() || access.revocadoEn || access.informe.estado === 'RETIRADO') problem(401, 'ACCESO_NO_VALIDO', 'Tu acceso terminó o fue desactivado. Vuelve a ingresar o contacta con la clínica.');
    return { access, session };
  }
  async detail(secret: string) {
    const { access } = await this.access(secret); const report = access.informe;
    return { estado: report.estado, estudio: report.estudio, fechaEstudio: report.fechaEstudio, medico: report.medico.nombre,
      disponible: report.estado === 'PUBLICADO', mensaje: report.estado === 'PUBLICADO' ? 'Tu informe está disponible. Puedes descargarlo.' : 'Estamos preparando tu informe. Puedes volver a consultar más adelante.' };
  }
  async download(secret: string) {
    const { access } = await this.access(secret); const report = access.informe;
    if (report.estado !== 'PUBLICADO' || !report.archivoId) problem(409, 'RESULTADO_EN_PREPARACION', 'Tu informe todavía está en preparación. Vuelve a consultar más adelante.');
    const file = await this.results.readFile(report.archivoId);
    // Revalida después de leer el almacenamiento: pudo retirarse entretanto.
    await this.access(secret);
    await this.db.auditoria.create({ data: { actorId: access.id, informeId: report.id, accion: 'PDF_DESCARGADO_PACIENTE' } });
    return file;
  }
  async logout(secret: string) {
    await this.db.sesion.deleteMany({ where: { tokenHash: digest(secret, this.config.hmacKey), accesoId: { not: null } } });
    return { cerrado: true };
  }
}
