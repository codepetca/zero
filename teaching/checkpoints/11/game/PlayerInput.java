import zero.GameApp;
import zero.Key;

/** Reads controls; Main still decides when and how to update the player. */
public class PlayerInput {
    private final GameApp game;

    public PlayerInput(GameApp game) { this.game = game; }

    public int horizontal() {
        int direction = 0;
        if (game.keyDown(Key.LEFT) || game.keyDown(Key.A)) direction--;
        if (game.keyDown(Key.RIGHT) || game.keyDown(Key.D)) direction++;
        return direction;
    }

    public int vertical() {
        int direction = 0;
        if (game.keyDown(Key.UP) || game.keyDown(Key.W)) direction--;
        if (game.keyDown(Key.DOWN) || game.keyDown(Key.S)) direction++;
        return direction;
    }
}
