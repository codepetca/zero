package zero;

/** One owner's explicitly advanced clock; frame() observes without advancing. */
public interface AnimationPlayback {
    public void update(double seconds);
    public ImageRegion frame();
}
