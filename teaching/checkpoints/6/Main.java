import zero.App;

public class Main extends App {
    private StudyQuiz quiz;

    @Override public void settings() {
        padding(20);
    }

    @Override public void setup() {
        quiz = new StudyQuiz();
        show(quiz.view());
    }

    public static void main(String[] args) { launch(args); }
}
