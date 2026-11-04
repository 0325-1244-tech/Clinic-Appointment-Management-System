package clinic.model;

/**
 * Contract for objects that can be filtered by a search keyword.
 * Each class decides for itself which fields are searchable (POLYMORPHISM).
 */
public interface Searchable {
    boolean matches(String keyword);
}
