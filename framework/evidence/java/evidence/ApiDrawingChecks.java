package evidence;

import javafx.scene.image.Image;
import zero.Actor;
import zero.GameApp;
import zero.ImageRegion;
import zero.SpriteAnimation;

/** Fixed, disjoint atlas: real Java calls plus native/browser sampled pixels. */
public final class ApiDrawingChecks {
    private static boolean recording;
    private static GameApp current;
    private ApiDrawingChecks() { }
    private static void pixel(String signature,String assertion,String postcondition,Runnable invocation,String specification) {
        if(recording) {
            ApiProof.pixel(signature,assertion,postcondition,invocation,specification);
            current.text("ZERO_API_PIXEL_SAMPLE|"+assertion+"|"+specification,-10000,-10000);
        } else invocation.run();
    }
    public static void paint(GameApp app,Image sheet,boolean record) {
        recording=record;current=app;
        ImageRegion region=new ImageRegion(sheet,0,0,12,24);
        SpriteAnimation animation=new SpriteAnimation(sheet,2,1,2);
        pixel("zero.GameApp#background(javafx.scene.paint.Color)","background-fx","JavaFX background clears a retained outside-atlas witness",()->{app.background(javafx.scene.paint.Color.WHITE);},"pixel,900,450,255,255,255,255");
        pixel("zero.GameApp#background(zero.Color)","background-zero","Zero background clears a second retained outside-atlas witness",()->{app.background(zero.Color.WHITE);},"pixel,910,450,255,255,255,255");
        pixel("zero.GameApp#fill(javafx.scene.paint.Color)","fill-fx","Fill determines the interior color of a rectangle",()->{app.fill(javafx.scene.paint.Color.BLUE);app.rect(10,110,24,24);},"pixel,18,118,0,0,255,255");
        pixel("zero.GameApp#fill(zero.Color)","fill-zero","Fill determines the interior color of a rectangle",()->{app.fill(zero.Color.BLUE);app.rect(90,110,24,24);},"pixel,98,118,0,0,255,255");
        pixel("zero.GameApp#stroke(javafx.scene.paint.Color)","stroke-fx","Stroke determines the interior of a thick line",()->{app.stroke(javafx.scene.paint.Color.BLUE);app.strokeWidth(6);app.line(170,120,195,120);},"pixel,180,120,0,0,255,255");
        pixel("zero.GameApp#stroke(zero.Color)","stroke-zero","Stroke determines the interior of a thick line",()->{app.stroke(zero.Color.BLUE);app.strokeWidth(6);app.line(250,120,275,120);},"pixel,260,120,0,0,255,255");
        pixel("zero.GameApp#strokeWidth(double)","stroke-width","Eight-pixel line includes a witness three pixels from its centre",()->{app.stroke(zero.Color.BLUE);app.strokeWidth(8);app.line(330,120,355,120);},"pixel,340,123,0,0,255,255");
        pixel("zero.GameApp#rect(double,double,double,double)","draw-rect","Rectangle covers its interior witness",()->{app.fill(zero.Color.BLUE);app.rect(410,110,24,24);},"pixel,418,118,0,0,255,255");
        pixel("zero.GameApp#outlineRect(double,double,double,double)","draw-outline","Rectangle outline covers an edge witness",()->{app.stroke(zero.Color.BLUE);app.strokeWidth(4);app.outlineRect(490,110,24,24);},"pixel,490,122,0,0,255,255");
        pixel("zero.GameApp#circle(double,double,double)","draw-circle","Circle covers its specified centre",()->{app.fill(zero.Color.BLUE);app.circle(582,122,20);},"pixel,582,122,0,0,255,255");
        pixel("zero.GameApp#line(double,double,double,double)","draw-line","Line joins the supplied endpoints",()->{app.stroke(zero.Color.BLUE);app.strokeWidth(4);app.line(650,120,674,120);},"pixel,662,120,0,0,255,255");
        pixel("zero.GameApp#textSize(double)","font-size","Text leaves visible ink in the expected font or alignment region",()->{app.fill(zero.Color.BLUE);app.textSize(28);app.text("M",730,110+30);},"ink,732,115,25,10");
        pixel("zero.GameApp#text(java.lang.String,double,double)","draw-text","Text leaves visible ink in the expected font or alignment region",()->{app.fill(zero.Color.BLUE);app.textSize(24);app.text("M",10,180+30);},"ink,10,188,28,24");
        pixel("zero.GameApp#textCentered(java.lang.String,double,double)","draw-centred-text","Text leaves visible ink in the expected font or alignment region",()->{app.fill(zero.Color.BLUE);app.textSize(24);app.textCentered("MM",90+40,180+30);},"ink,114,188,14,24");
        pixel("zero.GameApp#image(javafx.scene.image.Image,double,double)","image-Image-natural","Image overload selects the top-left atlas color",()->{app.image(sheet,170,180);},"pixel,173,183,240,90,40,255");
        pixel("zero.GameApp#image(javafx.scene.image.Image,double,double,double,double)","image-Image-sized","Image overload selects the top-left atlas color",()->{app.image(sheet,250,180,24,24);},"pixel,253,183,240,90,40,255");
        pixel("zero.GameApp#imageCentered(javafx.scene.image.Image,double,double,double,double,double)","imageCentered-Image","Image placement or vertical flip selects the expected atlas row",()->{app.imageCentered(sheet,342,192,24,24,0);},"pixel,333,183,240,90,40,255");
        pixel("zero.GameApp#imageFlippedY(javafx.scene.image.Image,double,double,double,double)","imageFlippedY-Image","Image placement or vertical flip selects the expected atlas row",()->{app.imageFlippedY(sheet,410,180,24,24);},"pixel,413,183,80,200,80,255");
        pixel("zero.GameApp#image(zero.ImageRegion,double,double)","image-ImageRegion-natural","Image overload selects the top-left atlas color",()->{app.image(region,490,180);},"pixel,493,183,240,90,40,255");
        pixel("zero.GameApp#image(zero.ImageRegion,double,double,double,double)","image-ImageRegion-sized","Image overload selects the top-left atlas color",()->{app.image(region,570,180,24,24);},"pixel,573,183,240,90,40,255");
        pixel("zero.GameApp#imageCentered(zero.ImageRegion,double,double,double,double,double)","imageCentered-ImageRegion","Image placement or vertical flip selects the expected atlas row",()->{app.imageCentered(region,662,192,24,24,0);},"pixel,653,183,240,90,40,255");
        pixel("zero.GameApp#imageFlippedY(zero.ImageRegion,double,double,double,double)","imageFlippedY-ImageRegion","Image placement or vertical flip selects the expected atlas row",()->{app.imageFlippedY(region,730,180,24,24);},"pixel,733,183,80,200,80,255");
        pixel("zero.GameApp#image(zero.SpriteAnimation,double,double)","image-SpriteAnimation-natural","Image overload selects the top-left atlas color",()->{app.image(animation,10,250);},"pixel,13,253,240,90,40,255");
        pixel("zero.GameApp#image(zero.SpriteAnimation,double,double,double,double)","image-SpriteAnimation-sized","Image overload selects the top-left atlas color",()->{app.image(animation,90,250,24,24);},"pixel,93,253,240,90,40,255");
        pixel("zero.GameApp#imageCentered(zero.SpriteAnimation,double,double,double,double,double)","imageCentered-SpriteAnimation","Image placement or vertical flip selects the expected atlas row",()->{app.imageCentered(animation,182,262,24,24,0);},"pixel,173,253,240,90,40,255");
        pixel("zero.GameApp#imageFlippedY(zero.SpriteAnimation,double,double,double,double)","imageFlippedY-SpriteAnimation","Image placement or vertical flip selects the expected atlas row",()->{app.imageFlippedY(animation,250,250,24,24);},"pixel,253,253,80,200,80,255");
        app.fill(zero.Color.BLACK);app.rect(330,250,24,24);
        pixel("zero.Color#WHITE:zero.Color","constant-WHITE","Color constant paints its documented RGB channels",()->{app.fill(zero.Color.WHITE);app.rect(332,252,20,20);},"pixel,340,260,255,255,255,255");
        app.fill(zero.Color.BLACK);app.rect(410,250,24,24);
        pixel("zero.Color#BLACK:zero.Color","constant-BLACK","Color constant paints its documented RGB channels",()->{app.fill(zero.Color.BLACK);app.rect(412,252,20,20);},"pixel,420,260,0,0,0,255");
        app.fill(zero.Color.BLACK);app.rect(490,250,24,24);
        pixel("zero.Color#BLUE:zero.Color","constant-BLUE","Color constant paints its documented RGB channels",()->{app.fill(zero.Color.BLUE);app.rect(492,252,20,20);},"pixel,500,260,0,0,255,255");
        app.fill(zero.Color.BLACK);app.rect(570,250,24,24);
        pixel("zero.Color#GOLD:zero.Color","constant-GOLD","Color constant paints its documented RGB channels",()->{app.fill(zero.Color.GOLD);app.rect(572,252,20,20);},"pixel,580,260,255,215,0,255");
        pixel("zero.Actor#draw(zero.GameApp)","actor-app-draw","Actor draw translates its natural sprite into world coordinates",()->{new Actor(region,656,262).draw(app);},"pixel,653,253,240,90,40,255");
        pixel("zero.GameApp#draw(zero.Actor)","app-actor-draw","GameApp actor overload reaches the translated sprite callback",()->{app.draw(new Actor(region,736,262));},"pixel,733,253,240,90,40,255");
        app.draw(new Actor(region,16,332) {
            @Override public void draw() {
                pixel("zero.Actor#draw()","actor-default-draw","Default Actor callback paints its current region",()->super.draw(),"pixel,13,323,240,90,40,255");
            }
        });
        app.draw(new Actor(0,0) {
            @Override public void draw() {
                pixel("zero.Actor#fill(zero.Color)","actor-fill","Bound Actor helper paints its expected local-coordinate witness",()->{fill(zero.Color.BLUE);rect(90,320,24,24);},"pixel,98,328,0,0,255,255");
                pixel("zero.Actor#stroke(zero.Color)","actor-stroke","Bound Actor helper paints its expected local-coordinate witness",()->{stroke(zero.Color.BLUE);strokeWidth(6);line(170,320+10,170+24,320+10);},"pixel,180,330,0,0,255,255");
                pixel("zero.Actor#strokeWidth(double)","actor-stroke-width","Bound Actor helper paints its expected local-coordinate witness",()->{stroke(zero.Color.BLUE);strokeWidth(8);line(250,320+10,250+24,320+10);},"pixel,260,333,0,0,255,255");
                pixel("zero.Actor#rect(double,double,double,double)","actor-rect","Bound Actor helper paints its expected local-coordinate witness",()->{fill(zero.Color.BLUE);rect(330,320,24,24);},"pixel,338,328,0,0,255,255");
                pixel("zero.Actor#outlineRect(double,double,double,double)","actor-outline","Bound Actor helper paints its expected local-coordinate witness",()->{stroke(zero.Color.BLUE);strokeWidth(4);outlineRect(410,320,24,24);},"pixel,410,332,0,0,255,255");
                pixel("zero.Actor#circle(double,double,double)","actor-circle","Bound Actor helper paints its expected local-coordinate witness",()->{fill(zero.Color.BLUE);circle(490+12,320+12,20);},"pixel,502,332,0,0,255,255");
                pixel("zero.Actor#line(double,double,double,double)","actor-line","Bound Actor helper paints its expected local-coordinate witness",()->{stroke(zero.Color.BLUE);strokeWidth(4);line(570,320+10,570+24,320+10);},"pixel,582,330,0,0,255,255");
                pixel("zero.Actor#textSize(double)","actor-font-size","Bound Actor text leaves ink in its expected font or alignment region",()->{fill(zero.Color.BLUE);textSize(28);text("M",650,320+30);},"ink,652,325,25,10");
                pixel("zero.Actor#text(java.lang.String,double,double)","actor-text","Bound Actor text leaves ink in its expected font or alignment region",()->{fill(zero.Color.BLUE);textSize(24);text("M",730,320+30);},"ink,730,328,28,24");
                pixel("zero.Actor#textCentered(java.lang.String,double,double)","actor-centred-text","Bound Actor text leaves ink in its expected font or alignment region",()->{fill(zero.Color.BLUE);textSize(24);textCentered("MM",10+40,390+30);},"ink,34,398,14,24");
            }
        });
    }
}
