/** One ordinary object holds the data for one study question. */
public class Question {
    private final String prompt;
    private final String answer;
    private final String explanation;

    public Question(String prompt, String answer, String explanation) {
        this.prompt = prompt;
        this.answer = answer;
        this.explanation = explanation;
    }

    public String prompt() { return prompt; }

    public boolean accepts(String attempt) {
        return answer.equalsIgnoreCase(attempt.trim());
    }

    public String explanation() { return explanation; }
}
