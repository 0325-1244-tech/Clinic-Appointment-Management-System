package clinic.ui.table;

import javax.swing.table.AbstractTableModel;
import java.util.ArrayList;
import java.util.List;

/**
 * ABSTRACTION: a reusable table model for any list of objects. Subclasses only
 * say which columns exist and what each cell shows. Row handling is written once here.
 *
 * @param <T> the type of object shown in each row
 */
public abstract class EntityTableModel<T> extends AbstractTableModel {
    private static final long serialVersionUID = 1L;

    private final List<T> items = new ArrayList<>();

    protected abstract String[] getColumnNames();

    protected abstract Object getColumnValue(T item, int column);

    public void setItems(List<T> newItems) {
        items.clear();
        items.addAll(newItems);
        fireTableDataChanged();
    }

    public T getItemAt(int row) {
        return row >= 0 && row < items.size() ? items.get(row) : null;
    }

    @Override
    public int getRowCount() {
        return items.size();
    }

    @Override
    public int getColumnCount() {
        return getColumnNames().length;
    }

    @Override
    public String getColumnName(int column) {
        return getColumnNames()[column];
    }

    @Override
    public Object getValueAt(int row, int column) {
        return getColumnValue(items.get(row), column);
    }

    @Override
    public boolean isCellEditable(int row, int column) {
        return false;
    }
}
