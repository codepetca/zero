# HealthBar API

`zero.healthbars.HealthBar` is an ordinary object with an ordinary JavaFX view.
Create and update it on the JavaFX application thread. The app owns its rules
and state; call `setHealth` after changing that state. No update discovery,
component registry, reflection or component superclass is required.

```java
HealthBar health = new HealthBar("Energy", 100);
show(health.view());
health.setHealth(75);
```

| Public API | Behavior |
| --- | --- |
| `HealthBar(int maximum)` | Starts full with caption `Health`. Maximum must be positive. |
| `HealthBar(String caption, int maximum)` | Starts full with a non-null caption and positive maximum. |
| `Node view()` | Returns the same VBox containing a Label and ProgressBar. One parent per instance. |
| `void setHealth(int health)` | Clamps to `0..maximum`, updates label, fill and accessible text immediately. |
| `int getHealth()` | Returns the last clamped displayed value. |
| `int getMaximum()` | Returns the fixed positive maximum. |

Invalid maximum throws `IllegalArgumentException` with `Maximum health must be
positive.` A null caption throws `NullPointerException` with `Health caption must
not be null.` Empty captions are allowed. Updates do not animate or run app rules.

Partial values use floating-point division: 75/100 displays 75% and 7/8
displays 87.5%. Existing regression tests protect this behavior.
