package zero.healthbars;

import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import javafx.application.Platform;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.layout.VBox;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class HealthBarTest {
    @BeforeAll static void startToolkit() { try { Platform.startup(() -> { }); } catch (IllegalStateException alreadyStarted) { } }
    // The shared JavaFX toolkit stays alive for other component test classes.

    private void onFx(Runnable check) throws Exception {
        FutureTask<Void> task = new FutureTask<>(check, null);
        Platform.runLater(task);
        task.get(15, TimeUnit.SECONDS);
    }

    @Test void partialDamageShowsCorrectFractionAndCaption() throws Exception {
        onFx(() -> {
            HealthBar bar = new HealthBar("Energy", 80);
            VBox view = (VBox) bar.view();
            bar.setHealth(60);
            assertEquals(60, bar.getHealth());
            assertEquals(80, bar.getMaximum());
            assertEquals("Energy: 60 / 80", ((Label) view.getChildren().get(0)).getText());
            assertEquals(0.75, ((ProgressBar) view.getChildren().get(1)).getProgress());
            assertEquals("Energy: 60 / 80", view.getAccessibleText());
            assertSame(view, bar.view());
        });
    }

    @Test void boundsAndIndependentInstancesSurviveReset() throws Exception {
        onFx(() -> {
            HealthBar first = new HealthBar(100);
            HealthBar second = new HealthBar(50);
            first.setHealth(Integer.MIN_VALUE);
            assertEquals(0, first.getHealth());
            first.setHealth(Integer.MAX_VALUE);
            assertEquals(100, first.getHealth());
            assertEquals(50, second.getHealth());
            assertNotSame(first.view(), second.view());
            first.setHealth(25);
            assertEquals(0.25, ((ProgressBar) ((VBox) first.view()).getChildren().get(1)).getProgress());
        });
    }

    @Test void invalidMaximumAndCaptionHaveUsefulErrors() throws Exception {
        onFx(() -> {
            assertEquals("Maximum health must be positive.",
                assertThrows(IllegalArgumentException.class, () -> new HealthBar(0)).getMessage());
            assertThrows(IllegalArgumentException.class, () -> new HealthBar(-1));
            assertEquals("Health caption must not be null.",
                assertThrows(NullPointerException.class, () -> new HealthBar(null, 100)).getMessage());
        });
    }
}
