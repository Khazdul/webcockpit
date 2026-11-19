// Film 2's device act (stage 70, owner rounds 1 and 2): the shared schedule
// of the takes (record/scenes/devices.ts) and the composition
// (src/compositions/DevicesProto.tsx). Seconds from the takes' `sync`
// marker, which is also the act's 0: one session, one device live at a
// time, each picking up where the last was left.
export const DEVICES = {
  /** The desktop is left (it freezes and sleeps) and the tablet picks up, in the wide view. */
  toTablet: 5.6,
  /** The camera goes in on the live tablet once the act's caption has been read in the wide view (owner round 2, item 4: this reverses round 1's "never zoom in"). */
  tabletIn: 9.2,
  /** On the tablet, by touch, after its `butch corpse` and the keyboard folded: the lens moved a little, made about half again as large, then four taps (each steps the zoom one level out, the last from the furthest back to the nearest). */
  lensMove: 15.4,
  lensResize: 16.9,
  lensTaps: [18.9, 19.8, 20.7, 21.6],
  /** The camera comes back out to the wide view. */
  tabletOut: 22.5,
  /** The tablet is left and the phone picks up, in the wide view. */
  toPhone: 24.1,
  /** The run's walk back east starts (the fight's end and the walk are two segments: a rest between). Owner round 1: the walk at 2×. */
  walk: 26.9,
  walkSpeed: 2,
  /** Staged tells (feeds/comm.ts) during the walk: the lens's Comm key gets its unread count. */
  tells: [28.5, 29.8, 30.9],
  /** Messages (Comm) opens; the first chat; the second; Messages closes. */
  commOpen: 32.7,
  chatA: 34.5,
  chatB: 36.5,
  commClose: 38.5,
  /** The pane strip opens (Timers), a swipe to Group, one back to Timers, its band dragged up to about half its height (owner round 1, item 6), the strip closes. */
  panesOpen: 40.3,
  swipeA: 42.2,
  swipeB: 44.1,
  stripResize: 46.2,
  panesClose: 48.7,
  /**
   * Back to the desktop (owner round 2, item 5): the phone is left, the camera goes out to
   * the wide view and on in to the monitor, which wakes on take B (film2-b) on the way; at
   * `end` its screen fills the frame on take B's `film0`, and the film goes on full-screen.
   */
  back: 49.3,
  backS: 3.6,
  /** The act's end (s from sync): `back + backS`. The takes run a little past it. */
  end: 52.9,
} as const;
