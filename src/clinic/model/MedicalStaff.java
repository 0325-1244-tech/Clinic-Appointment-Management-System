package clinic.model;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * ABSTRACTION + INHERITANCE: the shared blueprint for every kind of medical
 * personnel. It handles the work schedule; subclasses (Doctor, Dentist, Nurse)
 * decide their own fee, appointment length and service area.
 *
 * POLYMORPHISM: the rest of the system works with MedicalStaff references,
 * and the right overridden method runs for each concrete type at runtime.
 */
public abstract class MedicalStaff extends Person {
    private static final long serialVersionUID = 1L;
    private static final DateTimeFormatter SHIFT_FMT = DateTimeFormatter.ofPattern("hh:mm a", Locale.ENGLISH);

    private String licenseNumber;
    private final EnumSet<DayOfWeek> workingDays = EnumSet.noneOf(DayOfWeek.class);
    private LocalTime shiftStart;
    private LocalTime shiftEnd;
    private boolean active = true;

    protected MedicalStaff(String id, String firstName, String lastName, String contactNumber, String email,
                           String licenseNumber, Set<DayOfWeek> workingDays,
                           LocalTime shiftStart, LocalTime shiftEnd) {
        super(id, firstName, lastName, contactNumber, email);
        setLicenseNumber(licenseNumber);
        setWorkingDays(workingDays);
        setShift(shiftStart, shiftEnd);
    }

    // ---- Abstract methods: every subclass MUST provide its own version ----

    /** Base consultation fee for this kind of staff. */
    public abstract double getConsultationFee();

    /** How long one appointment slot lasts, in minutes. */
    public abstract int getSlotDurationMinutes();

    /** Label for the service area field (e.g. "Specialization", "Department"). */
    public abstract String getServiceAreaLabel();

    public abstract String getServiceArea();

    public abstract void setServiceArea(String serviceArea);

    // ---- Shared behaviour ----

    /** Name as shown to patients. Subclasses override this to add titles like "Dr." or "RN". */
    public String getDisplayName() {
        return getFullName();
    }

    public String getLicenseNumber() {
        return licenseNumber;
    }

    public void setLicenseNumber(String licenseNumber) {
        this.licenseNumber = requireText(licenseNumber, "License number");
    }

    /** Returns a read-only view so outside code cannot modify the schedule directly. */
    public Set<DayOfWeek> getWorkingDays() {
        return Collections.unmodifiableSet(workingDays);
    }

    public void setWorkingDays(Set<DayOfWeek> days) {
        if (days == null || days.isEmpty()) {
            throw new IllegalArgumentException("Select at least one working day.");
        }
        workingDays.clear();
        workingDays.addAll(days);
    }

    public LocalTime getShiftStart() {
        return shiftStart;
    }

    public LocalTime getShiftEnd() {
        return shiftEnd;
    }

    public void setShift(LocalTime start, LocalTime end) {
        if (start == null || end == null) {
            throw new IllegalArgumentException("Shift start and end are required.");
        }
        if (!end.isAfter(start)) {
            throw new IllegalArgumentException("Shift end must be later than shift start.");
        }
        if (Duration.between(start, end).toMinutes() < getSlotDurationMinutes()) {
            throw new IllegalArgumentException("Shift must be at least " + getSlotDurationMinutes() + " minutes long.");
        }
        this.shiftStart = start;
        this.shiftEnd = end;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public boolean isAvailableOn(LocalDate date) {
        return active && date != null && workingDays.contains(date.getDayOfWeek());
    }

    /** All appointment start times within the shift, based on this staff's slot length. */
    public List<LocalTime> getTimeSlots() {
        int slot = getSlotDurationMinutes();
        long count = Duration.between(shiftStart, shiftEnd).toMinutes() / slot;
        List<LocalTime> slots = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            slots.add(shiftStart.plusMinutes((long) i * slot));
        }
        return slots;
    }

    public String getWorkingDaysText() {
        return workingDays.stream()
                .map(d -> d.getDisplayName(TextStyle.SHORT, Locale.ENGLISH))
                .collect(Collectors.joining(", "));
    }

    public String getShiftText() {
        return shiftStart.format(SHIFT_FMT) + " - " + shiftEnd.format(SHIFT_FMT);
    }

    @Override
    public String getDetails() {
        return String.format("%s | %s | %s: %s | Fee: PHP %,.2f | %d-min slots | %s, %s",
                getDisplayName(), getRole(), getServiceAreaLabel(), getServiceArea(),
                getConsultationFee(), getSlotDurationMinutes(), getWorkingDaysText(), getShiftText());
    }

    @Override
    public boolean matches(String keyword) {
        if (super.matches(keyword)) {
            return true;
        }
        String k = keyword.trim().toLowerCase();
        return getRole().toLowerCase().contains(k)
                || getServiceArea().toLowerCase().contains(k)
                || licenseNumber.toLowerCase().contains(k);
    }

    @Override
    public String toString() {
        return getDisplayName() + " - " + getRole() + " (" + getServiceArea() + ")";
    }
}
