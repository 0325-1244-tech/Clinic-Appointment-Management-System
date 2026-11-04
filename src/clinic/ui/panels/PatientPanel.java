package clinic.ui.panels;

import clinic.model.Patient;
import clinic.service.ClinicService;
import clinic.ui.UITheme;
import clinic.ui.components.HintTextField;
import clinic.ui.components.RoundedButton;
import clinic.ui.dialogs.AppointmentDialog;
import clinic.ui.dialogs.PatientDialog;
import clinic.ui.table.PatientTableModel;

import javax.swing.JComponent;
import javax.swing.JLabel;
import javax.swing.JTable;
import java.awt.BorderLayout;
import java.util.function.Consumer;

/** Patient registration and records. */
public class PatientPanel extends BasePanel {
    private static final long serialVersionUID = 1L;

    private final PatientTableModel model = new PatientTableModel();
    private final JTable table = new JTable(model);
    private final HintTextField search = new HintTextField("Search by name, ID, contact or address...");
    private final RoundedButton editButton = UITheme.secondaryButton("Edit");
    private final RoundedButton bookButton = UITheme.secondaryButton("Book Appointment");
    private final RoundedButton recordsButton = UITheme.secondaryButton("View Records");
    private final RoundedButton deleteButton = UITheme.dangerButton("Delete");
    private final JLabel countLabel = UITheme.label("", UITheme.SMALL, UITheme.MUTED);

    public PatientPanel(ClinicService service, Consumer<Patient> openRecords) {
        super(service);

        RoundedButton add = UITheme.primaryButton("+  Register Patient");
        add.addActionListener(e -> {
            if (new PatientDialog(owner(), service, null).showDialog()) {
                refreshData();
            }
        });
        addHeaderAction(add);

        editButton.addActionListener(e -> editSelected());
        bookButton.addActionListener(e -> {
            Patient p = selected(table, model);
            if (p != null && new AppointmentDialog(owner(), service, null, p).showDialog()) {
                showInfo("Appointment booked for " + p.getFullName() + ".");
            }
        });
        recordsButton.addActionListener(e -> {
            Patient p = selected(table, model);
            if (p != null) {
                openRecords.accept(p);
            }
        });
        deleteButton.addActionListener(e -> deleteSelected());
        search.onTextChanged(this::refreshData);
        table.getSelectionModel().addListSelectionListener(e -> updateButtons());
        onDoubleClick(table, this::editSelected);
        setColumnWidths(table, 95, 0, 50, 75, 110, 95, 115, 0);

        add(tableCard(table, toolbar(new JComponent[]{search, countLabel},
                editButton, bookButton, recordsButton, deleteButton)), BorderLayout.CENTER);
        updateButtons();
    }

    @Override
    public String getTitle() {
        return "Patients";
    }

    @Override
    public String getSubtitle() {
        return "Register patients and manage their information";
    }

    @Override
    public void refreshData() {
        model.setItems(service.searchPatients(search.getText()));
        countLabel.setText(model.getRowCount() + " patient(s)");
        updateButtons();
    }

    private void updateButtons() {
        boolean hasSelection = table.getSelectedRow() >= 0;
        editButton.setEnabled(hasSelection);
        bookButton.setEnabled(hasSelection);
        recordsButton.setEnabled(hasSelection);
        deleteButton.setEnabled(hasSelection);
    }

    private void editSelected() {
        Patient p = selected(table, model);
        if (p != null && new PatientDialog(owner(), service, p).showDialog()) {
            refreshData();
        }
    }

    private void deleteSelected() {
        Patient p = selected(table, model);
        if (p == null || !confirm("Delete patient " + p.getFullName() + " (" + p.getId() + ")?")) {
            return;
        }
        if (attempt(() -> service.removePatient(p))) {
            refreshData();
        }
    }
}
