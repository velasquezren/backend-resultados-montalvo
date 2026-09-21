import 'reflect-metadata';
import { Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { CONFIG, readConfig } from './config';
import { Database } from './database';
import { Attempts, AuthGuard, AuthService } from './auth/auth';
import { PrivateFiles, PdfScanner, UploadCapacity } from './files/files';
import { Results } from './results/results';
import { Patients } from './results/patients';
import { PatientPortal } from './results/portal';
import { Notifications } from './notifications/notifications';
import { MetaTransport, TRANSPORT } from './notifications/meta';
import { AuthController, CrmEventsController, HealthController, MetaWebhookController, PatientsController, PortalController, ResultsController } from './controllers';
import { ApiErrors } from './errors';

@Module({
  controllers: [HealthController, AuthController, PatientsController, ResultsController, PortalController, MetaWebhookController, CrmEventsController],
  providers: [
    { provide: CONFIG, useFactory: readConfig }, Database, Attempts, AuthService,
    { provide: APP_GUARD, useClass: AuthGuard }, PrivateFiles, PdfScanner, UploadCapacity,
    Patients, Results, PatientPortal, Notifications, { provide: TRANSPORT, useClass: MetaTransport },
  ],
})
export class AppModule {}

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, logger: ['error', 'warn'] });
  const config = app.get<ReturnType<typeof readConfig>>(CONFIG);
  app.set('trust proxy', 'loopback');
  app.use(helmet());
  app.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    next();
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({ origin: config.origins, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'], maxAge: 3600 });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, validationError: { target: false, value: false } }));
  app.useGlobalFilters(new ApiErrors());
  app.enableShutdownHooks();
  return app;
}
