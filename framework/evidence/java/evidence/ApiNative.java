package evidence;

/** Native-only transport; the browser receives only ApiProof/ApiSignatureChecks. */
public final class ApiNative {
    private ApiNative() { }
    public static void emit() {
        System.out.println(ApiProof.events());
        System.out.println("ZERO_API_JAVA_HOME=" + System.getProperty("java.home"));
        System.out.println("ZERO_API_JAVA_VERSION=" + System.getProperty("java.version"));
        System.out.println("ZERO_API_MODULE_PATH=" + System.getProperty("jdk.module.path", ""));
        System.out.println("ZERO_API_PLATFORM=" + System.getProperty("os.name") + "/" + System.getProperty("os.arch"));
    }
}
