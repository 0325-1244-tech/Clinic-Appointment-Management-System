package clinic.service;

import clinic.data.ClinicDatabase;
import clinic.data.FileStorage;
import clinic.model.Appointment;
import clinic.model.AppointmentStatus;
import clinic.model.AppointmentType;
import clinic.model.Billable;
import clinic.model.MedicalStaff;
import clinic.model.Patient;
import clinic.repository.Repository;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/**
 * The business-logic layer. The user interface talks only to this class,
 * never to the repositories directly. This keeps rules such as
 * "no double booking" in one place.
 */
public class ClinicService {
    private static final Comparator<Appointment> BY_SCHEDULE = Comparator.comparing(Appointment::getDateTime);

    private final ClinicDatabase database;
    private final FileStorage storage;

    public ClinicService(ClinicDatabase database, FileStorage storage) {
        this.database = database;
        this.storage = storage;
    }

    // =====================================================================
    //  Patients
    // =====================================================================

    public String generatePatientId() {
        return database.getPatients().nextId();
    }

    public void addPatient(Patient patient) {
        database.getPatients().add(patient);
        saveChanges();
    }

    public void removePatient(Patient patient) throws ValidationException {
        int records = findAppointments(patient).size();
        if (records > 0) {
            throw new ValidationException(patient.getFullName() + " has " + records
                    + " appointment record(s). Patient records with appointment history must be kept.");
        }
        database.getPatients().remove(patient.getId());
        saveChanges();
    }

    public List<Patient> getPatients() {
        return database.getPatients().findAll();
    }

    public List<Patient> searchPatients(String keyword) {
        return database.getPatients().findWhere(p -> p.matches(keyword));
    }

    // =====================================================================
    //  Medical staff
    // =====================================================================

    public String generateStaffId() {
        return database.getStaff().nextId();
    }

    /** Accepts any subclass (Doctor, Dentist, Nurse). This is POLYMORPHISM. */
    public void addStaff(MedicalStaff staff) {
        database.getStaff().add(staff);
        saveChanges();
    }

    /** Changes a staff schedule, but only if no scheduled appointment would fall outside it. */
    public void updateStaffSchedule(MedicalStaff staff, Set<DayOfWeek> days, LocalTime start, LocalTime end)
            throws ValidationException {
        for (Appointment a : findAppointments(staff)) {
            if (!a.isActive()) {
                continue;
            }
            boolean outside = !days.contains(a.getDate().getDayOfWeek())
                    || a.getTime().isBefore(start) || a.getEndTime().isAfter(end);
            if (outside) {
                throw new ValidationException("Cannot change the schedule: appointment " + a.getId() + " on "
                        + a.getDate() + " at " + a.getTime() + " would fall outside the new schedule. "
                        + "Reschedule or cancel it first.");
            }
        }
        staff.setWorkingDays(days);
        staff.setShift(start, end);
    }

    public void setStaffActive(MedicalStaff staff, boolean active) throws ValidationException {
        if (!active) {
            long scheduled = findAppointments(staff).stream().filter(Appointment::isActive).count();
            if (scheduled > 0) {
                throw new ValidationException(staff.getDisplayName() + " still has " + scheduled
                        + " scheduled appointment(s). Reschedule or cancel them first.");
            }
        }
        staff.setActive(active);
        saveChanges();
    }

    public void removeStaff(MedicalStaff staff) throws ValidationException {
        int records = findAppointments(staff).size();
        if (records > 0) {
            throw new ValidationException(staff.getDisplayName() + " has " + records
                    + " appointment record(s) and cannot be removed. Deactivate the account instead.");
        }
        database.getStaff().remove(staff.getId());
        saveChanges();
    }

    public List<MedicalStaff> getStaff() {
        return database.getStaff().findAll();
    }

    public List<MedicalStaff> getActiveStaff() {
        return database.getStaff().findWhere(MedicalStaff::isActive);
    }

    public List<MedicalStaff> searchStaff(String keyword) {
        return database.getStaff().findWhere(s -> s.matches(keyword));
    }

    public List<MedicalStaff> getStaffOnDuty(LocalDate date) {
        return database.getStaff().findWhere(s -> s.isAvailableOn(date));
    }

    // =====================================================================
    //  Appointments
    // =====================================================================

    public Appointment bookAppointment(Patient patient, MedicalStaff staff, LocalDate date, LocalTime time,
                                       AppointmentType type, String reason) throws ValidationException {
        validateSchedule(patient, staff, date, time, null);
        if (type == null) {
            throw new ValidationException("Please select an appointment type.");
        }
        if (reason == null || reason.isBlank()) {
            throw new ValidationException("Please enter the reason for the visit.");
        }
        Repository<Appointment> appointments = database.getAppointments();
        Appointment appointment = new Appointment(appointments.nextId(), patient, staff, date, time, type, reason);
        appointments.add(appointment);
        saveChanges();
        return appointment;
    }

    public void rescheduleAppointment(Appointment appointment, LocalDate newDate, LocalTime newTime)
            throws ValidationException {
        ensureScheduled(appointment);
        validateSchedule(appointment.getPatient(), appointment.getStaff(), newDate, newTime, appointment);
        appointment.reschedule(newDate, newTime);
        saveChanges();
    }

    public void completeAppointment(Appointment appointment, String findings) throws ValidationException {
        ensureScheduled(appointment);
        appointment.complete(findings);
        saveChanges();
    }

    public void cancelAppointment(Appointment appointment, String reason) throws ValidationException {
        ensureScheduled(appointment);
        appointment.cancel(reason);
        saveChanges();
    }

