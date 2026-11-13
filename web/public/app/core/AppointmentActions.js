// @ts-check
import { AppointmentDetailsDialog, AppointmentDialog } from '../components/dialogs/AppointmentDialogs.js';
import { ConfirmDialog } from '../components/dialogs/BaseDialog.js';
import { TextPromptDialog } from '../components/dialogs/FormDialog.js';

/** @typedef {import('/domain/Appointment.js').Appointment} Appointment */

const UNDO_SECONDS = 6;

/**
 * The appointment actions shared by every page (list, calendar, dashboard,
 * profile): details, book, reschedule, complete, cancel (with undo) and no-show.
 * Each action resolves to true when something changed, so the page can refresh.
 */
export class AppointmentActions {
  #app;
  /** @type {Map<string, string>} appointment id -> cancel reason waiting to be sent */
  #pendingCancels = new Map();

  /** @param {import('../App.js').App} app */
  constructor(app) {
    this.#app = app;
    // If the tab closes during the undo window, the cancellation is still sent.
    window.addEventListener('pagehide', () => {
      for (const [id, reason] of this.#pendingCancels) {
        fetch(`/api/appointments/${encodeURIComponent(id)}/cancel`, {
          method: 'POST', keepalive: true, credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
        });
      }
    });
  }

  /** @param {Appointment} appointment @returns {Promise<boolean>} */
  async details(appointment) {
    const choice = await new AppointmentDetailsDialog(this.#app, appointment).open();
    switch (choice) {
      case 'reschedule':
        return this.reschedule(appointment);
      case 'complete':
        return this.complete(appointment);
      case 'cancel':
        return this.cancel(appointment);
      case 'no-show':
        return this.noShow(appointment);
      default:
        return false;
    }
  }

  /** @param {{ patientId?: string, staffId?: string, date?: string, time?: string }} [defaults] */
  async book(defaults = {}) {
    const booked = await new AppointmentDialog(this.#app, defaults).load();
    if (booked) {
      this.#app.toaster.success(`Booked ${booked.id}`, `${booked.patient.fullName} · ${booked.date.formatMedium()} at ${booked.time.format12h()}`);
    }
    return Boolean(booked);
  }

  /** @param {Appointment} appointment */
  async reschedule(appointment) {
    const moved = await new AppointmentDialog(this.#app, { appointment }).load();
    if (moved) {
      this.#app.toaster.success(`Rescheduled ${moved.id}`, `${moved.date.formatMedium()} at ${moved.time.format12h()}`);
    }
    return Boolean(moved);
  }

  /**
   * Moves an appointment straight to a new date and time (calendar drag and drop).
   *
   * @param {Appointment} appointment @param {string} date @param {string} time
   */
  async moveTo(appointment, date, time) {
    try {
      const moved = await this.#app.api.act(appointment.id, 'reschedule', { date, time });
      this.#app.toaster.success(`Moved ${moved.id}`, `${moved.date.formatMedium()} at ${moved.time.format12h()}`);
      return true;
    } catch (err) {
      this.#app.toaster.error('Could not move the appointment', /** @type {Error} */ (err).message);
      return false;
    }
  }

  /** @param {Appointment} appointment */
  async complete(appointment) {
    const findings = await new TextPromptDialog({
      title: `Complete ${appointment.id}`,
      description: `${appointment.patient.fullName} · ${appointment.type.label}`,
      label: 'Findings or notes for this visit',
      saveLabel: 'Mark as completed',
      placeholder: 'Diagnosis, treatment given, advice…',
      validate: (text) => {
        if (!text.trim()) throw new Error('Please enter the findings or notes for this visit.');
      },
    }).open();
    if (findings === undefined) {
      return false;
    }
    return this.#run(() => this.#app.api.act(appointment.id, 'complete', { findings }), `Completed ${appointment.id}`);
  }

  /**
   * Cancels with a reason. The request waits a few seconds so "Undo" can take
   * it back without breaking the rule that a cancelled appointment never changes.
   *
   * @param {Appointment} appointment
   */
  async cancel(appointment) {
    const reason = await new TextPromptDialog({
      title: `Cancel ${appointment.id}`,
      description: `${appointment.patient.fullName} · ${appointment.date.formatMedium()} at ${appointment.time.format12h()}`,
      label: 'Reason for cancelling',
      saveLabel: 'Cancel appointment',
      validate: (text) => {
        if (!text.trim()) throw new Error('Please enter a reason for cancelling.');
      },
    }).open();
    if (reason === undefined) {
      return false;
    }
    this.#pendingCancels.set(appointment.id, reason);
    this.#app.emit('pending-cancel', appointment.id);
    const toast = this.#app.toaster.show({
      title: `Cancelling ${appointment.id}…`,
      detail: `${appointment.patient.fullName}. You can undo this for ${UNDO_SECONDS} seconds.`,
      duration: UNDO_SECONDS * 1000,
      action: { label: 'Undo', onAction: () => {} },
    });
    const outcome = await toast.done;
    this.#pendingCancels.delete(appointment.id);
    if (outcome === 'action') {
      this.#app.toaster.success(`Kept ${appointment.id}`, 'The appointment was not cancelled.');
      this.#app.emit('pending-cancel', null);
      return true;
    }
    return this.#run(() => this.#app.api.act(appointment.id, 'cancel', { reason }), `Cancelled ${appointment.id}`);
  }

  /** @param {Appointment} appointment */
  async noShow(appointment) {
    const ok = await new ConfirmDialog({
      title: 'Mark as no-show?',
      message: `${appointment.patient.fullName} did not arrive for ${appointment.id} (${appointment.time.format12h()}). No fee is charged. This cannot be undone.`,
      confirmLabel: 'Mark no-show',
      danger: true,
    }).open();
    if (!ok) {
      return false;
    }
    return this.#run(() => this.#app.api.act(appointment.id, 'no-show'), `Marked ${appointment.id} as no-show`);
  }

  /** True while a cancellation is waiting in its undo window. @param {string} id */
  isPendingCancel(id) {
    return this.#pendingCancels.has(id);
  }

  /** @param {() => Promise<unknown>} fn @param {string} message */
  async #run(fn, message) {
    try {
      await fn();
      this.#app.toaster.success(message);
      return true;
    } catch (err) {
      this.#app.toaster.error('That did not work', /** @type {Error} */ (err).message);
      return true;
    }
  }
}
