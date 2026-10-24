# Actor containers

Main owns one explicit update call and one draw call through the student-owned
`ActorCollection` interface. OrderedActors stores membership in an ArrayList and
copies membership tokens for each update. SnapshotActors replaces its membership
array on edits and borrows that snapshot while visiting. Switch selects the other
implementation in the same Main, retaining actor identities, membership order,
position, size, rotation, counters and pause state. There is no extra game loop.

Both implementations use identity (`==`), allow one membership per actor, retain
insertion order, ignore duplicate adds and treat removing an absent actor as a
no-op. An update visits its initial membership once. Additions begin next update;
removing a later actor skips it immediately. Removing then readding an actor gives
it a new membership at the end, which begins next update. Zero seconds still calls
each eligible actor once. Invalid time and null inputs fail before actor calls or
membership changes. Index errors have an explicit argument error.

Drawing observes membership and never calls update. Add/remove, recursive drawing
and update during drawing are rejected. Recursive update is also rejected.
Finally blocks release visit guards after a student callback throws; earlier
student changes are not rolled back. These are single-game-loop containers, not
thread-safe collections. Separate containers must not both update the same actor
in a frame; Main selects one owner.

The game starts with two rotating actors and visible update counts. Remove takes
out the second actor; Add puts the same actor back without resetting it. Repeated
Add does not duplicate it. Pause stops real updates. Switch retains the current
state, while Restart creates two fresh actors in the ordered list and resumes.
The maintainer driver checks both contracts, mutation during updates, identity,
error cleanup, drawing guards and the actual controls/live pause/resume/restart.
Native and browser acceptance are separate verification steps. This local
prototype does not claim a published ZeroHub artifact or add a core World API.
