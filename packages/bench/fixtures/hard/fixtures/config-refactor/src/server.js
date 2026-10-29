import { loadConfig } from './config.js';

export const SERVER_DEFAULTS = {
  host: '127.0.0.1',
  port: 8080,
  tls: false,
  db: { host: 'localhost', port: 5432, pool: { max: 10 } },
  cors: ['http://localhost:3000'],
};

/** Resolve the settings the HTTP server starts with. */
export function serverSettings(env) {
  const config = loadConfig(env, SERVER_DEFAULTS);
  return {
    listen: `${config.tls ? 'https' : 'http'}://${config.host}:${config.port}`,
    dbUrl: `postgres://${config.db.host}:${config.db.port}`,
    poolMax: config.db.pool.max,
    cors: config.cors,
  };
}
