package clinic.ui.dialogs;

import clinic.model.MedicalStaff;
import clinic.model.StaffFactory;
import clinic.service.ClinicService;
import clinic.service.ValidationException;
import clinic.ui.UITheme;

import javax.swing.JCheckBox;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JTextField;
import java.awt.FlowLayout;
import java.awt.GridLayout;
import java.awt.Window;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.format.TextStyle;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Add a Doctor, Dentist or Nurse, or edit an existing staff member. */
public class StaffDialog extends FormDialog {
    private static final long serialVersionUID = 1L;

    private final ClinicService service;
    private final MedicalStaff existing;

    private final JComboBox<String> role = new JComboBox<>(StaffFactory.ROLES);
    private final JTextField firstName;
    private final JTextField lastName;
    private final JTextField contact;
    private final JTextField email;
    private final JTextField license;
    private final JComboBox<String> serviceArea = new JComboBox<>();
    private final JLabel serviceAreaHint = UITheme.label("", UITheme.SMALL, UITheme.MUTED);
    private final Map<DayOfWeek, JCheckBox> dayBoxes = new EnumMap<>(DayOfWeek.class);
    private final JComboBox<LocalTime> shiftStart = timeCombo();
    private final JComboBox<LocalTime> shiftEnd = timeCombo();

    public StaffDialog(Window owner, ClinicService service, MedicalStaff existing) {
        super(owner, existing == null ? "Add Medical Staff" : "Edit " + existing.getRole() + " " + existing.getId());
        this.service = service;
        this.existing = existing;

        boolean editing = existing != null;
        firstName = textField(editing ? existing.getFirstName() : "");
        lastName = textField(editing ? existing.getLastName() : "");
        contact = textField(editing ? existing.getContactNumber() : "");
        email = textField(editing ? existing.getEmail() : "");
        license = textField(editing ? existing.getLicenseNumber() : "");
        serviceArea.setEditable(true);

        JPanel days = new JPanel(new GridLayout(1, 7, 2, 0));
        days.setOpaque(false);
        for (DayOfWeek day : DayOfWeek.values()) {
            JCheckBox box = new JCheckBox(day.getDisplayName(TextStyle.SHORT, Locale.ENGLISH));
            box.setOpaque(false);
            box.setSelected(editing ? existing.getWorkingDays().contains(day) : day != DayOfWeek.SUNDAY);
            dayBoxes.put(day, box);
            days.add(box);
        }

        JPanel shift = new JPanel(new FlowLayout(FlowLayout.LEFT, 0, 0));
        shift.setOpaque(false);
        shift.add(shiftStart);
        shift.add(UITheme.label("   to   ", UITheme.BASE, UITheme.MUTED));
        shift.add(shiftEnd);
        shiftStart.setSelectedItem(editing ? existing.getShiftStart() : LocalTime.of(8, 0));
        shiftEnd.setSelectedItem(editing ? existing.getShiftEnd() : LocalTime.of(17, 0));

        if (editing) {
            role.setSelectedItem(existing.getRole());
            role.setEnabled(false);
        }
        role.addActionListener(e -> updateServiceAreaChoices());
        updateServiceAreaChoices();
        if (editing) {
            serviceArea.setSelectedItem(existing.getServiceArea());
        }

        addField("Role *", role);
        addField("First Name *", firstName);
        addField("Last Name *", lastName);
        addField("Contact No. *", contact);
        addField("Email", email);
        addField("PRC License No. *", license);
        addField("Service Area *", serviceArea);
        addField("", serviceAreaHint);
        addField("Working Days *", days);
        addField("Shift *", shift);
    }

    @Override
    protected String getSaveLabel() {
        return existing == null ? "Add Staff" : "Save Changes";
    }

    /** Updates the suggested service areas when the role changes. */
    private void updateServiceAreaChoices() {
        String selectedRole = (String) role.getSelectedItem();
        serviceArea.removeAllItems();
        for (String option : StaffFactory.serviceAreaOptions(selectedRole)) {
            serviceArea.addItem(option);
        }
        serviceAreaHint.setText(StaffFactory.serviceAreaLabel(selectedRole)
                + " (pick one or type a new value)");
    }

    @Override
    protected void onSave() throws ValidationException {
        Set<DayOfWeek> days = EnumSet.noneOf(DayOfWeek.class);
        dayBoxes.forEach((day, box) -> {
            if (box.isSelected()) {
                days.add(day);
            }
        });
        Object area = serviceArea.getEditor().getItem();
        LocalTime start = (LocalTime) shiftStart.getSelectedItem();
        LocalTime end = (LocalTime) shiftEnd.getSelectedItem();
        String selectedRole = existing == null ? (String) role.getSelectedItem() : existing.getRole();
        String id = existing == null ? service.generateStaffId() : existing.getId();

        // The factory builds the right subclass. Its constructor validates every field.
        MedicalStaff candidate = StaffFactory.create(selectedRole, id, firstName.getText(), lastName.getText(),
                contact.getText(), email.getText(), license.getText(), area == null ? "" : area.toString(),
                days, start, end);

        if (existing == null) {
            service.addStaff(candidate);
        } else {
            service.updateStaffSchedule(existing, days, start, end);
            existing.setFirstName(candidate.getFirstName());
            existing.setLastName(candidate.getLastName());
            existing.setContactNumber(candidate.getContactNumber());
            existing.setEmail(candidate.getEmail());
            existing.setLicenseNumber(candidate.getLicenseNumber());
            existing.setServiceArea(candidate.getServiceArea());
            service.saveChanges();
        }
    }

    private static JComboBox<LocalTime> timeCombo() {
        JComboBox<LocalTime> combo = new JComboBox<>();
        for (LocalTime t = LocalTime.of(6, 0); !t.isAfter(LocalTime.of(22, 0)); t = t.plusMinutes(30)) {
            combo.addItem(t);
        }
        combo.setRenderer(UITheme.<LocalTime>listRenderer(UITheme::time));
        return combo;
    }
}
