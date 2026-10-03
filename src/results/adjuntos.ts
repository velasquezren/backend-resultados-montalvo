import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { Actor } from '../auth/auth';
import { Database, Prisma } from '../database';
import { problem } from '../errors';
import { PdfScanner, PrivateFiles } from '../files/files';
import { BYTES_PARA_DETECTAR, detectarFormato, extensionDe, MAX_ADJUNTO_BYTES, MAX_ADJUNTOS_POR_INFORME, nombreVisible } from '../files/medios';
import { Rango } from '../files/rango';
import { scope } from './results';

/** Lo que el médico ve de cada adjunto. Nunca la clave del almacenamiento. */
export const SELECT_ADJUNTO = { id: true, tipo: true, mime: true, nombre: true, bytes: true, createdAt: true } satisfies Prisma.AdjuntoSelect;
export const VIGENTES = { eliminadoEn: null } satisfies Prisma.AdjuntoWhereInput;

/** Una subida que multer dejó en disco (`directorioSubidas`). */
export interface Subida {
  readonly path: string;
  readonly size: number;
  readonly originalname?: string;
}

/** Lo necesario para servir un adjunto: tipo, tamaño y de qué estudio es. */
export type AdjuntoParaServir = { id: string; tipo: 'VIDEO' | 'IMAGEN'; mime: string; bytes: number; clave: string; createdAt: Date };

/**
 * Videos e imágenes que el médico suma a un informe para el paciente: un clip
 * de la ecografía, un video 4D, un GIF.
 *
 * **Se pueden sumar también a un informe YA publicado.** Casi todos los
 * informes llegan publicados desde FileMaker (los 34 de producción al
 * 2026-10-03), así que limitarlo al borrador dejaba la función sin uso. Lo que
 * es inmutable es el RESULTADO —el PDF—; un video lo acompaña y no cambia lo
 * que dice. Por la misma razón se puede quitar: un video en la ficha
 * equivocada tiene que desaparecer, no quedarse por coherencia. Todo queda en
 * la auditoría. Un informe retirado no admite cambios.
 */
@Injectable()
export class Adjuntos {
  constructor(private readonly db: Database, private readonly files: PrivateFiles, private readonly scanner: PdfScanner) {}

  async subir(informeId: string, subida: Subida, actor: Actor): Promise<void> {
    await this.informeEditable(informeId, actor);
    if (subida.size <= 0) problem(400, 'ARCHIVO_VACIO', 'El archivo está vacío. Vuelve a exportarlo desde el equipo.');
    if (subida.size > MAX_ADJUNTO_BYTES) problem(413, 'ARCHIVO_DEMASIADO_GRANDE', 'Cada video o imagen puede pesar hasta 100 MB.');
    const formato = detectarFormato(await primerosBytes(subida.path));
    /* Antes de analizar —que en un video tarda—: el tope se vuelve a mirar
       dentro de la transacción, que es la que lo hace cumplir. */
    if (await this.contar(informeId) >= MAX_ADJUNTOS_POR_INFORME) problem(409, 'LIMITE_ADJUNTOS', `Cada informe admite hasta ${MAX_ADJUNTOS_POR_INFORME} videos o imágenes. Quita alguno para sumar otro.`);
    await this.scanner.scanFile(subida.path);

    const clave = `${randomUUID()}.${formato.extension}`;
    const sha256 = await this.files.guardarAdjunto(clave, subida.path);
    try {
      await this.db.$transaction(async tx => {
        // Serializa las subidas del mismo informe: dos a la vez no pasan juntas el tope.
        await tx.$queryRaw`SELECT id FROM "Informe" WHERE id = ${informeId}::uuid FOR UPDATE`;
        const informe = await tx.informe.findFirst({ where: { id: informeId, ...scope(actor) }, select: { estado: true } });
        if (!informe || informe.estado === 'RETIRADO') problem(409, 'INFORME_RETIRADO', 'El informe fue retirado mientras subías el archivo.');
        if (await tx.adjunto.count({ where: { informeId, ...VIGENTES } }) >= MAX_ADJUNTOS_POR_INFORME) problem(409, 'LIMITE_ADJUNTOS', `Cada informe admite hasta ${MAX_ADJUNTOS_POR_INFORME} videos o imágenes. Quita alguno para sumar otro.`);
        await tx.adjunto.create({ data: { informeId, tipo: formato.tipo, mime: formato.mime, nombre: nombreVisible(subida.originalname, formato), clave, sha256, bytes: subida.size, subidoPor: actor.id } });
        await tx.auditoria.create({ data: { actorId: actor.id, accion: 'ADJUNTO_AGREGADO', informeId } });
      });
    } catch (error) {
      await this.files.delete(clave).catch(() => process.stderr.write(JSON.stringify({ evento: 'archivo_huerfano', clave }) + '\n'));
      throw error;
    }
  }

