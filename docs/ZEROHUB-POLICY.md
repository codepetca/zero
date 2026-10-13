# ZeroHub contribution and curation policy

Owner approved, 2026-10-12. ZeroHub is operated by Zero at `/hub`.

## Open contribution

Anyone signed in with GitHub may contribute a library supported by ZeroHub's
technical contract. Trusted automated minimum checks and the separate publisher
make passing versions available without routine maintainer or teacher approval.
Alternative implementations may coexist; usefulness is not an admission test.
Contributors receive authenticated GitHub credit. The existing MIT notices remain;
this hosting policy does not require a transfer of copyright to Zero.

There is no lifetime storage allowance or lifetime library-count quota per
contributor. The proposed 10 MB contributor allowance is rejected. Contributors
may continue publishing subject to technical requirements, temporary rate/queue
controls, available service capacity and curation decisions.

## Zero's authority

Zero's owners and designated maintainers have final authority over the catalog
and hosted content. They may archive, hide, remove, restore or otherwise manage
contributions at their discretion, including content they consider unused,
redundant, unsuitable or no longer useful. Continued listing and hosting are not
guaranteed. Curation takes place after automated publication and does not create
a routine human acceptance queue.

Usage information and automated reports may help identify candidates for
curation. No automatic inactivity deadline or deletion schedule is adopted by
this policy. Owners and maintainers decide what action to take.

## Archive and remove

Archiving normally hides a library or version from discovery while preserving
its exact-version downloads where practical. It does not free the space occupied
by retained files. Archived content should have a clear status when accessed
through a direct link.

Removal may stop downloads and reclaim stored source, results and artifact
bytes. Owners and maintainers may remove content even when a project depends on
it. Consider known dependency impact and retain an audit record of the action.
Show a useful unavailable message; never substitute another version or silently
change installed pins. A removed published coordinate stays reserved and cannot
be reused for different bytes. Copies already downloaded cannot be revoked.

## Capacity and technical controls

Keep bounded upload size, supported files/dependencies, checking time, memory,
output, request rates and pending jobs. These are operating controls, not a
per-contributor lifetime allowance. Use a shared capacity safeguard and usage
monitoring; when capacity is reached, pause new work with a clear explanation.
Curation and deliberate removal can reclaim capacity. Provider quotas can also
interrupt reads, so preserving releases is not a promise of unlimited free
availability. New artifact/result/global numeric budgets remain to be selected.

## Implementation status

This is the approved product policy, not a claim that its controls are deployed.
The public catalog is available; public sign-in and uploads remain closed under
the existing checker-review and hosting requirements. Local admission now has no
cumulative contributor-source or lifetime library-reservation allowance. Temporary
rate/queue controls and the existing shared source budget remain. Archiving and
physical reclamation are deferred; no new permanent contributor quota replaces
the removed guards.

Existing append-only release withdrawal can deny exact-version reads, but does
not implement discovery-only archiving or physical data reclamation. Those need
separate implementation and verification. See the
[implementation plan](ZEROHUB-PLAN.md#curation-and-capacity-follow-up) and
[hosting requirements](ZEROHUB-HOSTING.md).
