package clinic.ui.panels;

import clinic.model.Appointment;
import clinic.model.AppointmentStatus;
import clinic.model.MedicalStaff;
import clinic.service.ClinicService;
import clinic.ui.UITheme;
import clinic.ui.components.RoundedButton;
import clinic.ui.components.RoundedPanel;
import clinic.ui.components.StatCard;
import clinic.ui.dialogs.AppointmentDialog;
import clinic.ui.table.AppointmentTableModel;

import javax.swing.BorderFactory;
import javax.swing.DefaultListCellRenderer;
import javax.swing.DefaultListModel;
import javax.swing.JLabel;
import javax.swing.JList;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.GridLayout;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/** Overview page: key numbers, today's schedule and who is on duty. */
public class DashboardPanel extends BasePanel {
    private static final long serialVersionUID = 1L;

    private final StatCard patientsCard = new StatCard("Registered Patients", "Total patient records", UITheme.PRIMARY);
    private final StatCard staffCard = new StatCard("Active Medical Staff", "Doctors, dentists and nurses", UITheme.INFO);
    private final StatCard todayCard = new StatCard("Today's Appointments", "All statuses", UITheme.WARNING);
    private final StatCard upcomingCard = new StatCard("Upcoming Appointments", "Still scheduled", new Color(0x7C3AED));
    private final StatCard completedCard = new StatCard("Completed Visits", "All time", UITheme.SUCCESS);
    private final StatCard feesCard = new StatCard("Fees from Completed Visits", "Sum of computeFee()", UITheme.SUCCESS);

    private final AppointmentTableModel todayModel = new AppointmentTableModel();
    private final JTable todayTable = new JTable(todayModel);
    private final DefaultListModel<MedicalStaff> onDutyModel = new DefaultListModel<>();
    private final JLabel scheduleTitle = UITheme.label("", UITheme.SECTION, UITheme.TEXT);

    public DashboardPanel(ClinicService service) {
        super(service);

        RoundedButton book = UITheme.primaryButton("+  Book Appointment");
        book.addActionListener(e -> {
            if (new AppointmentDialog(owner(), service, null).showDialog()) {
                refreshData();
            }
        });
        addHeaderAction(book);

        JPanel cards = new JPanel(new GridLayout(2, 3, 16, 16));
        cards.setOpaque(false);
        cards.add(patientsCard);
        cards.add(staffCard);
        cards.add(todayCard);
        cards.add(upcomingCard);
        cards.add(completedCard);
        cards.add(feesCard);

        scheduleTitle.setBorder(BorderFactory.createEmptyBorder(0, 0, 10, 0));
        RoundedPanel scheduleCard = tableCard(todayTable, scheduleTitle);
        // Compact view: hide ID, Date, Reason and Fee (removed from the view only, the model is unchanged).
        for (int column : new int[]{7, 6, 1, 0}) {
            todayTable.removeColumn(todayTable.getColumnModel().getColumn(column));
        }
        setColumnWidths(todayTable, 150, 0, 0, 0, 115);

        JList<MedicalStaff> onDuty = new JList<>(onDutyModel);
        onDuty.setCellRenderer(new StaffCellRenderer());
        onDuty.setFocusable(false);
        JScrollPane dutyScroll = new JScrollPane(onDuty);
        dutyScroll.setBorder(BorderFactory.createLineBorder(UITheme.BORDER));
        RoundedPanel dutyCard = new RoundedPanel(new BorderLayout());
        JLabel dutyTitle = UITheme.label("On Duty Today", UITheme.SECTION, UITheme.TEXT);
        dutyTitle.setBorder(BorderFactory.createEmptyBorder(0, 0, 10, 0));
        dutyCard.add(dutyTitle, BorderLayout.NORTH);
        dutyCard.add(dutyScroll, BorderLayout.CENTER);
        dutyCard.setPreferredSize(new Dimension(320, 0));

        JPanel bottom = new JPanel(new BorderLayout(16, 0));
        bottom.setOpaque(false);
        bottom.add(scheduleCard, BorderLayout.CENTER);
        bottom.add(dutyCard, BorderLayout.EAST);

        JPanel content = new JPanel(new BorderLayout(0, 16));
        content.setOpaque(false);
        content.add(cards, BorderLayout.NORTH);
        content.add(bottom, BorderLayout.CENTER);
        add(content, BorderLayout.CENTER);
    }

    @Override
    public String getTitle() {
        return "Dashboard";
    }

    @Override
    public String getSubtitle() {
        return "Overview of the clinic for " + LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, MMMM dd, yyyy", Locale.ENGLISH));
    }

    @Override
    public void refreshData() {
        LocalDate today = LocalDate.now();
        List<Appointment> todays = service.findAppointments(today);

        patientsCard.setValue(String.valueOf(service.getPatientCount()));
        staffCard.setValue(String.valueOf(service.getActiveStaffCount()));
        todayCard.setValue(String.valueOf(todays.size()));
        upcomingCard.setValue(String.valueOf(service.getUpcomingAppointments().size()));
        completedCard.setValue(String.valueOf(service.findAppointments(AppointmentStatus.COMPLETED).size()));
        feesCard.setValue(UITheme.money(service.getCollectedFees()));

        todayModel.setItems(todays);
        scheduleTitle.setText("Today's Schedule  (" + todays.size() + ")");

        onDutyModel.clear();
        service.getStaffOnDuty(today).forEach(onDutyModel::addElement);
    }

    /** Two-line list item: staff name, then role, area and shift. */
    private static class StaffCellRenderer extends DefaultListCellRenderer {
        private static final long serialVersionUID = 1L;

        @Override
        public Component getListCellRendererComponent(JList<?> list, Object value, int index,
                                                      boolean selected, boolean focus) {
            super.getListCellRendererComponent(list, value, index, false, false);
            MedicalStaff s = (MedicalStaff) value;
            setText("<html><b>" + s.getDisplayName() + "</b><br><font color='#64748B'>"
                    + s.getRole() + " &middot; " + s.getServiceArea() + "<br>" + s.getShiftText() + "</font></html>");
            setBorder(BorderFactory.createCompoundBorder(
                    BorderFactory.createMatteBorder(0, 0, 1, 0, UITheme.BORDER),
                    BorderFactory.createEmptyBorder(8, 10, 8, 10)));
            return this;
        }
    }
}
