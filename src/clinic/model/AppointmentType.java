package clinic.model;

/** Kinds of visit. Each one scales the staff's base fee by its own multiplier. */
public enum AppointmentType {
    CONSULTATION("Consultation", 1.00),
    FOLLOW_UP("Follow-up", 0.60),
    CHECK_UP("General Check-up", 0.80),
    EMERGENCY("Emergency", 1.50);

    private final String label;
    private final double feeMultiplier;

    AppointmentType(String label, double feeMultiplier) {
        this.label = label;
        this.feeMultiplier = feeMultiplier;
    }

    public String getLabel() {
        return label;
    }

    public double getFeeMultiplier() {
        return feeMultiplier;
    }

    @Override
    public String toString() {
        return label;
    }
}
