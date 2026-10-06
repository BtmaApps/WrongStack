# Goal pause, resume and progress

`/goal` exposes a persistent mission and executable phase runs with different
state machines. See [the command](slash/goal.md) and
[project goals and My Goals](architecture/project-goals.md).

Phase runs live in the project `autophase` catalog. Pause stops admission of
new tasks while active tasks settle. Resume continues the saved graph under
its ownership lease. Stop aborts active work and fences late verification and
completion. New git-backed goals use retained goal checkouts and branches;
phases integrate there for operator review.

WebUI My Goals and `/goals` distinguish task progress, phase status, blockers,
ownership and final verification. Another terminal's active goal is read only.
A skipped verifier is not successful verification.

The legacy eternal/parallel mission lives in `goal.json`. Its iteration stages
are reported separately from phase/task progress. The original mission-only
design is preserved in [the archive](archive/designs/goal-pause-resume-2026-05-24.md).
Its direct mission-file writes do not describe phase admission and ownership.
