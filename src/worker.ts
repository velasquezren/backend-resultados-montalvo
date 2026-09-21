import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app';
import { Notifications } from './notifications/notifications';
void (async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const notifications = app.get(Notifications);
  let running = true;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { running = false; });
  let ticks = 0;
  while (running) {
    try { await notifications.tick(); if (ticks++ % 3600 === 0) await notifications.cleanup(); }
    catch { process.stderr.write('No se completó el ciclo de avisos. Se revisará en el siguiente ciclo.\n'); }
    if (running) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await app.close();
})().catch(() => { process.stderr.write('No se pudo iniciar el proceso de avisos.\n'); process.exitCode = 1; });
