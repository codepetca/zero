import zero.contrib.r12345.tutorial_credits_badge.CreditsBadge;

public class SecondExample {
    public static void main(String[] args) {
        CreditsBadge badge = new CreditsBadge("Study quiz");
        if (!badge.view().getText().equals("Made with Zero: Study quiz")) {
            throw new AssertionError("Show the caller's message.");
        }
    }
}
