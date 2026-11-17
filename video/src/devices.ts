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
  /** The run's walk back east starts (the fight's end and the walk are two segments: a rest between). */
  walk: 18.0,
  /** Staged tells (feeds/comm.ts) during the walk: the lens's Comm key gets its unread count. */
  tells: [22.6, 24.8, 26.0],
  /** Messages (Comm) opens; the first chat; the second; Messages closes. */
  commOpen: 28.5,
  chatA: 30.5,
  chatB: 32.7,
  commClose: 35.0,
  /** The pane strip opens (Timers), a swipe to Group, one back to Timers, the strip closes. */
  panesOpen: 37.0,
  swipeA: 39.0,
  swipeB: 41.0,
  panesClose: 43.0,
  /** The phone turns to landscape (the frame's turn in the film); the take's viewport changes just after. */
  rotate: 45.0,
  rotateS: 1.2,
  /** In landscape: the lens dragged a little, then held and made larger. */
  lensMove: 48.3,
  lensResize: 51.0,
  /** The film's end (s from sync); the takes run a little past it. */
  end: 55.0,
} as const;

/**
 * Film 2's act 6 phone shot (record/scenes/film2-phone.ts, s from its
 * `film0`): the start page with the account in the owner row, History
 * tapped, the Bree session in Sessions; the film shows it until `end`.
 */
export const PHONE_SHOT = { history: 2.2, end: 8.0 } as const;
