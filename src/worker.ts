import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app';
import { Mantenimiento } from './mantenimiento/mantenimiento';

/** Una pasada por hora: las sesiones duran 15 minutos y nadie espera la purga. */
const INTERVALO_MS = 60 * 60_000;

void (async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const mantenimiento = app.get(Mantenimiento);
  let running = true;
  let despertar: () => void = () => undefined;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { running = false; despertar(); });
  while (running) {
    try { await mantenimiento.limpiar(); }
    catch { process.stderr.write('No se completó la limpieza. Se reintentará en el siguiente ciclo.\n'); }
    if (running) await new Promise<void>(resolve => { despertar = resolve; setTimeout(resolve, INTERVALO_MS); });
  }
  await app.close();
})().catch(() => { process.stderr.write('No se pudo iniciar el proceso de mantenimiento.\n'); process.exitCode = 1; });
