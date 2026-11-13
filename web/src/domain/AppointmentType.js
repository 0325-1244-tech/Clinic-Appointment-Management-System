// @ts-check
import { Enumeration } from './Enumeration.js';

/** Kinds of visit. Each one scales the staff member's base fee by its own multiplier. */
export class AppointmentType extends Enumeration {
  static CONSULTATION = new AppointmentType('CONSULTATION', 'Consultation', 1.0);
  static FOLLOW_UP = new AppointmentType('FOLLOW_UP', 'Follow-up', 0.6);
  static CHECK_UP = new AppointmentType('CHECK_UP', 'General Check-up', 0.8);
  static EMERGENCY = new AppointmentType('EMERGENCY', 'Emergency', 1.5);

  #feeMultiplier;

  /**
   * @param {string} code
   * @param {string} label
   * @param {number} feeMultiplier
   */
  constructor(code, label, feeMultiplier) {
    super(code, label);
    this.#feeMultiplier = feeMultiplier;
  }

  get feeMultiplier() {
    return this.#feeMultiplier;
  }
}
Enumeration.seal(AppointmentType);
