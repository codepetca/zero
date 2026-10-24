import zero.ui.Element;

/** A student-owned presentation contract; the app owns the score and its rules. */
public interface ScoreView {
    Element view();
    void setScore(int points);
}
