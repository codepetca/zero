package evidence;

import java.util.ArrayList;

/** Maintainer-only assertions. The callback executes before either event exists. */
public final class ApiProof {
    public interface Invocation { String run(); }
    private static final ArrayList<String> seen = new ArrayList<>();
    private static String log = "";
    private ApiProof() { }

    public static void equal(String signature, String assertion, String postcondition,
            Invocation invocation, String expected) {
        String key = signature + "|" + assertion;
        for (int i = 0; i < seen.size(); i++) if (seen.get(i).equals(key)) {
            throw new IllegalStateException("Duplicate API assertion: " + assertion);
        }
        seen.add(key);
        String actual = invocation.run();
        log += "I|" + signature + "|" + assertion + "\n";
        if (!expected.equals(actual)) throw new IllegalStateException("API assertion failed: "
                + assertion + "; expected " + expected + ", observed " + actual);
        log += "A|" + signature + "|" + assertion + "|" + postcondition + "|" + actual + "\n";
    }

    public static String events() { return "ZERO_API_EVIDENCE_V1\n" + log + "END_ZERO_API_EVIDENCE"; }
}
