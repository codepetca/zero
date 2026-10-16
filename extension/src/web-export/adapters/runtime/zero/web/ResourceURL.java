package zero.web;
/** Browser-compatible result of a class-literal getResource lookup. */
public final class ResourceURL {
    private final String url;
    ResourceURL(String url) { this.url = url; }
    public String toExternalForm() { return url; }
    @Override public String toString() { return url; }
}
