// @ts-check
import { BadRequestError } from '../auth/errors.js';

/**
 * @typedef {object} FieldSpec
 * @property {'string' | 'boolean' | 'string[]'} type
 * @property {boolean} [required]  must be present (the domain still decides whether blank is allowed)
 * @property {number} [max]        longest allowed string, or longest list
 */

/**
 * Checks the shape of a JSON request body before it reaches the services:
 * only known fields, the right types, and sensible lengths. The domain
 * classes then apply the real business rules and their friendly messages.
 */
export class RequestSchema {
  #fields;

  /** @param {Record<string, FieldSpec>} fields */
  constructor(fields) {
    this.#fields = Object.freeze({ ...fields });
  }

  /**
   * @param {unknown} body
   * @returns {Record<string, any>} only the declared fields
   */
  parse(body) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestError('The request body must be a JSON object.');
    }
    const input = /** @type {Record<string, unknown>} */ (body);
    const unknown = Object.keys(input).filter((k) => !Object.hasOwn(this.#fields, k));
    if (unknown.length > 0) {
      throw new BadRequestError(`Unknown field(s): ${unknown.join(', ')}.`, { field: unknown[0] });
    }
    /** @type {Record<string, any>} */
    const out = {};
    for (const [name, spec] of Object.entries(this.#fields)) {
      const value = input[name];
      if (value === undefined || value === null) {
        if (spec.required) {
          throw new BadRequestError(`Missing field: ${name}.`, { field: name });
        }
        continue;
      }
      out[name] = RequestSchema.#check(name, value, spec);
    }
    return out;
  }

  /** @param {string} name @param {unknown} value @param {FieldSpec} spec */
  static #check(name, value, spec) {
    const max = spec.max ?? 200;
    if (spec.type === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new BadRequestError(`${name} must be true or false.`, { field: name });
      }
      return value;
    }
    if (spec.type === 'string[]') {
      if (!Array.isArray(value) || value.length > max || !value.every((v) => typeof v === 'string' && v.length <= 40)) {
        throw new BadRequestError(`${name} must be a list of text values.`, { field: name });
      }
      return value;
    }
    if (typeof value !== 'string') {
      throw new BadRequestError(`${name} must be text.`, { field: name });
    }
    if (value.length > max) {
      throw new BadRequestError(`${name} is too long (at most ${max} characters).`, { field: name });
    }
    return value;
  }
}

const text = (/** @type {number} */ max = 200) => /** @type {FieldSpec} */ ({ type: 'string', max });
const required = (/** @type {number} */ max = 200) => /** @type {FieldSpec} */ ({ type: 'string', max, required: true });

const personFields = {
  firstName: required(80), lastName: required(80), contactNumber: required(20), email: text(120),
};

export const Schemas = Object.freeze({
  login: new RequestSchema({ username: required(60), password: required(200) }),
  patient: new RequestSchema({
    ...personFields, birthDate: required(10), gender: required(20), address: required(250), bloodType: text(10),
  }),
  staff: new RequestSchema({
    role: text(20), ...personFields, licenseNumber: required(40), serviceArea: required(80),
    workingDays: { type: 'string[]', required: true, max: 7 }, shiftStart: required(5), shiftEnd: required(5),
  }),
  active: new RequestSchema({ active: { type: 'boolean', required: true } }),
  booking: new RequestSchema({
    patientId: required(20), staffId: required(20), date: required(10), time: required(5), type: required(20), reason: required(500),
  }),
  reschedule: new RequestSchema({ date: required(10), time: required(5) }),
  complete: new RequestSchema({ findings: required(4000) }),
  cancel: new RequestSchema({ reason: required(500) }),
  empty: new RequestSchema({}),
  newUser: new RequestSchema({
    username: required(30), displayName: required(80), role: required(20), staffId: text(20), password: required(200),
  }),
  editUser: new RequestSchema({
    displayName: required(80), role: required(20), staffId: text(20), active: { type: 'boolean', required: true },
  }),
  resetPassword: new RequestSchema({ password: required(200) }),
  changePassword: new RequestSchema({ currentPassword: required(200), newPassword: required(200) }),
});
