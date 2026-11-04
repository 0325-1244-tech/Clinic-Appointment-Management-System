package clinic.model;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

/**
 * INHERITANCE: a Nurse is a MedicalStaff member.
 * POLYMORPHISM: nurses handle short services (vaccination, vitals check),
 * so they use 15-minute slots and a lower fee.
 */
public class Nurse extends MedicalStaff {
    private static final long serialVersionUID = 1L;

    public static final String AREA_LABEL = "Department";
    public static final String[] DEPARTMENTS = {"Immunization", "Triage", "Wound Care", "Maternal Care"};
    private static final double NURSING_FEE = 250.00;
    private static final int SLOT_MINUTES = 15;

    private String department;

    public Nurse(String id, String firstName, String lastName, String contactNumber, String email,
                 String licenseNumber, String department, Set<DayOfWeek> workingDays,
                 LocalTime shiftStart, LocalTime shiftEnd) {
        super(id, firstName, lastName, contactNumber, email, licenseNumber, workingDays, shiftStart, shiftEnd);
        setServiceArea(department);
    }

    @Override
    public double getConsultationFee() {
        return NURSING_FEE;
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
        return department;
    }

    @Override
    public void setServiceArea(String department) {
        this.department = requireText(department, AREA_LABEL);
    }

    @Override
    public String getRole() {
        return "Nurse";
    }

    @Override
    public String getDisplayName() {
        return getFullName() + ", RN";
    }
}
