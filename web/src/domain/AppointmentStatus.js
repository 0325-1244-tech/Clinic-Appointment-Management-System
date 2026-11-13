// @ts-check
import { Enumeration } from './Enumeration.js';

/** The life-cycle states of an appointment. */
export class AppointmentStatus extends Enumeration {
  static SCHEDULED = new AppointmentStatus('SCHEDULED', 'Scheduled');
  static COMPLETED = new AppointmentStatus('COMPLETED', 'Completed');
  static CANCELLED = new AppointmentStatus('CANCELLED', 'Cancelled');
  static NO_SHOW = new AppointmentStatus('NO_SHOW', 'No-Show');

  /** Closed appointments become the appointment records. */
  get isClosed() {
    return this !== AppointmentStatus.SCHEDULED;
  }

  /** Cancelled and no-show appointments are not charged. */
  get isBillable() {
    return this !== AppointmentStatus.CANCELLED && this !== AppointmentStatus.NO_SHOW;
  }
}
Enumeration.seal(AppointmentStatus);
