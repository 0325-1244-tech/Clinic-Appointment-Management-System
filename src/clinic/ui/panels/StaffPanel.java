package clinic.ui.panels;

import clinic.model.MedicalStaff;
import clinic.model.StaffFactory;
import clinic.service.ClinicService;
import clinic.ui.UITheme;
import clinic.ui.components.HintTextField;
import clinic.ui.components.RoundedButton;
import clinic.ui.dialogs.StaffDialog;
import clinic.ui.table.StaffTableModel;

import javax.swing.BorderFactory;
import javax.swing.JComboBox;
import javax.swing.JComponent;
import javax.swing.JLabel;
import javax.swing.JTable;
import java.awt.BorderLayout;
import java.util.List;
import java.util.stream.Collectors;

/** Medical personnel: doctors, dentists and nurses. */
public class StaffPanel extends BasePanel {
    private static final long serialVersionUID = 1L;
    private static final String ALL_ROLES = "All Roles";

    private final StaffTableModel model = new StaffTableModel();
    private final JTable table = new JTable(model);
    private final HintTextField search = new HintTextField("Search by name, ID, role or specialization...");
    private final JComboBox<String> roleFilter = new JComboBox<>();
    private final RoundedButton editButton = UITheme.secondaryButton("Edit");
    private final RoundedButton toggleButton = UITheme.secondaryButton("Deactivate");
    private final RoundedButton removeButton = UITheme.dangerButton("Remove");
    private final JLabel detailsLabel = UITheme.label(" ", UITheme.BASE, UITheme.MUTED);

    public StaffPanel(ClinicService service) {
        super(service);

        RoundedButton add = UITheme.primaryButton("+  Add Medical Staff");
        add.addActionListener(e -> {
            if (new StaffDialog(owner(), service, null).showDialog()) {
                refreshData();
            }
        });
        addHeaderAction(add);

        roleFilter.addItem(ALL_ROLES);
        for (String role : StaffFactory.ROLES) {
            roleFilter.addItem(role);
        }
        roleFilter.addActionListener(e -> refreshData());
        search.onTextChanged(this::refreshData);

        editButton.addActionListener(e -> editSelected());
        toggleButton.addActionListener(e -> toggleSelected());
        removeButton.addActionListener(e -> removeSelected());
        table.getSelectionModel().addListSelectionListener(e -> updateSelection());
        onDoubleClick(table, this::editSelected);
        setColumnWidths(table, 72, 0, 75, 0, 90, 65, 0, 165, 80);

        detailsLabel.setBorder(BorderFactory.createEmptyBorder(10, 2, 0, 0));
        add(tableCard(table, toolbar(new JComponent[]{search, roleFilter},
                editButton, toggleButton, removeButton)), BorderLayout.CENTER);
        add(detailsLabel, BorderLayout.SOUTH);
        updateSelection();
    }

    @Override
    public String getTitle() {
        return "Medical Staff";
    }

    @Override
    public String getSubtitle() {
        return "Doctors, dentists and nurses with their schedules and fees";
    }

    @Override
    public void refreshData() {
        String role = (String) roleFilter.getSelectedItem();
        List<MedicalStaff> list = service.searchStaff(search.getText()).stream()
                .filter(s -> ALL_ROLES.equals(role) || s.getRole().equals(role))
                .collect(Collectors.toList());
        model.setItems(list);
        updateSelection();
    }

    private void updateSelection() {
        MedicalStaff s = selected(table, model);
        editButton.setEnabled(s != null);
        toggleButton.setEnabled(s != null);
        removeButton.setEnabled(s != null);
        toggleButton.setText(s != null && !s.isActive() ? "Activate" : "Deactivate");
        // getDetails() is overridden, so the same call describes any type of staff.
        detailsLabel.setText(s == null ? "Select a staff member to see details." : s.getDetails());
    }

    private void editSelected() {
        MedicalStaff s = selected(table, model);
        if (s != null && new StaffDialog(owner(), service, s).showDialog()) {
            refreshData();
        }
    }

    private void toggleSelected() {
        MedicalStaff s = selected(table, model);
        if (s == null) {
            return;
        }
        boolean activate = !s.isActive();
        String verb = activate ? "Activate" : "Deactivate";
        if (confirm(verb + " " + s.getDisplayName() + "?") && attempt(() -> service.setStaffActive(s, activate))) {
            refreshData();
        }
    }

    private void removeSelected() {
        MedicalStaff s = selected(table, model);
        if (s != null && confirm("Remove " + s.getDisplayName() + " permanently?")
                && attempt(() -> service.removeStaff(s))) {
            refreshData();
        }
    }
}
