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
    public String explanation() { return explanation; }
    public boolean accepts(String response) {
        return answer.equalsIgnoreCase(response.trim());
    }
}
