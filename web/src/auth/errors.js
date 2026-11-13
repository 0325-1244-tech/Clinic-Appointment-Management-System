// @ts-check
import { ClinicError } from '../domain/errors.js';

/** Not signed in, or the username or password is wrong. */
export class AuthenticationError extends ClinicError {
  get status() {
    return 401;
  }

  get code() {
    return 'UNAUTHENTICATED';
  }
}

/** Signed in, but this role may not do that. */
export class ForbiddenError extends ClinicError {
  get status() {
    return 403;
  }

  get code() {
    return 'FORBIDDEN';
  }
}

/** Too many attempts; try again later. */
export class RateLimitError extends ClinicError {
  #retryAfterSeconds;

  /** @param {string} message @param {number} retryAfterSeconds */
  constructor(message, retryAfterSeconds) {
    super(message);
    this.#retryAfterSeconds = retryAfterSeconds;
  }

  get retryAfterSeconds() {
    return this.#retryAfterSeconds;
  }

  get status() {
    return 429;
  }

  get code() {
    return 'RATE_LIMITED';
  }
}

/** The request itself is malformed (wrong JSON shape or types). */
export class BadRequestError extends ClinicError {
  get status() {
    return 400;
  }

  get code() {
    return 'BAD_REQUEST';
  }
}
