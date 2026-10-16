package zero;

/** Ordinary geometry predicates. Touching edges count as a hit. */
public final class Collisions {
    private Collisions() { }

    public static boolean circleHitsRect(double cx, double cy, double radius,
            double x, double y, double width, double height) {
        coordinate(cx, "Circle x"); coordinate(cy, "Circle y"); dimension(radius, "Radius");
        rectangle(x, y, width, height);
        // Subtract first, so finite rectangles near Double.MAX_VALUE need no overflowing right edge.
        double dx = distanceToInterval(cx, x, width), dy = distanceToInterval(cy, y, height);
        return Math.hypot(dx, dy) <= radius;
    }
    public static boolean rectHitsRect(double x1, double y1, double width1, double height1,
            double x2, double y2, double width2, double height2) {
        rectangle(x1, y1, width1, height1); rectangle(x2, y2, width2, height2);
        return overlaps(x1, width1, x2, width2) && overlaps(y1, height1, y2, height2);
    }
    public static boolean circleHitsCircle(double x1, double y1, double radius1,
            double x2, double y2, double radius2) {
        coordinate(x1, "Circle x"); coordinate(y1, "Circle y"); dimension(radius1, "Radius");
        coordinate(x2, "Circle x"); coordinate(y2, "Circle y"); dimension(radius2, "Radius");
        double distance = Math.hypot(x1 - x2, y1 - y2), radii = radius1 + radius2;
        if (Double.isFinite(distance) && Double.isFinite(radii)) return distance <= radii;
        // Scaling avoids overflow both in coordinate differences and in the radius sum.
        double scale = Math.max(Math.max(Math.abs(x1), Math.abs(y1)),
                Math.max(Math.max(Math.abs(x2), Math.abs(y2)), Math.max(radius1, radius2)));
        if (scale == 0) return true;
        return Math.hypot(x1 / scale - x2 / scale, y1 / scale - y2 / scale)
                <= radius1 / scale + radius2 / scale;
    }
    private static double distanceToInterval(double value, double start, double length) {
        if (value < start) return start - value;
        double offset = value - start;
        if (!Double.isFinite(offset)) return Math.max(0, (value - length) - start);
        return Math.max(0, offset - length);
    }
    private static boolean overlaps(double start1, double length1, double start2, double length2) {
        return start1 <= start2 ? start2 - start1 <= length1 : start1 - start2 <= length2;
    }
    private static void rectangle(double x, double y, double width, double height) {
        coordinate(x, "Rectangle x"); coordinate(y, "Rectangle y");
        dimension(width, "Width"); dimension(height, "Height");
    }
    private static void coordinate(double value, String name) {
        if (!Double.isFinite(value)) throw new IllegalArgumentException(name + " must be finite.");
    }
    private static void dimension(double value, String name) {
        if (!Double.isFinite(value) || value < 0) throw new IllegalArgumentException(name + " must be non-negative and finite.");
    }
}
