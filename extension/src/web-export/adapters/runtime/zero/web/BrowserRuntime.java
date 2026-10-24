package zero.web;

import elemental2.dom.DomGlobal;
import jsinterop.annotations.JsFunction;
import jsinterop.annotations.JsPackage;
import jsinterop.annotations.JsType;
import jsinterop.base.Js;

/** Local bootstrap sink only; the exported static app has no diagnostic service. */
public final class BrowserRuntime {
    private static boolean failing;
    static boolean beginFailure() { if (failing) return false; failing = true; return true; }
    @JsFunction private interface Action { void run(); }
    @JsType(isNative = true, namespace = JsPackage.GLOBAL, name = "Object")
    private interface Sink {
        void emit(String type, String stage, String code, String diagnostic);
        void fail(String stage, String code, String diagnostic);
        Action registerStop(Action stop);
    }
    private static Sink sink() {
        Object value = Js.asPropertyMap(DomGlobal.window).get("__zeroRuntime");
        return value == null ? null : Js.uncheckedCast(value);
    }
    public static void emit(String type, String stage, String code, Throwable failure) {
        if (failing) return;
        Sink sink = sink();
        if (sink != null) sink.emit(type, stage, code, failure == null ? null : diagnostic(failure));
    }
    public static void fatal(String stage, String code, Throwable failure) {
        Sink sink = sink();
        if (sink != null) sink.fail(stage, code, diagnostic(failure));
        else DomGlobal.console.error(diagnostic(failure));
    }
    public static Runnable registerStop(Runnable stop) {
        Sink sink = sink();
        if (sink == null) return () -> {};
        Action remove = sink.registerStop(stop::run);
        return () -> { if (remove != null) remove.run(); };
    }
    private static String diagnostic(Throwable failure) {
        StringBuilder text = new StringBuilder();
        append(text, failure, "", 0);
        return text.substring(0, Math.min(8192, text.length()));
    }
    private static void append(StringBuilder text, Throwable failure, String label, int depth) {
        if (failure == null || depth >= 8 || text.length() >= 8192) return;
        text.append(label).append(failure.getClass().getName()).append(": ");
        String message = failure.getMessage();
        if (message != null) text.append(message.substring(0, Math.min(2048, message.length())));
        text.append('\n');
        StackTraceElement[] frames = failure.getStackTrace();
        for (int i = 0; i < Math.min(24, frames.length) && text.length() < 8192; i++) {
            text.append("  at ").append(frames[i]).append('\n');
        }
        for (Throwable cleanup : failure.getSuppressed()) append(text, cleanup, "Suppressed: ", depth + 1);
        append(text, failure.getCause(), "Caused by: ", depth + 1);
    }
}
