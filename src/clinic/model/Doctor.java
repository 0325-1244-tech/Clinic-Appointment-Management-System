package clinic.model;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

/**
 * INHERITANCE: a Doctor is a MedicalStaff member.
 * POLYMORPHISM: overrides the fee, slot length and display name.
 * Specialists charge more than general practitioners.
 */
public class Doctor extends MedicalStaff {
    private static final long serialVersionUID = 1L;

    public static final String AREA_LABEL = "Specialization";
    public static final String[] SPECIALIZATIONS = {
            "General Medicine", "Pediatrics", "Internal Medicine", "OB-Gynecology", "Cardiology", "Dermatology"
    };
    private static final double GENERAL_FEE = 500.00;
    private static final double SPECIALIST_FEE = 800.00;
    private static final int SLOT_MINUTES = 30;

    private String specialization;

    public Doctor(String id, String firstName, String lastName, String contactNumber, String email,
                  String licenseNumber, String specialization, Set<DayOfWeek> workingDays,
                  LocalTime shiftStart, LocalTime shiftEnd) {
        super(id, firstName, lastName, contactNumber, email, licenseNumber, workingDays, shiftStart, shiftEnd);
        setServiceArea(specialization);
    }

    public boolean isGeneralPractitioner() {
        return "General Medicine".equalsIgnoreCase(specialization);
    }

    @Override
    public double getConsultationFee() {
        return isGeneralPractitioner() ? GENERAL_FEE : SPECIALIST_FEE;
    }

    @Override
    public int getSlotDurationMinutes() {
        return SLOT_MINUTES;
    }

    @Override
    public String getServiceAreaLabel() {
        return AREA_LABEL;
    }

    @Override
    public String getServiceArea() {
        return specialization;
    }

    @Override
    public void setServiceArea(String specialization) {
        this.specialization = requireText(specialization, AREA_LABEL);
    }

    @Override
    public String getRole() {
        return "Doctor";
    }

    @Override
    public String getDisplayName() {
        return "Dr. " + getFullName();
    }
}
