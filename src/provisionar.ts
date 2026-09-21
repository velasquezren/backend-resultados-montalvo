import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { UserDto } from './dto';
import { AuthService } from './auth/auth';

/** La contraseña entra por stdin; nunca por argumentos ni logs. */
void (async () => {
  const [email, nombre, rol] = process.argv.slice(2);
  if (!email || !nombre || !['ADMIN', 'MEDICO'].includes(rol ?? '')) throw new Error('uso');
  let password = '';
  for await (const chunk of process.stdin) { password += String(chunk); if (password.length > 256) throw new Error('password'); }
  await validateOrReject(plainToInstance(UserDto, { email, nombre, rol, password: password.trimEnd() }));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const user = await app.get(AuthService).createUser(email, nombre, password.trimEnd(), rol === 'ADMIN' ? 'ADMIN' : 'MEDICO');
    process.stdout.write(`Usuario creado: ${user.id}\n`);
  } finally { await app.close(); }
})().catch(() => { process.stderr.write('No se pudo crear el usuario. Uso: npm run usuario -- correo nombre ADMIN|MEDICO; contraseña por stdin (12–128 caracteres).\n'); process.exitCode = 1; });
