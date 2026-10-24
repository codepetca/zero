package zero.contrib.r12345.actor_containers;

import zero.Actor;
import zero.GameApp;

/** Alternative: replace the membership array on edits, then borrow it for visits. */
public final class SnapshotActors implements ActorCollection {
    private Member[] members = new Member[0];
    private boolean updating, drawing;

    private static final class Member {
        final Actor actor;
        boolean present = true;
        Member(Actor actor) { this.actor = actor; }
    }

    @Override public void add(Actor actor) {
        requireActor(actor); requireEditable();
        if (contains(actor)) return;
        Member[] next = new Member[members.length + 1];
        for (int i = 0; i < members.length; i++) next[i] = members[i];
        next[members.length] = new Member(actor);
        members = next;
    }

    @Override public void remove(Actor actor) {
        requireActor(actor); requireEditable();
        for (int index = 0; index < members.length; index++) {
            if (members[index].actor != actor) continue;
            Member[] next = new Member[members.length - 1];
            for (int i = 0; i < index; i++) next[i] = members[i];
            for (int i = index + 1; i < members.length; i++) next[i - 1] = members[i];
            members[index].present = false;
            members = next;
            return;
        }
    }

    @Override public boolean contains(Actor actor) {
        requireActor(actor);
        for (Member member : members) if (member.actor == actor) return true;
        return false;
    }

    @Override public int size() { return members.length; }

    @Override public Actor get(int index) {
        if (index < 0 || index >= size()) throw new IllegalArgumentException("Actor index must be inside the collection.");
        return members[index].actor;
    }

    @Override public void update(double seconds) {
        if (!Double.isFinite(seconds) || seconds < 0) throw new IllegalArgumentException("Collection seconds must be non-negative and finite.");
        if (updating || drawing) throw new IllegalStateException("Collection update must have one explicit owner and cannot run during drawing.");
        Member[] frame = members;
        updating = true;
        try { for (Member member : frame) if (member.present) member.actor.update(seconds); }
        finally { updating = false; }
    }

    @Override public void draw(GameApp app) {
        if (app == null) throw new IllegalArgumentException("Collection drawing needs a game app.");
        if (drawing) throw new IllegalStateException("Collection drawing must not call itself.");
        Member[] frame = members;
        drawing = true;
        try { for (Member member : frame) app.draw(member.actor); }
        finally { drawing = false; }
    }

    private void requireEditable() {
        if (drawing) throw new IllegalStateException("Actor membership must not change during drawing.");
    }

    private static void requireActor(Actor actor) {
        if (actor == null) throw new IllegalArgumentException("Actor collection members must not be null.");
    }
}
