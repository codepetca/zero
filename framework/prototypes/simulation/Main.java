import zero.Color;
import zero.GameApp;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;
import zero.ui.Row;
import zero.ui.TextField;

/** One game loop owns the motion; ordinary button callbacks change its state. */
public class Main extends GameApp {
    private static final double RADIUS = 12;
    private double x = 60;
    private int direction = 1;
    private int speed = 120;
    private final TextField speedInput = new TextField();
    private final Label speedLabel = new Label("Speed: 120");
    private final Label error = new Label("");
    private final Button pauseButton = new Button("Pause");

    @Override public void settings() {
        title("Zero live simulation");
        size(480, 240);
        padding(12);
    }

    @Override public void setup() {
        speedInput.setText("120");
        speedInput.setPromptText("Speed 0 to 400");
        Button apply = new Button("Apply");
        Button reset = new Button("Reset");
        apply.onClick(this::applySpeed);
        pauseButton.onClick(this::togglePause);
        reset.onClick(this::reset);
        controls(new Column(8, new Row(new Label("Speed (0–400)"), speedInput, apply),
                new Row(speedLabel, pauseButton, reset), error));
    }

    private void applySpeed() {
        try {
            int candidate = Integer.parseInt(speedInput.getText().trim());
            if (candidate < 0 || candidate > 400) {
                throw new IllegalArgumentException("Speed must be from 0 to 400.");
            }
            speed = candidate;
            speedLabel.setText("Speed: " + speed);
            error.setText("");
        } catch (IllegalArgumentException invalid) {
            error.setText("Enter a whole number from 0 to 400.");
        }
    }

    private void togglePause() {
        if (isPaused()) {
            resume();
            pauseButton.setText("Pause");
        } else {
            pause();
            pauseButton.setText("Resume");
        }
    }

    private void reset() {
        x = 60;
        direction = 1;
        speed = 120;
        speedInput.setText("120");
        speedLabel.setText("Speed: 120");
        error.setText("");
        resume();
        pauseButton.setText("Pause");
    }

    @Override public void update(double seconds) {
        x += direction * speed * seconds;
        if (x >= width() - RADIUS) {
            x = width() - RADIUS;
            direction = -1;
        } else if (x <= RADIUS) {
            x = RADIUS;
            direction = 1;
        }
    }

    @Override public void draw() {
        background(Color.WHITE);
        fill(Color.BLUE);
        circle(x, height() / 2, RADIUS * 2);
    }

    public static void main(String[] args) { launch(args); }
}
