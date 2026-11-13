// @ts-check
import { Appointment } from '../domain/Appointment.js';
import { AppointmentType } from '../domain/AppointmentType.js';
import { Dentist } from '../domain/Dentist.js';
import { Doctor } from '../domain/Doctor.js';
import { Nurse } from '../domain/Nurse.js';
import { Patient } from '../domain/Patient.js';
import { Clock } from '../domain/time/Clock.js';
import { DayOfWeek } from '../domain/time/DayOfWeek.js';

/** @typedef {import('../domain/MedicalStaff.js').MedicalStaff} MedicalStaff */
/** @typedef {import('../domain/time/CalendarDate.js').CalendarDate} CalendarDate */

const { MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY } = DayOfWeek;
const WEEKDAYS = DayOfWeek.range(MONDAY, FRIDAY);
const MON_TO_SAT = DayOfWeek.range(MONDAY, SATURDAY);

/**
 * Fills an empty database with the same demo records as the Java version
 * (6 staff, 8 patients, 14 to 16 appointments placed around today's date),
 * so there is something to show during the demonstration.
 *
 * Like the Java loader it writes to the repositories directly, because past
 * visits could never be booked through the service's "no past bookings" rule.
 */
export class SampleDataLoader {
  constructor() {
    throw new TypeError('SampleDataLoader only has static methods.');
  }

