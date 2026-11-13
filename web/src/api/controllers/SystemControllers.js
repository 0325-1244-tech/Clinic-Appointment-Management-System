// @ts-check
import { DEFAULT_ACCOUNTS } from '../../auth/AuthService.js';
import { Permission } from '../../auth/AccessPolicy.js';
import { AppointmentStatus } from '../../domain/AppointmentStatus.js';
import { AppointmentType } from '../../domain/AppointmentType.js';
import { Patient } from '../../domain/Patient.js';
import { StaffFactory } from '../../domain/StaffFactory.js';
import { DayOfWeek } from '../../domain/time/DayOfWeek.js';
import { noStore, readCookie, requireAuth, requirePermission as can, SESSION_COOKIE } from '../middleware.js';
import { Schemas } from '../validation.js';
import { Controller } from './Controller.js';

/** /api/health and /api/config: public information the app needs before sign-in. */
export class MetaController extends Controller {
  get basePath() {
    return '/api';
  }

  /** @param {import('express').Router} r */
  routes(r) {
    r.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });
    r.get('/config', (_req, res) => {
      const { date, time } = this.service.clock.now();
      res.json({
        demoMode: this.context.config.demoMode,
        demoAccounts: this.context.config.demoMode
          ? DEFAULT_ACCOUNTS.map((a) => ({ username: a.username, password: a.demoPassword, role: a.role.label, displayName: a.displayName }))
          : [],
        timeZone: this.context.config.timeZone,
        today: date.toString(),
        now: time.toString(),
        options: {
          genders: Patient.GENDERS,
          bloodTypes: Patient.BLOOD_TYPES,
          roles: StaffFactory.ROLES.map((role) => ({
            role, serviceAreaLabel: StaffFactory.serviceAreaLabel(role), serviceAreas: StaffFactory.serviceAreaOptions(role),
          })),
          appointmentTypes: AppointmentType.values().map((t) => ({ code: t.code, label: t.label, multiplier: t.feeMultiplier })),
          statuses: AppointmentStatus.values().map((s) => ({ code: s.code, label: s.label })),
          days: DayOfWeek.values().map((d) => ({ code: d.code, label: d.label, short: d.shortLabel })),
        },
      });
    });
  }
}

/** /api/auth: sign in, sign out, who am I. */
export class AuthController extends Controller {
  get basePath() {
    return '/api/auth';
  }

  /** @param {import('express').Router} r */
  routes(r) {
    r.use(noStore);
    r.post('/login', async (req, res) => {
      const { username, password } = Schemas.login.parse(req.body);
      const { user, token } = await this.context.auth.login(username, password, req.ip ?? 'unknown');
      this.context.audit.record({ action: 'auth.login', entityType: 'user', entityId: user.username, summary: `${user.role.label} signed in` },
        { username: user.username, role: user.role.label });
      res.cookie(SESSION_COOKIE, token, {
        httpOnly: true, sameSite: 'strict', secure: this.context.config.secureCookies, path: '/', maxAge: 12 * 3_600_000,
      });
      res.json({ user: this.#me(user) });
    });
    r.post('/logout', (req, res) => {
      const user = /** @type {import('../middleware.js').AppRequest} */ (req).user;
      if (user) {
        this.context.audit.record({ action: 'auth.logout', entityType: 'user', entityId: user.username, summary: 'Signed out' });
      }
      this.context.auth.logout(readCookie(req, SESSION_COOKIE));
      res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'strict', secure: this.context.config.secureCookies });
      res.status(204).end();
    });
    // Returns { user: null } when signed out, so the app can check without logging an error.
    r.get('/me', (req, res) => {
      const user = /** @type {import('../middleware.js').AppRequest} */ (req).user;
      res.json({ user: user ? this.#me(user) : null });
    });
  }

  /** @param {import('../../auth/User.js').User} user */
  #me(user) {
    const policy = this.context.auth.policyFor(user);
    return { ...user.toPublic(), permissions: policy.permissions() };
  }
}

/** /api/audit: the audit log (admins only). */
export class AuditController extends Controller {
  get basePath() {
    return '/api/audit';
  }

