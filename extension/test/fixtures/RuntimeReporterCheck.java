package zero;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;

/** Headless private-reporter semantics; no JavaFX toolkit/window or network. */
public final class RuntimeReporterCheck {
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    private static void open(App app) throws Exception {
        Method method = App.class.getDeclaredMethod("runtimeOpen");
        method.setAccessible(true);
        method.invoke(app);
    }
    public static void main(String[] arguments) throws Exception {
        PrintStream stdout = System.out;
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        Thread thread = Thread.currentThread();
        Thread.UncaughtExceptionHandler original = thread.getUncaughtExceptionHandler();
        Throwable[] forwarded = {null};
        Thread.UncaughtExceptionHandler previous = (owner, error) -> forwarded[0] = error;
        try {
            System.setOut(new PrintStream(bytes, true, StandardCharsets.UTF_8));
            System.clearProperty("zero.runtime.runId");
            System.clearProperty("zero.runtime.buildId");
            App ordinary = new App() {};
            open(ordinary);
            ordinary.runtimeEvent("startup", "startup", "STARTING");
            ordinary.stop();
            require(bytes.size() == 0, "ordinary Run must not emit diagnostic stdout");
            System.setProperty("zero.runtime.runId", "run-1");
            System.setProperty("zero.runtime.buildId", "build-1");
            thread.setUncaughtExceptionHandler(previous);
            int[] shutdowns = {0};
            App app = new App() {
                @Override protected void shutdown() { shutdowns[0]++; throw new IllegalStateException("cleanup cause"); }
            };
            open(app);
            app.runtimeEvent("startup", "startup", "STARTING");
            RuntimeException cause = new RuntimeException("callback \"message\"\nline", new IllegalArgumentException("root cause"));
            thread.getUncaughtExceptionHandler().uncaughtException(thread, cause);
            require(app.isStopped(), "uncaught UI failure must stop the App");
            require(shutdowns[0] == 1, "shutdown must run once");
            require(cause.getSuppressed().length == 1, "cleanup must remain attached to original callback error");
            require(forwarded[0] == cause, "previous uncaught handler must receive original error");
            require(thread.getUncaughtExceptionHandler() == previous, "owned hook must restore previous handler");
            app.runtimeEvent("ui-ready", "startup", "UI_READY");
            String result = bytes.toString(StandardCharsets.UTF_8);
            String[] lines = result.split("\\n");
            require(lines.length == 2, "one startup and one fatal only");
            require(lines[0].startsWith("\u001eZERO_RUNTIME_V1 {\"version\":1"), "framed record");
            require(lines[1].contains("\"seq\":2") && lines[1].contains("\"type\":\"fatal\""), "ordered terminal fatal");
            require(lines[1].contains("ui-callback") && lines[1].contains("root cause") && lines[1].contains("cleanup cause"), "local causal diagnostic");
            require(lines[1].contains("\\u000a") && lines[1].contains("\\\"message\\\""), "JSON escapes student messages");
            bytes.reset();
            App replacement = new App() {};
            open(replacement);
            Thread.UncaughtExceptionHandler newer = (owner, error) -> {};
            thread.setUncaughtExceptionHandler(newer);
            replacement.stop();
            require(thread.getUncaughtExceptionHandler() == newer, "stop cannot overwrite a newer hook owner");
            bytes.reset();
            System.setProperty("zero.runtime.runId", "bad\nID");
            App invalid = new App() {};
            open(invalid);
            invalid.runtimeEvent("startup", "startup", "STARTING");
            invalid.stop();
            require(bytes.size() == 0, "malformed host identity must not enable reporting");
        } finally {
            thread.setUncaughtExceptionHandler(original);
            System.setOut(stdout);
            System.clearProperty("zero.runtime.runId");
            System.clearProperty("zero.runtime.buildId");
        }
        System.out.println("RuntimeReporterCheck passed: opt-in framing, callback stop/causes, terminal order and owned hook restoration.");
    }
}
