import { createApp } from './app';
import { AppConfig, CONFIG } from './config';
void (async () => {
  const app = await createApp();
  await app.listen(app.get<AppConfig>(CONFIG).port, '0.0.0.0');
})().catch(() => { process.stderr.write('No se pudo iniciar la API de resultados. Revisa su configuración.\n'); process.exitCode = 1; });
