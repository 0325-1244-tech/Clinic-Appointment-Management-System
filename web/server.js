// @ts-check
/**
 * CareConnect web server.
 *
 * Environment variables (all optional):
 *   PORT            port to listen on (default 3000; Render sets this)
 *   STORAGE         json (default), sqlite or memory
 *   DATA_DIR        folder for the data files (default ./data)
 *   DEMO_MODE       "true" shows demo accounts on the login page (default true)
 *   ADMIN_PASSWORD, RECEPTION_PASSWORD, DOCTOR_PASSWORD   used when DEMO_MODE is false
 *   CLINIC_TIME_ZONE  default Asia/Manila
 *   NODE_ENV        "production" turns on secure cookies, HSTS and trust proxy
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, createContext } from './src/api/app.js';
import { CLINIC_TIME_ZONE } from './src/domain/time/Clock.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const production = env.NODE_ENV === 'production';
const storage = /** @type {'json' | 'sqlite' | 'memory'} */ (['json', 'sqlite', 'memory'].includes(env.STORAGE ?? '') ? env.STORAGE : 'json');

const context = await createContext({
  storage,
  dataDir: path.resolve(here, env.DATA_DIR ?? 'data'),
  demoMode: (env.DEMO_MODE ?? 'true').toLowerCase() !== 'false',
  secureCookies: production,
  trustProxy: production,
  timeZone: env.CLINIC_TIME_ZONE ?? CLINIC_TIME_ZONE,
  env,
});
const app = createApp(context, { trustProxy: production });
const port = Number(env.PORT ?? 3000);

const server = app.listen(port, () => {
  console.info(`CareConnect is running at http://localhost:${port} (storage: ${storage}, demo mode: ${context.config.demoMode})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
