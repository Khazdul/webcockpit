# 0086 — Touch detection fallback for misreporting browsers

Status: accepted 2026-10-08 (amends ADR 0075 §1)

## Context

ADR 0075 decides *touch* from `(pointer: coarse) and (hover: none)`. On
the owner's Samsung phone, Samsung Internet (opened from a Discord link)
does not match it — it reports a hovering, fine primary pointer — so
neither flag is set and the phone shows "Window too small" (36×37 cells,
needs 60×18). Chrome on the same phone works.

## Decision

*touch* is also on when the device has a touch screen
(`navigator.maxTouchPoints > 0`) and either the screen's short side is
under 600 CSS px or the user agent says Android. *phone* is unchanged:
touch and a short side under 600.

A touch-screen laptop (touch points, fine primary pointer, large screen,
not Android) still stays desktop. No user-agent sniffing beyond the
Android test.

## Consequences

- Samsung Internet (and any other browser with the same misreport) gets
  the phone layout on a phone and the touch fixes on an Android tablet.
- A desktop browser with touch points on a small screen would now count
  as a phone. No such desktop is known.
