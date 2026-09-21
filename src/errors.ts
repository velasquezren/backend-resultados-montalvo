import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { Prisma } from './database';

export function problem(status: number, codigo: string, mensaje: string): never {
  throw new HttpException({ codigo, mensaje }, status);
}

@Catch()
export class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = randomUUID();
    let status = 500;
    let codigo = 'SERVICIO_NO_DISPONIBLE';
    let mensaje = 'No pudimos completar la operación. Intenta de nuevo en unos momentos.';
    let campos: string[] | undefined;
    if (error instanceof HttpException) {
      status = error.getStatus();
      const data = error.getResponse();
      if (typeof data === 'object' && 'codigo' in data && 'mensaje' in data) {
        codigo = String(data.codigo); mensaje = String(data.mensaje);
      } else {
        codigo = status === 413 ? 'ARCHIVO_DEMASIADO_GRANDE' : 'DATOS_INVALIDOS';
        mensaje = status === 413 ? 'El PDF supera 10 MB. Reduce su tamaño e intenta otra vez.' : 'Revisa los datos indicados e intenta de nuevo.';
        if (typeof data === 'object' && 'message' in data && Array.isArray(data.message)) campos = data.message.filter((v): v is string => typeof v === 'string');
      }
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      status = 409; codigo = 'CONFLICTO'; mensaje = 'Los datos ya existen o cambiaron. Actualiza la información antes de continuar.';
    }
    if (status >= 500) process.stderr.write(JSON.stringify({ requestId, codigo, evento: 'error_api' }) + '\n');
    response.status(status).setHeader('X-Request-Id', requestId);
    response.json({ error: { codigo, mensaje, campos, requestId } });
  }
}
