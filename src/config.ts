import { isAbsolute, resolve } from 'node:path';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name}`);
  return value;
}

export function readConfig() {
  const production = process.env.NODE_ENV === 'production';
  const databaseUrl = required('RESULTADOS_DATABASE_URL');
  const db = new URL(databaseUrl);
  if (!db.pathname.slice(1).startsWith('resultados')) throw new Error('La base debe ser exclusiva y comenzar por resultados');
  const hmacKey = required('SESSION_HMAC_KEY');
  if (!/^[a-f0-9]{64}$/i.test(hmacKey)) throw new Error('SESSION_HMAC_KEY debe contener 32 bytes hexadecimales');
  const portal = new URL(required('PATIENT_PORTAL_URL'));
  if (!['http:', 'https:'].includes(portal.protocol) || (production && portal.protocol !== 'https:')) throw new Error('PATIENT_PORTAL_URL inválida');
  const origins = required('CORS_ORIGINS').split(',').map(value => new URL(value.trim()).origin);
  if (production && origins.some(value => !value.startsWith('https://'))) throw new Error('CORS debe usar HTTPS');
  const storage = process.env.STORAGE_DRIVER ?? 'local';
  if (!['local', 'local-encrypted', 'r2'].includes(storage)) throw new Error('STORAGE_DRIVER inválido');
  if (production && (storage === 'local' || !process.env.CLAMAV_HOST)) throw new Error('Producción requiere almacenamiento privado protegido y ClamAV');
  const storageKey = storage === 'local-encrypted' ? required('STORAGE_ENCRYPTION_KEY') : undefined;
  if (storageKey && !/^[a-f0-9]{64}$/i.test(storageKey)) throw new Error('STORAGE_ENCRYPTION_KEY debe tener 32 bytes hexadecimales');
  if (production && storage === 'local-encrypted' && !isAbsolute(required('PRIVATE_STORAGE_DIR'))) throw new Error('El almacenamiento de producción requiere ruta absoluta privada');
  if (storage === 'r2') for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) required(key);
  const port = Number(process.env.PORT ?? 3010);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT inválido');
  return { production, databaseUrl, hmacKey, origins, port, storage, storageKey,
    portalUrl: portal.href.replace(/\/$/, ''), privateDir: resolve(process.env.PRIVATE_STORAGE_DIR ?? 'var/private'),
  };
}
export type AppConfig = ReturnType<typeof readConfig>;
export const CONFIG = Symbol('CONFIG');
