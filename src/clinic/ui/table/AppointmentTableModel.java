package clinic.ui.table;

import clinic.model.Appointment;
import clinic.ui.UITheme;

public class AppointmentTableModel extends EntityTableModel<Appointment> {
    private static final long serialVersionUID = 1L;
    private static final String[] COLUMNS = {
            "Appt. ID", "Date", "Time", "Patient", "Attending Staff", "Type", "Reason for Visit", "Fee", "Status"
    };

    @Override
    protected String[] getColumnNames() {
        return COLUMNS;
    }

    @Override
    protected Object getColumnValue(Appointment a, int column) {
        return switch (column) {
            case 0 -> a.getId();
            case 1 -> UITheme.date(a.getDate());
            case 2 -> UITheme.time(a.getTime()) + " - " + UITheme.time(a.getEndTime());
            case 3 -> a.getPatient().getFullName();
            case 4 -> a.getStaff().getDisplayName();
            case 5 -> a.getType().getLabel();
            case 6 -> a.getReason();
            case 7 -> UITheme.money(a.computeFee());
            case 8 -> a.getStatus();
            default -> "";
        };
    }
}
