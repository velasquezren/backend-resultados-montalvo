import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from './app';
import { Mantenimiento } from './mantenimiento/mantenimiento';
import { VistasLivianas } from './results/vistas';

/**
 * Cada cuánto se miran los informes recién publicados para generar su versión
 * liviana. Mientras no existe se sirve el original, así que esperar medio
 * minuto no deja a nadie sin informe; y un informe publicado desde FileMaker
 * suele tardar más que eso en llegar a la cola de recepción.
 */
const INTERVALO_VISTAS_MS = 30_000;
/** Una limpieza por hora: las sesiones duran 15 minutos y nadie espera la purga. */
const INTERVALO_LIMPIEZA_MS = 60 * 60_000;

/* Un hilo para recomprimir fotos: el VPS se comparte con el CRM y la API, y
   generar la versión liviana nunca es urgente. */
sharp.concurrency(1);

void (async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const mantenimiento = app.get(Mantenimiento);
  const vistas = app.get(VistasLivianas);
  let running = true;
  let despertar: () => void = () => undefined;
  let ultimaLimpieza = 0;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { running = false; despertar(); });
  while (running) {
    try { await vistas.generarPendientes(); }
    catch { process.stderr.write('No se completó la generación de vistas livianas. Se reintentará en el siguiente ciclo.\n'); }
    if (Date.now() - ultimaLimpieza >= INTERVALO_LIMPIEZA_MS) {
      try { await mantenimiento.limpiar(); ultimaLimpieza = Date.now(); }
      catch { process.stderr.write('No se completó la limpieza. Se reintentará en el siguiente ciclo.\n'); }
    }
    /* La espera se cancela, no solo se resuelve: un temporizador pendiente
       mantiene vivo el proceso aunque el bucle ya haya terminado, y systemd
       acababa matándolo por tiempo en cada reinicio (2026-09-23). */
    if (running) await new Promise<void>(resolve => {
      const temporizador = setTimeout(resolve, INTERVALO_VISTAS_MS);
      despertar = () => { clearTimeout(temporizador); resolve(); };
    });
  }
  await app.close();
})().catch(() => { process.stderr.write('No se pudo iniciar el proceso de mantenimiento.\n'); process.exitCode = 1; });
