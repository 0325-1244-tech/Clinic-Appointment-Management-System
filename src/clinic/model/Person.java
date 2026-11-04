package clinic.model;

import java.io.Serializable;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * ABSTRACTION: the common blueprint for every person in the clinic.
 * It is abstract, so it cannot be instantiated on its own. Patient and
 * MedicalStaff extend it (INHERITANCE).
 *
 * ENCAPSULATION: every field is private and can only be changed through
 * setters that validate the value first.
 */
public abstract class Person implements Identifiable, Searchable, Serializable {
    private static final long serialVersionUID = 1L;
    private static final Pattern PHONE = Pattern.compile("^(09|\\+639)\\d{9}$");
    private static final Pattern EMAIL = Pattern.compile("^[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+$");

    private final String id;
    private String firstName;
    private String lastName;
    private String contactNumber;
    private String email;

    protected Person(String id, String firstName, String lastName, String contactNumber, String email) {
        this.id = requireText(id, "ID");
        setFirstName(firstName);
        setLastName(lastName);
        setContactNumber(contactNumber);
        setEmail(email);
    }

    @Override
    public String getId() {
        return id;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = requireText(firstName, "First name");
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = requireText(lastName, "Last name");
    }

    public String getContactNumber() {
        return contactNumber;
    }

    public void setContactNumber(String contactNumber) {
        String value = requireText(contactNumber, "Contact number").replaceAll("[\\s-]", "");
        if (!PHONE.matcher(value).matches()) {
            throw new IllegalArgumentException("Contact number must be a valid PH mobile number (e.g. 09171234567).");
        }
        this.contactNumber = value;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        String value = email == null ? "" : email.trim();
        if (!value.isEmpty() && !EMAIL.matcher(value).matches()) {
            throw new IllegalArgumentException("Email address is not valid.");
        }
        this.email = value;
    }

    public String getFullName() {
        return firstName + " " + lastName;
    }

    /** Each subclass describes its own role (e.g. "Patient", "Doctor"). */
    public abstract String getRole();

    /** Each subclass builds its own one-line description. */
    public abstract String getDetails();

    @Override
    public boolean matches(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return true;
        }
        String k = keyword.trim().toLowerCase();
        return id.toLowerCase().contains(k)
                || getFullName().toLowerCase().contains(k)
                || contactNumber.contains(k)
                || email.toLowerCase().contains(k);
    }

    protected static String requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " is required.");
        }
        return value.trim();
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (other == null || getClass() != other.getClass()) {
            return false;
        }
        return id.equals(((Person) other).id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(getClass(), id);
    }

    @Override
    public String toString() {
        return getFullName() + " (" + id + ")";
    }
}
