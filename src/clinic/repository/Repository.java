package clinic.repository;

import clinic.model.Identifiable;

import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;

/**
 * ABSTRACTION: a generic storage contract. The service layer depends on this
 * interface only, so the storage implementation can be swapped (in-memory,
 * file, database) without touching business logic.
 *
 * @param <T> any entity that has an ID
 */
public interface Repository<T extends Identifiable> {

    /** Returns the ID the next added item should use (e.g. "P-0007"). */
    String nextId();

    void add(T item);

    boolean remove(String id);

    Optional<T> findById(String id);

    List<T> findAll();

    List<T> findWhere(Predicate<T> condition);

    int count();
}
