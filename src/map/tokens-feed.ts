// The map tokens' main-thread side (stage 80 §7, ADR 0171): what the map
// worker is told about the tokens, and the drawings it asks for.
//
// - `tokenState` (pure): the switches, your face and each group member's
//   by its Group.* id (in `GameState.groupTable` order), the hue from that
//   table, the looks from the one resolver (src/looks/resolve.ts), the HP
//   fractions (`vitalPct`; yours from `Char.Vitals`) and the arc's colours
//   by tone (`hpToneColors`, shared with the Group pane).
// - `TokenFeed` sends it only when it changed (one compare of a small JSON
//   per change of the game, the settings, the looks or the library, at most
//   once a frame, and not while the map is hidden), and answers the
//   worker's `tokenArt`: an engraved drawing is baked once per (id, sex) at
//   128 px (src/panes/portraits, ADR 0166), one at a time and after the
//   frame (a bake runs SVG filters: never in the game path), and sent as a
//   transferred ImageBitmap. Own images (part D) come through `ownBytes`.
// - Without looks (the log player, the replay bundle: no `ctx.looks`) the
//   pane makes no feed and the worker draws today's boxes.

import type { GameState } from '../gmcp/state';
import { vitalPct } from '../gmcp/group';
import { bandMidpoint } from '../gmcp/bands';
import { type Library, libraryNow, loadLibrary, onLibrary, tokenUrl } from '../looks/library';
import { type Look, autoMember, autoSelf, resolveMember, resolveSelf } from '../looks/resolve';
import type { LooksStore } from '../looks/store';
import { hpToneColors } from '../panes/group-model';
import { isPortraitId } from '../panes/portrait';
import { portraitArt } from '../panes/portraits';
import type { Settings } from '../settings/types';
import { type TokenColors, type TokenFace, type TokenLook, type TokenMember, type TokenState, tokenKey } from './protocol';

/** The key of a token's picture (re-exported for the lazily loaded pane side). */
export const tokenKeyOf = tokenKey;

/** A resolved look as the worker draws it. */
export function tokenLook(l: Look): TokenLook {
  switch (l.kind) {
    case 'lib':
      return { k: 'lib', id: l.id };
    case 'own':
      return { k: 'own', id: l.id };
    case 'drawn':
      return { k: 'drawn', portrait: l.portrait, sex: l.sex };
    default:
      return { k: 'none' };
  }
}

/** `#rrggbb` (or `#rgb`) as 0xRRGGBB; `fallback` for anything else. */
export function hexColor(css: string, fallback: number): number {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css.trim());
  if (!m) return fallback;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return Number.parseInt(h, 16);
}

export interface TokenStateInput {
  settings: Readonly<Settings>;
  /** The arc's colours for a light map (the map's background decides). */
  light: boolean;
  game: GameState;
  looks: LooksStore;
  library: Library | null;
  /** The library's 128 px pictures, `${BASE_URL}tokens/t/`. */
  lib: string;
}

const face = (look: Look, alt: Look, hp: number | null): TokenFace => {
  const f: TokenFace = { look: tokenLook(look), hp };
  // A picture that may not load falls back to the drawing (spec §1: one row down).
  if (look.kind === 'lib' || look.kind === 'own') f.alt = tokenLook(alt);
  return f;
};

/** Your HP fraction from `Char.Vitals` (the number when exact, else the band's middle), or null. */
function selfHp(game: GameState): number | null {
  const v = game.char.view().vitals.hp;
  if (v.value !== null && v.max !== null && v.max > 0 && (v.exact || v.word === null)) return Math.max(0, Math.min(1, v.value / v.max));
  return bandMidpoint('hp', v.word);
}

/** What the worker gets (the `tokens` message without its `t`). */
export function tokenState(i: TokenStateInput): TokenState {
  const { game, looks, library } = i;
  const s = i.settings;
  const sv = game.char.statusVars;
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const ownImages = looks.ownIds();
  const selfIn = { mode: 'live' as const, choice: looks.lookFor(game.char.name), race: str(sv.get('race')), subrace: str(sv.get('subrace')), sex: game.sex, library, ownImages };
  const self = face(resolveSelf(selfIn), autoSelf(selfIn), selfHp(game));
  const members: TokenMember[] = [];
  for (const e of game.groupTable.values()) {
    const npc = e.type === 'npc';
    const mi = { mode: 'live' as const, name: e.name, npc, choice: looks.lookFor(e.name), library, ownImages, dir: npc ? null : looks.dirFor(e.name) };
    const m = game.group.get(e.id);
    const hp = m ? vitalPct('hp', m.hp).pct : null;
    members.push({ id: e.id, color: game.groupTable.colorOf(e.id) ?? 0, ...face(resolveMember(mi), autoMember(mi), hp) });
  }
  const c = hpToneColors(s, i.light);
  const colors: TokenColors = { ok: hexColor(c.ok, 0x3fd062), low: hexColor(c.low, 0xff8c2a), critical: hexColor(c.critical, 0xff4d4d) };
  return { on: s.mapper.tokens, hp: s.mapper.tokenHp, self, members, colors, lib: i.lib };
}

