package hub.policy;
import java.lang.instrument.*;
import java.security.ProtectionDomain;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;
public final class JarTracker {
  private static final AtomicBoolean seen = new AtomicBoolean();
  private static volatile String prefix;
  public static void premain(String arg, Instrumentation instrumentation) {
    prefix = arg.replace('.', '/') + "/";
    instrumentation.addTransformer(new ClassFileTransformer() {
      public byte[] transform(ClassLoader loader, String name, Class<?> type, ProtectionDomain domain, byte[] bytes) {
        if (name != null && name.startsWith(prefix)) {
          try {
            if (domain == null || domain.getCodeSource() == null || !Path.of(domain.getCodeSource().getLocation().toURI()).equals(Path.of("/input/library.jar")))
              throw new IllegalStateException("Foreign candidate class origin");
            seen.set(true);
          } catch (Exception failure) { throw new IllegalStateException(failure); }
        }
        return null;
      }
    });
  }
  static boolean used() { return seen.get(); }
}
