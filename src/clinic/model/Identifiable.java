package clinic.model;

/**
 * Contract for any object that can be stored and looked up by a unique ID.
 * Used by the generic Repository so it can work with any entity type.
 */
public interface Identifiable {
    String getId();
}
