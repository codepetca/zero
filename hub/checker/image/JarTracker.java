package hub.policy;
import java.lang.instrument.*;
import java.security.ProtectionDomain;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;

/** Observer state belongs to the same closed named module as the launcher. */
public final class JarTracker {
    private static final AtomicBoolean seen = new AtomicBoolean();
    private static final AtomicBoolean foreign = new AtomicBoolean();
    private static boolean installed;
    private static String prefix;
    private static Path origin;

    public static void premain(String arg, Instrumentation instrumentation) {
        assertModuleIdentity();
        if (installed) throw new IllegalStateException("Observer already installed");
        String[] parameters = arg.split("\\|", -1);
        if (parameters.length != 2 || !parameters[0].matches("zero\\.ui[1-9a-z][0-9a-z]{0,11}|zero\\.contrib\\.r[1-9][0-9]*\\.[a-z][a-z0-9_]*"))
            throw new IllegalArgumentException("Invalid trusted observer arguments");
        origin = Path.of(parameters[1]).toAbsolutePath().normalize();
        prefix = parameters[0].replace('.', '/') + "/";
        installed = true;
        instrumentation.addTransformer(new ClassFileTransformer() {
            public byte[] transform(ClassLoader loader, String name, Class<?> type,
                                    ProtectionDomain domain, byte[] bytes) {
                if (name != null && name.startsWith(prefix)) {
                    try {
                        if (loader != ClassLoader.getSystemClassLoader() || domain == null
                            || domain.getCodeSource() == null
                            || !Path.of(domain.getCodeSource().getLocation().toURI()).toAbsolutePath().normalize().equals(origin)) {
                            foreign.set(true);
                        } else {
                            seen.set(true);
                        }
                    } catch (Exception failure) { foreign.set(true); }
                }
                return null;
            }
        });
    }

    static void assertModuleIdentity() {
        Module module = JarTracker.class.getModule();
        if (!module.isNamed() || !"zero.hub.checker".equals(module.getName())
            || ModuleLayer.boot().findModule("zero.hub.checker").orElseThrow() != module
            || TrustedRun.class.getModule() != module
            || JarTracker.class.getClassLoader() != TrustedRun.class.getClassLoader()
            || module.isOpen("hub.policy", ClassLoader.getSystemClassLoader().getUnnamedModule())
            || module.isExported("hub.policy", ClassLoader.getSystemClassLoader().getUnnamedModule()))
            throw new IllegalStateException("Observer and launcher must share the closed trusted module");
    }

    static boolean used() { return installed && seen.get() && !foreign.get(); }
}
