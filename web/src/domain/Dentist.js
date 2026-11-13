// @ts-check
import { MedicalStaff } from './MedicalStaff.js';
import { requireText } from './text.js';

/**
 * INHERITANCE: a Dentist is a MedicalStaff member.
 * POLYMORPHISM: dental procedures take longer (60-minute slots) and have their own fee.
 */
export class Dentist extends MedicalStaff {
  static AREA_LABEL = 'Dental Room';
  static ROOMS = Object.freeze(['Dental Room 1', 'Dental Room 2', 'Dental Room 3']);
  static #DENTAL_FEE = 700;
  static #SLOT_MINUTES = 60;

  /** @type {string} */
  #clinicRoom = '';

  /** @param {import('./MedicalStaff.js').StaffProps} props */
  constructor(props) {
    super(props);
    this.serviceArea = props.serviceArea;
  }

  /** @override */
  getConsultationFee() {
    return Dentist.#DENTAL_FEE;
  }

  /** @override */
  getSlotDurationMinutes() {
    return Dentist.#SLOT_MINUTES;
  }

  /** @override */
  getServiceAreaLabel() {
    return Dentist.AREA_LABEL;
  }

  /** @override */
  get serviceArea() {
    return this.#clinicRoom;
  }

  /** @override */
  set serviceArea(value) {
    this.#clinicRoom = requireText(value, Dentist.AREA_LABEL, 'serviceArea');
  }

  /** @override */
  getRole() {
    return 'Dentist';
  }

  /** @override */
  getDisplayName() {
    return `Dr. ${this.fullName}, DMD`;
  }
}
