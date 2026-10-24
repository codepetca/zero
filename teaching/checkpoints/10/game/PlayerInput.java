import zero.GameApp;
import zero.Key;

/** Reads controls; Main still decides when and how to update the player. */
public class PlayerInput {
    private final GameApp game;

    public PlayerInput(GameApp game) { this.game = game; }

    public int horizontal() {
        int direction = 0;
        if (game.keyDown(Key.LEFT)) direction--;
        if (game.keyDown(Key.RIGHT)) direction++;
        return direction;
    }

    public int vertical() {
        int direction = 0;
        if (game.keyDown(Key.UP)) direction--;
        if (game.keyDown(Key.DOWN)) direction++;
        return direction;
    }
}
