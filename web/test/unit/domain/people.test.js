import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  Clock, DayOfWeek, Dentist, Doctor, Identifiable, MedicalStaff, Nurse, Patient, Person, Searchable, StaffFactory,
  TimeOfDay, ValidationError, implementsInterface,
} from '../../../src/domain/index.js';
import { freezeClock, makeDentist, makeDoctor, makeNurse, makePatient, MON_TO_SAT } from '../../helpers.js';

before(() => freezeClock());
after(() => Clock.use(undefined));

describe('Person (abstract)', () => {
  it('cannot be instantiated directly', () => {
    assert.throws(
      () => new Person({ id: 'X', firstName: 'A', lastName: 'B', contactNumber: '09171234567' }),
      /Person is abstract/,
    );
  });

  it('a subclass that does not override the abstract methods fails clearly', () => {
    class Visitor extends Person {}
    const v = new Visitor({ id: 'V-1', firstName: 'A', lastName: 'B', contactNumber: '09171234567' });
    assert.throws(() => v.getRole(), /Visitor must implement the abstract method getRole/);
    assert.throws(() => v.getDetails(), /getDetails/);
  });

  it('implements Identifiable and Searchable', () => {
    const p = makePatient();
    assert.ok(implementsInterface(p, Identifiable));
    assert.ok(implementsInterface(p, Searchable));
    assert.deepEqual(Person.implements, [Identifiable, Searchable]);
  });

  it('requires the ID, first name, last name and contact number', () => {
    assert.throws(() => makePatient({ id: ' ' }), /ID is required/);
    assert.throws(() => makePatient({ firstName: '' }), /First name is required/);
    assert.throws(() => makePatient({ lastName: undefined }), /Last name is required/);
    assert.throws(() => makePatient({ contactNumber: '' }), /Contact number is required/);
  });

  it('trims names', () => {
    const p = makePatient({ firstName: '  Juan ', lastName: ' Dela Cruz ' });
    assert.equal(p.fullName, 'Juan Dela Cruz');
    assert.equal(p.initials, 'J.D.');
  });

  it('accepts PH mobile numbers, removing spaces and dashes', () => {
    assert.equal(makePatient({ contactNumber: '0917 123-4567' }).contactNumber, '09171234567');
    assert.equal(makePatient({ contactNumber: '+639171234567' }).contactNumber, '+639171234567');
  });

  it('rejects anything that is not a PH mobile number', () => {
    for (const bad of ['0817123456', '091712345678', '+63917123456', '021234567', 'abcdefghijk']) {
      assert.throws(() => makePatient({ contactNumber: bad }), (err) => {
        assert.ok(err instanceof ValidationError);
        assert.equal(err.message, 'Contact number must be a valid PH mobile number (e.g. 09171234567).');
        assert.equal(err.field, 'contactNumber');
        return true;
      });
    }
  });

  it('treats email as optional but validates it when given', () => {
    assert.equal(makePatient({ email: '' }).email, '');
    assert.equal(makePatient({ email: undefined }).email, '');
    assert.equal(makePatient({ email: ' a.b+c@mail.co.ph ' }).email, 'a.b+c@mail.co.ph');
    assert.throws(() => makePatient({ email: 'not-an-email' }), /Email address is not valid/);
    assert.throws(() => makePatient({ email: 'a@b' }), /Email address is not valid/);
  });

  it('keeps the ID read-only and validates every setter (encapsulation)', () => {
    const p = makePatient();
    assert.throws(() => {
      /** @type {any} */ (p).id = 'P-9999';
    }, TypeError);
    assert.equal(p.id, 'P-0001');
    assert.throws(() => {
      p.firstName = '';
    }, ValidationError);
    assert.equal(p.firstName, 'Juan');
    assert.equal(Object.keys(p).length, 0, 'no public fields: all state is #private');
  });

  it('is equal to another object of the same class with the same ID', () => {
    assert.ok(makePatient().equals(makePatient({ firstName: 'Other' })));
    assert.equal(makePatient().equals(makePatient({ id: 'P-0002' })), false);
    assert.equal(makeDoctor({ id: 'X-1' }).equals(makeNurse({ id: 'X-1' })), false);
    assert.equal(makePatient().equals(null), false);
    assert.equal(String(makePatient()), 'Juan Dela Cruz (P-0001)');
  });

  it('matches a keyword in the ID, name, contact number or email', () => {
    const p = makePatient();
    for (const k of ['', '  ', undefined, 'p-0001', 'DELA', 'juan dela', '0918111', 'gmail']) {
      assert.ok(p.matches(k), `should match ${k}`);
    }
    assert.equal(p.matches('zzz'), false);
  });
});

