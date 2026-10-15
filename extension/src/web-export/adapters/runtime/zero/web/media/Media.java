package zero.web.media;
public final class Media {
    private final String source;
    private Runnable onError;
    private MediaException error;
    public Media(String source) {
        if (source == null || source.isEmpty()) throw new MediaException("Audio source must not be empty.");
        this.source = source;
    }
    public String getSource() { return source; }
    public MediaException getError() { return error; }
    public void setOnError(Runnable handler) { onError = handler; }
    public Runnable getOnError() { return onError; }
    void failed(MediaException failure) { if (error != null) return; error = failure; if (onError != null) onError.run(); }
}
