// @ts-check
import { Enumeration } from '../Enumeration.js';

/** Days of the week, numbered 1 (Monday) to 7 (Sunday) like java.time.DayOfWeek. */
export class DayOfWeek extends Enumeration {
  static MONDAY = new DayOfWeek('MONDAY', 'Monday', 1);
  static TUESDAY = new DayOfWeek('TUESDAY', 'Tuesday', 2);
  static WEDNESDAY = new DayOfWeek('WEDNESDAY', 'Wednesday', 3);
  static THURSDAY = new DayOfWeek('THURSDAY', 'Thursday', 4);
  static FRIDAY = new DayOfWeek('FRIDAY', 'Friday', 5);
  static SATURDAY = new DayOfWeek('SATURDAY', 'Saturday', 6);
  static SUNDAY = new DayOfWeek('SUNDAY', 'Sunday', 7);

  #number;

  /**
   * @param {string} code
   * @param {string} label
   * @param {number} number ISO day number
   */
  constructor(code, label, number) {
    super(code, label);
    this.#number = number;
  }

  /** ISO day number: 1 = Monday ... 7 = Sunday. */
  get number() {
    return this.#number;
  }

  /** Three-letter name, e.g. "Mon". */
  get shortLabel() {
    return this.label.slice(0, 3);
  }

  /**
   * @param {number} number ISO day number
   * @returns {DayOfWeek}
   */
  static ofNumber(number) {
    const day = DayOfWeek.values().find((d) => d.number === number);
    if (!day) {
      throw new RangeError(`Invalid day number: ${number}`);
    }
    return day;
  }

  /**
   * Monday to Friday, or Monday to Saturday, as a new Set.
   *
   * @param {DayOfWeek} from
   * @param {DayOfWeek} to
   * @returns {Set<DayOfWeek>}
   */
  static range(from, to) {
    return new Set(DayOfWeek.values().filter((d) => d.number >= from.number && d.number <= to.number));
  }

  /**
   * Sorts days Monday-first and joins their short names: "Mon, Wed, Fri".
   *
   * @param {Iterable<DayOfWeek>} days
   * @returns {string}
   */
  static describe(days) {
    return [...days]
      .sort((a, b) => a.number - b.number)
      .map((d) => d.shortLabel)
      .join(', ');
  }
}
Enumeration.seal(DayOfWeek);
