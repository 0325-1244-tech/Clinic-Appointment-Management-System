// @ts-check
import { MedicalStaff } from './MedicalStaff.js';
import { requireText } from './text.js';

/**
 * INHERITANCE: a Nurse is a MedicalStaff member.
 * POLYMORPHISM: nurses handle short services (vaccination, vitals check), so
 * they use 15-minute slots and a lower fee.
 */
export class Nurse extends MedicalStaff {
  static AREA_LABEL = 'Department';
  static DEPARTMENTS = Object.freeze(['Immunization', 'Triage', 'Wound Care', 'Maternal Care']);
  static #NURSING_FEE = 250;
  static #SLOT_MINUTES = 15;

  /** @type {string} */
  #department = '';

  /** @param {import('./MedicalStaff.js').StaffProps} props */
  constructor(props) {
    super(props);
    this.serviceArea = props.serviceArea;
  }

  /** @override */
  getConsultationFee() {
    return Nurse.#NURSING_FEE;
  }

  /** @override */
  getSlotDurationMinutes() {
    return Nurse.#SLOT_MINUTES;
  }

  /** @override */
  getServiceAreaLabel() {
    return Nurse.AREA_LABEL;
  }

  /** @override */
  get serviceArea() {
    return this.#department;
  }

  /** @override */
  set serviceArea(value) {
    this.#department = requireText(value, Nurse.AREA_LABEL, 'serviceArea');
  }

  /** @override */
  getRole() {
    return 'Nurse';
  }

  /** @override */
  getDisplayName() {
    return `${this.fullName}, RN`;
  }
}
