import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.URL;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import javafx.application.Platform;

/** Maintained runner for explicitly chosen local checks; not an isolation boundary. */
public final class ZeroLibraryHarness {
    private ZeroLibraryHarness() { }

    private static void checks(String[] args) throws Exception {
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
                throw new AssertionError("Local behavior check failed: " + args[i] + ": " + error.getCause(), error.getCause());
            }
        }
        System.out.println("Actual JAR origins and " + (args.length - 3) + " behavior checks/examples passed.");
    }

    private static void widgetChecks(String[] args) throws Exception {
        long timeout = Long.getLong("zero.check.fxTimeoutMillis", 15_000L);
        if (timeout < 1 || timeout > 120_000) throw new IllegalArgumentException("Invalid JavaFX Check deadline.");
        // Also bound native startup and shutdown calls that can block before a
        // latch wait starts. This process owns only the explicitly selected Check.
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(timeout); }
            catch (InterruptedException finished) { return; }
            System.err.println("JavaFX local Check timed out during toolkit startup, checks/examples or shutdown. Keep checks finite and verify desktop/display access.");
            System.exit(1);
        }, "zero-library-check-deadline");
        watchdog.setDaemon(true);
        watchdog.start();
        boolean startupRequested = false;
        try {
            CountDownLatch finished = new CountDownLatch(1);
            AtomicReference<Throwable> failure = new AtomicReference<>();
            try {
                Platform.startup(() -> {
                    try {
                        Platform.setImplicitExit(false);
                        if (!Platform.isFxApplicationThread()) throw new AssertionError("Widget checks require the JavaFX application thread.");
                        checks(args);
                    } catch (Throwable error) { failure.set(error); }
                    finally { finished.countDown(); }
                });
                startupRequested = true;
            } catch (Throwable error) {
                throw new IllegalStateException("JavaFX toolkit startup failed. Verify this computer's JavaFX desktop/display support before Check library.", error);
            }
            if (!finished.await(timeout, TimeUnit.MILLISECONDS)) throw new IllegalStateException("JavaFX local Check timed out. Keep behavior checks and examples finite.");
            if (failure.get() != null) throw new AssertionError("JavaFX library behavior checks failed.", failure.get());
        } finally {
            if (startupRequested) Platform.exit();
            watchdog.interrupt();
        }
    }

    public static void main(String[] args) {
        try {
            if (args.length < 4) throw new IllegalArgumentException("Expected JAR, library kind, library classes and check/example main classes.");
            if (args[1].equals("widget")) widgetChecks(args);
            else if (args[1].equals("helper")) checks(args);
            else throw new IllegalArgumentException("Choose widget or helper library checks.");
        } catch (Throwable failure) {
            failure.printStackTrace();
            System.exit(1);
        }
    }
}