  /**
   * Lo quita: la fila queda marcada (rastro) y los bytes se borran del
   * almacenamiento después de confirmar, para que un fallo de la base no deje
   * un registro apuntando a un archivo inexistente.
   */
  async quitar(informeId: string, adjuntoId: string, actor: Actor): Promise<void> {
    await this.informeEditable(informeId, actor);
    const quitado = await this.db.$transaction(async tx => {
      const adjunto = await tx.adjunto.findFirst({ where: { id: adjuntoId, informeId, ...VIGENTES }, select: { id: true, clave: true } });
      if (!adjunto) problem(404, 'ADJUNTO_NO_ENCONTRADO', 'Ese archivo ya no está en el informe. Actualiza la página.');
      const marcado = await tx.adjunto.updateMany({ where: { id: adjunto.id, ...VIGENTES }, data: { eliminadoEn: new Date() } });
      if (!marcado.count) problem(404, 'ADJUNTO_NO_ENCONTRADO', 'Ese archivo ya no está en el informe. Actualiza la página.');
      await tx.auditoria.create({ data: { actorId: actor.id, accion: 'ADJUNTO_ELIMINADO', informeId } });
      return adjunto;
    });
    await this.files.delete(quitado.clave).catch(() => process.stderr.write(JSON.stringify({ evento: 'adjunto_sin_borrar', clave: quitado.clave }) + '\n'));
  }

  /** Para la vista previa del médico: solo informes suyos (o todos, si es admin). */
  async paraMedico(informeId: string, adjuntoId: string, actor: Actor): Promise<AdjuntoParaServir> {
    const adjunto = await this.db.adjunto.findFirst({
      where: { id: adjuntoId, informeId, ...VIGENTES, informe: scope(actor) },
      select: { id: true, tipo: true, mime: true, bytes: true, clave: true, createdAt: true },
    });
    if (!adjunto) problem(404, 'ADJUNTO_NO_ENCONTRADO', 'No encontramos ese archivo o no tienes acceso a él.');
    return adjunto;
  }

  /** Para el paciente: solo los de SU informe, y solo si está publicado (lo comprueba quien llama). */
  async delInforme(informeId: string, adjuntoId: string): Promise<AdjuntoParaServir> {
    const adjunto = await this.db.adjunto.findFirst({
      where: { id: adjuntoId, informeId, ...VIGENTES },
      select: { id: true, tipo: true, mime: true, bytes: true, clave: true, createdAt: true },
    });
    if (!adjunto) problem(404, 'ADJUNTO_NO_ENCONTRADO', 'Ese archivo ya no está disponible.');
    return adjunto;
  }

  /** Lo que el paciente ve de sus adjuntos: tipo y tamaño, sin el nombre que le puso el médico. */
  listaParaPaciente(informeId: string) {
    return this.db.adjunto.findMany({ where: { informeId, ...VIGENTES }, select: { id: true, tipo: true, mime: true, bytes: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  }

  leer(adjunto: AdjuntoParaServir, rango: Rango): Promise<Readable> {
    return this.files.leerAdjunto(adjunto.clave, rango.inicio, rango.fin);
  }

  private contar(informeId: string): Promise<number> {
    return this.db.adjunto.count({ where: { informeId, ...VIGENTES } });
  }

  private async informeEditable(informeId: string, actor: Actor): Promise<void> {
    const informe = await this.db.informe.findFirst({ where: { id: informeId, ...scope(actor) }, select: { estado: true } });
    if (!informe) problem(404, 'INFORME_NO_ENCONTRADO', 'No encontramos el informe o no tienes acceso a él.');
    if (informe.estado === 'RETIRADO') problem(409, 'INFORME_RETIRADO', 'Este informe fue retirado: ya no admite cambios.');
  }
}

async function primerosBytes(ruta: string): Promise<Buffer> {
  const archivo = await open(ruta, 'r');
  try {
    const cabecera = Buffer.alloc(BYTES_PARA_DETECTAR);
    const { bytesRead } = await archivo.read(cabecera, 0, BYTES_PARA_DETECTAR, 0);
    return cabecera.subarray(0, bytesRead);
  } finally {
    await archivo.close();
  }
}

/** Borra la subida temporal. Si ya no está (o el corte fue antes), no es un error. */
export async function descartarSubida(subida: Subida | undefined): Promise<void> {
  if (subida?.path) await unlink(subida.path).catch(() => undefined);
}

/** Nombre del archivo al guardarlo: reconocible y sin datos del paciente. */
export function nombreDeDescarga(adjunto: Pick<AdjuntoParaServir, 'id' | 'tipo' | 'mime' | 'createdAt'>): string {
  const fecha = adjunto.createdAt.toISOString().slice(0, 10);
  return `clinica-montalvo-${adjunto.tipo === 'VIDEO' ? 'video' : 'imagen'}-${fecha}-${adjunto.id.slice(0, 6)}.${extensionDe(adjunto.mime)}`;
}
