// @ts-check
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { AuthService } from '../auth/AuthService.js';
import { UserMapper } from '../auth/User.js';
import { Clock, ZoneClock } from '../domain/time/Clock.js';
import { ClinicDatabase } from '../repositories/ClinicDatabase.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import { AuditEntryMapper, AuditLog } from '../services/AuditLog.js';
import { ClinicService } from '../services/ClinicService.js';
import { QueueService } from '../services/QueueService.js';
import { SampleDataLoader } from '../services/SampleDataLoader.js';
import { StatsService } from '../services/StatsService.js';
import { AppointmentController, PatientController, RecordController, StaffController, StatsController } from './controllers/ClinicControllers.js';
import { AuditController, AuthController, MetaController, QueueController, UserController } from './controllers/SystemControllers.js';
import { errorHandler, notFound, requireAuth, sameOriginWrites, sessionAuth } from './middleware.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(here, '..', '..');

/**
 * @typedef {object} AppConfig
 * @property {'memory' | 'json' | 'sqlite' | 'postgres'} storage
 * @property {string} dataDir
 * @property {string} [databaseUrl]   PostgreSQL connection string (storage: postgres)
 * @property {boolean} demoMode       demo accounts + sample data + "sample data only" banner
 * @property {boolean} [sampleData]   load the sample records into an empty clinic (always on in demo mode)
 * @property {{ username?: string, password?: string, displayName?: string }} [admin]  first administrator (official mode)
 * @property {boolean} secureCookies  true behind HTTPS (production)
 * @property {boolean} trustProxy     true behind Render's proxy, so req.ip is the real client
 * @property {string} timeZone
 * @property {Clock} [clock]          tests pass a FixedClock
 * @property {import('../repositories/PostgresRepository.js').SqlClient} [sqlClient]  tests pass an in-memory PostgreSQL
 * @property {(message: string, error: unknown) => void} [log]
 */

/** Whether every write has reached storage. Turns unhealthy after a failed database write. */
export class StorageHealth {
  #ok = true;
  /** @type {string | undefined} */
  #lastError;

  get ok() {
    return this.#ok;
  }

  get lastError() {
    return this.#lastError;
  }

  /** @param {unknown} error */
  fail(error) {
    this.#ok = false;
    this.#lastError = error instanceof Error ? error.message : String(error);
  }
}

/**
 * Builds the services and wires them together.
 *
 * Official mode: the clinic starts empty, the first administrator comes from
 * the server settings, and every account is stored with the clinic records.
 * Demo mode: the sample data and the three demo accounts (kept in memory).
 *
 * @param {AppConfig} config
 * @returns {Promise<import('./controllers/Controller.js').AppContext>}
 */
export async function createContext(config) {
  const clock = config.clock ?? new ZoneClock(config.timeZone);
  Clock.use(clock);
  const log = config.log ?? ((message, error) => console.error(message, error));
  const health = new StorageHealth();

  const { database, close } = await openDatabase(config, (error) => {
    health.fail(error);
    log('A database write failed; the health check now reports it so the service is restarted.', error);
  });
  if (database.isEmpty() && (config.demoMode || config.sampleData)) {
    SampleDataLoader.populate(database, clock);
  }
  const service = new ClinicService(database, { clock });
  const audit = new AuditLog({
    repository: /** @type {any} */ (await database.openRepository('audit_log', 'L', new AuditEntryMapper())),
  }).observe(service);
  // Demo accounts are never written to storage; real accounts always are.
  const users = config.demoMode ? new InMemoryRepository('U') : await database.openRepository('users', 'U', new UserMapper());
  const auth = new AuthService({ users: /** @type {any} */ (users), audit });
  if (config.demoMode) {
    await auth.seedDemoAccounts();
  } else if (await auth.ensureAdministrator(config.admin ?? {}) === 'missing') {
    log('No administrator account exists. Set ADMIN_PASSWORD (and optionally ADMIN_USERNAME) and restart to create one.', '');
  }

  return {
    service,
    stats: new StatsService(service),
    audit,
    queue: new QueueService(service),
    auth,
    health,
    close: async () => {
      await database.flush();
      await close();
    },
    config: { demoMode: config.demoMode, secureCookies: config.secureCookies, timeZone: config.timeZone },
  };
}

/**
 * @param {AppConfig} config
 * @param {(error: unknown) => void} onError
 * @returns {Promise<{ database: ClinicDatabase, close: () => Promise<void> }>}
 */
async function openDatabase(config, onError) {
  const none = async () => {};
  if (config.storage === 'memory') {
    return { database: ClinicDatabase.inMemory(), close: none };
  }
  if (config.storage === 'postgres') {
    if (config.sqlClient) {
      return { database: await ClinicDatabase.postgres(config.sqlClient, { onError }), close: none };
    }
    if (!config.databaseUrl) {
      throw new Error('STORAGE=postgres needs DATABASE_URL (the PostgreSQL connection string).');
    }
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5, idleTimeoutMillis: 30_000 });
    pool.on('error', onError);
    return { database: await ClinicDatabase.postgres(pool, { onError }), close: () => pool.end() };
  }
  if (config.storage === 'sqlite') {
    const { DatabaseSync } = await import('node:sqlite');
    const fs = await import('node:fs');
    fs.mkdirSync(config.dataDir, { recursive: true });
    const db = new DatabaseSync(path.join(config.dataDir, 'careconnect.db'));
    return { database: ClinicDatabase.sqlite(db), close: async () => db.close() };
  }
  return { database: ClinicDatabase.jsonFiles(config.dataDir), close: none };
}

/**
 * The Express application: security headers, static files (the browser app
 * and the shared domain classes), and the REST API.
 *
 * @param {import('./controllers/Controller.js').AppContext} context
 * @param {{ trustProxy?: boolean, log?: (message: string, error: unknown) => void }} [options]
 */
export function createApp(context, { trustProxy = false, log } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        ...(context.config.secureCookies ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    strictTransportSecurity: context.config.secureCookies ? { maxAge: 15_552_000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use((_req, res, next) => {
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });

  // Cache static files for an hour in production; always revalidate during development.
  const staticOptions = { maxAge: context.config.secureCookies ? '1h' : 0, index: 'index.html' };
  app.use('/domain', express.static(path.join(WEB_ROOT, 'src', 'domain'), staticOptions));
  app.use(express.static(path.join(WEB_ROOT, 'public'), staticOptions));
  app.get('/board', (_req, res) => res.sendFile(path.join(WEB_ROOT, 'public', 'board.html')));

  app.use('/api', express.json({ limit: '20kb' }), sameOriginWrites, sessionAuth(context.auth), (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const publicControllers = [new MetaController(context), new AuthController(context), new QueueController(context)];
  for (const controller of publicControllers) {
    app.use(controller.basePath, controller.router());
  }
  const protectedControllers = [
    new PatientController(context), new StaffController(context), new AppointmentController(context),
    new RecordController(context), new StatsController(context), new AuditController(context), new UserController(context),
  ];
  for (const controller of protectedControllers) {
    app.use(controller.basePath, requireAuth, controller.router());
  }

  app.use('/api', notFound);
  app.use(errorHandler({ log }));
  return app;
}
