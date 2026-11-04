package clinic.service;

/**
 * Custom checked exception for business-rule violations (e.g. double booking).
 * INHERITANCE: extends Java's built-in Exception class.
 */
public class ValidationException extends Exception {
    private static final long serialVersionUID = 1L;

    public ValidationException(String message) {
        super(message);
    }
}
