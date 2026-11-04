package clinic.data;

import clinic.model.Appointment;
import clinic.model.MedicalStaff;
import clinic.model.Patient;
import clinic.repository.InMemoryRepository;
import clinic.repository.Repository;

import java.io.Serializable;

/**
 * Holds every repository of the clinic (COMPOSITION). The whole object is
 * saved to and loaded from disk as one unit.
 */
public class ClinicDatabase implements Serializable {
    private static final long serialVersionUID = 1L;

    private final Repository<Patient> patients = new InMemoryRepository<>("P");
    private final Repository<MedicalStaff> staff = new InMemoryRepository<>("S");
    private final Repository<Appointment> appointments = new InMemoryRepository<>("A");

    public Repository<Patient> getPatients() {
        return patients;
    }

    public Repository<MedicalStaff> getStaff() {
        return staff;
    }

    public Repository<Appointment> getAppointments() {
        return appointments;
    }
}
