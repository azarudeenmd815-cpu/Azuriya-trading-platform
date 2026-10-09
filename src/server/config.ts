import 'dotenv/config';
export interface Config { production: boolean; environment: 'development' | 'test' | 'staging' | 'production'; port: number; origin: string; dataDir: string; databaseUrl?: string; migrationDatabaseUrl?: string; sslCaFile?: string; trustedProxies: string[] }
export function config(): Config {
  const environment = process.env.DEPLOYMENT_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : process.env.NODE_ENV === 'test' ? 'test' : 'development');
  if (!['development','test','staging','production'].includes(environment)) throw new Error('DEPLOYMENT_ENV must be development, test, staging or production.');
  const production = environment === 'production' || environment === 'staging';
  const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173';
  if (production && (!process.env.DATABASE_URL || !origin.startsWith('https://'))) throw new Error('Production requires DATABASE_URL and an HTTPS APP_ORIGIN.');
  if (production && (!process.env.SECRET_ENCRYPTION_KEY || Buffer.from(process.env.SECRET_ENCRYPTION_KEY, 'base64').length !== 32)) throw new Error('Production requires a 32-byte identity and credential encryption key.');
  const port = Number(process.env.PORT ?? 3004); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const parsed = new URL(origin); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('APP_ORIGIN must be a plain HTTP or HTTPS origin.');
  if (production && /(^|\.)(localhost|local|test|invalid|example)$/.test(parsed.hostname)) throw new Error('Staging and production require a deployable application hostname.');
  return { production, environment: environment as Config['environment'], port, origin: parsed.origin, dataDir: process.env.DATA_DIR ?? './data/azuriya', databaseUrl: process.env.DATABASE_URL, migrationDatabaseUrl: process.env.MIGRATION_DATABASE_URL, sslCaFile: process.env.DB_TLS_CA_FILE, trustedProxies: (process.env.TRUSTED_PROXY_IPS ?? '').split(',').map(value => value.trim()).filter(Boolean) };
}
