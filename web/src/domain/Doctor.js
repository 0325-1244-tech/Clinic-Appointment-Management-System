// @ts-check
import { MedicalStaff } from './MedicalStaff.js';
import { requireText } from './text.js';

/**
 * INHERITANCE: a Doctor is a MedicalStaff member.
 * POLYMORPHISM: overrides the fee, slot length and display name.
 * Specialists charge more than general practitioners.
 */
export class Doctor extends MedicalStaff {
  static AREA_LABEL = 'Specialization';
  static SPECIALIZATIONS = Object.freeze([
    'General Medicine', 'Pediatrics', 'Internal Medicine', 'OB-Gynecology', 'Cardiology', 'Dermatology',
  ]);
  static #GENERAL_FEE = 500;
  static #SPECIALIST_FEE = 800;
  static #SLOT_MINUTES = 30;

  /** @type {string} */
  #specialization = '';

  /** @param {import('./MedicalStaff.js').StaffProps} props */
  constructor(props) {
    super(props);
    this.serviceArea = props.serviceArea;
  }

  isGeneralPractitioner() {
    return this.#specialization.toLowerCase() === 'general medicine';
  }

  /** @override */
  getConsultationFee() {
    return this.isGeneralPractitioner() ? Doctor.#GENERAL_FEE : Doctor.#SPECIALIST_FEE;
  }

  /** @override */
  getSlotDurationMinutes() {
    return Doctor.#SLOT_MINUTES;
  }

  /** @override */
  getServiceAreaLabel() {
    return Doctor.AREA_LABEL;
  }

  /** @override */
  get serviceArea() {
    return this.#specialization;
  }

  /** @override */
  set serviceArea(value) {
    this.#specialization = requireText(value, Doctor.AREA_LABEL, 'serviceArea');
  }

  /** @override */
  getRole() {
    return 'Doctor';
  }

  /** @override */
  getDisplayName() {
    return `Dr. ${this.fullName}`;
  }
}
