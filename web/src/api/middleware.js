// @ts-check
import { AuthenticationError, BadRequestError, ForbiddenError, RateLimitError } from '../auth/errors.js';
import { ClinicError } from '../domain/errors.js';
import { RequestContext } from '../services/RequestContext.js';

/** @typedef {import('express').Request & { user?: import('../auth/User.js').User, policy?: import('../auth/AccessPolicy.js').AccessPolicy }} AppRequest */

export const SESSION_COOKIE = 'cc_session';

/**
 * Reads one cookie from the Cookie header.
 *
 * @param {import('express').Request} req
 * @param {string} name
 */
export function readCookie(req, name) {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return undefined;
}

/**
 * Finds the signed-in user from the session cookie and runs the rest of the
 * request "as" that user, so the audit log knows who made each change.
 *
 * @param {import('../auth/AuthService.js').AuthService} auth
 * @returns {import('express').RequestHandler}
 */
export function sessionAuth(auth) {
  return (req, _res, next) => {
    const request = /** @type {AppRequest} */ (req);
    const user = auth.userForToken(readCookie(req, SESSION_COOKIE));
    if (!user) {
      next();
      return;
    }
    request.user = user;
    request.policy = auth.policyFor(user);
    RequestContext.run({ username: user.username, role: user.role.label }, () => next());
  };
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
export function requireAuth(req, _res, next) {
  if (!(/** @type {AppRequest} */ (req)).user) {
    throw new AuthenticationError('Please sign in to continue.');
  }
  next();
}

/**
 * @param {string} permission
 * @returns {import('express').RequestHandler}
 */
export function requirePermission(permission) {
  return (req, _res, next) => {
    const request = /** @type {AppRequest} */ (req);
    if (!request.user || !request.policy) {
      throw new AuthenticationError('Please sign in to continue.');
    }
    request.policy.require(permission);
    next();
  };
}

/**
 * CSRF defence in depth (the session cookie is already SameSite=Strict):
 * state-changing requests from a browser must come from this site and send JSON.
 *
 * @type {import('express').RequestHandler}
 */
export function sameOriginWrites(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      host = '';
    }
    if (host !== req.headers.host) {
      throw new ForbiddenError('Cross-site requests are not allowed.');
    }
  }
  const length = Number(req.headers['content-length'] ?? 0);
  if (length > 0 && !req.is('application/json')) {
    throw new BadRequestError('Send the request body as JSON.');
  }
  next();
}

/**
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

/** @param {import('express').Request} req @returns {never} */
export function notFound(req) {
  throw new ClinicNotFound(`No API endpoint ${req.method} ${req.path}.`);
}

class ClinicNotFound extends ClinicError {
  get status() {
    return 404;
  }

  get code() {
    return 'NOT_FOUND';
  }
}

/**
 * Turns every error into the same JSON shape: { error: { code, message, field? } }.
 * Unexpected errors are logged on the server and the client only gets a generic message.
 *
 * @param {{ log?: (message: string, error: unknown) => void }} [options]
 * @returns {import('express').ErrorRequestHandler}
 */
export function errorHandler({ log = (m, e) => console.error(m, e) } = {}) {
  return (err, _req, res, _next) => {
    if (err instanceof ClinicError) {
      if (err instanceof RateLimitError) {
        res.set('Retry-After', String(err.retryAfterSeconds));
      }
      res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}) } });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'The request body is not valid JSON.' } });
      return;
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' } });
      return;
    }
    log('Unexpected error', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server. Please try again.' } });
  };
}
