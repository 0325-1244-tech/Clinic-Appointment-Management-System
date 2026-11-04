package clinic.model;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

/**
 * INHERITANCE: a Dentist is a MedicalStaff member.
 * POLYMORPHISM: dental procedures take longer (60-minute slots) and have their own fee.
 */
public class Dentist extends MedicalStaff {
    private static final long serialVersionUID = 1L;

    public static final String AREA_LABEL = "Dental Room";
    public static final String[] ROOMS = {"Dental Room 1", "Dental Room 2", "Dental Room 3"};
    private static final double DENTAL_FEE = 700.00;
    private static final int SLOT_MINUTES = 60;

    private String clinicRoom;

    public Dentist(String id, String firstName, String lastName, String contactNumber, String email,
                   String licenseNumber, String clinicRoom, Set<DayOfWeek> workingDays,
                   LocalTime shiftStart, LocalTime shiftEnd) {
        super(id, firstName, lastName, contactNumber, email, licenseNumber, workingDays, shiftStart, shiftEnd);
        setServiceArea(clinicRoom);
    }

    @Override
    public double getConsultationFee() {
        return DENTAL_FEE;
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
        return clinicRoom;
    }

    @Override
    public void setServiceArea(String clinicRoom) {
        this.clinicRoom = requireText(clinicRoom, AREA_LABEL);
    }

    @Override
    public String getRole() {
        return "Dentist";
    }

    @Override
    public String getDisplayName() {
        return "Dr. " + getFullName() + ", DMD";
    }
}
