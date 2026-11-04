package clinic.ui.dialogs;

import clinic.service.ValidationException;
import clinic.ui.UITheme;
import clinic.ui.components.RoundedButton;

import javax.swing.BorderFactory;
import javax.swing.JComponent;
import javax.swing.JDialog;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JTextField;
import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Insets;
import java.awt.Window;
import java.io.UncheckedIOException;

/**
 * ABSTRACTION + TEMPLATE METHOD: every form dialog shares the same layout,
 * Save/Cancel buttons and error handling. Subclasses only add their fields
 * and implement {@link #onSave()}.
 */
public abstract class FormDialog extends JDialog {
    private static final long serialVersionUID = 1L;

    private final JPanel form = new JPanel(new GridBagLayout());
    private int row;
    private boolean saved;

    protected FormDialog(Window owner, String title) {
        super(owner, title, ModalityType.APPLICATION_MODAL);
        setDefaultCloseOperation(DISPOSE_ON_CLOSE);

        JPanel root = new JPanel(new BorderLayout(0, 14));
        root.setBackground(UITheme.CARD);
        root.setBorder(BorderFactory.createEmptyBorder(20, 24, 18, 24));

        root.add(UITheme.label(title, UITheme.SECTION, UITheme.TEXT), BorderLayout.NORTH);
        form.setOpaque(false);
        root.add(form, BorderLayout.CENTER);

        RoundedButton cancel = UITheme.secondaryButton("Cancel");
        RoundedButton save = UITheme.primaryButton(getSaveLabel());
        cancel.addActionListener(e -> dispose());
        save.addActionListener(e -> handleSave());
        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        buttons.setOpaque(false);
        buttons.add(cancel);
        buttons.add(save);
        root.add(buttons, BorderLayout.SOUTH);

        setContentPane(root);
        getRootPane().setDefaultButton(save);
    }

    /** Subclasses validate their input and save it. Throwing an exception keeps the dialog open. */
    protected abstract void onSave() throws ValidationException;

    protected String getSaveLabel() {
        return "Save";
    }

    protected void addField(String label, JComponent field) {
        GridBagConstraints c = new GridBagConstraints();
        c.gridy = row++;
        c.insets = new Insets(5, 0, 5, 14);
        c.anchor = GridBagConstraints.WEST;
        c.gridx = 0;
        JLabel jLabel = UITheme.label(label, UITheme.BOLD, UITheme.MUTED);
        form.add(jLabel, c);

        c.gridx = 1;
        c.weightx = 1;
        c.fill = GridBagConstraints.HORIZONTAL;
        c.insets = new Insets(5, 0, 5, 0);
        if (field instanceof JTextField) {
            field.setPreferredSize(new Dimension(340, 32));
        }
        form.add(field, c);
    }

    /** Opens the dialog and blocks until it closes. Returns true if the user saved. */
    public boolean showDialog() {
        pack();
        setMinimumSize(getSize());
        setLocationRelativeTo(getOwner());
        setVisible(true);
        return saved;
    }

    private void handleSave() {
        try {
            onSave();
            saved = true;
            dispose();
        } catch (ValidationException | IllegalArgumentException | IllegalStateException | UncheckedIOException ex) {
            JOptionPane.showMessageDialog(this, ex.getMessage(), "Please check your input",
                    JOptionPane.WARNING_MESSAGE);
        }
    }

    protected static JTextField textField(String value) {
        JTextField field = new JTextField(value == null ? "" : value);
        field.setFont(UITheme.BASE);
        return field;
    }
}
