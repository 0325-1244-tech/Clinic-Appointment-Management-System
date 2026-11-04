package clinic.ui.dialogs;

import clinic.model.Appointment;
import clinic.model.AppointmentType;
import clinic.model.MedicalStaff;
import clinic.model.Patient;
import clinic.service.ClinicService;
import clinic.service.ValidationException;
import clinic.ui.UITheme;

import javax.swing.DefaultComboBoxModel;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JScrollPane;
import javax.swing.JSpinner;
import javax.swing.JTextArea;
import java.awt.Window;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.TextStyle;
import java.util.List;
import java.util.Locale;

/**
 * Books a new appointment, or reschedules an existing one (reschedule mode
 * locks patient, staff, type and reason). The time-slot list only offers open
 * slots, and it refreshes whenever the staff member or date changes.
 */
public class AppointmentDialog extends FormDialog {
    private static final long serialVersionUID = 1L;

    private final ClinicService service;
    private final Appointment existing;

    private final JComboBox<Patient> patient;
    private final JComboBox<MedicalStaff> staff;
    private final JComboBox<AppointmentType> type = new JComboBox<>(AppointmentType.values());
    private final JSpinner date;
    private final JComboBox<LocalTime> time = new JComboBox<>();
    private final JLabel scheduleHint = UITheme.label(" ", UITheme.SMALL, UITheme.MUTED);
    private final JLabel feeLabel = UITheme.label(" ", UITheme.BOLD, UITheme.PRIMARY);
    private final JTextArea reason = new JTextArea(3, 28);

    public AppointmentDialog(Window owner, ClinicService service, Appointment existing) {
        this(owner, service, existing, null);
    }

    public AppointmentDialog(Window owner, ClinicService service, Appointment existing, Patient preselected) {
        super(owner, existing == null ? "Book Appointment" : "Reschedule Appointment " + existing.getId());
        this.service = service;
        this.existing = existing;

        patient = new JComboBox<>(service.getPatients().toArray(new Patient[0]));
        patient.setRenderer(UITheme.<Patient>listRenderer(p -> p.getFullName() + "  (" + p.getId() + ")"));

        DefaultComboBoxModel<MedicalStaff> staffModel = new DefaultComboBoxModel<>();
        service.getActiveStaff().forEach(staffModel::addElement);
        staff = new JComboBox<>(staffModel);
        staff.setRenderer(UITheme.<MedicalStaff>listRenderer(
                s -> s.getDisplayName() + "  -  " + s.getRole() + ", " + s.getServiceArea()));

        type.setRenderer(UITheme.<AppointmentType>listRenderer(
                t -> t.getLabel() + "  (x" + t.getFeeMultiplier() + " of base fee)"));
        time.setRenderer(UITheme.<LocalTime>listRenderer(UITheme::time));
        reason.setLineWrap(true);
        reason.setWrapStyleWord(true);
        reason.setFont(UITheme.BASE);

        LocalDate today = LocalDate.now();
        LocalDate initialDate = today;
        if (existing != null) {
            if (staffModel.getIndexOf(existing.getStaff()) < 0) {
                staffModel.addElement(existing.getStaff());
            }
            patient.setSelectedItem(existing.getPatient());
            staff.setSelectedItem(existing.getStaff());
            type.setSelectedItem(existing.getType());
            reason.setText(existing.getReason());
            patient.setEnabled(false);
            staff.setEnabled(false);
            type.setEnabled(false);
            reason.setEditable(false);
            reason.setBackground(UITheme.BACKGROUND);
            if (existing.getDate().isAfter(today)) {
                initialDate = existing.getDate();
            }
        } else if (preselected != null) {
            patient.setSelectedItem(preselected);
        }
        date = UITheme.dateSpinner(initialDate, today, null);

        addField("Patient *", patient);
        addField("Attending Staff *", staff);
        addField("", scheduleHint);
        addField("Appointment Type *", type);
        addField("Date *", date);
        addField("Available Time *", time);
        addField("Estimated Fee", feeLabel);
        addField("Reason for Visit *", new JScrollPane(reason));

        staff.addActionListener(e -> {
            refreshSlots();
            refreshFee();
        });
        type.addActionListener(e -> refreshFee());
        date.addChangeListener(e -> refreshSlots());
        refreshSlots();
        refreshFee();

        if (existing != null && time.getItemCount() > 0) {
            time.setSelectedItem(existing.getTime());
        }
    }

    @Override
    protected String getSaveLabel() {
        return existing == null ? "Book Appointment" : "Reschedule";
    }

    private void refreshSlots() {
        MedicalStaff selected = (MedicalStaff) staff.getSelectedItem();
        time.removeAllItems();
        if (selected == null) {
            setHint("No active medical staff yet. Add staff first.", true);
            return;
        }
        LocalDate chosen = UITheme.getDate(date);
        List<LocalTime> slots = service.getAvailableSlots(selected, chosen, existing);
        slots.forEach(time::addItem);

        String schedule = "Works " + selected.getWorkingDaysText() + "  |  " + selected.getShiftText()
                + "  |  " + selected.getSlotDurationMinutes() + "-min slots";
        if (!selected.isAvailableOn(chosen)) {
            setHint("Not available on " + chosen.getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.ENGLISH)
                    + ".  " + schedule, true);
        } else if (slots.isEmpty()) {
            setHint("Fully booked on this date. Please choose another date.  " + schedule, true);
        } else {
            setHint(slots.size() + " open slot(s).  " + schedule, false);
        }
    }

    private void setHint(String text, boolean warning) {
        scheduleHint.setText(text);
        scheduleHint.setForeground(warning ? UITheme.DANGER : UITheme.MUTED);
    }

    /** The fee comes from the staff member's overridden getConsultationFee() (POLYMORPHISM). */
    private void refreshFee() {
        MedicalStaff selected = (MedicalStaff) staff.getSelectedItem();
        AppointmentType selectedType = (AppointmentType) type.getSelectedItem();
        if (selected == null || selectedType == null) {
            feeLabel.setText("-");
            return;
        }
        feeLabel.setText(UITheme.money(Appointment.estimateFee(selected, selectedType))
                + "   (" + selected.getRole() + " base fee " + UITheme.money(selected.getConsultationFee())
                + " x " + selectedType.getFeeMultiplier() + ")");
    }

    @Override
    protected void onSave() throws ValidationException {
        LocalTime chosenTime = (LocalTime) time.getSelectedItem();
        if (chosenTime == null) {
            throw new ValidationException("There is no available time slot selected. "
                    + "Please choose another date or staff member.");
        }
        LocalDate chosenDate = UITheme.getDate(date);
        if (existing == null) {
            service.bookAppointment((Patient) patient.getSelectedItem(), (MedicalStaff) staff.getSelectedItem(),
                    chosenDate, chosenTime, (AppointmentType) type.getSelectedItem(), reason.getText());
        } else {
            service.rescheduleAppointment(existing, chosenDate, chosenTime);
        }
    }
}
