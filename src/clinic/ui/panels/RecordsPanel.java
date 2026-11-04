package clinic.ui.panels;

import clinic.model.Appointment;
import clinic.model.AppointmentStatus;
import clinic.model.Patient;
import clinic.service.ClinicService;
import clinic.ui.UITheme;
import clinic.ui.components.HintTextField;
import clinic.ui.components.RoundedButton;
import clinic.ui.components.StatCard;
import clinic.ui.table.RecordTableModel;

import javax.swing.JComboBox;
import javax.swing.JComponent;
import javax.swing.JFileChooser;
import javax.swing.JPanel;
import javax.swing.JTable;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.GridLayout;
import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

/** History of finished appointments (completed, cancelled, no-show), per patient or for everyone. */
public class RecordsPanel extends BasePanel {
    private static final long serialVersionUID = 1L;
    private static final String ALL_PATIENTS = "All Patients";

    private final RecordTableModel model = new RecordTableModel();
    private final JTable table = new JTable(model);
    private final JComboBox<Object> patientFilter = new JComboBox<>();
    private final HintTextField search = new HintTextField("Search records...");
    private final StatCard totalCard = new StatCard("Total Records", "Closed appointments", UITheme.PRIMARY);
    private final StatCard completedCard = new StatCard("Completed Visits", "With findings", UITheme.SUCCESS);
    private final StatCard missedCard = new StatCard("Cancelled / No-Show", "Not charged", UITheme.DANGER);
    private final StatCard feesCard = new StatCard("Total Fees", "From completed visits", UITheme.INFO);
    private boolean updatingFilter;

    public RecordsPanel(ClinicService service) {
        super(service);

        patientFilter.setRenderer(UITheme.<Object>listRenderer(
                o -> o instanceof Patient p ? p.getFullName() + "  (" + p.getId() + ")" : o.toString()));
        patientFilter.setPreferredSize(new Dimension(240, 34));
        patientFilter.addActionListener(e -> {
            if (!updatingFilter) {
                refreshTable();
            }
        });
        search.setPreferredSize(new Dimension(240, 36));
        search.onTextChanged(this::refreshTable);

        RoundedButton details = UITheme.secondaryButton("View Details");
        details.addActionListener(e -> viewDetails());
        RoundedButton export = UITheme.secondaryButton("Export CSV");
        export.addActionListener(e -> exportCsv());
        onDoubleClick(table, this::viewDetails);
        setColumnWidths(table, 72, 165, 0, 0, 0, 115, 90, 0);
        table.getColumnModel().getColumn(7).setPreferredWidth(320);

        JPanel cards = new JPanel(new GridLayout(1, 4, 16, 0));
        cards.setOpaque(false);
        cards.add(totalCard);
        cards.add(completedCard);
        cards.add(missedCard);
        cards.add(feesCard);

        JPanel content = new JPanel(new BorderLayout(0, 16));
        content.setOpaque(false);
        content.add(cards, BorderLayout.NORTH);
        content.add(tableCard(table, toolbar(new JComponent[]{patientFilter, search}, details, export)),
                BorderLayout.CENTER);
        add(content, BorderLayout.CENTER);
    }

    @Override
    public String getTitle() {
        return "Appointment Records";
    }

    @Override
    public String getSubtitle() {
        return "Visit history with findings, cancellations and fees";
    }

    @Override
    public void refreshData() {
        Object current = patientFilter.getSelectedItem();
        updatingFilter = true;
        patientFilter.removeAllItems();
        patientFilter.addItem(ALL_PATIENTS);
        service.getPatients().forEach(patientFilter::addItem);
        patientFilter.setSelectedItem(current != null ? current : ALL_PATIENTS);
        if (patientFilter.getSelectedIndex() < 0) {
            patientFilter.setSelectedIndex(0);
        }
        updatingFilter = false;
        refreshTable();
    }

    /** Called from the Patients page to jump straight to one patient's history. */
    public void selectPatient(Patient patient) {
        refreshData();
        patientFilter.setSelectedItem(patient);
    }

    private void refreshTable() {
        Object filter = patientFilter.getSelectedItem();
        List<Appointment> source = filter instanceof Patient p
                ? service.findAppointments(p)
                : service.getAllAppointments();
        List<Appointment> records = source.stream()
                .filter(a -> !a.isActive())
                .filter(a -> a.matches(search.getText()) || a.getRemarks().toLowerCase()
                        .contains(search.getText().trim().toLowerCase()))
                .collect(Collectors.toCollection(ArrayList::new));
        Collections.reverse(records); // newest first
        model.setItems(records);

        long completed = records.stream().filter(a -> a.getStatus() == AppointmentStatus.COMPLETED).count();
        totalCard.setValue(String.valueOf(records.size()));
        completedCard.setValue(String.valueOf(completed));
        missedCard.setValue(String.valueOf(records.size() - completed));
        feesCard.setValue(UITheme.money(service.computeTotal(records)));
    }

    private void viewDetails() {
        Appointment a = selected(table, model);
        if (a == null) {
            showInfo("Select a record first.");
            return;
        }
        showDetails("Record " + a.getId(), a.getSummary() + "\n\nPatient Profile:  " + a.getPatient().getDetails());
    }

    private void exportCsv() {
        if (model.getRowCount() == 0) {
            showInfo("There are no records to export.");
            return;
        }
        JFileChooser chooser = new JFileChooser();
        chooser.setSelectedFile(new File("appointment-records.csv"));
        chooser.setFileFilter(new FileNameExtensionFilter("CSV files", "csv"));
        if (chooser.showSaveDialog(owner()) != JFileChooser.APPROVE_OPTION) {
            return;
        }
        File file = chooser.getSelectedFile();
        if (!file.getName().toLowerCase().endsWith(".csv")) {
            file = new File(file.getParentFile(), file.getName() + ".csv");
        }
        try (PrintWriter out = new PrintWriter(file, StandardCharsets.UTF_8)) {
            out.println("Appointment ID,Date,Time,Patient ID,Patient,Staff,Role,Type,Reason,Status,Fee (PHP),Remarks");
            for (int i = 0; i < model.getRowCount(); i++) {
                Appointment a = model.getItemAt(i);
                out.println(String.join(",", csv(a.getId()), csv(a.getDate().toString()),
                        csv(a.getTime().toString()), csv(a.getPatient().getId()), csv(a.getPatient().getFullName()),
                        csv(a.getStaff().getDisplayName()), csv(a.getStaff().getRole()), csv(a.getType().getLabel()),
                        csv(a.getReason()), csv(a.getStatus().getLabel()), String.format("%.2f", a.computeFee()),
                        csv(a.getRemarks())));
            }
            showInfo("Exported " + model.getRowCount() + " record(s) to\n" + file.getAbsolutePath());
        } catch (IOException e) {
            showError("Could not export: " + e.getMessage());
        }
    }

    private static String csv(String value) {
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }
}
