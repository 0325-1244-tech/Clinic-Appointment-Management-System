// @ts-check
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { AuthService } from '../auth/AuthService.js';
import { Clock, ZoneClock } from '../domain/time/Clock.js';
import { ClinicDatabase } from '../repositories/ClinicDatabase.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import { JsonFileRepository } from '../repositories/JsonFileRepository.js';
import { AuditEntryMapper, AuditLog } from '../services/AuditLog.js';
import { ClinicService } from '../services/ClinicService.js';
import { QueueService } from '../services/QueueService.js';
import { SampleDataLoader } from '../services/SampleDataLoader.js';
import { StatsService } from '../services/StatsService.js';
import { AppointmentController, PatientController, RecordController, StaffController, StatsController } from './controllers/ClinicControllers.js';
import { AuditController, AuthController, MetaController, QueueController } from './controllers/SystemControllers.js';
import { errorHandler, notFound, requireAuth, sameOriginWrites, sessionAuth } from './middleware.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(here, '..', '..');

/**
 * @typedef {object} AppConfig
 * @property {'memory' | 'json' | 'sqlite'} storage
 * @property {string} dataDir
 * @property {boolean} demoMode
 * @property {boolean} secureCookies  true behind HTTPS (production)
 * @property {boolean} trustProxy     true behind Render's proxy, so req.ip is the real client
 * @property {string} timeZone
 * @property {Clock} [clock]          tests pass a FixedClock
 * @property {Record<string, string | undefined>} [env]
 * @property {(message: string, error: unknown) => void} [log]
 */

/**
 * Builds the services and wires them together. The first run on empty
 * storage loads the sample data, exactly like the Java version.
 *
 * @param {AppConfig} config
 * @returns {Promise<import('./controllers/Controller.js').AppContext>}
 */
export async function createContext(config) {
  const clock = config.clock ?? new ZoneClock(config.timeZone);
  Clock.use(clock);

  const database = await openDatabase(config);
  if (database.isEmpty()) {
    SampleDataLoader.populate(database, clock);
  }
  const service = new ClinicService(database, { clock });
  const auditRepository = config.storage === 'memory'
    ? new InMemoryRepository('L')
    : new JsonFileRepository({ file: path.join(config.dataDir, 'audit.json'), prefix: 'L', mapper: new AuditEntryMapper() });
  const audit = new AuditLog({ repository: /** @type {any} */ (auditRepository) }).observe(service);
  const auth = new AuthService({ audit });
  await auth.seedAccounts({ demoMode: config.demoMode, env: config.env ?? {} });

  return {
    service,
    stats: new StatsService(service),
    audit,
    queue: new QueueService(service),
    auth,
    config: { demoMode: config.demoMode, secureCookies: config.secureCookies, timeZone: config.timeZone },
  };
}

/** @param {AppConfig} config */
async function openDatabase(config) {
  if (config.storage === 'memory') {
    return ClinicDatabase.inMemory();
  }
  if (config.storage === 'sqlite') {
    const { DatabaseSync } = await import('node:sqlite');
    const fs = await import('node:fs');
    fs.mkdirSync(config.dataDir, { recursive: true });
    return ClinicDatabase.sqlite(new DatabaseSync(path.join(config.dataDir, 'careconnect.db')));
  }
  return ClinicDatabase.jsonFiles(config.dataDir);
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
    new RecordController(context), new StatsController(context), new AuditController(context),
  ];
  for (const controller of protectedControllers) {
    app.use(controller.basePath, requireAuth, controller.router());
  }

  app.use('/api', notFound);
  app.use(errorHandler({ log }));
  return app;
}
