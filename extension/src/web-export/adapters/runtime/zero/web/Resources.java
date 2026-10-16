package zero.web;

import dev.webfx.platform.resource.Resource;

/** Classpath names are resolved against the frozen export resource manifest. */
public final class Resources {
    private Resources() { }
    public static ResourceURL get(Class<?> owner, String name) {
        String key = key(owner, name);
        for (String resource : PackagedResources.ALL) {
            if (resource.equals(key)) return new ResourceURL(Resource.toUrl(key, owner));
        }
        return null;
    }
    static String key(Class<?> owner, String name) {
        if (name == null) throw new NullPointerException("Resource name must not be null.");
        if (name.startsWith("/")) return normalize(name);
        String className = owner.getName();
        int dot = className.lastIndexOf('.');
        String parent = dot < 0 ? "" : className.substring(0, dot).replace('.', '/') + "/";
        // Relocation must not change default-package resource lookup semantics.
        if (parent.equals("zero/exported/")) parent = "";
        return normalize("/" + parent + name);
    }
    private static String normalize(String path) {
        java.util.ArrayList<String> parts = new java.util.ArrayList<>();
        for (String part : path.split("/")) {
            if (part.isEmpty() || part.equals(".")) continue;
            if (part.equals("..")) {
                if (parts.isEmpty()) throw new IllegalArgumentException("Resource escapes classpath: " + path);
                parts.remove(parts.size() - 1);
            } else parts.add(part);
        }
        return "/" + String.join("/", parts);
    }
}
