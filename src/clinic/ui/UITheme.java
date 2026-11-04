package clinic.ui;

import clinic.model.AppointmentStatus;
import clinic.ui.components.RoundedButton;
import clinic.ui.table.StyledCellRenderer;

import javax.swing.BorderFactory;
import javax.swing.DefaultListCellRenderer;
import javax.swing.JComponent;
import javax.swing.JLabel;
import javax.swing.JList;
import javax.swing.JScrollPane;
import javax.swing.JSpinner;
import javax.swing.JTable;
import javax.swing.ListSelectionModel;
import javax.swing.SpinnerDateModel;
import javax.swing.UIManager;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.JTableHeader;
import java.awt.Color;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.Font;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.function.Function;

/** Central place for colours, fonts, formatters and styled-component factories. */
public final class UITheme {
    public static final Color PRIMARY = new Color(0x0E7490);
    public static final Color SIDEBAR = new Color(0x0B3B4A);
    public static final Color SIDEBAR_HOVER = new Color(0x14566A);
    public static final Color ACCENT = new Color(0x2DD4BF);
    public static final Color BACKGROUND = new Color(0xF1F5F9);
    public static final Color CARD = Color.WHITE;
    public static final Color BORDER = new Color(0xE2E8F0);
    public static final Color TEXT = new Color(0x0F172A);
    public static final Color MUTED = new Color(0x64748B);
    public static final Color SUCCESS = new Color(0x16A34A);
    public static final Color DANGER = new Color(0xDC2626);
    public static final Color WARNING = new Color(0xD97706);
    public static final Color INFO = new Color(0x2563EB);
    public static final Color STRIPE = new Color(0xF8FAFC);
    public static final Color SELECTION = new Color(0xCCFBF1);
    public static final Color HEADER_BG = new Color(0xF1F5F9);

    public static final Font BASE = new Font("Segoe UI", Font.PLAIN, 13);
    public static final Font BOLD = BASE.deriveFont(Font.BOLD);
    public static final Font SMALL = BASE.deriveFont(12f);
    public static final Font TITLE = new Font("Segoe UI", Font.BOLD, 24);
    public static final Font SECTION = new Font("Segoe UI", Font.BOLD, 15);
    public static final Font STAT = new Font("Segoe UI", Font.BOLD, 28);

    public static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("MMM dd, yyyy", Locale.ENGLISH);
    public static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("hh:mm a", Locale.ENGLISH);

    private UITheme() {
    }

    public static void install() {
        try {
            UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
        } catch (Exception ignored) {
            // Fall back to the default look and feel.
        }
        UIManager.put("OptionPane.messageFont", BASE);
        UIManager.put("OptionPane.buttonFont", BASE);
        UIManager.put("Label.font", BASE);
        UIManager.put("TextField.font", BASE);
        UIManager.put("TextArea.font", BASE);
        UIManager.put("ComboBox.font", BASE);
        UIManager.put("CheckBox.font", BASE);
        UIManager.put("Spinner.font", BASE);
        UIManager.put("Button.font", BASE);
    }

    // ---- Formatting ----

    public static String date(LocalDate date) {
        return date == null ? "" : date.format(DATE_FMT);
    }

    public static String time(LocalTime time) {
        return time == null ? "" : time.format(TIME_FMT);
    }

    public static String money(double amount) {
        return String.format("₱ %,.2f", amount);
    }

    public static Color statusColor(AppointmentStatus status) {
        return switch (status) {
            case SCHEDULED -> INFO;
            case COMPLETED -> SUCCESS;
            case CANCELLED -> DANGER;
            case NO_SHOW -> WARNING;
        };
    }

    // ---- Component factories ----

    public static RoundedButton primaryButton(String text) {
        return new RoundedButton(text, PRIMARY, Color.WHITE, null);
    }

    public static RoundedButton secondaryButton(String text) {
        return new RoundedButton(text, Color.WHITE, TEXT, BORDER);
    }

    public static RoundedButton dangerButton(String text) {
        return new RoundedButton(text, DANGER, Color.WHITE, null);
    }

    public static RoundedButton successButton(String text) {
        return new RoundedButton(text, SUCCESS, Color.WHITE, null);
    }

    public static JLabel label(String text, Font font, Color color) {
        JLabel label = new JLabel(text);
        label.setFont(font);
        label.setForeground(color);
        return label;
    }

    public static void styleTable(JTable table) {
        table.setFont(BASE);
        table.setRowHeight(32);
        table.setShowVerticalLines(false);
        table.setShowHorizontalLines(true);
        table.setGridColor(BORDER);
        table.setIntercellSpacing(new Dimension(0, 1));
        table.setSelectionBackground(SELECTION);
        table.setSelectionForeground(TEXT);
        table.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        table.setFillsViewportHeight(true);
        table.setBackground(CARD);
        table.setDefaultRenderer(Object.class, new StyledCellRenderer());

        JTableHeader header = table.getTableHeader();
        header.setReorderingAllowed(false);
        header.setPreferredSize(new Dimension(0, 36));
        header.setDefaultRenderer(new DefaultTableCellRenderer() {
            @Override
            public Component getTableCellRendererComponent(JTable t, Object value, boolean selected,
                                                           boolean focus, int row, int column) {
                super.getTableCellRendererComponent(t, value, false, false, row, column);
                setFont(BOLD);
                setForeground(MUTED);
                setBackground(HEADER_BG);
                setOpaque(true);
                setBorder(BorderFactory.createCompoundBorder(
                        BorderFactory.createMatteBorder(0, 0, 1, 0, BORDER),
                        BorderFactory.createEmptyBorder(0, 10, 0, 10)));
                return this;
            }
        });
    }

    public static JScrollPane scroll(JComponent component) {
        JScrollPane scroll = new JScrollPane(component);
        scroll.setBorder(BorderFactory.createLineBorder(BORDER));
        scroll.getViewport().setBackground(CARD);
        return scroll;
    }

    /** Creates a combo/list renderer that turns each item into text with the given function. */
    @SuppressWarnings("unchecked")
    public static <T> DefaultListCellRenderer listRenderer(Function<T, String> toText) {
        return new DefaultListCellRenderer() {
            @Override
            public Component getListCellRendererComponent(JList<?> list, Object value, int index,
                                                          boolean selected, boolean focus) {
                super.getListCellRendererComponent(list, value, index, selected, focus);
                setText(value == null ? " " : toText.apply((T) value));
                setBorder(BorderFactory.createEmptyBorder(3, 6, 3, 6));
                return this;
            }
        };
    }

    // ---- Dates ----

    public static JSpinner dateSpinner(LocalDate value, LocalDate min, LocalDate max) {
        SpinnerDateModel model = new SpinnerDateModel(toDate(value),
                min == null ? null : toDate(min), max == null ? null : toDate(max), Calendar.DAY_OF_MONTH);
        JSpinner spinner = new JSpinner(model);
        spinner.setEditor(new JSpinner.DateEditor(spinner, "yyyy-MM-dd  (EEE)"));
        spinner.setFont(BASE);
        return spinner;
    }

    public static LocalDate getDate(JSpinner spinner) {
        return ((Date) spinner.getValue()).toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
    }

    private static Date toDate(LocalDate date) {
        return Date.from(date.atStartOfDay(ZoneId.systemDefault()).toInstant());
    }
}
