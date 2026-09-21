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
    if ((!ci && !pac) || (ci && pac)) problem(400, 'BUSQUEDA_EXACTA_REQUERIDA', 'Busca por CI o por PAC, uno a la vez.');
    const patient = await this.db.paciente.findFirst({ where: ci ? { ci } : { pac } });
    if (!patient) problem(404, 'PACIENTE_NO_ENCONTRADO', 'No encontramos ese paciente. Comprueba el identificador o registra sus datos.');
    return patient;
  }
  async create(dto: PacienteDto, actor: Actor) {
    const ci = normalizeId(dto.ci); const pac = normalizeId(dto.pac);
    if (!ci && !pac) problem(400, 'IDENTIFICADOR_REQUERIDO', 'Indica el CI o el PAC para identificar al paciente.');
    if (dto.referenciaCrm && actor.rol !== 'ADMIN') problem(403, 'VINCULO_ADMINISTRATIVO', 'El vínculo con el CRM lo configura un administrador.');
    return this.db.$transaction(async tx => {
      const patient = await tx.paciente.create({ data: { ...dto, nombre: dto.nombre.trim(), ci, pac } });
      await tx.auditoria.create({ data: { actorId: actor.id, accion: 'PACIENTE_REGISTRADO' } });
      return patient;
    });
  }
}
