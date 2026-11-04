package clinic.ui.dialogs;

import clinic.model.Patient;
import clinic.service.ClinicService;
import clinic.ui.UITheme;

import javax.swing.JComboBox;
import javax.swing.JSpinner;
import javax.swing.JTextField;
import java.awt.Window;
import java.time.LocalDate;

/** Register a new patient, or edit an existing one. */
public class PatientDialog extends FormDialog {
    private static final long serialVersionUID = 1L;

    private final ClinicService service;
    private final Patient existing;

    private final JTextField firstName;
    private final JTextField lastName;
    private final JSpinner birthDate;
    private final JComboBox<String> gender = new JComboBox<>(Patient.GENDERS);
    private final JComboBox<String> bloodType = new JComboBox<>(Patient.BLOOD_TYPES);
    private final JTextField contact;
    private final JTextField email;
    private final JTextField address;

    public PatientDialog(Window owner, ClinicService service, Patient existing) {
        super(owner, existing == null ? "Register New Patient" : "Edit Patient " + existing.getId());
        this.service = service;
        this.existing = existing;

        boolean editing = existing != null;
        firstName = textField(editing ? existing.getFirstName() : "");
        lastName = textField(editing ? existing.getLastName() : "");
        birthDate = UITheme.dateSpinner(editing ? existing.getBirthDate() : LocalDate.now().minusYears(20),
                LocalDate.of(1900, 1, 1), LocalDate.now());
        contact = textField(editing ? existing.getContactNumber() : "");
        email = textField(editing ? existing.getEmail() : "");
        address = textField(editing ? existing.getAddress() : "");
        if (editing) {
            gender.setSelectedItem(existing.getGender());
            bloodType.setSelectedItem(existing.getBloodType());
        } else {
            bloodType.setSelectedItem("Unknown");
        }

        addField("First Name *", firstName);
        addField("Last Name *", lastName);
        addField("Birth Date *", birthDate);
        addField("Gender *", gender);
        addField("Blood Type", bloodType);
        addField("Contact No. *", contact);
        addField("Email", email);
        addField("Address *", address);
    }

    @Override
    protected String getSaveLabel() {
        return existing == null ? "Register Patient" : "Save Changes";
    }

    @Override
    protected void onSave() {
        String id = existing == null ? service.generatePatientId() : existing.getId();
        // Building the object runs every setter's validation. If anything is wrong,
        // an exception is thrown here and nothing has been changed yet.
        Patient candidate = new Patient(id, firstName.getText(), lastName.getText(), contact.getText(),
                email.getText(), UITheme.getDate(birthDate), (String) gender.getSelectedItem(),
                address.getText(), (String) bloodType.getSelectedItem());

        if (existing == null) {
            service.addPatient(candidate);
        } else {
            existing.setFirstName(candidate.getFirstName());
            existing.setLastName(candidate.getLastName());
            existing.setContactNumber(candidate.getContactNumber());
            existing.setEmail(candidate.getEmail());
            existing.setBirthDate(candidate.getBirthDate());
            existing.setGender(candidate.getGender());
            existing.setAddress(candidate.getAddress());
            existing.setBloodType(candidate.getBloodType());
            service.saveChanges();
        }
    }
}