describe('Patient', () => {
  it('stores the medical profile', () => {
    const p = makePatient();
    assert.equal(p.getRole(), 'Patient');
    assert.equal(p.birthDate.toString(), '1990-03-14');
    assert.equal(p.age, 36);
    assert.equal(p.gender, 'Male');
    assert.equal(p.bloodType, 'O+');
    assert.equal(p.getDetails(), 'Juan Dela Cruz | 36 yrs old | Male | Blood type: O+ | Brgy. Bagumbayan, Santa Cruz, Laguna');
  });

  it('requires a birth date that is not in the future', () => {
    assert.throws(() => makePatient({ birthDate: '' }), /Birth date is required/);
    assert.throws(() => makePatient({ birthDate: undefined }), /Birth date is required/);
    assert.throws(() => makePatient({ birthDate: '2026-11-12' }), /Birth date cannot be in the future/);
    assert.equal(makePatient({ birthDate: '2026-11-11' }).age, 0);
  });

  it('requires gender and address', () => {
    assert.throws(() => makePatient({ gender: '' }), /Gender is required/);
    assert.throws(() => makePatient({ address: '   ' }), /Address is required/);
  });

  it('defaults a blank blood type to "Unknown"', () => {
    assert.equal(makePatient({ bloodType: '' }).bloodType, 'Unknown');
    assert.equal(makePatient({ bloodType: undefined }).bloodType, 'Unknown');
    assert.equal(makePatient({ bloodType: ' AB- ' }).bloodType, 'AB-');
  });

  it('also searches the address', () => {
    assert.ok(makePatient().matches('bagumbayan'));
  });

  it('offers the same option lists as the Java version', () => {
    assert.deepEqual(Patient.GENDERS, ['Male', 'Female', 'Other']);
    assert.deepEqual(Patient.BLOOD_TYPES, ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']);
  });
});

describe('MedicalStaff (abstract)', () => {
  it('cannot be instantiated directly', () => {
    assert.throws(() => new MedicalStaff(/** @type {any} */ ({})), /MedicalStaff is abstract/);
  });

  it('a subclass that forgets an abstract member fails clearly', () => {
    class Intern extends MedicalStaff {
      getSlotDurationMinutes() {
        return 30;
      }
    }
    const intern = new Intern({
      id: 'S-9', firstName: 'A', lastName: 'B', contactNumber: '09171234567', licenseNumber: 'L',
      serviceArea: 'x', workingDays: ['MONDAY'], shiftStart: '08:00', shiftEnd: '09:00',
    });
    assert.throws(() => intern.getConsultationFee(), /Intern must implement the abstract method getConsultationFee/);
    assert.throws(() => intern.getServiceAreaLabel(), /getServiceAreaLabel/);
    assert.throws(() => intern.serviceArea, /serviceArea/);
    assert.throws(() => {
      intern.serviceArea = 'x';
    }, /serviceArea/);
    assert.throws(() => intern.getRole(), /getRole/);
  });

  it('requires a license number and at least one working day', () => {
    assert.throws(() => makeDoctor({ licenseNumber: '' }), /License number is required/);
    assert.throws(() => makeDoctor({ workingDays: [] }), /Select at least one working day/);
    assert.throws(() => makeDoctor({ workingDays: undefined }), /Select at least one working day/);
    assert.throws(() => makeDoctor({ workingDays: ['FUNDAY'] }), ValidationError);
  });

  it('accepts working days as constants or codes and returns a frozen, sorted copy', () => {
    const d = makeDoctor({ workingDays: ['FRIDAY', DayOfWeek.MONDAY, 'MONDAY'] });
    assert.deepEqual(d.workingDays, [DayOfWeek.MONDAY, DayOfWeek.FRIDAY]);
    assert.ok(Object.isFrozen(d.workingDays));
    assert.equal(d.getWorkingDaysText(), 'Mon, Fri');
    assert.ok(d.worksOn(DayOfWeek.FRIDAY));
  });

  it('requires a shift that ends after it starts and fits at least one slot', () => {
    assert.throws(() => makeDoctor({ shiftStart: '', shiftEnd: '17:00' }), /Shift start and end are required/);
    assert.throws(() => makeDoctor({ shiftStart: '17:00', shiftEnd: '08:00' }), /Shift end must be later than shift start/);
    assert.throws(() => makeDoctor({ shiftStart: '08:00', shiftEnd: '08:00' }), /Shift end must be later/);
    assert.throws(() => makeDoctor({ shiftStart: '08:00', shiftEnd: '08:15' }), /Shift must be at least 30 minutes long/);
    assert.throws(() => makeDentist({ shiftStart: '08:00', shiftEnd: '08:30' }), /at least 60 minutes/);
    assert.equal(makeNurse({ shiftStart: '08:00', shiftEnd: '08:15' }).getTimeSlots().length, 1);
  });

  it('builds time slots from the shift and the slot length (polymorphism)', () => {
    const doctor = makeDoctor({ shiftStart: '08:00', shiftEnd: '10:00' });
    assert.deepEqual(doctor.getTimeSlots().map(String), ['08:00', '08:30', '09:00', '09:30']);
    const dentist = makeDentist({ shiftStart: '08:00', shiftEnd: '10:30' });
    assert.deepEqual(dentist.getTimeSlots().map(String), ['08:00', '09:00']);
    const nurse = makeNurse({ shiftStart: '07:00', shiftEnd: '08:00' });
    assert.equal(nurse.getTimeSlots().length, 4);
    assert.ok(doctor.isValidSlot(TimeOfDay.of(9, 30)));
    assert.equal(doctor.isValidSlot(TimeOfDay.of(9, 15)), false);
    assert.equal(doctor.getShiftText(), '08:00 AM - 10:00 AM');
  });

  it('is available only on working days while active', () => {
    const d = makeDoctor({ workingDays: ['MONDAY', 'WEDNESDAY'] });
    const wednesday = Clock.current().today();
    assert.ok(d.isAvailableOn(wednesday));
    assert.equal(d.isAvailableOn(wednesday.plusDays(1)), false);
    assert.equal(d.isAvailableOn(null), false);
    d.active = false;
    assert.equal(d.isAvailableOn(wednesday), false);
    assert.equal(makeDoctor({ active: false }).active, false);
  });

  it('also searches the role, service area and license', () => {
    const d = makeDoctor({ serviceArea: 'Cardiology' });
    assert.ok(d.matches('doctor'));
    assert.ok(d.matches('cardio'));
    assert.ok(d.matches('prc-0123'));
    assert.ok(d.matches(''));
    assert.equal(d.matches('dentist'), false);
  });
});

describe('Doctor, Dentist and Nurse (polymorphism)', () => {
  it('Doctor: PHP 500 for General Medicine, PHP 800 for specialists, 30-minute slots', () => {
    const gp = makeDoctor({ serviceArea: 'general medicine' });
    assert.ok(gp.isGeneralPractitioner());
    assert.equal(gp.getConsultationFee(), 500);
    const specialist = makeDoctor({ serviceArea: 'Pediatrics' });
    assert.equal(specialist.getConsultationFee(), 800);
    assert.equal(specialist.getSlotDurationMinutes(), 30);
    assert.equal(specialist.getServiceAreaLabel(), 'Specialization');
    assert.equal(specialist.getRole(), 'Doctor');
    assert.equal(specialist.getDisplayName(), 'Dr. Maria Santos');
    assert.equal(String(specialist), 'Dr. Maria Santos - Doctor (Pediatrics)');
  });

  it('Dentist: PHP 700, 60-minute slots, "Dr. Name, DMD", dental room', () => {
    const d = makeDentist();
    assert.equal(d.getConsultationFee(), 700);
    assert.equal(d.getSlotDurationMinutes(), 60);
    assert.equal(d.getServiceAreaLabel(), 'Dental Room');
    assert.equal(d.serviceArea, 'Dental Room 1');
    assert.equal(d.getRole(), 'Dentist');
    assert.equal(d.getDisplayName(), 'Dr. Carlo Mendoza, DMD');
  });

  it('Nurse: PHP 250, 15-minute slots, "Name, RN", department', () => {
    const n = makeNurse();
    assert.equal(n.getConsultationFee(), 250);
    assert.equal(n.getSlotDurationMinutes(), 15);
    assert.equal(n.getServiceAreaLabel(), 'Department');
    assert.equal(n.getRole(), 'Nurse');
    assert.equal(n.getDisplayName(), 'Liza Bautista, RN');
  });

  it('requires a service area for every role', () => {
    assert.throws(() => makeDoctor({ serviceArea: '' }), /Specialization is required/);
    assert.throws(() => makeDentist({ serviceArea: '' }), /Dental Room is required/);
    assert.throws(() => makeNurse({ serviceArea: '' }), /Department is required/);
  });

  it('builds a one-line details summary using the overridden methods', () => {
    assert.equal(
      makeDoctor({ workingDays: MON_TO_SAT }).getDetails(),
      'Dr. Maria Santos | Doctor | Specialization: General Medicine | Fee: PHP 500.00 | 30-min slots | ' +
        'Mon, Tue, Wed, Thu, Fri, Sat, 08:00 AM - 05:00 PM',
    );
  });

  it('one loop over MedicalStaff references runs each subclass\'s own code', () => {
    /** @type {MedicalStaff[]} */
    const team = [makeDoctor(), makeDentist(), makeNurse()];
    assert.deepEqual(team.map((s) => s.getConsultationFee()), [500, 700, 250]);
    assert.deepEqual(team.map((s) => s.getSlotDurationMinutes()), [30, 60, 15]);
  });
});

describe('StaffFactory', () => {
  const props = {
    id: 'S-0009', firstName: 'Ana', lastName: 'Cruz', contactNumber: '09171234567', email: '',
    licenseNumber: 'PRC-1', serviceArea: 'Triage', workingDays: ['MONDAY'], shiftStart: '08:00', shiftEnd: '12:00',
  };

  it('creates the right subclass for each role', () => {
    assert.ok(StaffFactory.create('Doctor', props) instanceof Doctor);
    assert.ok(StaffFactory.create('Dentist', props) instanceof Dentist);
    assert.ok(StaffFactory.create('Nurse', props) instanceof Nurse);
    assert.throws(() => StaffFactory.create('Janitor', props), /Unknown staff role: Janitor/);
    assert.throws(() => StaffFactory.create('toString', props), /Unknown staff role/);
  });

  it('knows each role\'s service area label and options', () => {
    assert.equal(StaffFactory.serviceAreaLabel('Doctor'), 'Specialization');
    assert.equal(StaffFactory.serviceAreaLabel('Dentist'), 'Dental Room');
    assert.equal(StaffFactory.serviceAreaLabel('Nurse'), 'Department');
    assert.equal(StaffFactory.serviceAreaLabel('Unknown'), 'Specialization');
    assert.deepEqual(StaffFactory.serviceAreaOptions('Doctor'), Doctor.SPECIALIZATIONS);
    assert.deepEqual(StaffFactory.serviceAreaOptions('Dentist'), ['Dental Room 1', 'Dental Room 2', 'Dental Room 3']);
    assert.deepEqual(StaffFactory.serviceAreaOptions('Nurse'), ['Immunization', 'Triage', 'Wound Care', 'Maternal Care']);
    assert.deepEqual(StaffFactory.ROLES, ['Doctor', 'Dentist', 'Nurse']);
  });

  it('cannot be instantiated', () => {
    assert.throws(() => new StaffFactory(), TypeError);
  });
});
