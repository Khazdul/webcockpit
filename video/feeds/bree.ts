// "An evening in Bree": the test scene's feed, from the repository's
// fixtures (tests/fixtures/map-demo.log, timers-demo.log; invented names).
// Rasta logs in on the Old East Road, casts his spells, hears a narrate
// and looks around before the camera rolls (the look re-centres the map
// once its data has loaded and scrolls the client's own startup lines out
// of view); on camera he walks north past the Prancing Pony, east along
// Cobble Street, up Mill Road and west to Stone Road, and Gibur's tell
// arrives on the way.
import { type Step, comm, feedFriends, feedParts, fixture, toSteps } from '../../scripts/lib/mume-feed.ts';

/** Moves on camera (commands of the walk). */
const MOVES = 10;
/** The tell comes after this many moves. */
const TELL_AFTER = 5;

/** `look` in the login room: its Room.Info (counts as a look for the map), name, description, exits, prompt. */
function lookSteps(): Step[] {
  const map = fixture('map-demo.log');
  const info = map.findIndex((l) => l.startsWith('\x1bGMCP Room.Info '));
  const prompt = map.findIndex((l, i) => i > info && l === '*=>');
  return toSteps(['> look', ...map.slice(info, prompt + 1).filter((l) => !l.startsWith('\x1bGMCP ') || l.startsWith('\x1bGMCP Room.Info '))], { descs: true });
}

export function breeFeed(): { before: Step[]; look: Step[]; walk: Step[] } {
  const { login, spells, walk } = feedParts();
  const onCamera: Step[] = [];
  let moves = 0;
  for (const s of walk) {
    if ('cmd' in s && moves === MOVES) break;
    if ('cmd' in s) moves++;
    onCamera.push(s);
    // the tell after the room reply of move TELL_AFTER
    if ('out' in s && moves === TELL_AFTER && !onCamera.some((x) => x.mark === 'tell')) {
      onCamera.push({ ...comm('tells', 'Gibur', "Gibur tells you 'meet me at the Pony, bring the merc'", '32'), mark: 'tell' });
    }
  }
  const before = [...login, feedFriends(), ...spells, comm('tales', 'Gibur', "Gibur narrates 'orcs gathering at the ford'", '33')];
  return { before, look: lookSteps(), walk: onCamera };
}
