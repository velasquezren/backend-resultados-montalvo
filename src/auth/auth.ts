import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CONFIG, AppConfig } from '../config';
import { Database } from '../database';
import { problem } from '../errors';
import { digest, hashPassword, token, verifyPassword } from './crypto';
import { Rol } from '../generated/prisma/client';

export const Public = () => SetMetadata('public', true);
export interface Actor { id: string; rol: Rol; }
export interface AuthRequest extends Request { actor: Actor; sesionId: string; }
export function bearer(request: Request): string {
  const value = request.headers.authorization;
  return value?.startsWith('Bearer ') ? value.slice(7) : '';
}

@Injectable()
export class Attempts {
  constructor(private readonly db: Database, @Inject(CONFIG) private readonly config: AppConfig) {}
  async consume(namespace: string, identifier: string, max: number, windowSeconds = 900): Promise<void> {
    const clave = digest(`${namespace}:${identifier}`, this.config.hmacKey);
    const inicio = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
    const rows = await this.db.$queryRaw<Array<{ cantidad: number }>>`
      INSERT INTO "LimiteIntentos" (clave, inicio, cantidad) VALUES (${clave}, ${inicio}, 1)
      ON CONFLICT (clave) DO UPDATE SET inicio = EXCLUDED.inicio,
      cantidad = CASE WHEN "LimiteIntentos".inicio = EXCLUDED.inicio THEN "LimiteIntentos".cantidad + 1 ELSE 1 END
      RETURNING cantidad`;
    if ((rows[0]?.cantidad ?? max + 1) > max) problem(429, 'DEMASIADOS_INTENTOS', 'Has realizado varios intentos. Espera unos minutos antes de volver a intentar.');
  }
}

@Injectable()
export class AuthService {
  private readonly dummy = hashPassword(token());
  constructor(private readonly db: Database, private readonly attempts: Attempts, @Inject(CONFIG) private readonly config: AppConfig) {}
  async login(email: string, password: string, ip: string) {
    await this.attempts.consume('login-ip', ip, 30);
    await this.attempts.consume('login-email', email.toLowerCase(), 8);
    const user = await this.db.usuario.findUnique({ where: { email: email.trim().toLowerCase() } });
    const valid = await verifyPassword(password, user?.passwordHash ?? await this.dummy);
    if (!user?.activo || !valid) problem(401, 'ACCESO_INVALIDO', 'El correo o la contraseña no son correctos. Revisa tus datos.');
    const secret = token();
    const expiraEn = new Date(Date.now() + 8 * 3600_000);
    await this.db.sesion.create({ data: { usuarioId: user.id, tokenHash: digest(secret, this.config.hmacKey), expiraEn } });
    return { token: secret, expiraEn, usuario: { id: user.id, nombre: user.nombre, rol: user.rol } };
  }
  async resolve(secret: string) {
    if (!secret || secret.length > 200) problem(401, 'SESION_REQUERIDA', 'Inicia sesión para continuar.');
    const session = await this.db.sesion.findUnique({ where: { tokenHash: digest(secret, this.config.hmacKey) }, include: { usuario: true } });
    if (!session?.usuario?.activo || session.expiraEn <= new Date()) problem(401, 'SESION_VENCIDA', 'Tu sesión terminó. Vuelve a ingresar para continuar.');
    return session;
  }
  async createUser(email: string, nombre: string, password: string, rol: Rol) {
    if (password.length < 12 || password.length > 128) problem(400, 'CONTRASENA_INVALIDA', 'Usa una contraseña de entre 12 y 128 caracteres.');
    return this.db.usuario.create({ data: { email: email.trim().toLowerCase(), nombre, rol, passwordHash: await hashPassword(password) }, select: { id: true, email: true, nombre: true, rol: true, activo: true } });
  }
  async changePassword(actor: Actor, actual: string, nueva: string) {
    const user = await this.db.usuario.findUniqueOrThrow({ where: { id: actor.id } });
    if (!await verifyPassword(actual, user.passwordHash)) problem(400, 'CONTRASENA_INCORRECTA', 'La contraseña actual no es correcta.');
    if (actual === nueva) problem(400, 'CONTRASENA_REPETIDA', 'Elige una contraseña diferente a la actual.');
    const passwordHash = await hashPassword(nueva);
    await this.db.$transaction(async tx => {
      const updated = await tx.usuario.updateMany({ where: { id: actor.id, passwordHash: user.passwordHash }, data: { passwordHash } });
      if (!updated.count) problem(409, 'CUENTA_CAMBIO', 'La cuenta cambió. Vuelve a ingresar.');
      await tx.sesion.deleteMany({ where: { usuarioId: actor.id } });
      await tx.auditoria.create({ data: { actorId: actor.id, accion: 'CONTRASENA_CAMBIADA' } });
    });
    return { cerrado: true };
  }
  async disableUser(id: string, actor: Actor) {
    if (actor.rol !== 'ADMIN' || actor.id === id) problem(403, 'ACCION_NO_PERMITIDA', 'Esta acción requiere otro administrador.');
    return this.db.$transaction(async tx => {
      const user = await tx.usuario.update({ where: { id }, data: { activo: false }, select: { id: true, activo: true } });
      await tx.sesion.deleteMany({ where: { usuarioId: id } });
      await tx.auditoria.create({ data: { actorId: actor.id, accion: 'USUARIO_DESACTIVADO' } });
      return user;
    });
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const session = await this.auth.resolve(bearer(request));
    request.actor = { id: session.usuario!.id, rol: session.usuario!.rol };
    request.sesionId = session.id;
    return true;
  }
}