  /** @param {import('express').Router} r */
  routes(r) {
    r.get('/', can(Permission.AUDIT_READ), (req, res) => {
      const limit = Math.min(Number(this.query(req, 'limit') ?? 200) || 200, 1000);
      res.json({ entries: this.context.audit.list({ entityId: this.query(req, 'entityId'), limit }).map((e) => e.toRecord()) });
    });
  }
}

/**
 * /api/queue: check-in and "call next" for staff, plus the public waiting-room
 * board and its live Server-Sent Events stream (initials and ticket numbers only).
 */
export class QueueController extends Controller {
  /** @type {Set<import('express').Response>} */
  #clients = new Set();
  /** @type {Map<string, number>} open streams per client address */
  #perAddress = new Map();
  static #MAX_STREAMS = 100;
  static #MAX_PER_ADDRESS = 5;
  static #MAX_LIFETIME_MS = 60 * 60_000;

  /** @param {import('./Controller.js').AppContext} context */
  constructor(context) {
    super(context);
    context.queue.on('update', () => this.#broadcast());
    // Rolls the queue over at midnight even when nobody is using it.
    setInterval(() => context.queue.tick(), 30_000).unref();
  }

  get basePath() {
    return '/api/queue';
  }

  /** @param {import('express').Router} r */
  routes(r) {
    r.get('/board', (_req, res) => {
      res.json(this.#board());
    });
    r.get('/stream', (req, res) => {
      const address = req.ip ?? 'unknown';
      const mine = this.#perAddress.get(address) ?? 0;
      if (this.#clients.size >= QueueController.#MAX_STREAMS || mine >= QueueController.#MAX_PER_ADDRESS) {
        res.status(503).set('Retry-After', '30').json({ error: { code: 'BUSY', message: 'Too many board screens are connected.' } });
        return;
      }
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      res.write(`retry: 5000\n\nevent: board\ndata: ${JSON.stringify(this.#board())}\n\n`);
      this.#clients.add(res);
      this.#perAddress.set(address, mine + 1);
      const ping = setInterval(() => this.#send(res, ': ping\n\n'), 25_000);
      // Streams are closed after an hour; the board's EventSource reconnects by itself.
      const lifetime = setTimeout(() => res.end(), QueueController.#MAX_LIFETIME_MS);
      let closed = false;
      const cleanUp = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        clearTimeout(lifetime);
        this.#clients.delete(res);
        const left = (this.#perAddress.get(address) ?? 1) - 1;
        if (left > 0) this.#perAddress.set(address, left);
        else this.#perAddress.delete(address);
      };
      res.on('close', cleanUp);
      res.on('error', cleanUp);
    });
    r.get('/', requireAuth, can(Permission.QUEUE_MANAGE), (req, res) => {
      const policy = this.policy(req);
      const today = this.service.findAppointments(this.service.clock.today())
        .filter((a) => a.isActive() && policy.canAccess(a));
      res.json({
        entries: today.map((a) => ({
          appointment: this.view(req)(a),
          state: this.context.queue.stateOf(a)?.code ?? null,
          ticket: this.context.queue.ticketOf(a) ?? null,
        })),
      });
    });
    r.post('/:appointmentId/check-in', can(Permission.QUEUE_MANAGE), (req, res) => {
      this.context.queue.checkIn(this.appointmentFor(req, String(req.params.appointmentId)));
      res.status(204).end();
    });
    r.post('/:appointmentId/call', can(Permission.QUEUE_MANAGE), (req, res) => {
      this.context.queue.call(this.appointmentFor(req, String(req.params.appointmentId)));
      res.status(204).end();
    });
    r.delete('/:appointmentId', can(Permission.QUEUE_MANAGE), (req, res) => {
      this.context.queue.remove(this.appointmentFor(req, String(req.params.appointmentId)));
      res.status(204).end();
    });
  }

  #board() {
    const { date, time } = this.service.clock.now();
    return { date: date.toString(), dateText: date.formatLong(), time: time.format12h(), rows: this.context.queue.board() };
  }

  #broadcast() {
    let message;
    try {
      message = `event: board\ndata: ${JSON.stringify(this.#board())}\n\n`;
    } catch {
      return; // never let the board break the change that triggered it
    }
    for (const client of this.#clients) {
      this.#send(client, message);
    }
  }

  /**
   * Writes to one stream, dropping clients that are gone or not reading.
   *
   * @param {import('express').Response} res
   * @param {string} message
   */
  #send(res, message) {
    try {
      if (res.writableEnded || res.destroyed) {
        this.#clients.delete(res);
      } else if (res.writableLength > 64 * 1024) {
        res.destroy();
      } else {
        res.write(message);
      }
    } catch {
      this.#clients.delete(res);
    }
  }
}
