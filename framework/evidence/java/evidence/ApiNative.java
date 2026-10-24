package evidence;

/** Native-only transport; the browser receives only ApiProof/ApiSignatureChecks. */
public final class ApiNative {
    private ApiNative() { }
    public static javafx.scene.image.Image atlasImage() {
        javafx.scene.image.WritableImage image=new javafx.scene.image.WritableImage(24,24);
        int[] colors={0xfff05a28,0xff2878f0,0xff50c850,0xffc850dc};
        for(int y=0;y<24;y++)for(int x=0;x<24;x++)image.getPixelWriter().setArgb(x,y,colors[(y>=12?2:0)+(x>=12?1:0)]);
        return image;
    }
    public static void observePixels(zero.GameApp app) {
        ApiProof.observePixels(specification -> {
            String[] parts=specification.split(",");
            int x=Integer.parseInt(parts[1]),y=Integer.parseInt(parts[2]);
            javafx.scene.image.PixelReader reader=app.canvas().snapshot(null,null).getPixelReader();
            if(parts[0].equals("pixel")) {
                int actual=reader.getArgb(x,y),red=(actual>>>16)&255,green=(actual>>>8)&255,blue=actual&255,alpha=(actual>>>24)&255;
                String observed="pixel,"+x+","+y+","+red+","+green+","+blue+","+alpha;
                if(!specification.equals(observed))throw new AssertionError("API pixel expected "+specification+" observed "+observed);
                return observed;
            }
            int width=Integer.parseInt(parts[3]),height=Integer.parseInt(parts[4]),ink=0;
            for(int dy=0;dy<height;dy++)for(int dx=0;dx<width;dx++){int argb=reader.getArgb(x+dx,y+dy);if((argb>>>24)!=0&&(argb&0xffffff)!=0xffffff)ink++;}
            if(ink==0)throw new AssertionError("API text region contains no ink: "+specification);
            return specification+",ink="+ink;
        });
    }
    public static void resolveUi(javafx.stage.Stage stage) {
        ApiProof.resolveUi(specification -> {
            if(specification.startsWith("title,")) {
                String expected=specification.substring(6);
                if(!stage.getTitle().equals(expected))throw new AssertionError("Lifecycle native title differs");
                return "title="+stage.getTitle();
            }
            String expected=specification.substring(5);stage.getScene().getRoot().applyCss();stage.getScene().getRoot().layout();
            for(javafx.scene.Node node:stage.getScene().getRoot().lookupAll(".label"))if(node instanceof javafx.scene.control.Label&&((javafx.scene.control.Label)node).getText().equals(expected)&&node.isVisible()&&node.getScene()==stage.getScene())return "visible-text="+expected;
            throw new AssertionError("Lifecycle native content missing: "+expected);
        });
    }
    public static void emit() {
        System.out.println(ApiProof.events());
        System.out.println("ZERO_API_JAVA_HOME=" + System.getProperty("java.home"));
        System.out.println("ZERO_API_JAVA_VERSION=" + System.getProperty("java.version"));
        System.out.println("ZERO_API_MODULE_PATH=" + System.getProperty("jdk.module.path", ""));
        System.out.println("ZERO_API_PLATFORM=" + System.getProperty("os.name") + "/" + System.getProperty("os.arch"));
    }
}
