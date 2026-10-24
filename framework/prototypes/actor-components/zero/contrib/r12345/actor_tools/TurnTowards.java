package zero.contrib.r12345.actor_tools;

import zero.Actor;

/** A student-owned behaviour: turn toward a point at a bounded angular speed. */
public final class TurnTowards {
    private TurnTowards() { }

    /** Positive canvas angles turn clockwise; an exact half-turn goes counterclockwise. */
    public static void apply(Actor actor, double targetX, double targetY,
            double degreesPerSecond, double seconds) {
        if (actor == null) throw new IllegalArgumentException("Turning needs an actor.");
        if (!Double.isFinite(targetX) || !Double.isFinite(targetY)) {
            throw new IllegalArgumentException("Turning target coordinates must be finite.");
        }
        if (!Double.isFinite(degreesPerSecond) || degreesPerSecond < 0
                || !Double.isFinite(seconds) || seconds < 0) {
            throw new IllegalArgumentException("Turning speed and seconds must be non-negative finite numbers.");
        }
        double limit = degreesPerSecond * seconds;
        if (!Double.isFinite(limit)) throw new IllegalArgumentException("Turning speed times seconds must be finite.");
        if (limit == 0 || (targetX == actor.x() && targetY == actor.y())) return;

        // Divide before subtracting: opposite finite extremes can overflow.
        // Ignore equal axes when choosing a scale so an unrelated huge coordinate
        // cannot erase a tiny difference on the other axis. Division by two is
        // exact for normal values and keeps the largest possible difference finite.
        double magnitudeX = targetX == actor.x() ? 0 : Math.max(Math.abs(targetX), Math.abs(actor.x()));
        double magnitudeY = targetY == actor.y() ? 0 : Math.max(Math.abs(targetY), Math.abs(actor.y()));
        double scale = Math.max(magnitudeX, magnitudeY) > 1 ? 2 : 1;
        double dx = targetX / scale - actor.x() / scale;
        double dy = targetY / scale - actor.y() / scale;
        double target = Math.atan2(dy, dx) * 180 / Math.PI;
        double difference = (target - actor.rotation() + 540) % 360 - 180;
        double turn = Math.min(Math.abs(difference), limit);
        actor.rotate(difference < 0 ? -turn : turn);
    }
}