  /**
   * @param {import('../repositories/ClinicDatabase.js').ClinicDatabase} db
   * @param {Clock} [clock]
   */
  static populate(db, clock = Clock.current()) {
    const staff = db.staff;
    const patients = db.patients;
    /** @template T @param {import('../repositories/Repository.js').Repository<any>} repo @param {T} item @returns {T} */
    const add = (repo, item) => {
      repo.add(item);
      return item;
    };
    const person = (/** @type {string} */ first, /** @type {string} */ last, /** @type {string} */ phone,
      /** @type {string} */ email) => ({ firstName: first, lastName: last, contactNumber: phone, email });

    const santos = add(staff, new Doctor({
      id: staff.nextId(), ...person('Maria', 'Santos', '09171234501', 'maria.santos@careconnect.ph'),
      licenseNumber: 'PRC-0123456', serviceArea: 'General Medicine', workingDays: MON_TO_SAT, shiftStart: '08:00', shiftEnd: '17:00',
    }));
    const reyes = add(staff, new Doctor({
      id: staff.nextId(), ...person('Jose', 'Reyes', '09171234502', 'jose.reyes@careconnect.ph'),
      licenseNumber: 'PRC-0234567', serviceArea: 'Pediatrics', workingDays: [MONDAY, WEDNESDAY, FRIDAY], shiftStart: '09:00', shiftEnd: '15:00',
    }));
    const villanueva = add(staff, new Doctor({
      id: staff.nextId(), ...person('Ana', 'Villanueva', '09171234503', 'ana.villanueva@careconnect.ph'),
      licenseNumber: 'PRC-0345678', serviceArea: 'Cardiology', workingDays: [TUESDAY, THURSDAY, SATURDAY], shiftStart: '10:00', shiftEnd: '16:00',
    }));
    const mendoza = add(staff, new Dentist({
      id: staff.nextId(), ...person('Carlo', 'Mendoza', '09171234504', 'carlo.mendoza@careconnect.ph'),
      licenseNumber: 'PRC-0456789', serviceArea: 'Dental Room 1', workingDays: MON_TO_SAT, shiftStart: '08:00', shiftEnd: '16:00',
    }));
    const bautista = add(staff, new Nurse({
      id: staff.nextId(), ...person('Liza', 'Bautista', '09171234505', 'liza.bautista@careconnect.ph'),
      licenseNumber: 'PRC-0567890', serviceArea: 'Immunization', workingDays: MON_TO_SAT, shiftStart: '07:00', shiftEnd: '15:00',
    }));
    add(staff, new Nurse({
      id: staff.nextId(), ...person('Mark', 'Dela Cruz', '09171234506', 'mark.delacruz@careconnect.ph'),
      licenseNumber: 'PRC-0678901', serviceArea: 'Triage', workingDays: WEEKDAYS, shiftStart: '13:00', shiftEnd: '21:00',
    }));

    const patient = (/** @type {Omit<import('../domain/Patient.js').PatientProps, 'id'>} */ props) =>
      add(patients, new Patient({ id: patients.nextId(), ...props }));
    const juan = patient({ ...person('Juan', 'Dela Cruz', '09181112201', 'juan.dc@gmail.com'),
      birthDate: '1990-03-14', gender: 'Male', address: 'Brgy. Bagumbayan, Santa Cruz, Laguna', bloodType: 'O+' });
    const angela = patient({ ...person('Angela', 'Ramos', '09181112202', 'angela.ramos@gmail.com'),
      birthDate: '1998-07-02', gender: 'Female', address: 'Brgy. Pagsawitan, Santa Cruz, Laguna', bloodType: 'A+' });
    const miguel = patient({ ...person('Miguel', 'Garcia', '09181112203', ''),
      birthDate: '2018-11-21', gender: 'Male', address: 'Brgy. Poblacion, Pagsanjan, Laguna', bloodType: 'B+' });
    const sofia = patient({ ...person('Sofia', 'Aquino', '09181112204', 'sofia.aquino@yahoo.com'),
      birthDate: '1965-01-30', gender: 'Female', address: 'Brgy. San Juan, Lumban, Laguna', bloodType: 'AB+' });
    const rafael = patient({ ...person('Rafael', 'Torres', '09181112205', 'raf.torres@gmail.com'),
      birthDate: '2003-05-09', gender: 'Male', address: 'Brgy. Calios, Santa Cruz, Laguna', bloodType: 'O-' });
    const bea = patient({ ...person('Bea', 'Navarro', '09181112206', ''),
      birthDate: '2001-09-17', gender: 'Female', address: 'Brgy. Duhat, Santa Cruz, Laguna', bloodType: 'Unknown' });
    const lorna = patient({ ...person('Lorna', 'Castillo', '09181112207', 'lorna.c@gmail.com'),
      birthDate: '1978-12-05', gender: 'Female', address: 'Brgy. Wawa, Pila, Laguna', bloodType: 'A-' });
    const paolo = patient({ ...person('Paolo', 'Mercado', '09181112208', 'paolo.mercado@gmail.com'),
      birthDate: '1995-04-25', gender: 'Male', address: 'Brgy. Bubukal, Santa Cruz, Laguna', bloodType: 'B-' });

    const today = clock.today();
    /**
     * @param {Patient} p @param {MedicalStaff} s @param {CalendarDate} date @param {string} time
     * @param {AppointmentType} type @param {string} reason
     */
    const book = (p, s, date, time, type, reason) => add(db.appointments,
      new Appointment({ id: db.appointments.nextId(), patient: p, staff: s, date, time, type, reason }));
    /** @param {Appointment} a @param {string} findings */
    const complete = (a, findings) => {
      a.complete(findings);
      db.appointments.update(a);
    };
    const before = SampleDataLoader.#workingDayOnOrBefore;
    const after = SampleDataLoader.#workingDayOnOrAfter;
    const { CONSULTATION, FOLLOW_UP, CHECK_UP } = AppointmentType;

    // Past visits, already completed / cancelled / no-show (these become the appointment records).
    complete(book(juan, santos, before(santos, today.minusDays(14)), '09:00', CONSULTATION, 'Fever and cough for 3 days'),
      'Acute upper respiratory infection. Prescribed paracetamol and rest. Return if fever persists.');
    complete(book(miguel, reyes, before(reyes, today.minusDays(10)), '10:00', CHECK_UP, 'Annual pediatric check-up'),
      'Normal growth and development. Weight 22 kg. Due for booster shot.');
    complete(book(sofia, villanueva, before(villanueva, today.minusDays(9)), '11:00', CONSULTATION,
      'Chest discomfort and high blood pressure'), 'BP 150/95. ECG normal. Started on amlodipine 5mg. Follow-up in 2 weeks.');
    complete(book(angela, mendoza, before(mendoza, today.minusDays(7)), '13:00', CONSULTATION, 'Toothache, lower left molar'),
      'Dental caries on tooth #36. Filling done. Advised to avoid sweets.');
    complete(book(miguel, bautista, before(bautista, today.minusDays(6)), '08:30', CHECK_UP, 'Booster vaccination'),
      'DTaP booster given, left arm. No adverse reaction after 15 minutes.');
    complete(book(juan, santos, before(santos, today.minusDays(4)), '14:00', FOLLOW_UP, 'Follow-up for respiratory infection'),
      'Fully recovered. Lungs clear. No further medication needed.');

    const cancelled = book(rafael, santos, before(santos, today.minusDays(3)), '10:30', CONSULTATION, 'Headache and dizziness');
    cancelled.cancel('Patient had a class schedule conflict.');
    db.appointments.update(cancelled);
    const noShow = book(lorna, mendoza, before(mendoza, today.minusDays(2)), '09:00', CHECK_UP, 'Dental cleaning');
    noShow.markNoShow();
    db.appointments.update(noShow);

    // Today's appointments (only for staff who work today).
    if (santos.isAvailableOn(today)) {
      book(juan, santos, today, '16:00', CHECK_UP, 'Annual physical examination');
    }
    if (bautista.isAvailableOn(today)) {
      book(paolo, bautista, today, '14:00', CHECK_UP, 'Blood pressure monitoring');
    }

    // Upcoming appointments.
    book(sofia, villanueva, after(villanueva, today.plusDays(1)), '10:00', FOLLOW_UP, 'Blood pressure follow-up');
    book(bea, santos, after(santos, today.plusDays(1)), '09:30', CONSULTATION, 'Skin rash on arms');
    book(rafael, santos, after(santos, today.plusDays(2)), '10:30', CONSULTATION, 'Headache and dizziness (rebooked)');
    book(lorna, mendoza, after(mendoza, today.plusDays(2)), '14:00', CHECK_UP, 'Dental cleaning (rebooked)');
    book(angela, bautista, after(bautista, today.plusDays(3)), '09:00', CHECK_UP, 'Flu vaccine');
    book(miguel, reyes, after(reyes, today.plusDays(5)), '11:00', FOLLOW_UP, 'Post-vaccination check');
  }

  /** @param {MedicalStaff} staff @param {CalendarDate} date */
  static #workingDayOnOrBefore(staff, date) {
    let d = date;
    while (!staff.isAvailableOn(d)) {
      d = d.minusDays(1);
    }
    return d;
  }

  /** @param {MedicalStaff} staff @param {CalendarDate} date */
  static #workingDayOnOrAfter(staff, date) {
    let d = date;
    while (!staff.isAvailableOn(d)) {
      d = d.plusDays(1);
    }
    return d;
  }
}