export interface TokenFeedOptions {
  game: GameState;
  looks: LooksStore;
  settings: { get(): Readonly<Settings>; subscribe(fn: (next: Readonly<Settings>, prev: Readonly<Settings>) => void): () => void };
  doc: Document;
  /** Whether the map's background is light (the arc's colours). */
  light: () => boolean;
  requestFrame: (cb: () => void) => void;
  send: (m: TokenState) => void;
  /** Answers a `tokenArt` (a transferred bitmap, bytes, or failed). */
  answer: (key: string, a: { bitmap?: ImageBitmap; bytes?: ArrayBuffer; failed?: boolean }) => void;
  /** Part D: an own image's bytes (absent: none, the face falls back). */
  ownBytes?: (id: string) => Promise<ArrayBuffer | null>;
  /** The library's 128 px pictures' URL prefix (default `${BASE_URL}tokens/t/`). */
  lib?: string;
}

export class TokenFeed {
  private last = '';
  private scheduled = false;
  private active = false;
  private readonly offs: (() => void)[] = [];
  private readonly queue: { key: string; look: TokenLook }[] = [];
  private baking = false;
  private disposed = false;
  private readonly lib: string;

  constructor(private readonly o: TokenFeedOptions) {
    this.lib = o.lib ?? tokenUrl('', 't').replace(/\.webp$/, '');
    const want = (): void => this.update();
    this.offs.push(
      o.game.subscribe((part) => (part === 'group' || part === 'char') && want()),
      o.settings.subscribe((n, p) => (n.mapper !== p.mapper || n.group !== p.group || n.appearance !== p.appearance || n.panes !== p.panes) && want()),
      o.looks.subscribe(want),
      onLibrary(want),
    );
  }

  /** The map is shown (sending) or hidden (nothing is computed until it shows again). */
  setActive(on: boolean): void {
    this.active = on;
    if (on) this.update();
  }

  /** Something changed: computed and sent (if it differs) in the next frame. */
  update(): void {
    if (!this.active || this.scheduled || this.disposed) return;
    this.scheduled = true;
    this.o.requestFrame(() => {
      this.scheduled = false;
      if (this.active && !this.disposed) this.flush();
    });
  }

  /** Computes and sends now, if changed (tests call it directly). */
  flush(): void {
    const s = this.o.settings.get();
    const lib = libraryNow();
    const st = tokenState({ settings: s, light: this.o.light(), game: this.o.game, looks: this.o.looks, library: lib, lib: this.lib });
    // NPCs are matched only with the manifest: load it once there is one to match (tokens on).
    if (st.on && !lib && st.members.some((m) => this.o.game.groupTable.get(m.id)?.type === 'npc')) void loadLibrary();
    const key = JSON.stringify(st);
    if (key === this.last) return;
    this.last = key;
    this.o.send(st);
  }

  /** The worker asks for a picture (`tokenArt`): baked or read in turn. */
  art(key: string, look: TokenLook): void {
    if (this.queue.some((q) => q.key === key)) return;
    this.queue.push({ key, look });
    this.next();
  }

  private next(): void {
    if (this.baking || this.disposed) return;
    const job = this.queue.shift();
    if (!job) return;
    this.baking = true;
    // After the frame, off the game path.
    setTimeout(() => {
      void this.make(job.look).then(
        (a) => {
          if (!this.disposed) this.o.answer(job.key, a);
        },
        () => {
          if (!this.disposed) this.o.answer(job.key, { failed: true });
        },
      ).finally(() => {
        this.baking = false;
        this.next();
      });
    }, 0);
  }

  private async make(look: TokenLook): Promise<{ bitmap?: ImageBitmap; bytes?: ArrayBuffer; failed?: boolean }> {
    if (look.k === 'own') {
      const bytes = this.o.ownBytes ? await this.o.ownBytes(look.id) : null;
      return bytes ? { bytes } : { failed: true };
    }
    if (look.k !== 'drawn' || !isPortraitId(look.portrait)) return { failed: true };
    const url = await portraitArt(this.o.doc, look.portrait, look.sex, 'medium', 128);
    if (!url) return { failed: true };
    const win = this.o.doc.defaultView;
    if (!win || typeof win.createImageBitmap !== 'function') return { failed: true };
    const img = new win.Image();
    img.src = url;
    await img.decode();
    const bitmap = await win.createImageBitmap(img, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
    return { bitmap };
  }

  dispose(): void {
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    this.queue.length = 0;
  }
}
