// Report's Log in from the watch page, and back (stage 64 C2, round 12's
// pick 5: "Log in goes to the start page's Account, and back here after").
//
// Logging in changes the space, which always reloads the page to the start
// menu (src/core/space.ts), so the way back is a note in sessionStorage
// (this tab only) that lives across two page loads:
//
//   the watch page's Log in   writes {back, step: 'login'} and opens the start page
//   the start menu's first    step 'login': opens Log in, and the note
//   render                    becomes step 'return'
//   the next load (the        step 'return': the note goes; logged in, the
//   login's reload)           page goes back to the run
//
// Any other way out (Back from Log in, a reload) leaves step 'return' to
// the next load without a login, which drops it. A note older than
// `RETURN_MAX_MS` is dropped too. Small and dependency free: the start
// menu imports it.

export const RETURN_KEY = 'wc.watch.back';
/** A note this old is forgotten (ms). */
export const RETURN_MAX_MS = 15 * 60_000;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface Note {
  back: string;
  step: 'login' | 'return';
  at: number;
}

function session(): Store | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Only a watch page's path on this site: `<base>r/<id>` and an optional query. */
const backOk = (back: unknown, base: string): back is string =>
  typeof back === 'string' && back.length <= 200 && back.startsWith(`${base}r/`) && /^\/[A-Za-z0-9/_-]*(\?[A-Za-z0-9=&_-]*)?$/.test(back) && !back.startsWith('//');

/** The watch page's Log in: remember where to come back to. */
export function noteLoginReturn(back: string, now = Date.now(), store: Store | null = session()): void {
  try {
    store?.setItem(RETURN_KEY, JSON.stringify({ back, step: 'login', at: now } satisfies Note));
  } catch {
    /* not kept: Log in still opens, the way back is lost */
  }
}

/**
 * The watch page's Log in, all of it (review fix CR2): the note, then, when
 * `lost` (the server answered 401 though this device holds a login: a stale
 * hint), `forget` (the app's lost-session path, src/cloud/space/flows.ts
 * `sessionLost`, which clears the hint and the keys and may reload to the
 * start page itself) before `go`. Without it the start page saw "logged
 * in" and sent the player straight back to the run, which asked to log in
 * again, for ever.
 */
export async function leaveForLogin(
  back: string,
  o: { lost: boolean; forget: () => Promise<void>; go: () => void; now?: number; store?: Store | null },
): Promise<void> {
  noteLoginReturn(back, o.now ?? Date.now(), o.store === undefined ? session() : o.store);
  if (o.lost) {
    try {
      await o.forget();
    } catch {
      /* the start page's own checks find the lost session later */
    }
  }
  o.go();
}

/**
 * The start menu's first render: `login` to open the Log in page, `go` to
 * leave for the run (logged in), or null. Moves the note on (or drops it).
 */
export function takeLoginReturn(loggedIn: boolean, base = '/', now = Date.now(), store: Store | null = session()): { open: 'login' } | { go: string } | null {
  let note: Partial<Note> | null = null;
  try {
    const raw = store?.getItem(RETURN_KEY);
    note = raw ? (JSON.parse(raw) as Partial<Note>) : null;
  } catch {
    note = null;
  }
  if (!note) return null;
  const drop = (): null => {
    try {
      store?.removeItem(RETURN_KEY);
    } catch {
      /* nothing kept */
    }
    return null;
  };
  if (!backOk(note.back, base) || typeof note.at !== 'number' || !(now - note.at >= 0 && now - note.at < RETURN_MAX_MS)) return drop();
  if (note.step === 'login' && !loggedIn) {
    try {
      store?.setItem(RETURN_KEY, JSON.stringify({ back: note.back, step: 'return', at: note.at } satisfies Note));
    } catch {
      return drop();
    }
    return { open: 'login' };
  }
  const back = note.back;
  drop();
  return loggedIn ? { go: back } : null;
}
