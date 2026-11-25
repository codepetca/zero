package hub.policy;
import java.lang.reflect.*;
import java.nio.file.Path;
import java.security.Permission;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Node;
/** Fixed harness verdict is completion and exit status, never a contributor receipt. */
public final class TrustedRun {
  private static final AtomicBoolean uncaught = new AtomicBoolean();
  @SuppressWarnings("removal")
  public static void main(String[] args) throws Exception {
    JarTracker.assertModuleIdentity();
    if (args[0].equals("api")) {
      boolean current = args.length > 1 && (args[1].equals("helper") || args[1].equals("widget"));
      boolean widget = !current || args[1].equals("widget");
      boolean core = current && args.length > 2 && args[2].equals("--core");
      Class<?> element = core ? requireCore() : null;
      boolean widgetView = false;
      for (int i = core ? 3 : current ? 2 : 1; i < args.length; i++) {
        Class<?> type = Class.forName(args[i], false, ClassLoader.getSystemClassLoader());
        if (!Modifier.isPublic(type.getModifiers())) throw new AssertionError("Declared class must be public");
        requireOrigin(type, Path.of("/input/library.jar"));
        if (widget && core) {
          for (Method view : type.getMethods()) {
            if (view.getName().equals("view") && view.getParameterCount() == 0 && !Modifier.isStatic(view.getModifiers())
                && (Node.class.isAssignableFrom(view.getReturnType()) || element.isAssignableFrom(view.getReturnType())))
              widgetView = true;
          }
        } else if (widget) {
          Method view = type.getMethod("view");
          if ((current ? !Node.class.isAssignableFrom(view.getReturnType()) : view.getReturnType() != Node.class)
              || Modifier.isStatic(view.getModifiers()) || !Modifier.isPublic(view.getModifiers()))
            throw new AssertionError("Each widget needs public Node view()");
        }
      }
      if (core && widget && !widgetView) throw new AssertionError("A widget needs a public Node or Zero Element view()");
      return;
    }
    // Initialize the JDK's address implementation before candidate execution.
    // Its first use needs internal constructor access; no network request occurs.
    java.net.InetAddress.getLoopbackAddress();
    Thread.setDefaultUncaughtExceptionHandler((thread, failure) -> { uncaught.set(true); failure.printStackTrace(); });
    Module trusted = TrustedRun.class.getModule();
    System.setSecurityManager(new SecurityManager() {
      private boolean trustedRequester(Class<?>[] context) {
        for (Class<?> caller : context) {
          Module module = caller.getModule();
          if (module == trusted || module == Object.class.getModule()) continue;
          // Only actual boot-layer JavaFX and agent-startup modules may perform internal reflection.
          String name = module.getName();
          if (name != null && ModuleLayer.boot().findModule(name).orElse(null) == module
              && (name.startsWith("javafx.") || name.equals("java.instrument"))) return true;
          return false;
        }
        return false;
      }
      private boolean lambdaConstructorBootstrap(Class<?>[] context) {
        // Exact constructor-access request during JDK lambda creation. Arbitrary
        // MethodHandles/privateLookupIn/LambdaForm frames confer no authority.
        boolean constructor = false;
        for (Class<?> caller : context) {
          if (caller == java.lang.reflect.Constructor.class || caller == Class.class) constructor = true;
          if (constructor && caller.getName().equals("java.lang.invoke.InnerClassLambdaMetafactory")
              && caller.getModule() == Object.class.getModule()) return true;
          if (caller.getModule() != trusted && caller.getModule() != Object.class.getModule()) return false;
        }
        return false;
      }
      public void checkPermission(Permission permission) {
        String name = permission.getName();
        if (permission instanceof RuntimePermission && (name.startsWith("exitVM") || name.equals("setSecurityManager") || name.equals("setDefaultUncaughtExceptionHandler")))
          throw new SecurityException("Candidate cannot terminate or replace the trusted completion guard");
        if (permission instanceof RuntimePermission && name.equals("accessDeclaredMembers") && !trustedRequester(getClassContext()) && !lambdaConstructorBootstrap(getClassContext()))
          throw new SecurityException("Candidate cannot inspect private JDK/guard implementation");
        if (permission instanceof java.lang.reflect.ReflectPermission && name.equals("suppressAccessChecks")) {
          Class<?>[] context = getClassContext();
          if (!trustedRequester(context) && !lambdaConstructorBootstrap(context))
            throw new SecurityException("Candidate cannot suppress private access checks");
        }
      }
    });
    try {
      boolean core = args.length == 4 && (args[3].equals("--core-helper") || args[3].equals("--core-widget"));
      if (core) requireCore();
      Class<?> entry = Class.forName(args[1], false, ClassLoader.getSystemClassLoader());
      if (Application.class.isAssignableFrom(entry)) {
        Application.launch(entry.asSubclass(Application.class), new String[0]);
      } else if (core && args[3].equals("--core-widget")) {
        var completion = new CompletableFuture<Void>();
        Platform.startup(() -> {
          try {
            runMain(entry);
            completion.complete(null);
          } catch (Throwable failure) { completion.completeExceptionally(failure); }
        });
        completion.get();
      } else {
        runMain(entry);
      }
      if (uncaught.get()) throw new AssertionError("Uncaught candidate exception");
      if (!JarTracker.used()) throw new AssertionError("Consumer never loaded a component from the built JAR");
    } finally { Platform.exit(); }
  }

  private static void runMain(Class<?> entry) throws Exception {
    Method main = entry.getMethod("main", String[].class);
    if (!Modifier.isStatic(main.getModifiers()) || main.getReturnType() != void.class)
      throw new AssertionError("Use public static void main(String[] args)");
    try { main.invoke(null, (Object) new String[0]); }
    catch (InvocationTargetException failure) { throw new Exception("Declared check failed", failure.getCause()); }
  }

  private static Class<?> requireCore() throws Exception {
    Path coreJar = Path.of("/opt/zero/zero-core.jar");
    ClassLoader loader = ClassLoader.getSystemClassLoader();
    Class<?> element = Class.forName("zero.ui.Element", false, loader);
    requireOrigin(element, coreJar);
    requireOrigin(Class.forName("zero.App", false, loader), coreJar);
    return element;
  }

  private static void requireOrigin(Class<?> type, Path expected) throws Exception {
    var source = type.getProtectionDomain().getCodeSource();
    if (source == null || !Path.of(source.getLocation().toURI()).equals(expected))
      throw new AssertionError("Class must originate in its checked JAR: " + type.getName());
  }
}
