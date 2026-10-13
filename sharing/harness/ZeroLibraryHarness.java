import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.URL;
import java.nio.file.Path;

/** Maintained runner for explicitly chosen local checks; not an isolation boundary. */
public final class ZeroLibraryHarness {
    private ZeroLibraryHarness() { }

    public static void main(String[] args) throws Exception {
        if (args.length < 4) throw new IllegalArgumentException("Expected JAR, library kind, library classes and check/example main classes.");
        Path jar = Path.of(args[0]).toRealPath();
        boolean widgetView = false;
        for (String name : args[2].split(",")) {
            Class<?> type = Class.forName(name, false, ZeroLibraryHarness.class.getClassLoader());
            URL origin = type.getProtectionDomain().getCodeSource().getLocation();
            if (!Path.of(origin.toURI()).toRealPath().equals(jar)) {
                throw new AssertionError(name + " loaded from source/classes instead of the actual library JAR: " + origin);
            }
            if (args[1].equals("widget")) {
                for (Method method : type.getMethods()) {
                    if (method.getName().equals("view") && method.getParameterCount() == 0
                            && !java.lang.reflect.Modifier.isStatic(method.getModifiers())
                            && javafx.scene.Node.class.isAssignableFrom(method.getReturnType())) widgetView = true;
                }
            }
        }
        if (args[1].equals("widget") && !widgetView) throw new AssertionError("A widget must expose a public Node view() method.");
        for (int i = 3; i < args.length; i++) {
            try {
                Method main = Class.forName(args[i]).getMethod("main", String[].class);
                if (!java.lang.reflect.Modifier.isStatic(main.getModifiers()) || main.getReturnType() != void.class) {
                    throw new AssertionError("Use public static void main(String[] args) for " + args[i]);
                }
                main.invoke(null, (Object) new String[0]);
            } catch (InvocationTargetException error) {
                Throwable cause = error.getCause();
                System.err.println("Local behavior check failed: " + args[i] + ": " + cause);
                cause.printStackTrace();
                System.exit(1);
            }
        }
        System.out.println("Actual JAR origins and " + (args.length - 3) + " behavior checks/examples passed.");
    }
}
