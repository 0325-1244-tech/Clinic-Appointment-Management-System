// @ts-check
import { EventEmitter } from 'node:events';
import { Enumeration } from '../domain/Enumeration.js';
import { ConflictError } from '../domain/errors.js';

/** @typedef {import('../domain/Appointment.js').Appointment} Appointment */

/** Where a checked-in patient is in the waiting-room queue. */
export class QueueState extends Enumeration {
  static WAITING = new QueueState('WAITING', 'Waiting');
  static SERVING = new QueueState('SERVING', 'Now serving');
  static SEEN = new QueueState('SEEN', 'Seen');
}
Enumeration.seal(QueueState);

/**
 * @typedef {object} QueueEntry
 * @property {Appointment} appointment
 * @property {QueueState} state
 * @property {string} checkedInAt  HH:MM clinic time
 * @property {string} [calledAt]
 * @property {string} ticket       per-day queue number shown on the board, e.g. "Q-007"
 */

/**
 * The waiting-room queue for today: check-in, "call next", and a board for the
 * waiting-area screen.
 *
 * This is kept apart from the appointment status on purpose: the four
 * statuses and their rules stay exactly as in the Java version. When an
 * appointment is completed, cancelled or marked no-show, it leaves the queue
 * automatically (the queue observes the ClinicService).
 *
 * Emits "update" whenever the board changes, which the server streams to the
 * board screen with Server-Sent Events.
 */
export class QueueService extends EventEmitter {
  #service;
  /** @type {Map<string, QueueEntry>} */
  #entries = new Map();
  /** @type {string} */
  #day = '';
  #nextTicket = 1;

  /** @param {import('./ClinicService.js').ClinicService} service */
  constructor(service) {
    super();
    this.#service = service;
    service.on('change', (/** @type {import('./ClinicService.js').ChangeEvent} */ event) => {
      if (event.entityType === 'appointment' && this.#entries.has(event.entityId)) {
        const appointment = this.#service.getAppointment(event.entityId);
        if (!appointment.isActive() || !appointment.date.equals(this.#service.clock.today())) {
          this.#entries.delete(event.entityId);
          this.#changed();
        }
      }
    });
  }

  /** @param {Appointment} appointment */
  checkIn(appointment) {
    this.#rollOver();
    if (!appointment.isActive()) {
      throw new ConflictError(`Appointment ${appointment.id} is ${appointment.status.label} and cannot be checked in.`);
    }
    if (!appointment.date.equals(this.#service.clock.today())) {
      throw new ConflictError('Only today\'s appointments can be checked in.');
    }
    if (this.#entries.has(appointment.id)) {
      throw new ConflictError(`${appointment.patient.fullName} is already checked in.`);
    }
    // The board shows a per-day queue number, not the appointment ID, so nobody can link a ticket to a record.
    const ticket = `Q-${String(this.#nextTicket++).padStart(3, '0')}`;
    this.#entries.set(appointment.id, {
      appointment, state: QueueState.WAITING, checkedInAt: this.#service.clock.now().time.toString(), ticket,
    });
    this.#changed();
  }

  /**
   * Calls a waiting patient in. Whoever that staff member was serving before is marked as seen.
   *
   * @param {Appointment} appointment
   */
  call(appointment) {
    this.#rollOver();
    const entry = this.#entries.get(appointment.id);
    if (!entry) {
      throw new ConflictError(`${appointment.patient.fullName} has not checked in yet.`);
    }
    for (const other of this.#entries.values()) {
      if (other.state === QueueState.SERVING && other.appointment.staff.equals(appointment.staff)) {
        other.state = QueueState.SEEN;
      }
    }
    entry.state = QueueState.SERVING;
    entry.calledAt = this.#service.clock.now().time.toString();
    this.#changed();
  }

  /** Undo a check-in made by mistake. @param {Appointment} appointment */
  remove(appointment) {
    if (this.#entries.delete(appointment.id)) {
      this.#changed();
    }
  }

  /** All of today's entries, in appointment order. */
  entries() {
    this.#rollOver();
    return [...this.#entries.values()].sort((a, b) => a.appointment.compareTo(b.appointment));
  }

  /** @param {Appointment} appointment */
  stateOf(appointment) {
    return this.#entries.get(appointment.id)?.state;
  }

  /** The queue number given at check-in. @param {Appointment} appointment */
  ticketOf(appointment) {
    return this.#entries.get(appointment.id)?.ticket;
  }

  /**
   * What the waiting-area screen shows. Patient privacy: only the ticket
   * number and initials, never a full name.
   */
  board() {
    const today = this.#service.clock.today();
    const entries = this.entries();
    return this.#service.getStaffOnDuty(today)
      .map((staff) => {
        const mine = entries.filter((e) => e.appointment.staff.equals(staff));
        const serving = mine.find((e) => e.state === QueueState.SERVING);
        const ticket = (/** @type {QueueEntry} */ e) => ({ ticket: e.ticket, initials: e.appointment.patient.initials });
        return {
          staffId: staff.id,
          staffName: staff.getDisplayName(),
          role: staff.getRole(),
          serviceArea: staff.serviceArea,
          nowServing: serving ? ticket(serving) : null,
          waiting: mine.filter((e) => e.state === QueueState.WAITING).map(ticket),
        };
      });
  }

  /** Checks for a new day; the server calls this regularly so the board clears at midnight. */
  tick() {
    this.#rollOver();
  }

  /** The queue only covers today; it empties itself when the date changes. */
  #rollOver() {
    const today = this.#service.clock.today().toString();
    if (this.#day !== today) {
      const hadEntries = this.#entries.size > 0;
      this.#day = today;
      this.#entries.clear();
      this.#nextTicket = 1;
      if (hadEntries) {
        this.#changed();
      }
    }
  }

  #changed() {
    this.emit('update');
  }
}
