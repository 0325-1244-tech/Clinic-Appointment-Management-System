// @ts-check
import express from 'express';
import { ForbiddenError } from '../../auth/errors.js';
import { abstractClass, abstractMethod } from '../../domain/contracts.js';

/** @typedef {import('../middleware.js').AppRequest} AppRequest */

/**
 * @typedef {object} AppContext  everything a controller may use
 * @property {import('../../services/ClinicService.js').ClinicService} service
 * @property {import('../../services/StatsService.js').StatsService} stats
 * @property {import('../../services/AuditLog.js').AuditLog} audit
 * @property {import('../../services/QueueService.js').QueueService} queue
 * @property {import('../../auth/AuthService.js').AuthService} auth
 * @property {{ demoMode: boolean, secureCookies: boolean, timeZone: string }} config
 */

/**
 * ABSTRACTION: the base of every API controller. A subclass declares its
 * routes in `routes()`; the base class builds the Express router and offers
 * shared helpers. The app mounts a list of controllers and calls the same
 * method on each one (POLYMORPHISM).
 */
export class Controller {
  #context;

  /** @param {AppContext} context */
  constructor(context) {
    if (new.target === Controller) {
      throw abstractClass('Controller');
    }
    this.#context = context;
  }

  /**
   * Where the router is mounted, e.g. "/api/patients".
   *
   * @abstract
   * @returns {string}
   */
  get basePath() {
    throw abstractMethod(this, 'basePath');
  }

  /**
   * Adds this controller's routes.
   *
   * @abstract
   * @param {import('express').Router} _router
   */
  routes(_router) {
    throw abstractMethod(this, 'routes');
  }

  /** @returns {import('express').Router} */
  router() {
    const router = express.Router();
    this.routes(router);
    return router;
  }

  get context() {
    return this.#context;
  }

  get service() {
    return this.#context.service;
  }

  /**
   * The access policy of the signed-in user.
   *
   * @param {import('express').Request} req
   */
  policy(req) {
    const policy = /** @type {AppRequest} */ (req).policy;
    if (!policy) {
      throw new ForbiddenError('Your account is not allowed to do that.');
    }
    return policy;
  }

  /**
   * An appointment the signed-in user is allowed to see.
   *
   * @param {import('express').Request} req
   * @param {string} id
   */
  appointmentFor(req, id) {
    const appointment = this.service.getAppointment(id);
    this.policy(req).requireAccess(appointment);
    return appointment;
  }

  /**
   * Read a single query-string value as text.
   *
   * @param {import('express').Request} req
   * @param {string} name
   */
  query(req, name) {
    const value = req.query[name];
    return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 200) : undefined;
  }
}
