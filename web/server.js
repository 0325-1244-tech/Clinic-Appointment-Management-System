// @ts-check
/**
 * CareConnect web server.
 *
 * Official mode (the default): the clinic starts empty, there are no demo
 * accounts, and the first administrator is created from ADMIN_USERNAME /
 * ADMIN_PASSWORD. The administrator then creates every other account in the app.
 *
 * Demo mode (`npm run demo`, or DEMO_MODE=true): sample data and the three
 * published demo accounts, for presentations. Demo data is kept apart in data/demo.
 *
 * Environment variables (all optional):
 *   PORT              port to listen on (default 3000; Render sets this)
 *   DATABASE_URL      PostgreSQL connection string (e.g. Neon). When set, records are stored there.
 *   STORAGE           postgres, json, sqlite or memory (default: postgres if DATABASE_URL is set, else json)
 *   DATA_DIR          folder for json/sqlite data (default ./data, or ./data/demo in demo mode)
 *   ADMIN_USERNAME    first administrator's username (default admin)
 *   ADMIN_PASSWORD    first administrator's password, 10+ characters (official mode)
 *   SAMPLE_DATA       "true" loads the sample records into an empty clinic in official mode
 *   DEMO_MODE         "true" turns demo mode on
 *   CLINIC_TIME_ZONE  default Asia/Manila
 *   NODE_ENV          "production" turns on secure cookies, HSTS and trust proxy
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, createContext } from './src/api/app.js';
import { CLINIC_TIME_ZONE } from './src/domain/time/Clock.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const production = env.NODE_ENV === 'production';
const demoMode = (env.DEMO_MODE ?? '').toLowerCase() === 'true' || process.argv.includes('--demo');
const storages = /** @type {const} */ (['postgres', 'json', 'sqlite', 'memory']);
const storage = /** @type {(typeof storages)[number]} */ (
  storages.includes(/** @type {any} */ (env.STORAGE)) ? env.STORAGE : env.DATABASE_URL ? 'postgres' : 'json'
);

const context = await createContext({
  storage,
  dataDir: path.resolve(here, env.DATA_DIR ?? (demoMode ? 'data/demo' : 'data')),
  databaseUrl: env.DATABASE_URL,
  demoMode,
  sampleData: (env.SAMPLE_DATA ?? '').toLowerCase() === 'true',
  admin: { username: env.ADMIN_USERNAME?.trim() || 'admin', password: env.ADMIN_PASSWORD },
  secureCookies: production,
  trustProxy: production,
  timeZone: env.CLINIC_TIME_ZONE ?? CLINIC_TIME_ZONE,
});
const app = createApp(context, { trustProxy: production });
const port = Number(env.PORT ?? 3000);

const server = app.listen(port, () => {
  console.info(`CareConnect is running at http://localhost:${port} (${demoMode ? 'demo mode' : 'official mode'}, storage: ${storage})`);
});

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => process.exit(0), 5000).unref();
    server.close();
    try {
      await context.close(); // save any pending database writes
    } finally {
      process.exit(0);
    }
  });
}
