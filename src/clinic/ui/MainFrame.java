package clinic.ui;

import clinic.model.Patient;
import clinic.service.ClinicService;
import clinic.ui.components.NavButton;
import clinic.ui.panels.AppointmentPanel;
import clinic.ui.panels.BasePanel;
import clinic.ui.panels.DashboardPanel;
import clinic.ui.panels.PatientPanel;
import clinic.ui.panels.RecordsPanel;
import clinic.ui.panels.StaffPanel;

import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JPanel;
import java.awt.BorderLayout;
import java.awt.CardLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.Font;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The main window: a sidebar for navigation and one page shown at a time. */
public class MainFrame extends JFrame {
    private static final long serialVersionUID = 1L;

    private final CardLayout cards = new CardLayout();
    private final JPanel pageArea = new JPanel(cards);
    private final Map<BasePanel, NavButton> navigation = new LinkedHashMap<>();
    private final RecordsPanel recordsPanel;

    public MainFrame(ClinicService service) {
        super("CareConnect - Clinic Appointment Management System");
        setDefaultCloseOperation(EXIT_ON_CLOSE);
        setMinimumSize(new Dimension(1200, 720));
        setSize(1380, 840);
        setLocationRelativeTo(null);

        recordsPanel = new RecordsPanel(service);

        // POLYMORPHISM: different page classes stored as their common parent type.
        List<BasePanel> pages = List.of(
                new DashboardPanel(service),
                new PatientPanel(service, this::openRecordsFor),
                new StaffPanel(service),
                new AppointmentPanel(service),
                recordsPanel);

        JPanel sidebar = buildSidebar();
        for (BasePanel page : pages) {
            NavButton button = new NavButton(page.getTitle());
            button.setAlignmentX(Component.LEFT_ALIGNMENT);
            button.addActionListener(e -> showPage(page));
            navigation.put(page, button);
            sidebar.add(button);
            sidebar.add(Box.createVerticalStrut(4));
            pageArea.add(page, page.getTitle());
        }
        sidebar.add(Box.createVerticalGlue());
        JLabel footer = UITheme.label("<html>BSIT - Object-Oriented<br>Programming Final Project</html>",
                UITheme.SMALL, new Color(0x94A3B8));
        footer.setBorder(BorderFactory.createEmptyBorder(0, 24, 0, 0));
        footer.setAlignmentX(Component.LEFT_ALIGNMENT);
        sidebar.add(footer);

        JPanel root = new JPanel(new BorderLayout());
        root.add(sidebar, BorderLayout.WEST);
        root.add(pageArea, BorderLayout.CENTER);
        setContentPane(root);

        showPage(pages.get(0));
    }

    private JPanel buildSidebar() {
        JPanel sidebar = new JPanel();
        sidebar.setLayout(new BoxLayout(sidebar, BoxLayout.Y_AXIS));
        sidebar.setBackground(UITheme.SIDEBAR);
        sidebar.setPreferredSize(new Dimension(230, 0));
        sidebar.setBorder(BorderFactory.createEmptyBorder(26, 0, 20, 0));

        JLabel logo = UITheme.label("+ CareConnect", new Font("Segoe UI", Font.BOLD, 21), Color.WHITE);
        logo.setBorder(BorderFactory.createEmptyBorder(0, 22, 2, 0));
        logo.setAlignmentX(Component.LEFT_ALIGNMENT);
        JLabel tagline = UITheme.label("Clinic Appointment System", UITheme.SMALL, UITheme.ACCENT);
        tagline.setBorder(BorderFactory.createEmptyBorder(0, 24, 28, 0));
        tagline.setAlignmentX(Component.LEFT_ALIGNMENT);
        sidebar.add(logo);
        sidebar.add(tagline);
        return sidebar;
    }

    private void showPage(BasePanel page) {
        page.refreshData(); // runs the overridden version for this page
        cards.show(pageArea, page.getTitle());
        navigation.forEach((p, button) -> button.setActive(p == page));
    }

    private void openRecordsFor(Patient patient) {
        showPage(recordsPanel);
        recordsPanel.selectPatient(patient);
    }
}
