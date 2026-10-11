/** Fresh ordinary objects: restarting a level also restores coins and patrols. */
public class Level {
    public final double width = 1600, height = 360;
    public final double startX = 40, startY = 268;
    public final double exitX = 1520, exitY = 244;
    public final Platform[] platforms;
    public final Coin[] coins;
    public final Enemy[] enemies;

    public Level(Platform[] platforms, Coin[] coins, Enemy[] enemies) {
        this.platforms = platforms; this.coins = coins; this.enemies = enemies;
    }

    public boolean allCollected() {
        for (Coin coin : coins) if (!coin.isCollected()) return false;
        return true;
    }

    public static Level[] createLevels() {
        var first = new Level(
                new Platform[] { new Platform(0, 300, 480, 60),
                    new Platform(580, 300, 520, 60), new Platform(1200, 300, 400, 60),
                    new Platform(260, 230, 100, 20), new Platform(780, 230, 120, 20) },
                new Coin[] { new Coin(120, 268), new Coin(300, 198),
                    new Coin(850, 198), new Coin(1360, 268) },
                new Enemy[] { new Enemy(940, 1040, 272) });
        var second = new Level(
                new Platform[] { new Platform(0, 300, 620, 60),
                    new Platform(720, 300, 400, 60), new Platform(1220, 300, 380, 60),
                    new Platform(300, 240, 100, 20), new Platform(830, 230, 120, 20) },
                new Coin[] { new Coin(150, 268), new Coin(340, 208),
                    new Coin(880, 198), new Coin(1400, 268) },
                new Enemy[] { new Enemy(470, 560, 272), new Enemy(980, 1070, 272) });
        return new Level[] { first, second };
    }
}
