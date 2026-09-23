import { Inject, Injectable } from '@nestjs/common';
import { Attempts } from '../auth/auth';
import { digest, token } from '../auth/crypto';
import { AppConfig, CONFIG } from '../config';
import { Database } from '../database';
import { problem } from '../errors';
import { Results } from './results';

@Injectable()
export class PatientPortal {
  constructor(private readonly db: Database, private readonly attempts: Attempts, private readonly results: Results, @Inject(CONFIG) private readonly config: AppConfig) {}
  /**
   * El enlace es la llave: abrirlo da una sesión de 15 minutos para ESE
   * informe, sin código (decidido con la clínica el 2026-09-23: el código de
   * 12 caracteres en papel era el paso que más frenaba al paciente). El ID de
   * acceso es un UUID aleatorio de 122 bits, así que no se adivina; lo que
   * sigue protegiendo es su vencimiento, el retiro del informe y los límites
   * por IP y por acceso contra el recorrido masivo.
   */
  async login(accesoId: string, ip: string) {
    await this.attempts.consume('paciente-ip', ip, 30);
    await this.attempts.consume('paciente-acceso', accesoId, 30);
    return this.db.$transaction(async tx => {
      // Serializa la apertura con la renovación y el retiro del acceso.
      await tx.$queryRaw`SELECT id FROM "AccesoPaciente" WHERE id = ${accesoId}::uuid FOR UPDATE`;
      const access = await tx.accesoPaciente.findUnique({ where: { id: accesoId }, include: { informe: true } });
      if (!access || access.revocadoEn || access.expiraEn <= new Date() || access.informe.estado === 'RETIRADO') problem(401, 'ACCESO_NO_VALIDO', 'Este enlace ya no está activo. Escríbenos por WhatsApp y te enviamos uno nuevo.');
      const secret = token(); const expiraEn = new Date(Math.min(Date.now() + 15 * 60_000, access.expiraEn.getTime()));
      await tx.sesion.create({ data: { accesoId, tokenHash: digest(secret, this.config.hmacKey), expiraEn } });
      return { token: secret, expiraEn };
    });
  }

  private async access(secret: string) {
    const session = await this.db.sesion.findUnique({ where: { tokenHash: digest(secret, this.config.hmacKey) }, include: { acceso: { include: { informe: { include: { medico: { select: { nombre: true } } } } } } } });
    const access = session?.acceso;
    if (!session || !access || session.expiraEn <= new Date() || access.expiraEn <= new Date() || access.revocadoEn || access.informe.estado === 'RETIRADO') problem(401, 'ACCESO_NO_VALIDO', 'Este enlace ya no está activo. Escríbenos por WhatsApp y te enviamos uno nuevo.');
    return { access, session };
  }
  async detail(secret: string) {
    const { access } = await this.access(secret); const report = access.informe;
    /* Solo la primera vez, y solo si ya está publicado: «abierto» le dice a
       recepción que el paciente vio su resultado, no que visitó una espera. */
    if (report.estado === 'PUBLICADO') await this.db.accesoPaciente.updateMany({ where: { id: access.id, abiertoEn: null }, data: { abiertoEn: new Date() } });
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
