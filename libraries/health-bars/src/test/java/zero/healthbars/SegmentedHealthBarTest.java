package zero.healthbars;

import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import javafx.application.Platform;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SegmentedHealthBarTest {
    @BeforeAll static void startToolkit() {
        try { Platform.startup(() -> { }); } catch (IllegalStateException alreadyStarted) { }
    }
    private void onFx(Runnable check) throws Exception {
        FutureTask<Void> task = new FutureTask<>(check, null);
        Platform.runLater(task); task.get(15, TimeUnit.SECONDS);
    }
    private HBox segments(SegmentedHealthBar bar) {
        return (HBox) ((VBox) bar.view()).getChildren().get(1);
    }
    private double fill(SegmentedHealthBar bar, int index) {
        return ((ProgressBar) segments(bar).getChildren().get(index)).getProgress();
    }
    @Test void unevenIntegerCapacitiesShowPartialSegmentAndCaption() throws Exception {
        onFx(() -> {
            SegmentedHealthBar bar = new SegmentedHealthBar("Energy", 13);
            bar.setHealth(4);
            assertEquals(10, segments(bar).getChildren().size());
            for (int i = 0; i < 3; i++) assertEquals(1, fill(bar, i));
            assertEquals(0.5, fill(bar, 3));
            for (int i = 4; i < 10; i++) assertEquals(0, fill(bar, i));
            assertEquals("Energy: 4 / 13", ((Label) ((VBox) bar.view()).getChildren().get(0)).getText());
            assertEquals("Energy: 4 / 13", bar.view().getAccessibleText());
            assertEquals(13, bar.getMaximum()); assertEquals(4, bar.getHealth());
        });
    }
    @Test void smallAndHugeMaximaClampResetAndKeepIndependentViews() throws Exception {
        onFx(() -> {
            SegmentedHealthBar small = new SegmentedHealthBar(3);
            SegmentedHealthBar huge = new SegmentedHealthBar(Integer.MAX_VALUE);
            assertEquals(3, segments(small).getChildren().size());
            assertEquals(10, segments(huge).getChildren().size());
            var view = small.view();
            small.setHealth(Integer.MIN_VALUE);
            for (int i = 0; i < 3; i++) assertEquals(0, fill(small, i));
            small.setHealth(2); assertEquals(1, fill(small, 1)); assertEquals(0, fill(small, 2));
            small.setHealth(Integer.MAX_VALUE);
            for (int i = 0; i < 3; i++) assertEquals(1, fill(small, i));
            huge.setHealth(Integer.MAX_VALUE - 1);
            assertTrue(fill(huge, 9) < 1 && fill(huge, 9) > 0.99);
            huge.setHealth(Integer.MAX_VALUE); assertEquals(1, fill(huge, 9));
            assertSame(view, small.view()); assertNotSame(view, huge.view());
            assertEquals(3, small.getHealth());
        });
    }
    @Test void invalidMaximumAndCaptionHaveUsefulErrors() throws Exception {
        onFx(() -> {
            assertEquals("Maximum health must be positive.", assertThrows(IllegalArgumentException.class, () -> new SegmentedHealthBar(0)).getMessage());
            assertThrows(IllegalArgumentException.class, () -> new SegmentedHealthBar(-1));
            assertEquals("Health caption must not be null.", assertThrows(NullPointerException.class, () -> new SegmentedHealthBar(null, 3)).getMessage());
        });
    }
}
