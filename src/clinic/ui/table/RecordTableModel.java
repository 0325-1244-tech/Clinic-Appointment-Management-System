package clinic.ui.table;

import clinic.model.Appointment;
import clinic.ui.UITheme;

/** Appointment-history view: shows findings and remarks instead of booking details. */
public class RecordTableModel extends EntityTableModel<Appointment> {
    private static final long serialVersionUID = 1L;
    private static final String[] COLUMNS = {
            "Appt. ID", "Date", "Patient", "Attending Staff", "Type", "Status", "Fee", "Findings / Remarks"
    };

    @Override
    protected String[] getColumnNames() {
        return COLUMNS;
    }

    @Override
    protected Object getColumnValue(Appointment a, int column) {
        return switch (column) {
            case 0 -> a.getId();
            case 1 -> UITheme.date(a.getDate()) + "  " + UITheme.time(a.getTime());
            case 2 -> a.getPatient().getFullName();
            case 3 -> a.getStaff().getDisplayName();
            case 4 -> a.getType().getLabel();
            case 5 -> a.getStatus();
            case 6 -> UITheme.money(a.computeFee());
            case 7 -> a.getRemarks().isEmpty() ? "-" : a.getRemarks();
            default -> "";
        };
    }
}
