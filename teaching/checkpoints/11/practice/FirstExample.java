import zero.contrib.r12345.tutorial_credits_badge.CreditsBadge;

public class FirstExample {
    public static void main(String[] args) {
        CreditsBadge badge = new CreditsBadge("Coin game");
        if (!badge.view().getText().equals("Made with Zero: Coin game")) {
            throw new AssertionError("Show the caller's message.");
        }
    }
}
