package zero.contrib.r12345.actor_containers;

import zero.Actor;
import zero.GameApp;

/** Optional student-owned membership; Main remains the only update owner. */
public interface ActorCollection {
    // Identity membership, once, in insertion order. Null actors are rejected.
    void add(Actor actor);
    void remove(Actor actor);
    boolean contains(Actor actor);
    int size();
    Actor get(int index);

    // Snapshot membership at entry. Additions start next update; removals skip
    // later actors immediately, including an actor removed and then readded.
    // Reject invalid time and recursive update before calling any actor.
    void update(double seconds);

    // Observe without updating. Membership edits, recursive drawing and updates
    // during drawing are rejected. A callback failure releases the call guard;
    // earlier student state changes are not rolled back.
    void draw(GameApp app);
}
