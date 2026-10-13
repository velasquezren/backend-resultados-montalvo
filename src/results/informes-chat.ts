import { Injectable } from '@nestjs/common';
import { Database, Prisma } from '../database';
import { InformesPacienteCrmDto, PdfPacienteCrmDto } from '../dto';
import { problem } from '../errors';
import { normalizeId } from './patients';
import { Results } from './results';

/** Autoconsulta por WhatsApp: la autorización y los bytes siguen en Resultados.
 * No renueva enlaces, no publica borradores y no entrega otras fichas por CI. */
@Injectable()
export class InformesChat {
  constructor(private readonly db: Database, private readonly results: Results) {}

  private async alcance(dto: InformesPacienteCrmDto): Promise<Prisma.InformeWhereInput> {
    if (process.env.CRM_AUTOSERVICIO_INFORMES !== 'on') problem(503, 'AUTOCONSULTA_APAGADA', 'Autoconsulta no disponible.');
    const paciente = await this.db.paciente.findUnique({ where: { pac: normalizeId(dto.pac) }, select: { id: true, ci: true } });
    const canon = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Un conflicto entre PAC y CI no se resuelve escogiendo el más conveniente.
    if (!paciente || (dto.ci && paciente.ci && canon(dto.ci) !== canon(paciente.ci)))
      problem(404, 'IDENTIDAD_NO_RESUELTA', 'Recepción debe verificar la ficha.');
    return { pacienteId: paciente.id, estado: 'PUBLICADO', archivoId: { not: null },
      acceso: { is: { revocadoEn: null, expiraEn: { gt: new Date() } } } };
  }

  async listar(dto: InformesPacienteCrmDto) {
    const where = await this.alcance(dto);
    const limite = 7;
    const [datos, total] = await this.db.$transaction([
      this.db.informe.findMany({ where, select: { id: true, archivoId: true, estudio: true, fechaEstudio: true },
        orderBy: [{ fechaEstudio: 'desc' }, { id: 'desc' }], skip: (dto.pagina - 1) * limite, take: limite }),
      this.db.informe.count({ where }),
    ]);
    return { datos, total, pagina: dto.pagina, limite };
  }

  async pdf(id: string, dto: PdfPacienteCrmDto): Promise<Buffer> {
    const comprobar = async () => {
      const informe = await this.db.informe.findFirst({ where: { ...await this.alcance(dto), id, archivoId: dto.archivoId }, select: { id: true } });
      if (!informe) problem(404, 'INFORME_NO_DISPONIBLE', 'Vuelve a consultar tus informes o habla con recepción.');
    };
    await comprobar();
    const bytes = await this.results.readFile(dto.archivoId); // original, integridad SHA-256
    await comprobar(); // retiro, reemplazo o vencimiento durante la lectura
    await this.db.auditoria.create({ data: { actorId: 'crm', informeId: id, accion: 'PDF_PREPARADO_WHATSAPP' } });
    return bytes; // no marca abiertoEn: descargar para Meta no prueba que lo leyó el paciente
  }
}
