import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from './generated/prisma/client';
import { CONFIG, AppConfig } from './config';

@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(CONFIG) config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl, max: 5, connectionTimeoutMillis: 5000 }) });
  }
  async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
}
export type Transaction = Prisma.TransactionClient;
export { Prisma };
