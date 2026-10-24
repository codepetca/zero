import zero.contrib.r12345.tutorial_credits_badge.CreditsBadge;

public class LibraryCheck {
    public static void main(String[] args) {
        CreditsBadge first = new CreditsBadge("Coin game");
        CreditsBadge second = new CreditsBadge("Study quiz");
        if (!first.text().equals("Made with Zero: Coin game")
                || !second.text().equals("Made with Zero: Study quiz")) {
            throw new AssertionError("Badges must retain their own messages.");
        }
        if (!first.view().getText().equals(first.text())
                || first.view() == first.view()) {
            throw new AssertionError("Each mount needs its own correctly labelled view.");
        }
        try {
            new CreditsBadge(null);
            throw new AssertionError("A null message must be rejected.");
        } catch (IllegalArgumentException expected) {
            if (!expected.getMessage().contains("message")) {
                throw new AssertionError("Explain which argument is invalid.");
            }
        }
    }
}
