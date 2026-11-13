// @ts-check
import { ValidationError } from '../errors.js';

const MINUTES_PER_DAY = 24 * 60;

/**
 * A time of day without a date (the JavaScript counterpart of java.time.LocalTime),
 * stored as minutes after midnight.
 *
 * ENCAPSULATION: an immutable, frozen value object.
 */
export class TimeOfDay {
  #minutes;

  /** @param {number} minutesAfterMidnight 0 to 1439 */
  constructor(minutesAfterMidnight) {
    if (!Number.isInteger(minutesAfterMidnight) || minutesAfterMidnight < 0 || minutesAfterMidnight >= MINUTES_PER_DAY) {
      throw new ValidationError('Time must be between 00:00 and 23:59.');
    }
    this.#minutes = minutesAfterMidnight;
    Object.freeze(this);
  }

  /**
   * @param {number} hour
   * @param {number} [minute]
   */
  static of(hour, minute = 0) {
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new ValidationError('Time must be between 00:00 and 23:59.');
    }
    return new TimeOfDay(hour * 60 + minute);
  }

  /**
   * Parses "HH:MM" in 24-hour format (or returns the argument when it already is a TimeOfDay).
   *
   * @param {string | TimeOfDay} text
   * @returns {TimeOfDay}
   */
  static parse(text) {
    if (text instanceof TimeOfDay) {
      return text;
    }
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? '').trim());
    if (!match) {
      throw new ValidationError('Time must use the format HH:MM.');
    }
    return TimeOfDay.of(Number(match[1]), Number(match[2]));
  }

  get hour() {
    return Math.floor(this.#minutes / 60);
  }

  get minute() {
    return this.#minutes % 60;
  }

  /** Minutes after midnight. */
  get totalMinutes() {
    return this.#minutes;
  }

  /**
   * Adds minutes, staying within the same day (23:59 at most).
   *
   * @param {number} minutes
   */
  plusMinutes(minutes) {
    return new TimeOfDay(Math.min(Math.max(this.#minutes + minutes, 0), MINUTES_PER_DAY - 1));
  }

  /** Minutes from this time to `other`. @param {TimeOfDay} other */
  minutesUntil(other) {
    return other.#minutes - this.#minutes;
  }

  /** @param {TimeOfDay} other */
  compareTo(other) {
    return this.#minutes - other.#minutes;
  }

  /** @param {unknown} other */
  equals(other) {
    return other instanceof TimeOfDay && other.#minutes === this.#minutes;
  }

  /** @param {TimeOfDay} other */
  isBefore(other) {
    return this.#minutes < other.#minutes;
  }

  /** @param {TimeOfDay} other */
  isAfter(other) {
    return this.#minutes > other.#minutes;
  }

  /** "09:30 AM" — the Java version's display format. */
  format12h() {
    const h = this.hour % 12 === 0 ? 12 : this.hour % 12;
    return `${String(h).padStart(2, '0')}:${String(this.minute).padStart(2, '0')} ${this.hour < 12 ? 'AM' : 'PM'}`;
  }

  /** "09:30" */
  toString() {
    return `${String(this.hour).padStart(2, '0')}:${String(this.minute).padStart(2, '0')}`;
  }

  toJSON() {
    return this.toString();
  }
}
