import java.util.ArrayList;

/** The exact same ordinary Java assertions run on the JDK and in WebFX/GWT. */
public final class GameApiChecks {
    public static String verify(double x, double y, String suffix) {
        double infinity = 1.0 / 0.0, nan = 0.0 / 0.0;
        require(Math.hypot(x, y) == 5, "3-4-5 distance");
        require(Double.isFinite(Math.hypot(1e308, 1e308)), "distance overflow");
        require(Math.hypot(1e-300, 1e-300) > 0, "distance underflow");
        require(Math.hypot(infinity, nan) == infinity, "infinite distance");
        require(Math.abs(-x) == x && 1 / Math.abs(-0.0) == infinity, "absolute value and signed zero");
        require(Math.abs(Math.atan2(y, x) - 0.9272952180016122) < 1e-14, "vector angle");
        require(Math.abs(Math.atan2(0, -x) - Math.PI) < 1e-14, "angle quadrant");
        require(1 / Math.atan2(-0.0, x) == -infinity, "angle signed zero");
        require(Math.abs(Math.sin(Math.PI / 2) - 1) < 1e-14
                && Math.abs(Math.cos(Math.PI) + 1) < 1e-14, "radian trigonometry");
        double invalid = Math.sin(nan);
        require(invalid != invalid, "NaN trigonometry");
        ArrayList<String> items = new ArrayList<>();
        require(items.isEmpty(), "empty list");
        items.add("alpha"); items.add("middle"); items.add("alpha"); items.add(null);
        require(items.remove("al" + suffix), "remove equal object");
        require(items.size() == 3 && items.get(0).equals("middle") && items.get(1).equals("alpha"), "remove only first match");
        require(!items.remove("missing") && items.size() == 3, "missing object leaves list unchanged");
        require(items.remove(null) && items.size() == 2, "remove null");
        require(items.remove(0).equals("middle") && items.get(0).equals("alpha"), "index removal stays distinct");
        items.clear(); require(items.isEmpty(), "clear list");
        return "Game API checks ready";
    }
    private static void require(boolean valid, String name) {
        if (!valid) throw new IllegalStateException("Game API check failed: " + name);
    }
}
