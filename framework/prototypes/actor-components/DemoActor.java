import zero.Actor;
import zero.Color;
import zero.ImageRegion;

/** Draw locally around 0,0; Main still owns every update. */
public final class DemoActor extends Actor {
    private boolean procedural;

    public DemoActor(ImageRegion image, double x, double y) { super(image, x, y); }

    void procedural(boolean value) { procedural = value; }

    @Override public void draw() {
        if (procedural) {
            fill(Color.GOLD);
            circle(0, 0, width());
            fill(Color.BLACK);
            rect(width() / 4, -height() / 10, width() / 4, height() / 5);
        } else {
            super.draw();
        }
    }
}
