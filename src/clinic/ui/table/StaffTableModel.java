package clinic.ui.table;

import clinic.model.MedicalStaff;
import clinic.ui.UITheme;

/**
 * Every column below calls an overridden method (getRole, getDisplayName,
 * getServiceArea, getConsultationFee, getSlotDurationMinutes). Each row shows
 * correct values for a Doctor, Dentist or Nurse without any if/else on the type.
 * That is POLYMORPHISM.
 */
public class StaffTableModel extends EntityTableModel<MedicalStaff> {
    private static final long serialVersionUID = 1L;
    private static final String[] COLUMNS = {
            "Staff ID", "Name", "Role", "Specialization / Area", "Base Fee", "Slot", "Working Days", "Shift", "Status"
    };

    @Override
    protected String[] getColumnNames() {
        return COLUMNS;
    }

    @Override
    protected Object getColumnValue(MedicalStaff s, int column) {
        return switch (column) {
            case 0 -> s.getId();
            case 1 -> s.getDisplayName();
            case 2 -> s.getRole();
            case 3 -> s.getServiceArea();
            case 4 -> UITheme.money(s.getConsultationFee());
            case 5 -> s.getSlotDurationMinutes() + " min";
            case 6 -> s.getWorkingDaysText();
            case 7 -> s.getShiftText();
            case 8 -> s.isActive() ? "Active" : "Inactive";
            default -> "";
        };
    }
}
