// Maintainer-owned native illustration from the already verified Starter UI JAR.
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Scene;
import javafx.scene.image.WritableImage;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;
import zero.community.starterui.StartScreen;
import zero.community.starterui.Hud;
public class PreviewSnapshot extends Application {
    public void start(Stage stage) {
        try {
            StartScreen start = new StartScreen("Coin game", "Collect coins. Build your own rules.", () -> {});
            Hud hud = new Hud(() -> {}); hud.setScore(7); hud.setMessage("Ready for another round");
            VBox root = new VBox(24, start.view(), hud.view());
            root.setStyle("-fx-padding: 24; -fx-background-color: white;");
            Scene scene = new Scene(root, 500, 280); stage.setScene(scene); stage.show();
            root.applyCss(); root.layout();
            WritableImage snapshot = scene.snapshot(null);
            BufferedImage png = new BufferedImage(500, 280, BufferedImage.TYPE_INT_ARGB);
            for (int y=0;y<280;y++) for(int x=0;x<500;x++) png.setRGB(x,y,snapshot.getPixelReader().getArgb(x,y));
            ImageIO.write(png, "png", new File(getParameters().getRaw().get(0)));
            System.out.println("STARTER_UI_NATIVE_PREVIEW_OK");
        } catch (Exception failure) { failure.printStackTrace(); System.exit(1); }
        finally {stage.close();Platform.exit();}
    }
    public static void main(String[] args) {launch(args);}
}
