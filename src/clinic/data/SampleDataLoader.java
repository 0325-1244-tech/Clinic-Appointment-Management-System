package clinic.data;

import clinic.model.Appointment;
import clinic.model.AppointmentType;
import clinic.model.Dentist;
import clinic.model.Doctor;
import clinic.model.Identifiable;
import clinic.model.MedicalStaff;
import clinic.model.Nurse;
import clinic.model.Patient;
import clinic.repository.Repository;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.EnumSet;
import java.util.Set;

/**
 * Fills a fresh database with demo records the first time the system runs,
 * so there is something to show during the demonstration.
 */
public final class SampleDataLoader {
    private static final Set<DayOfWeek> WEEKDAYS = EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY);
    private static final Set<DayOfWeek> MON_TO_SAT = EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.SATURDAY);

    private SampleDataLoader() {
    }

    public static ClinicDatabase createSampleDatabase() {
        ClinicDatabase db = new ClinicDatabase();
        Repository<MedicalStaff> staff = db.getStaff();
        Repository<Patient> patients = db.getPatients();

        Doctor santos = add(staff, new Doctor(staff.nextId(), "Maria", "Santos", "09171234501", "maria.santos@careconnect.ph",
                "PRC-0123456", "General Medicine", MON_TO_SAT, LocalTime.of(8, 0), LocalTime.of(17, 0)));
        Doctor reyes = add(staff, new Doctor(staff.nextId(), "Jose", "Reyes", "09171234502", "jose.reyes@careconnect.ph",
                "PRC-0234567", "Pediatrics", EnumSet.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY),
                LocalTime.of(9, 0), LocalTime.of(15, 0)));
        Doctor villanueva = add(staff, new Doctor(staff.nextId(), "Ana", "Villanueva", "09171234503", "ana.villanueva@careconnect.ph",
                "PRC-0345678", "Cardiology", EnumSet.of(DayOfWeek.TUESDAY, DayOfWeek.THURSDAY, DayOfWeek.SATURDAY),
                LocalTime.of(10, 0), LocalTime.of(16, 0)));
        Dentist mendoza = add(staff, new Dentist(staff.nextId(), "Carlo", "Mendoza", "09171234504", "carlo.mendoza@careconnect.ph",
                "PRC-0456789", "Dental Room 1", MON_TO_SAT, LocalTime.of(8, 0), LocalTime.of(16, 0)));
        Nurse bautista = add(staff, new Nurse(staff.nextId(), "Liza", "Bautista", "09171234505", "liza.bautista@careconnect.ph",
                "PRC-0567890", "Immunization", MON_TO_SAT, LocalTime.of(7, 0), LocalTime.of(15, 0)));
        add(staff, new Nurse(staff.nextId(), "Mark", "Dela Cruz", "09171234506", "mark.delacruz@careconnect.ph",
                "PRC-0678901", "Triage", WEEKDAYS, LocalTime.of(13, 0), LocalTime.of(21, 0)));

        Patient juan = add(patients, new Patient(patients.nextId(), "Juan", "Dela Cruz", "09181112201", "juan.dc@gmail.com",
                LocalDate.of(1990, 3, 14), "Male", "Brgy. Bagumbayan, Santa Cruz, Laguna", "O+"));
        Patient angela = add(patients, new Patient(patients.nextId(), "Angela", "Ramos", "09181112202", "angela.ramos@gmail.com",
                LocalDate.of(1998, 7, 2), "Female", "Brgy. Pagsawitan, Santa Cruz, Laguna", "A+"));
        Patient miguel = add(patients, new Patient(patients.nextId(), "Miguel", "Garcia", "09181112203", "",
                LocalDate.of(2018, 11, 21), "Male", "Brgy. Poblacion, Pagsanjan, Laguna", "B+"));
        Patient sofia = add(patients, new Patient(patients.nextId(), "Sofia", "Aquino", "09181112204", "sofia.aquino@yahoo.com",
                LocalDate.of(1965, 1, 30), "Female", "Brgy. San Juan, Lumban, Laguna", "AB+"));
        Patient rafael = add(patients, new Patient(patients.nextId(), "Rafael", "Torres", "09181112205", "raf.torres@gmail.com",
                LocalDate.of(2003, 5, 9), "Male", "Brgy. Calios, Santa Cruz, Laguna", "O-"));
        Patient bea = add(patients, new Patient(patients.nextId(), "Bea", "Navarro", "09181112206", "",
                LocalDate.of(2001, 9, 17), "Female", "Brgy. Duhat, Santa Cruz, Laguna", "Unknown"));
        Patient lorna = add(patients, new Patient(patients.nextId(), "Lorna", "Castillo", "09181112207", "lorna.c@gmail.com",
                LocalDate.of(1978, 12, 5), "Female", "Brgy. Wawa, Pila, Laguna", "A-"));
        Patient paolo = add(patients, new Patient(patients.nextId(), "Paolo", "Mercado", "09181112208", "paolo.mercado@gmail.com",
                LocalDate.of(1995, 4, 25), "Male", "Brgy. Bubukal, Santa Cruz, Laguna", "B-"));

        LocalDate today = LocalDate.now();

        // Past visits, already completed / cancelled / no-show (these become the appointment records).
        completed(db, juan, santos, workingDayOnOrBefore(santos, today.minusDays(14)), LocalTime.of(9, 0),
                AppointmentType.CONSULTATION, "Fever and cough for 3 days",
                "Acute upper respiratory infection. Prescribed paracetamol and rest. Return if fever persists.");
        completed(db, miguel, reyes, workingDayOnOrBefore(reyes, today.minusDays(10)), LocalTime.of(10, 0),
                AppointmentType.CHECK_UP, "Annual pediatric check-up",
                "Normal growth and development. Weight 22 kg. Due for booster shot.");
        completed(db, sofia, villanueva, workingDayOnOrBefore(villanueva, today.minusDays(9)), LocalTime.of(11, 0),
                AppointmentType.CONSULTATION, "Chest discomfort and high blood pressure",
                "BP 150/95. ECG normal. Started on amlodipine 5mg. Follow-up in 2 weeks.");
        completed(db, angela, mendoza, workingDayOnOrBefore(mendoza, today.minusDays(7)), LocalTime.of(13, 0),
                AppointmentType.CONSULTATION, "Toothache, lower left molar",
                "Dental caries on tooth #36. Filling done. Advised to avoid sweets.");
        completed(db, miguel, bautista, workingDayOnOrBefore(bautista, today.minusDays(6)), LocalTime.of(8, 30),
                AppointmentType.CHECK_UP, "Booster vaccination",
                "DTaP booster given, left arm. No adverse reaction after 15 minutes.");
        completed(db, juan, santos, workingDayOnOrBefore(santos, today.minusDays(4)), LocalTime.of(14, 0),
                AppointmentType.FOLLOW_UP, "Follow-up for respiratory infection",
                "Fully recovered. Lungs clear. No further medication needed.");

        Appointment cancelled = book(db, rafael, santos, workingDayOnOrBefore(santos, today.minusDays(3)),
                LocalTime.of(10, 30), AppointmentType.CONSULTATION, "Headache and dizziness");
        cancelled.cancel("Patient had a class schedule conflict.");
        Appointment noShow = book(db, lorna, mendoza, workingDayOnOrBefore(mendoza, today.minusDays(2)),
                LocalTime.of(9, 0), AppointmentType.CHECK_UP, "Dental cleaning");
        noShow.markNoShow();

        // Today's appointments (only for staff who work today)
        if (santos.isAvailableOn(today)) {
            book(db, juan, santos, today, LocalTime.of(16, 0),
                    AppointmentType.CHECK_UP, "Annual physical examination");
        }
        if (bautista.isAvailableOn(today)) {
            book(db, paolo, bautista, today, LocalTime.of(14, 0),
                    AppointmentType.CHECK_UP, "Blood pressure monitoring");
        }

        // Upcoming appointments
        book(db, sofia, villanueva, workingDayOnOrAfter(villanueva, today.plusDays(1)), LocalTime.of(10, 0),
                AppointmentType.FOLLOW_UP, "Blood pressure follow-up");
        book(db, bea, santos, workingDayOnOrAfter(santos, today.plusDays(1)), LocalTime.of(9, 30),
                AppointmentType.CONSULTATION, "Skin rash on arms");
        book(db, rafael, santos, workingDayOnOrAfter(santos, today.plusDays(2)), LocalTime.of(10, 30),
                AppointmentType.CONSULTATION, "Headache and dizziness (rebooked)");
        book(db, lorna, mendoza, workingDayOnOrAfter(mendoza, today.plusDays(2)), LocalTime.of(14, 0),
                AppointmentType.CHECK_UP, "Dental cleaning (rebooked)");
        book(db, angela, bautista, workingDayOnOrAfter(bautista, today.plusDays(3)), LocalTime.of(9, 0),
                AppointmentType.CHECK_UP, "Flu vaccine");
        book(db, miguel, reyes, workingDayOnOrAfter(reyes, today.plusDays(5)), LocalTime.of(11, 0),
                AppointmentType.FOLLOW_UP, "Post-vaccination check");

        return db;
    }

    private static <T extends Identifiable> T add(Repository<? super T> repository, T item) {
        repository.add(item);
        return item;
    }

    private static Appointment book(ClinicDatabase db, Patient patient, MedicalStaff staff, LocalDate date,
                                    LocalTime time, AppointmentType type, String reason) {
        Repository<Appointment> appointments = db.getAppointments();
        return add(appointments, new Appointment(appointments.nextId(), patient, staff, date, time, type, reason));
    }

    private static void completed(ClinicDatabase db, Patient patient, MedicalStaff staff, LocalDate date,
                                  LocalTime time, AppointmentType type, String reason, String findings) {
        book(db, patient, staff, date, time, type, reason).complete(findings);
    }

    private static LocalDate workingDayOnOrBefore(MedicalStaff staff, LocalDate date) {
        LocalDate d = date;
        while (!staff.isAvailableOn(d)) {
            d = d.minusDays(1);
        }
        return d;
    }

    private static LocalDate workingDayOnOrAfter(MedicalStaff staff, LocalDate date) {
        LocalDate d = date;
        while (!staff.isAvailableOn(d)) {
            d = d.plusDays(1);
        }
        return d;
    }
}
