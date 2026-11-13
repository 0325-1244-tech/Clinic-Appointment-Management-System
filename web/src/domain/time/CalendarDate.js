// @ts-check
import { ValidationError } from '../errors.js';
import { DayOfWeek } from './DayOfWeek.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];
const DAY_MS = 86_400_000;

/**
 * A date without a time or time zone (the JavaScript counterpart of
 * java.time.LocalDate). Built-in `Date` always carries a time zone, which
 * causes off-by-one-day bugs, so the clinic uses this value object instead.
 *
 * ENCAPSULATION: an immutable value object. Fields are #private, the instance
 * is frozen, and "changing" a date returns a new CalendarDate.
 */
export class CalendarDate {
  #year;
  #month;
  #day;

  /**
   * @param {number} year
   * @param {number} month 1-12
   * @param {number} day   1-31
   */
  constructor(year, month, day) {
    if (![year, month, day].every(Number.isInteger)) {
      throw new ValidationError('Date must be made of whole numbers.');
    }
    const check = new Date(Date.UTC(year, month - 1, day));
    if (year < 1000 || year > 9999 || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
      throw new ValidationError(`Invalid date: ${year}-${month}-${day}.`);
    }
    this.#year = year;
    this.#month = month;
    this.#day = day;
    Object.freeze(this);
  }

  /**
   * @param {number} year
   * @param {number} month
   * @param {number} day
   */
  static of(year, month, day) {
    return new CalendarDate(year, month, day);
  }

  /**
   * Parses "YYYY-MM-DD" (or returns the argument when it already is a CalendarDate).
   *
   * @param {string | CalendarDate} text
   * @returns {CalendarDate}
   */
  static parse(text) {
    if (text instanceof CalendarDate) {
      return text;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? '').trim());
    if (!match) {
      throw new ValidationError('Date must use the format YYYY-MM-DD.');
    }
    return new CalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  get year() {
    return this.#year;
  }

  get month() {
    return this.#month;
  }

  get day() {
    return this.#day;
  }

  /** @returns {DayOfWeek} */
  get dayOfWeek() {
    const jsDay = new Date(this.#epochMs()).getUTCDay(); // 0 = Sunday
    return DayOfWeek.ofNumber(jsDay === 0 ? 7 : jsDay);
  }

  /** @param {number} days */
  plusDays(days) {
    const d = new Date(this.#epochMs() + days * DAY_MS);
    return new CalendarDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  /** @param {number} days */
  minusDays(days) {
    return this.plusDays(-days);
  }

  /** Whole days from this date to `other` (negative if `other` is earlier). @param {CalendarDate} other */
  daysUntil(other) {
    return Math.round((other.#epochMs() - this.#epochMs()) / DAY_MS);
  }

  /** Monday of this date's week. */
  startOfWeek() {
    return this.minusDays(this.dayOfWeek.number - 1);
  }

  /** @param {CalendarDate} other */
  compareTo(other) {
    return this.#epochMs() - other.#epochMs();
  }

  /** @param {unknown} other */
  equals(other) {
    return other instanceof CalendarDate && this.compareTo(other) === 0;
  }

  /** @param {CalendarDate} other */
  isBefore(other) {
    return this.compareTo(other) < 0;
  }

  /** @param {CalendarDate} other */
  isAfter(other) {
    return this.compareTo(other) > 0;
  }

  /**
   * Whole years from this date to `other`, as java.time.Period would count them.
   *
   * @param {CalendarDate} other
   */
  yearsUntil(other) {
    let years = other.#year - this.#year;
    if (other.#month < this.#month || (other.#month === this.#month && other.#day < this.#day)) {
      years -= 1;
    }
    return years;
  }

  /** "November 13, 2026 (Friday)" — the Java version's long format. */
  formatLong() {
    return `${MONTHS[this.#month - 1]} ${pad(this.#day)}, ${this.#year} (${this.dayOfWeek.label})`;
  }

  /** "Nov 13, 2026" */
  formatMedium() {
    return `${MONTHS[this.#month - 1].slice(0, 3)} ${this.#day}, ${this.#year}`;
  }

  /** "2026-11-13" */
  toString() {
    return `${this.#year}-${pad(this.#month)}-${pad(this.#day)}`;
  }

  toJSON() {
    return this.toString();
  }

  #epochMs() {
    return Date.UTC(this.#year, this.#month - 1, this.#day);
  }
}

/** @param {number} n */
function pad(n) {
  return String(n).padStart(2, '0');
}
