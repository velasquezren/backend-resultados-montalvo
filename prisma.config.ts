import { defineConfig } from 'prisma/config';
const databaseUrl = process.env.RESULTADOS_DATABASE_URL ?? 'postgresql://localhost/resultados_sin_configurar';
if (!new URL(databaseUrl).pathname.slice(1).startsWith('resultados')) throw new Error('Las migraciones requieren una base exclusiva cuyo nombre comience por resultados');
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl },
});
