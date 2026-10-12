package hub.policy;
import java.lang.reflect.*;
import java.nio.file.Path;
import java.security.Permission;
import java.util.concurrent.atomic.AtomicBoolean;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Node;
/** Fixed harness verdict is completion and exit status, never a contributor receipt. */
public final class TrustedRun {
  private static final AtomicBoolean uncaught = new AtomicBoolean();
  @SuppressWarnings("removal")
  public static void main(String[] args) throws Exception {
    if (args[0].equals("api")) {
      for (int i = 1; i < args.length; i++) {
        Class<?> type = Class.forName(args[i], false, ClassLoader.getSystemClassLoader());
        if (!Modifier.isPublic(type.getModifiers()) || !Path.of(type.getProtectionDomain().getCodeSource().getLocation().toURI()).equals(Path.of("/input/library.jar"))) throw new AssertionError("Declared public class must originate in built JAR");
        Method view = type.getMethod("view");
        if (view.getReturnType() != Node.class || Modifier.isStatic(view.getModifiers()) || !Modifier.isPublic(view.getModifiers())) throw new AssertionError("Each component needs public Node view()");
      }
      return;
    }
    Thread.setDefaultUncaughtExceptionHandler((thread, failure) -> { uncaught.set(true); failure.printStackTrace(); });
    String candidatePrefix = args[2] + ".";
    System.setSecurityManager(new SecurityManager() {
      public void checkPermission(Permission permission) {
        String name = permission.getName();
        if (permission instanceof RuntimePermission && (name.startsWith("exitVM") || name.equals("setSecurityManager") || name.equals("setDefaultUncaughtExceptionHandler"))) throw new SecurityException("Candidate cannot terminate or replace the trusted completion guard");
        if (permission instanceof java.lang.reflect.ReflectPermission && name.equals("suppressAccessChecks")) {
          // JavaFX/JDK reflection remains available; direct contributor reflection cannot edit harness state.
          boolean lambdaBootstrap = false;
          for (Class<?> caller : getClassContext()) if (caller.getName().startsWith("java.lang.invoke.")) lambdaBootstrap = true;
          if (!lambdaBootstrap) for (Class<?> caller : getClassContext()) if (caller.getName().equals("Main") || caller.getName().equals("BehaviorCheck") || caller.getName().startsWith(candidatePrefix)) throw new SecurityException("Candidate cannot access private harness state");
        }
      }
    });
    try {
      Class<?> entry = Class.forName(args[1]);
      if (Application.class.isAssignableFrom(entry)) {
        Application.launch(entry.asSubclass(Application.class), new String[0]);
      } else {
        try { entry.getMethod("main", String[].class).invoke(null, (Object) new String[0]); }
        catch (InvocationTargetException failure) { throw new Exception("Declared check failed", failure.getCause()); }
        Platform.exit();
      }
      if (uncaught.get()) throw new AssertionError("Uncaught candidate exception");
      if (!JarTracker.used()) throw new AssertionError("Consumer never loaded a component from the built JAR");
    } finally { Platform.exit(); }
  }
}
