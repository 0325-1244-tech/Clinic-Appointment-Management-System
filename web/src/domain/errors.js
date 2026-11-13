// @ts-check
/**
 * Error classes for the clinic.
 *
 * INHERITANCE: every error extends ClinicError, which extends JavaScript's
 * built-in Error. Each subclass fixes its own HTTP status and error code, so
 * the API error handler can treat all of them the same way (POLYMORPHISM).
 */

export class ClinicError extends Error {
  /**
   * @param {string} message
   * @param {{ field?: string }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = new.target.name;
    /** @type {string | undefined} */
    this.field = options.field;
  }

  /** HTTP status the API sends for this kind of error. */
  get status() {
    return 500;
  }

  /** Short machine-readable code, e.g. "VALIDATION_ERROR". */
  get code() {
    return 'INTERNAL_ERROR';
  }
}

/** A value is missing or invalid, or a business rule was broken (Java: ValidationException / IllegalArgumentException). */
export class ValidationError extends ClinicError {
  get status() {
    return 422;
  }

  get code() {
    return 'VALIDATION_ERROR';
  }
}

/** The action is not allowed in the record's current state (Java: IllegalStateException). */
export class InvalidStateError extends ClinicError {
  get status() {
    return 409;
  }

  get code() {
    return 'INVALID_STATE';
  }
}

/** The action clashes with existing data, e.g. a double booking or a duplicate ID. */
export class ConflictError extends ValidationError {
  get status() {
    return 409;
  }

  get code() {
    return 'CONFLICT';
  }
}

/** No record exists with the requested ID. */
export class NotFoundError extends ClinicError {
  get status() {
    return 404;
  }

  get code() {
    return 'NOT_FOUND';
  }
}
