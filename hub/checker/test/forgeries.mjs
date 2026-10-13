// Fixed trusted regressions for the independently reproduced verdict bypasses.

export function reflectionForgery(name) {
 return `public class ${name} { static final class Worker implements Runnable { public void run() { try { for(String cls:new String[]{"hub.policy.JarTracker","hub.policy.TrustedRun"}) { var f=Class.forName(cls).getDeclaredField(cls.endsWith("JarTracker")?"seen":"uncaught"); f.setAccessible(true); ((java.util.concurrent.atomic.AtomicBoolean)f.get(null)).set(cls.endsWith("JarTracker")); } } catch(Throwable failure) {} } } public static void main(String[] args) throws Exception { Thread t=new Thread(new Worker());t.start();t.join(); } }`;
}
export function methodHandleForgery(name) {
 return `public class ${name} { public static void main(String[] args) throws Throwable { try { Class<?> c=Class.forName("hub.policy.JarTracker"); var lookup=java.lang.invoke.MethodHandles.privateLookupIn(c,java.lang.invoke.MethodHandles.lookup()); var get=lookup.findStaticGetter(c,"seen",java.util.concurrent.atomic.AtomicBoolean.class); ((java.util.concurrent.atomic.AtomicBoolean)get.invoke()).set(true); } catch(Throwable failure) {} } }`;
}

// The JavaFX dependency exposes jdk.unsupported; a JDK public reflection deputy
// must not elevate a contributor lookup into access to sun.misc.Unsafe.
export function unsafeDeputyForgery(name) {
 return `public class ${name} { public static void main(String[] args) throws Throwable { try { Class<?> unsafeClass=Class.forName("sun.misc.Unsafe"); var expression=new java.beans.Expression(java.lang.invoke.MethodHandles.class,"privateLookupIn",new Object[]{unsafeClass,java.lang.invoke.MethodHandles.lookup()}); var lookup=(java.lang.invoke.MethodHandles.Lookup)expression.getValue(); Object unsafe=lookup.findStaticGetter(unsafeClass,"theUnsafe",unsafeClass).invoke(); var field=Class.forName("hub.policy.JarTracker").getDeclaredField("seen"); Object base=lookup.findVirtual(unsafeClass,"staticFieldBase",java.lang.invoke.MethodType.methodType(Object.class,java.lang.reflect.Field.class)).invoke(unsafe,field); long offset=(long)lookup.findVirtual(unsafeClass,"staticFieldOffset",java.lang.invoke.MethodType.methodType(long.class,java.lang.reflect.Field.class)).invoke(unsafe,field); Object seen=lookup.findVirtual(unsafeClass,"getObject",java.lang.invoke.MethodType.methodType(Object.class,Object.class,long.class)).invoke(unsafe,base,offset); ((java.util.concurrent.atomic.AtomicBoolean)seen).set(true); } catch(Throwable failure) {} } }`;
}
