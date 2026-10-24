package evidence;

import zero.App;
import zero.GameApp;

/** Abstract fixture bases keep verification helpers out of entrypoint selection. */
public final class ApiProbeBases {
    private ApiProbeBases() { }
    public abstract static class Ui extends App { }
    public abstract static class Game extends GameApp { }
}
