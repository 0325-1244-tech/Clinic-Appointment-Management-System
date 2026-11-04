package clinic.model;

/**
 * ABSTRACTION through an interface: anything that produces a charge.
 * Callers only know "it has a fee" and never how the fee is computed.
 */
public interface Billable {
    double computeFee();
}
