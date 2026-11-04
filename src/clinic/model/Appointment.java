package clinic.model;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * An appointment links one Patient with one MedicalStaff member (ASSOCIATION).
 *
 * ENCAPSULATION: the status can't be set directly. It only changes through
 * complete(), cancel(), markNoShow() and reschedule(), and those methods
 * enforce the rule that only a SCHEDULED appointment can change.
 */
public class Appointment implements Identifiable, Billable, Searchable, Serializable {
    private static final long serialVersionUID = 1L;
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("MMMM dd, yyyy (EEEE)", Locale.ENGLISH);
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("hh:mm a", Locale.ENGLISH);

    private final String id;
    private final Patient patient;
    private final MedicalStaff staff;
    private final AppointmentType type;
    private final String reason;
    private final LocalDateTime createdAt;
    private LocalDate date;
    private LocalTime time;
    private AppointmentStatus status;
    private String remarks;

    public Appointment(String id, Patient patient, MedicalStaff staff, LocalDate date, LocalTime time,
                       AppointmentType type, String reason) {
        if (patient == null || staff == null || date == null || time == null || type == null) {
            throw new IllegalArgumentException("Patient, staff, date, time and type are required.");
        }
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("Reason for visit is required.");
        }
        this.id = id;
        this.patient = patient;
        this.staff = staff;
        this.date = date;
        this.time = time;
        this.type = type;
        this.reason = reason.trim();
        this.status = AppointmentStatus.SCHEDULED;
        this.remarks = "";
        this.createdAt = LocalDateTime.now();
    }

    /** Fee estimate before an appointment exists. Uses the staff member's overridden fee. */
    public static double estimateFee(MedicalStaff staff, AppointmentType type) {
        return staff.getConsultationFee() * type.getFeeMultiplier();
    }

    @Override
    public double computeFee() {
        if (status == AppointmentStatus.CANCELLED || status == AppointmentStatus.NO_SHOW) {
            return 0;
        }
        return estimateFee(staff, type);
    }

    // ---- State changes (the only way to modify an appointment) ----

    public void reschedule(LocalDate newDate, LocalTime newTime) {
        ensureScheduled("rescheduled");
        if (newDate == null || newTime == null) {
            throw new IllegalArgumentException("New date and time are required.");
        }
        this.date = newDate;
        this.time = newTime;
    }

    public void complete(String findings) {
        ensureScheduled("completed");
        if (findings == null || findings.isBlank()) {
            throw new IllegalArgumentException("Please enter the findings or notes for this visit.");
        }
        this.status = AppointmentStatus.COMPLETED;
        this.remarks = findings.trim();
    }

    public void cancel(String cancelReason) {
        ensureScheduled("cancelled");
        if (cancelReason == null || cancelReason.isBlank()) {
            throw new IllegalArgumentException("Please enter a reason for cancelling.");
        }
        this.status = AppointmentStatus.CANCELLED;
        this.remarks = "Cancelled: " + cancelReason.trim();
    }

    public void markNoShow() {
        ensureScheduled("marked as no-show");
        this.status = AppointmentStatus.NO_SHOW;
        this.remarks = "Patient did not arrive.";
    }

    private void ensureScheduled(String action) {
        if (status != AppointmentStatus.SCHEDULED) {
            throw new IllegalStateException("Only scheduled appointments can be " + action
                    + ". Appointment " + id + " is already " + status.getLabel() + ".");
        }
    }

    // ---- Queries ----

    public boolean isActive() {
        return status == AppointmentStatus.SCHEDULED;
    }

    public LocalTime getEndTime() {
        return time.plusMinutes(staff.getSlotDurationMinutes());
    }

    public LocalDateTime getDateTime() {
        return LocalDateTime.of(date, time);
    }

    /** True if this appointment overlaps the given time window on the given date. */
    public boolean overlapsWith(LocalDate otherDate, LocalTime start, LocalTime end) {
        return date.equals(otherDate) && time.isBefore(end) && start.isBefore(getEndTime());
    }

    public String getSummary() {
        return "Appointment ID:   " + id + "\n"
                + "Status:           " + status.getLabel() + "\n"
                + "Patient:          " + patient.getFullName() + " (" + patient.getId() + ")\n"
                + "Attending Staff:  " + staff.getDisplayName() + " - " + staff.getRole()
                + " (" + staff.getServiceArea() + ")\n"
                + "Date:             " + date.format(DATE_FMT) + "\n"
                + "Time:             " + time.format(TIME_FMT) + " - " + getEndTime().format(TIME_FMT) + "\n"
                + "Type:             " + type.getLabel() + "\n"
                + "Reason for Visit: " + reason + "\n"
                + "Fee:              PHP " + String.format("%,.2f", computeFee()) + "\n"
                + "Remarks:          " + (remarks.isEmpty() ? "-" : remarks);
    }

    @Override
    public boolean matches(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return true;
        }
        String k = keyword.trim().toLowerCase();
        return id.toLowerCase().contains(k)
                || patient.getFullName().toLowerCase().contains(k)
                || patient.getId().toLowerCase().contains(k)
                || staff.getDisplayName().toLowerCase().contains(k)
                || reason.toLowerCase().contains(k)
                || type.getLabel().toLowerCase().contains(k);
    }

    @Override
    public String getId() {
        return id;
    }

    public Patient getPatient() {
        return patient;
    }

    public MedicalStaff getStaff() {
        return staff;
    }

    public LocalDate getDate() {
        return date;
    }

    public LocalTime getTime() {
        return time;
    }

    public AppointmentType getType() {
        return type;
    }

    public String getReason() {
        return reason;
    }

    public AppointmentStatus getStatus() {
        return status;
    }

    public String getRemarks() {
        return remarks;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    @Override
    public String toString() {
        return id + " - " + patient.getFullName() + " with " + staff.getDisplayName();
    }
}
