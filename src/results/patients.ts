import { Injectable } from '@nestjs/common';
import { Actor } from '../auth/auth';
import { Database } from '../database';
import { BuscarPacienteDto, PacienteDto } from '../dto';
import { problem } from '../errors';

export const normalizeId = (value?: string): string | undefined => value?.trim().toUpperCase().replace(/\s+/g, ' ') || undefined;

@Injectable()
export class Patients {
  constructor(private readonly db: Database) {}
  async find(dto: BuscarPacienteDto) {
    const ci = normalizeId(dto.ci); const pac = normalizeId(dto.pac);
    const any = normalizeId(dto.identificador);
    if (any && (ci || pac)) problem(400, 'BUSQUEDA_EXACTA_REQUERIDA', 'Usa el identificador único o CI/PAC, no ambos.');
    if (!any && ((!ci && !pac) || (ci && pac))) problem(400, 'BUSQUEDA_EXACTA_REQUERIDA', 'Busca por CI o por PAC, uno a la vez.');
    // Sigue siendo coincidencia exacta: el identificador solo evita que el
    // médico tenga que saber de antemano si el paciente es de CI o de PAC.
    const patient = await this.db.paciente.findFirst({ where: any ? { OR: [{ ci: any }, { pac: any }] } : ci ? { ci } : { pac } });
    if (!patient) problem(404, 'PACIENTE_NO_ENCONTRADO', 'No encontramos ese paciente. Comprueba el identificador o registra sus datos.');
    return patient;
  }
  async create(dto: PacienteDto, actor: Actor) {
    const ci = normalizeId(dto.ci); const pac = normalizeId(dto.pac);
    if (!ci && !pac) problem(400, 'IDENTIFICADOR_REQUERIDO', 'Indica el CI o el PAC para identificar al paciente.');
    return this.db.$transaction(async tx => {
      const patient = await tx.paciente.create({ data: { nombre: dto.nombre.trim(), ci, pac } });
      await tx.auditoria.create({ data: { actorId: actor.id, accion: 'PACIENTE_REGISTRADO' } });
      return patient;
    });
  }
}
