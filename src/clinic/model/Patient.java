package clinic.model;

import java.time.LocalDate;
import java.time.Period;

/**
 * INHERITANCE: a Patient is a Person with medical-profile information.
 */
public class Patient extends Person {
    private static final long serialVersionUID = 1L;

    public static final String[] GENDERS = {"Male", "Female", "Other"};
    public static final String[] BLOOD_TYPES = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"};

    private LocalDate birthDate;
    private String gender;
    private String address;
    private String bloodType;

    public Patient(String id, String firstName, String lastName, String contactNumber, String email,
                   LocalDate birthDate, String gender, String address, String bloodType) {
        super(id, firstName, lastName, contactNumber, email);
        setBirthDate(birthDate);
        setGender(gender);
        setAddress(address);
        setBloodType(bloodType);
    }

    public LocalDate getBirthDate() {
        return birthDate;
    }

    public void setBirthDate(LocalDate birthDate) {
        if (birthDate == null) {
            throw new IllegalArgumentException("Birth date is required.");
        }
        if (birthDate.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("Birth date cannot be in the future.");
        }
        this.birthDate = birthDate;
    }

    public int getAge() {
        return Period.between(birthDate, LocalDate.now()).getYears();
    }

    public String getGender() {
        return gender;
    }

    public void setGender(String gender) {
        this.gender = requireText(gender, "Gender");
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = requireText(address, "Address");
    }

    public String getBloodType() {
        return bloodType;
    }

    public void setBloodType(String bloodType) {
        this.bloodType = bloodType == null || bloodType.isBlank() ? "Unknown" : bloodType.trim();
    }

    @Override
    public String getRole() {
        return "Patient";
    }

    @Override
    public String getDetails() {
        return String.format("%s | %d yrs old | %s | Blood type: %s | %s",
                getFullName(), getAge(), gender, bloodType, address);
    }

    @Override
    public boolean matches(String keyword) {
        return super.matches(keyword)
                || address.toLowerCase().contains(keyword.trim().toLowerCase());
    }
}
