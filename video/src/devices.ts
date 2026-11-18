// Film 2's device prototype (stage 70, owner round 1): the shared schedule
// of the takes (record/scenes/devices.ts) and the composition
// (src/compositions/DevicesProto.tsx). Seconds from the takes' `sync`
// marker, which is also the film's 0: one session, one device live at a
// time, each picking up where the last was left.
export const DEVICES = {
  /** The desktop is left (it freezes and sleeps) and the tablet picks up, in the wide view. */
  toTablet: 5.6,
  /** The tablet is left (after its `butch corpse` and the keyboard folded) and the phone picks up, still in the wide view. */
  toPhone: 14.2,
  /** The run's walk back east starts (the fight's end and the walk are two segments: a rest between). Owner round 1: the walk at 2×. */
  walk: 17.0,
  walkSpeed: 2,
  /** Staged tells (feeds/comm.ts) during the walk: the lens's Comm key gets its unread count. */
  tells: [18.6, 19.9, 21.0],
  /** Messages (Comm) opens; the first chat; the second; Messages closes. */
  commOpen: 22.8,
  chatA: 24.6,
  chatB: 26.6,
  commClose: 28.6,
  /** The pane strip opens (Timers), a swipe to Group, one back to Timers, its band dragged up to about half its height (owner round 1, item 6), the strip closes. */
  panesOpen: 30.4,
  swipeA: 32.3,
  swipeB: 34.2,
  stripResize: 36.3,
  panesClose: 38.8,
  /** The phone turns to landscape (the frame's turn in the film); the take's viewport changes just after. */
  rotate: 40.6,
  rotateS: 1.2,
  /** In landscape: the lens dragged a little, then held and made larger. */
  lensMove: 43.8,
  lensResize: 46.4,
  /** The film's end (s from sync); the takes run a little past it. */
  end: 50.0,
} as const;

/**
 * Film 2's act 6 phone shot (record/scenes/film2-phone.ts, s from its
 * `film0`): the start page with the account in the owner row, History
 * tapped, the Bree session in Sessions; the film shows it until `end`.
 */
export const PHONE_SHOT = { history: 2.2, end: 8.0 } as const;
