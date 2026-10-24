# Example core proposal: gradual turning

Status: teaching example for a proposal, not an accepted ZeroHub release or a
new core API. The `r12345` namespace is an illustrative repository identifier,
not a claim about an actual student contributor.

## Problem and current component

`Actor.face(x, y)` turns immediately. A homing enemy may need to turn gradually.
The existing [TurnTowards source](zero/contrib/r12345/actor_tools/TurnTowards.java)
provides that behavior as ordinary Java without changing Zero:

```java
TurnTowards.apply(enemy, targetX, targetY, 90, seconds);
```

Main calls it during its explicit update. The helper limits angular speed,
avoids overshoot, uses clockwise canvas angles and leaves position unchanged.
It validates all inputs before mutation. It owns no timer, world or actor list.
The [actor component prototype](README.md) also demonstrates replacing animation
without editing core; these are independent contributions, not a required bundle.

## Evidence and remaining work

The prototype has recorded native and pinned WebFX/browser checks for turning,
clock ownership, presentation swaps, invalid inputs, pause and restart. See
[delivery evidence](../../../docs/EVIDENCE.md). The separate core-dependent
ScoreView JAR proof demonstrates the managed sharing/consumption protocol; it is
not evidence of a published TurnTowards release. No public contribution is
published or admitted by this proposal.

Before proposing adoption, publish or prepare an explicitly reviewed exact
component version, retain its source/license/history, and demonstrate useful
reuse in two independent projects through that same protocol. Include a short
student explanation, boundary cases and native/browser tests. Record the actual
contributor and repository/version when a real contribution replaces this fixture.

## Decision to review

Evaluate a possible convenience method such as
`enemy.turnTowards(x, y, degreesPerSecond, seconds)` against keeping the helper as
a separate library. Assess teaching value and repeated need before growing Actor.
This document does not select a final name or add the method.

If adopted, preserve the original contributor credit and MIT license/source
history, document any adaptations, and update the API, guide, website reference
and checks together. Release deliberately under the version policy. The original
library, namespace and accepted version stay unchanged; existing projects keep
their pins and choose whether to migrate. Popularity never performs this step
automatically. See [the contribution process](../../../docs/COMPONENTS.md#from-student-project-to-zero-core).