    public void markNoShow(Appointment appointment) throws ValidationException {
        ensureScheduled(appointment);
        appointment.markNoShow();
        saveChanges();
    }

    public List<LocalTime> getAvailableSlots(MedicalStaff staff, LocalDate date) {
        return getAvailableSlots(staff, date, null);
    }

    /** Open time slots for a staff member on a date. Pass the appointment being rescheduled as {@code exclude}. */
    public List<LocalTime> getAvailableSlots(MedicalStaff staff, LocalDate date, Appointment exclude) {
        List<LocalTime> open = new ArrayList<>();
        if (staff == null || date == null || !staff.isAvailableOn(date) || date.isBefore(LocalDate.now())) {
            return open;
        }
        LocalDateTime now = LocalDateTime.now();
        for (LocalTime slot : staff.getTimeSlots()) {
            if (LocalDateTime.of(date, slot).isBefore(now)) {
                continue;
            }
            LocalTime end = slot.plusMinutes(staff.getSlotDurationMinutes());
            if (!hasConflict(a -> a.getStaff().equals(staff), date, slot, end, exclude)) {
                open.add(slot);
            }
        }
        return open;
    }

    // ---- Overloaded search methods (compile-time POLYMORPHISM / method overloading) ----

    public List<Appointment> findAppointments(LocalDate date) {
        return query(a -> a.getDate().equals(date));
    }

    public List<Appointment> findAppointments(Patient patient) {
        return query(a -> a.getPatient().equals(patient));
    }

    public List<Appointment> findAppointments(MedicalStaff staff) {
        return query(a -> a.getStaff().equals(staff));
    }

    public List<Appointment> findAppointments(AppointmentStatus status) {
        return query(a -> a.getStatus() == status);
    }

    public List<Appointment> findAppointments(String keyword) {
        return query(a -> a.matches(keyword));
    }

    public List<Appointment> getAllAppointments() {
        return query(a -> true);
    }

    public List<Appointment> getUpcomingAppointments() {
        LocalDateTime now = LocalDateTime.now();
        return query(a -> a.isActive() && !a.getDateTime().isBefore(now));
    }

    // =====================================================================
    //  Statistics
    // =====================================================================

    /** Works with ANY list of Billable objects. It only relies on the interface (ABSTRACTION). */
    public double computeTotal(List<? extends Billable> items) {
        return items.stream().mapToDouble(Billable::computeFee).sum();
    }

    public double getCollectedFees() {
        return computeTotal(findAppointments(AppointmentStatus.COMPLETED));
    }

    public int getPatientCount() {
        return database.getPatients().count();
    }

    public int getActiveStaffCount() {
        return getActiveStaff().size();
    }

    // =====================================================================
    //  Persistence
    // =====================================================================

    public void saveChanges() {
        try {
            storage.save(database);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not save data to " + storage.getFile() + ": " + e.getMessage(), e);
        }
    }

    // =====================================================================
    //  Private helpers
    // =====================================================================

    private List<Appointment> query(Predicate<Appointment> condition) {
        return database.getAppointments().findWhere(condition).stream()
                .sorted(BY_SCHEDULE)
                .collect(Collectors.toList());
    }

    private void ensureScheduled(Appointment appointment) throws ValidationException {
        if (appointment == null) {
            throw new ValidationException("Please select an appointment.");
        }
        if (!appointment.isActive()) {
            throw new ValidationException("Appointment " + appointment.getId() + " is already "
                    + appointment.getStatus().getLabel() + " and can no longer be changed.");
        }
    }

    private boolean hasConflict(Predicate<Appointment> owner, LocalDate date, LocalTime start, LocalTime end,
                                Appointment exclude) {
        return database.getAppointments().findAll().stream()
                .filter(a -> a != exclude)
                .filter(Appointment::isActive)
                .filter(owner)
                .anyMatch(a -> a.overlapsWith(date, start, end));
    }

    private void validateSchedule(Patient patient, MedicalStaff staff, LocalDate date, LocalTime time,
                                  Appointment exclude) throws ValidationException {
        if (patient == null) {
            throw new ValidationException("Please select a patient.");
        }
        if (staff == null) {
            throw new ValidationException("Please select the attending medical staff.");
        }
        if (date == null || time == null) {
            throw new ValidationException("Please select a date and an available time slot.");
        }
        if (LocalDateTime.of(date, time).isBefore(LocalDateTime.now())) {
            throw new ValidationException("Appointments cannot be scheduled in the past.");
        }
        if (!staff.isActive()) {
            throw new ValidationException(staff.getDisplayName() + " is currently inactive.");
        }
        if (!staff.isAvailableOn(date)) {
            String day = date.getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
            throw new ValidationException(staff.getDisplayName() + " does not work on " + day
                    + ". Working days: " + staff.getWorkingDaysText() + ".");
        }
        if (!staff.getTimeSlots().contains(time)) {
            throw new ValidationException("The selected time is not a valid slot within "
                    + staff.getDisplayName() + "'s shift (" + staff.getShiftText() + ").");
        }
        LocalTime end = time.plusMinutes(staff.getSlotDurationMinutes());
        if (hasConflict(a -> a.getStaff().equals(staff), date, time, end, exclude)) {
            throw new ValidationException(staff.getDisplayName() + " already has an appointment at that time.");
        }
        if (hasConflict(a -> a.getPatient().equals(patient), date, time, end, exclude)) {
            throw new ValidationException(patient.getFullName()
                    + " already has another appointment that overlaps with this time.");
        }
    }
}
