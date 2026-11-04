package clinic.repository;

import clinic.model.Identifiable;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/**
 * Stores items in a map keyed by ID. Implements the Repository contract.
 * ENCAPSULATION: the map and ID counter are private, and callers only ever
 * receive copies of the list.
 */
public class InMemoryRepository<T extends Identifiable> implements Repository<T>, Serializable {
    private static final long serialVersionUID = 1L;

    private final Map<String, T> items = new LinkedHashMap<>();
    private final String prefix;
    private int counter;

    public InMemoryRepository(String prefix) {
        this.prefix = prefix;
    }

    @Override
    public String nextId() {
        return String.format("%s-%04d", prefix, counter + 1);
    }

    @Override
    public void add(T item) {
        if (item == null) {
            throw new IllegalArgumentException("Cannot add an empty record.");
        }
        if (items.containsKey(item.getId())) {
            throw new IllegalArgumentException("A record with ID " + item.getId() + " already exists.");
        }
        // The counter only moves forward once the generated ID has really been used.
        if (item.getId().equals(nextId())) {
            counter++;
        }
        items.put(item.getId(), item);
    }

    @Override
    public boolean remove(String id) {
        return items.remove(id) != null;
    }

    @Override
    public Optional<T> findById(String id) {
        return Optional.ofNullable(items.get(id));
    }

    @Override
    public List<T> findAll() {
        return new ArrayList<>(items.values());
    }

    @Override
    public List<T> findWhere(Predicate<T> condition) {
        return items.values().stream().filter(condition).collect(Collectors.toList());
    }

    @Override
    public int count() {
        return items.size();
    }
}
