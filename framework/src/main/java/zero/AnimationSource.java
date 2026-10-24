package zero;

/** Shared frame definitions that create an independent mutable clock for each owner. */
public interface AnimationSource {
    public AnimationPlayback createPlayback();
}
