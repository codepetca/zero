package evidence;

import java.util.ArrayList;

/** Maintainer-only direct invocation and checked-observation collector. */
public final class ApiProof {
    public interface Invocation { String run(); }
    public interface PixelObserver { String observe(String specification); }
    private static final ArrayList<String> seen=new ArrayList<>();
    private static final ArrayList<Observation> records=new ArrayList<>();
    private static PixelObserver pixelObserver;
    private ApiProof() { }
    private static final class Observation {
        final String signature,assertion,postcondition;
        String kind,value;
        Observation(String signature,String assertion,String postcondition,String kind,String value) {
            this.signature=signature;this.assertion=assertion;this.postcondition=postcondition;this.kind=kind;this.value=value;
        }
    }
    public static void observePixels(PixelObserver observer) { pixelObserver=observer; }
    private static void reserve(String signature,String assertion) {
        String key=signature+"|"+assertion;
        for(int i=0;i<seen.size();i++)if(seen.get(i).equals(key))throw new IllegalStateException("Duplicate API assertion: "+assertion);
        seen.add(key);
    }
    public static void equal(String signature,String assertion,String postcondition,Invocation invocation,String expected) {
        reserve(signature,assertion);
        String actual=invocation.run();
        Observation record=new Observation(signature,assertion,postcondition,"I",actual);records.add(record);
        if(!expected.equals(actual))throw new IllegalStateException("API assertion failed: "+assertion+"; expected "+expected+", observed "+actual);
        record.kind="A";
    }
    /** Browser P records require sampled canvas pixels; native checks sample immediately. */
    public static void pixel(String signature,String assertion,String postcondition,Runnable invocation,String specification) {
        reserve(signature,assertion);invocation.run();
        if(pixelObserver==null)records.add(new Observation(signature,assertion,postcondition,"P",specification));
        else records.add(new Observation(signature,assertion,postcondition,"A",pixelObserver.observe(specification)));
    }
    /** UI effects become observable only after startup attaches the returned Scene. */
    public static void pending(String signature,String assertion,String postcondition,Runnable invocation,String specification) {
        reserve(signature,assertion);invocation.run();records.add(new Observation(signature,assertion,postcondition,"O",specification));
    }
    public static void resolveUi(PixelObserver observer) {
        for(int i=0;i<records.size();i++) {
            Observation record=records.get(i);
            if(record.kind.equals("O")){record.value=observer.observe(record.value);record.kind="A";}
        }
    }
    public static String events() {
        String log="ZERO_API_EVIDENCE_V1\n";
        for(int i=0;i<records.size();i++) {
            Observation record=records.get(i);
            log+="I|"+record.signature+"|"+record.assertion+"\n";
            if(!record.kind.equals("I"))log+=record.kind+"|"+record.signature+"|"+record.assertion+"|"+record.postcondition+"|"+record.value+"\n";
        }
        return log+"END_ZERO_API_EVIDENCE";
    }
}
