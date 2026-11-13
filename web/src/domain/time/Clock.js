// @ts-check
import { abstractClass, abstractMethod } from '../contracts.js';
import { CalendarDate } from './CalendarDate.js';
import { TimeOfDay } from './TimeOfDay.js';

/** The clinic's time zone. Render's servers run on UTC, so "today" must not come from the server's own clock. */
export const CLINIC_TIME_ZONE = 'Asia/Manila';

/**
 * @typedef {object} ClinicMoment
 * @property {CalendarDate} date
 * @property {TimeOfDay} time
 */

/**
 * ABSTRACTION: where "today" and "now" come from. The Java version called
 * LocalDate.now() directly; here every rule asks a Clock, so tests can freeze
 * time (FixedClock) and the server always uses clinic time (ZoneClock).
 */
export class Clock {
  /** @type {Clock | undefined} */
  static #current;

  constructor() {
    if (new.target === Clock) {
      throw abstractClass('Clock');
    }
  }

  /**
   * The current date and time.
   *
   * @abstract
   * @returns {ClinicMoment}
   */
  now() {
    throw abstractMethod(this, 'now');
  }

  /** @returns {CalendarDate} */
  today() {
    return this.now().date;
  }

  /**
   * True when the given date and time are earlier than now.
   *
   * @param {CalendarDate} date
   * @param {TimeOfDay} time
   */
  isPast(date, time) {
    const { date: today, time: now } = this.now();
    return date.isBefore(today) || (date.equals(today) && time.isBefore(now));
  }

  /** The clock used by the domain classes when none is passed in (clinic time by default). */
  static current() {
    if (!Clock.#current) {
      Clock.#current = new ZoneClock(CLINIC_TIME_ZONE);
    }
    return Clock.#current;
  }

  /**
   * Replaces the default clock. Tests use this to freeze time.
   *
   * @param {Clock | undefined} clock pass undefined to go back to clinic time
   */
  static use(clock) {
    Clock.#current = clock;
  }
}

/** Real time in a given IANA time zone, e.g. "Asia/Manila". */
export class ZoneClock extends Clock {
  #format;
  #timeZone;

  /** @param {string} timeZone */
  constructor(timeZone) {
    super();
    this.#timeZone = timeZone;
    this.#format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  }

  get timeZone() {
    return this.#timeZone;
  }

  /** @returns {ClinicMoment} */
  now() {
    /** @type {Record<string, number>} */
    const parts = {};
    for (const part of this.#format.formatToParts(new Date())) {
      if (part.type !== 'literal') {
        parts[part.type] = Number(part.value);
      }
    }
    return {
      date: CalendarDate.of(parts.year, parts.month, parts.day),
      time: TimeOfDay.of(parts.hour, parts.minute),
    };
  }
}

/** A clock that stays at a set moment until told to move. Used in tests and demos. */
export class FixedClock extends Clock {
  #date;
  #time;

  /**
   * @param {CalendarDate | string} date
   * @param {TimeOfDay | string} [time]
   */
  constructor(date, time = '08:00') {
    super();
    this.#date = CalendarDate.parse(date);
    this.#time = TimeOfDay.parse(time);
  }

  /** @returns {ClinicMoment} */
  now() {
    return { date: this.#date, time: this.#time };
  }

  /**
   * @param {CalendarDate | string} date
   * @param {TimeOfDay | string} [time]
   */
  set(date, time = this.#time) {
    this.#date = CalendarDate.parse(date);
    this.#time = TimeOfDay.parse(time);
  }
}
