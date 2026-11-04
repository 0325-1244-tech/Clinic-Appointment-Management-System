package clinic.ui.table;

import clinic.model.AppointmentStatus;
import clinic.ui.UITheme;

import javax.swing.BorderFactory;
import javax.swing.JTable;
import javax.swing.table.DefaultTableCellRenderer;
import java.awt.Component;

/** Striped rows with padding. Appointment statuses are drawn in their own colour. */
public class StyledCellRenderer extends DefaultTableCellRenderer {
    private static final long serialVersionUID = 1L;

    @Override
    public Component getTableCellRendererComponent(JTable table, Object value, boolean selected,
                                                   boolean focus, int row, int column) {
        super.getTableCellRendererComponent(table, value, selected, false, row, column);
        setBorder(BorderFactory.createEmptyBorder(0, 10, 0, 10));
        setFont(UITheme.BASE);
        setForeground(UITheme.TEXT);
        if (!selected) {
            setBackground(row % 2 == 0 ? UITheme.CARD : UITheme.STRIPE);
        }
        if (value instanceof AppointmentStatus status) {
            setText("● " + status.getLabel());
            setForeground(UITheme.statusColor(status));
            setFont(UITheme.BOLD);
        } else if ("Inactive".equals(value)) {
            setForeground(UITheme.MUTED);
        } else if ("Active".equals(value)) {
            setForeground(UITheme.SUCCESS);
            setFont(UITheme.BOLD);
        }
        setToolTipText(value == null ? null : getText());
        return this;
    }
}
