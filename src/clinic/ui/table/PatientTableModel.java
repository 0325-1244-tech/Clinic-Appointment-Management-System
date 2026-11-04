package clinic.ui.table;

import clinic.model.Patient;
import clinic.ui.UITheme;

public class PatientTableModel extends EntityTableModel<Patient> {
    private static final long serialVersionUID = 1L;
    private static final String[] COLUMNS = {
            "Patient ID", "Full Name", "Age", "Gender", "Birth Date", "Blood Type", "Contact No.", "Address"
    };

    @Override
    protected String[] getColumnNames() {
        return COLUMNS;
    }

    @Override
    protected Object getColumnValue(Patient p, int column) {
        return switch (column) {
            case 0 -> p.getId();
            case 1 -> p.getFullName();
            case 2 -> p.getAge();
            case 3 -> p.getGender();
            case 4 -> UITheme.date(p.getBirthDate());
            case 5 -> p.getBloodType();
            case 6 -> p.getContactNumber();
            case 7 -> p.getAddress();
            default -> "";
        };
    }
}
