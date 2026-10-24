package zero.web;

import dev.webfx.platform.console.spi.impl.elemental2.Elemental2ConsoleProvider;

/** WebFX catches scheduled callback failures before GWT's uncaught handler. */
public final class BrowserConsoleProvider extends Elemental2ConsoleProvider {
    @Override public void error(String message, Throwable failure) {
        // This prefix belongs to the pinned WebFX scheduler. Ordinary logging,
        // including a similar message without a Throwable, remains nonfatal.
        if (failure != null && message != null
                && message.startsWith("Uncaught exception occurred in scheduled runnable ")) {
            BrowserLifecycle.fail("ui-callback", "UI_CALLBACK_FAILED", failure);
        }
        super.error(message, failure);
    }
}
