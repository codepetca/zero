/** Trust state is never exported/opened to the unnamed contributor module. */
module zero.hub.checker {
    requires javafx.controls;
    requires javafx.swing;
    requires java.instrument;
    requires java.compiler;
    requires jdk.compiler;
    // JVM agent startup invokes premain reflectively from this JDK module only.
    opens hub.policy to java.instrument;
}
