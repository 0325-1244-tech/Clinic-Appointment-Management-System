package clinic.data;

import java.io.IOException;
import java.io.InputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Saves and loads the ClinicDatabase as a file, so records survive after the
 * program is closed.
 */
public class FileStorage {
    private final Path file;

    public FileStorage(Path file) {
        this.file = file;
    }

    public Path getFile() {
        return file;
    }

    public boolean exists() {
        return Files.exists(file);
    }

    public ClinicDatabase load() throws IOException {
        try (InputStream in = Files.newInputStream(file);
             ObjectInputStream objectIn = new ObjectInputStream(in)) {
            return (ClinicDatabase) objectIn.readObject();
        } catch (ClassNotFoundException | ClassCastException e) {
            throw new IOException("The data file is not a valid clinic data file.", e);
        }
    }

    public void save(ClinicDatabase database) throws IOException {
        Path parent = file.toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        // Write to a temporary file first, so a crash mid-save never corrupts existing data.
        Path temp = file.resolveSibling(file.getFileName() + ".tmp");
        try (OutputStream out = Files.newOutputStream(temp);
             ObjectOutputStream objectOut = new ObjectOutputStream(out)) {
            objectOut.writeObject(database);
        }
        Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
    }
}
