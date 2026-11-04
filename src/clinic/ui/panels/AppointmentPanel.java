package clinic.ui.panels;

import clinic.model.Appointment;
import clinic.model.AppointmentStatus;
import clinic.service.ClinicService;
import clinic.ui.UITheme;
import clinic.ui.components.HintTextField;
import clinic.ui.components.RoundedButton;
import clinic.ui.dialogs.AppointmentDialog;
import clinic.ui.table.AppointmentTableModel;

import javax.swing.JComboBox;
import javax.swing.JComponent;
import javax.swing.JTable;
import java.awt.BorderLayout;
import java.awt.Dimension;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

/** Book, reschedule, complete, cancel and track appointments. */
public class AppointmentPanel extends BasePanel {
    private static final long serialVersionUID = 1L;
    private static final String ALL_STATUSES = "All Statuses";
    private static final String[] PERIODS = {"All Dates", "Today", "Upcoming", "Past"};

    private final AppointmentTableModel model = new AppointmentTableModel();
    private final JTable table = new JTable(model);
    private final HintTextField search = new HintTextField("Search patient, staff, ID or reason...");
    private final JComboBox<Object> statusFilter = new JComboBox<>();
    private final JComboBox<String> periodFilter = new JComboBox<>(PERIODS);
    private final RoundedButton rescheduleButton = UITheme.secondaryButton("Reschedule");
    private final RoundedButton completeButton = UITheme.successButton("Complete");
    private final RoundedButton cancelButton = UITheme.dangerButton("Cancel");
    private final RoundedButton noShowButton = UITheme.secondaryButton("No-Show");

    public AppointmentPanel(ClinicService service) {
        super(service);

        RoundedButton book = UITheme.primaryButton("+  Book Appointment");
        book.addActionListener(e -> bookNew());
        addHeaderAction(book);

        statusFilter.addItem(ALL_STATUSES);
        for (AppointmentStatus s : AppointmentStatus.values()) {
            statusFilter.addItem(s);
        }
        search.setPreferredSize(new Dimension(250, 36));
        statusFilter.addActionListener(e -> refreshData());
        periodFilter.addActionListener(e -> refreshData());
        search.onTextChanged(this::refreshData);

        rescheduleButton.addActionListener(e -> reschedule());
        completeButton.addActionListener(e -> complete());
        cancelButton.addActionListener(e -> cancel());
        noShowButton.addActionListener(e -> noShow());
        table.getSelectionModel().addListSelectionListener(e -> updateButtons());
        onDoubleClick(table, () -> {
            Appointment a = selected(table, model);
            showDetails("Appointment Details", a.getSummary());
        });
        setColumnWidths(table, 72, 100, 150, 0, 0, 0, 0, 90, 115);

        add(tableCard(table, toolbar(new JComponent[]{search, statusFilter, periodFilter},
                rescheduleButton, completeButton, cancelButton, noShowButton)), BorderLayout.CENTER);
        add(UITheme.label("Tip: double-click an appointment to see its full details.", UITheme.SMALL, UITheme.MUTED),
                BorderLayout.SOUTH);
        updateButtons();
    }

    @Override
    public String getTitle() {
        return "Appointments";
    }

    @Override
    public String getSubtitle() {
        return "Schedule and manage patient appointments";
    }

    @Override
    public void refreshData() {
        Object status = statusFilter.getSelectedItem();
        String period = (String) periodFilter.getSelectedItem();
        LocalDate today = LocalDate.now();

        List<Appointment> list = service.findAppointments(search.getText()).stream()
                .filter(a -> !(status instanceof AppointmentStatus) || a.getStatus() == status)
                .filter(a -> switch (period) {
                    case "Today" -> a.getDate().equals(today);
                    case "Upcoming" -> !a.getDate().isBefore(today);
                    case "Past" -> a.getDate().isBefore(today);
                    default -> true;
                })
                .collect(Collectors.toList());
        model.setItems(list);
        updateButtons();
    }

    private void updateButtons() {
        Appointment a = selected(table, model);
        boolean canChange = a != null && a.isActive();
        rescheduleButton.setEnabled(canChange);
        completeButton.setEnabled(canChange);
        cancelButton.setEnabled(canChange);
        noShowButton.setEnabled(canChange);
    }

    private void bookNew() {
        if (service.getPatientCount() == 0) {
            showInfo("Please register a patient first.");
            return;
        }
        if (new AppointmentDialog(owner(), service, null).showDialog()) {
            refreshData();
        }
    }

    private void reschedule() {
        Appointment a = selected(table, model);
        if (a != null && new AppointmentDialog(owner(), service, a).showDialog()) {
            refreshData();
        }
    }

    private void complete() {
        Appointment a = selected(table, model);
        if (a == null) {
            return;
        }
        String findings = promptText("Complete Appointment " + a.getId(),
                "Findings / diagnosis / notes for " + a.getPatient().getFullName() + ":");
        if (findings != null && attempt(() -> service.completeAppointment(a, findings))) {
            refreshData();
        }
    }

    private void cancel() {
        Appointment a = selected(table, model);
        if (a == null) {
            return;
        }
        String reason = promptText("Cancel Appointment " + a.getId(), "Reason for cancelling:");
        if (reason != null && attempt(() -> service.cancelAppointment(a, reason))) {
            refreshData();
        }
    }

    private void noShow() {
        Appointment a = selected(table, model);
        if (a != null && confirm("Mark " + a.getPatient().getFullName() + "'s appointment as No-Show?")
                && attempt(() -> service.markNoShow(a))) {
            refreshData();
        }
    }
}
