package clinic;

import clinic.data.ClinicDatabase;
import clinic.data.FileStorage;
import clinic.data.SampleDataLoader;
import clinic.service.ClinicService;
import clinic.ui.MainFrame;
import clinic.ui.UITheme;

import javax.swing.JOptionPane;
import javax.swing.SwingUtilities;
import java.io.IOException;
import java.nio.file.Paths;

/** Entry point of the CareConnect Clinic Appointment Management System. */
public class Main {

    public static void main(String[] args) {
        SwingUtilities.invokeLater(Main::start);
    }

    private static void start() {
        UITheme.install();
        FileStorage storage = new FileStorage(Paths.get("data", "clinic-data.ser"));

        ClinicDatabase database;
        if (storage.exists()) {
            try {
                database = storage.load();
            } catch (IOException e) {
                JOptionPane.showMessageDialog(null,
                        "Saved data could not be read (" + e.getMessage() + ").\nThe system will start with sample data.",
                        "CareConnect", JOptionPane.WARNING_MESSAGE);
                database = SampleDataLoader.createSampleDatabase();
            }
        } else {
            database = SampleDataLoader.createSampleDatabase();
        }

        ClinicService service = new ClinicService(database, storage);
        service.saveChanges();
        new MainFrame(service).setVisible(true);
    }
}
