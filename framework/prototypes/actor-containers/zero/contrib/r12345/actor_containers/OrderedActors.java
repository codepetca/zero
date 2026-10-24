package zero.contrib.r12345.actor_containers;

import java.util.ArrayList;
import zero.Actor;
import zero.GameApp;

/** An ordinary ordered list; each update takes a small snapshot of membership. */
public final class OrderedActors implements ActorCollection {
    private final ArrayList<Member> members = new ArrayList<>();
    private boolean updating, drawing;

    private static final class Member {
        final Actor actor;
        boolean present = true;
        Member(Actor actor) { this.actor = actor; }
    }

    @Override public void add(Actor actor) {
        requireActor(actor); requireEditable();
        if (!contains(actor)) members.add(new Member(actor));
    }

    @Override public void remove(Actor actor) {
        requireActor(actor); requireEditable();
        for (int i = 0; i < members.size(); i++) {
            Member member = members.get(i);
            if (member.actor == actor) {
                member.present = false;
                members.remove(i);
                return;
            }
        }
    }

    @Override public boolean contains(Actor actor) {
        requireActor(actor);
        for (int i = 0; i < members.size(); i++) if (members.get(i).actor == actor) return true;
        return false;
    }

    @Override public int size() { return members.size(); }

    @Override public Actor get(int index) {
        if (index < 0 || index >= size()) throw new IllegalArgumentException("Actor index must be inside the collection.");
        return members.get(index).actor;
    }

    @Override public void update(double seconds) {
        if (!Double.isFinite(seconds) || seconds < 0) throw new IllegalArgumentException("Collection seconds must be non-negative and finite.");
        if (updating || drawing) throw new IllegalStateException("Collection update must have one explicit owner and cannot run during drawing.");
        Member[] frame = snapshot();
        updating = true;
        try { for (Member member : frame) if (member.present) member.actor.update(seconds); }
        finally { updating = false; }
    }

    @Override public void draw(GameApp app) {
        if (app == null) throw new IllegalArgumentException("Collection drawing needs a game app.");
        if (drawing) throw new IllegalStateException("Collection drawing must not call itself.");
        Member[] frame = snapshot();
        drawing = true;
        try { for (Member member : frame) app.draw(member.actor); }
        finally { drawing = false; }
    }

    private Member[] snapshot() {
        Member[] frame = new Member[members.size()];
        for (int i = 0; i < frame.length; i++) frame[i] = members.get(i);
        return frame;
    }

    private void requireEditable() {
        if (drawing) throw new IllegalStateException("Actor membership must not change during drawing.");
    }

    private static void requireActor(Actor actor) {
        if (actor == null) throw new IllegalArgumentException("Actor collection members must not be null.");
    }
}
