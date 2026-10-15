package zero.web.media;
public final class Media {
    private final String source;
    private Runnable onError;
    public Media(String source) {
        if (source == null || source.isEmpty()) throw new MediaException("Audio source must not be empty.");
        this.source = source;
    }
    public String getSource() { return source; }
    public void setOnError(Runnable handler) { onError = handler; }
    void failed() { if (onError != null) onError.run(); }
}
