import zero.ui.Label;

/** Tutorial practice: copies are expected, not original community utilities. */
public class CreditsBadge {
    private final String message;

    public CreditsBadge(String message) {
        if (message == null) {
            throw new IllegalArgumentException("Badge message must not be null.");
        }
        this.message = message;
    }

    public String text() {
        return "Made with Zero: " + message;
    }

    public Label view() {
        return new Label(text());
    }
}
