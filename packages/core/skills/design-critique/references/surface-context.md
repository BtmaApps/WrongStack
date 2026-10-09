**Classify the surface first.** Two axes are scored differently depending on it,
and some are not scorable at all:

| Surface | Examples | What changes |
|---|---|---|
| **Page** | landing, marketing, docs, article, onboarding | Nothing — every axis applies as written |
| **App screen** | dashboard, console, table view, settings, editor chrome | *Structure*: "centered monotony" and "hero + three cards" do not apply; judge tile/lane rhythm and whether one element earns the focal point. *Typography*: the 60–75ch measure rule applies to prose blocks only, never to tables, labels or numeric cells |
| **Kiosk / public terminal** | ticket machine, self-checkout, wayfinding panel, check-in screen | Every axis applies, **plus** the physical checks below — which no other surface needs and which outrank taste when they conflict |
| **Component in isolation** | one primitive, one card | *Structure* and *Copy* are usually not scorable |

**Kiosk is not a small page.** Its constraints are physical, and a rubric that
only asks design questions will hand a kiosk a flattering score for the wrong
reasons. Ask these as well, and treat a failure as blocking rather than craft:

- **Readable at distance.** Can the primary state and the total/answer be read
  from two metres, in glare? If the answer depends on leaning in, it fails.
- **One cold finger.** Targets well above the 44px floor (64px+), spaced so a
  mis-tap cannot select the neighbour. No hover, no drag, no long-press, no
  dropdown.
- **Recoverable.** Every destructive or committing step has a visible way back.
  A stranded user cannot refresh, log in again, or email support.
- **No session.** Nothing personal persists on screen, and the screen returns to
  its start state on its own after inactivity.
- **Standing, not sitting.** Content sits in the upper-middle band; nothing
  essential lives at the very bottom of a tall panel.

Score the six craft axes as usual, then report the physical checks as a separate
pass/fail list. A kiosk that scores 4/5 on craft and fails "readable at distance"
is a failing screen.
