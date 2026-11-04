package clinic.ui.panels;

import clinic.service.ClinicService;
import clinic.service.ValidationException;
import clinic.ui.UITheme;
import clinic.ui.components.RoundedPanel;
import clinic.ui.table.EntityTableModel;

import javax.swing.BorderFactory;
import javax.swing.JComponent;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.JTextArea;
import javax.swing.SwingUtilities;
import javax.swing.table.TableColumn;
import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.Font;
import java.awt.GridLayout;
import java.awt.Window;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.io.UncheckedIOException;

/**
 * ABSTRACTION: the template for every page of the application. It provides
 * the page header and shared helpers. Each page must supply its own title,
 * subtitle and refreshData().
 *
 * POLYMORPHISM: MainFrame keeps all pages in a List of BasePanel and calls
 * refreshData() on whichever page is opened. The correct version runs
 * automatically.
 */
public abstract class BasePanel extends JPanel {
    private static final long serialVersionUID = 1L;

    protected final ClinicService service;
    private final JPanel headerActions = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));

    /** A service call that may fail with a business-rule error. */
    protected interface ServiceCall {
        void run() throws ValidationException;
    }

    protected BasePanel(ClinicService service) {
        super(new BorderLayout(0, 18));
        this.service = service;
        setBackground(UITheme.BACKGROUND);
        setBorder(BorderFactory.createEmptyBorder(24, 28, 24, 28));

        JPanel titles = new JPanel(new GridLayout(2, 1, 0, 2));
        titles.setOpaque(false);
        titles.add(UITheme.label(getTitle(), UITheme.TITLE, UITheme.TEXT));
        titles.add(UITheme.label(getSubtitle(), UITheme.BASE, UITheme.MUTED));

        JPanel header = new JPanel(new BorderLayout());
        header.setOpaque(false);
        header.add(titles, BorderLayout.WEST);
        headerActions.setOpaque(false);
        header.add(headerActions, BorderLayout.EAST);
        add(header, BorderLayout.NORTH);
    }

    public abstract String getTitle();

    public abstract String getSubtitle();

    /** Reloads the page from the service. Called every time the page is shown. */
    public abstract void refreshData();

    // ---- Helpers shared by all pages (inherited by every subclass) ----

    protected void addHeaderAction(JComponent component) {
        headerActions.add(component);
    }

    protected Window owner() {
        return SwingUtilities.getWindowAncestor(this);
    }

    /** Runs a service call and shows any error as a friendly message. Returns true if it succeeded. */
    protected boolean attempt(ServiceCall call) {
        try {
            call.run();
            return true;
        } catch (ValidationException | IllegalArgumentException | IllegalStateException | UncheckedIOException e) {
            showError(e.getMessage());
            return false;
        }
    }

    protected void showError(String message) {
        JOptionPane.showMessageDialog(owner(), message, "Unable to continue", JOptionPane.WARNING_MESSAGE);
    }

    protected void showInfo(String message) {
        JOptionPane.showMessageDialog(owner(), message, "CareConnect", JOptionPane.INFORMATION_MESSAGE);
    }

    protected boolean confirm(String message) {
        return JOptionPane.showConfirmDialog(owner(), message, "Please confirm",
                JOptionPane.YES_NO_OPTION, JOptionPane.QUESTION_MESSAGE) == JOptionPane.YES_OPTION;
    }

    /** Asks for multi-line text. Returns null if the user cancels. */
    protected String promptText(String title, String message) {
        JTextArea area = new JTextArea(5, 36);
        area.setLineWrap(true);
        area.setWrapStyleWord(true);
        area.setFont(UITheme.BASE);
        JPanel panel = new JPanel(new BorderLayout(0, 8));
        panel.add(UITheme.label(message, UITheme.BASE, UITheme.TEXT), BorderLayout.NORTH);
        panel.add(new JScrollPane(area), BorderLayout.CENTER);
        int choice = JOptionPane.showConfirmDialog(owner(), panel, title,
                JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
        return choice == JOptionPane.OK_OPTION ? area.getText() : null;
    }

    protected void showDetails(String title, String text) {
        JTextArea area = new JTextArea(text);
        area.setEditable(false);
        area.setFont(new Font("Consolas", Font.PLAIN, 13));
        area.setLineWrap(true);
        area.setWrapStyleWord(true);
        area.setBorder(BorderFactory.createEmptyBorder(8, 8, 8, 8));
        JScrollPane scroll = new JScrollPane(area);
        scroll.setPreferredSize(new Dimension(560, 280));
        JOptionPane.showMessageDialog(owner(), scroll, title, JOptionPane.PLAIN_MESSAGE);
    }

    /** A row with components on the left (search, filters) and buttons on the right. */
    protected JPanel toolbar(JComponent[] left, JComponent... right) {
        JPanel leftPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        leftPanel.setOpaque(false);
        for (JComponent c : left) {
            leftPanel.add(c);
        }
        JPanel rightPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        rightPanel.setOpaque(false);
        for (JComponent c : right) {
            rightPanel.add(c);
        }
        JPanel bar = new JPanel(new BorderLayout());
        bar.setOpaque(false);
        bar.setBorder(BorderFactory.createEmptyBorder(0, 0, 12, 0));
        bar.add(leftPanel, BorderLayout.WEST);
        bar.add(rightPanel, BorderLayout.EAST);
        return bar;
    }

    /** Wraps a table in a white rounded card. */
    protected RoundedPanel tableCard(JTable table, JComponent top) {
        UITheme.styleTable(table);
        JScrollPane scroll = new JScrollPane(table);
        scroll.setBorder(BorderFactory.createLineBorder(UITheme.BORDER));
        scroll.getViewport().setBackground(UITheme.CARD);
        RoundedPanel card = new RoundedPanel(new BorderLayout());
        if (top != null) {
            card.add(top, BorderLayout.NORTH);
        }
        card.add(scroll, BorderLayout.CENTER);
        return card;
    }

    /** Sets column widths in pixels. A width of 0 lets that column stretch to fill the remaining space. */
    protected static void setColumnWidths(JTable table, int... widths) {
        for (int i = 0; i < widths.length && i < table.getColumnCount(); i++) {
            if (widths[i] > 0) {
                TableColumn column = table.getColumnModel().getColumn(i);
                column.setMinWidth(widths[i]);
                column.setPreferredWidth(widths[i]);
                column.setMaxWidth(widths[i] + 60);
            }
        }
    }

    protected static void onDoubleClick(JTable table, Runnable action) {
        table.addMouseListener(new MouseAdapter() {
            @Override
            public void mouseClicked(MouseEvent e) {
                if (e.getClickCount() == 2 && table.getSelectedRow() >= 0) {
                    action.run();
                }
            }
        });
    }

    protected static <T> T selected(JTable table, EntityTableModel<T> model) {
        int row = table.getSelectedRow();
        return row < 0 ? null : model.getItemAt(table.convertRowIndexToModel(row));
    }
}
