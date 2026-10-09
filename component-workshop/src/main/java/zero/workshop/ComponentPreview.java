package zero.workshop;

import javafx.scene.Node;

/** Workshop adapter for the one documented component API; student components stay ordinary Java. */
final class ComponentPreview {
  private final Object instance;

  ComponentPreview(Class<?> type, String caption, int maximum) {
    try {
      instance = type.getConstructor(String.class, int.class).newInstance(caption, maximum);
    } catch (java.lang.reflect.InvocationTargetException failure) {
      if (failure.getCause() instanceof RuntimeException cause) throw cause;
      throw new IllegalArgumentException(failure.getCause());
    } catch (ReflectiveOperationException failure) {
      throw new IllegalArgumentException(
          "Candidate does not implement the documented HealthBar API", failure);
    }
  }

  private Object call(String method, Class<?>[] arguments, Object... values) {
    try {
      return instance.getClass().getMethod(method, arguments).invoke(instance, values);
    } catch (ReflectiveOperationException failure) {
      throw new IllegalStateException("Component call failed: " + method, failure);
    }
  }

  Node view() {
    return (Node) call("view", new Class<?>[0]);
  }

  void setHealth(int value) {
    call("setHealth", new Class<?>[] {int.class}, value);
  }

  int getHealth() {
    return (Integer) call("getHealth", new Class<?>[0]);
  }
}
