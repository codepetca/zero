public class Counter {
    private int count = 0;

    public void increment() { count = count + 1; }
    public void reset() { count = 0; }
    public int value() { return count; }
}
