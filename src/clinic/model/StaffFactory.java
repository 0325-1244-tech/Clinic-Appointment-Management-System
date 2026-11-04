package clinic.model;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

/**
 * Creates the right MedicalStaff subclass from a role name.
 * The caller receives a MedicalStaff reference and never needs to know the
 * concrete class (POLYMORPHISM).
 */
public final class StaffFactory {
    public static final String[] ROLES = {"Doctor", "Dentist", "Nurse"};

    private StaffFactory() {
    }

    public static MedicalStaff create(String role, String id, String firstName, String lastName,
                                      String contactNumber, String email, String licenseNumber,
                                      String serviceArea, Set<DayOfWeek> workingDays,
                                      LocalTime shiftStart, LocalTime shiftEnd) {
        return switch (role) {
            case "Doctor" -> new Doctor(id, firstName, lastName, contactNumber, email,
                    licenseNumber, serviceArea, workingDays, shiftStart, shiftEnd);
            case "Dentist" -> new Dentist(id, firstName, lastName, contactNumber, email,
                    licenseNumber, serviceArea, workingDays, shiftStart, shiftEnd);
            case "Nurse" -> new Nurse(id, firstName, lastName, contactNumber, email,
                    licenseNumber, serviceArea, workingDays, shiftStart, shiftEnd);
            default -> throw new IllegalArgumentException("Unknown staff role: " + role);
        };
    }

    public static String serviceAreaLabel(String role) {
        return switch (role) {
            case "Dentist" -> Dentist.AREA_LABEL;
            case "Nurse" -> Nurse.AREA_LABEL;
            default -> Doctor.AREA_LABEL;
        };
    }

    public static String[] serviceAreaOptions(String role) {
        return switch (role) {
            case "Dentist" -> Dentist.ROOMS;
            case "Nurse" -> Nurse.DEPARTMENTS;
            default -> Doctor.SPECIALIZATIONS;
        };
    }
}
