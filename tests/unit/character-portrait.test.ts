// @vitest-environment happy-dom
// The Character card's portraits (stage 77 part E, ADR 0166 addenda 10
// and 11): the subrace → race → portrait lookup, the figures, the raster file rule, and that
// the pane builds a figure only when the portrait changes.
import { afterEach, describe, expect, it, vi } from 'vitest';

const art = vi.hoisted(() => vi.fn(async (_doc: Document, _id: string, _sex: string, _size: string, _px: number) => null as string | null));
vi.mock('../../src/panes/portraits', async (orig) => ({ ...(await orig<typeof import('../../src/panes/portraits')>()), portraitArt: art }));
import { SUBRACE_RACE, raceKind, subraceKind } from '../../src/gmcp/race';
import { PORTRAIT_IDS, isPortraitId, portraitImage, portraitOf, portraitRace, rasterIds, rasterName } from '../../src/panes/portrait';
import { figureSvg } from '../../src/panes/portrait-figures';
import { PORTRAIT_GROUP, bucketPx, loadDraw, sizeFor } from '../../src/panes/portraits';
import { Bus } from '../../src/core/bus';
import { GameState } from '../../src/gmcp/state';
import { CharacterPane } from '../../src/panes/character';
import { createPaneContext } from '../../src/panes/context';
import { SettingsStore } from '../../src/settings';

describe('portraitOf', () => {
  it('the known pairs and the inferred ones', () => {
    const rows: Array<[string | null, string | null, string]> = [
      ['Orc', 'Tarkhnarb Orc', 'tarkhnarb'],
      ['Orc', 'Uruk-Tarkhnarb', 'tarkhnarb'],
      ['Orc', 'Morruhk Orc', 'morruhk'],
      ['Orc', 'Morrukh', 'morruhk'],
      ['Orc', 'Uruk-Morruhk', 'morruhk'],
      ['Orc', 'Zaugurz', 'zaugurz'],
      ['Orc', 'Zaugurz Orc', 'zaugurz'],
      ['Zaugurz Orc', '', 'zaugurz'],
      ['Zaugurz', null, 'zaugurz'],
      ['Orc', null, 'orc'],
      ['Orcs', 'Snaga', 'orc'],
      ['Hobbit', 'Fallohide', 'fallohide'],
      ['Hobbit', 'Fallohide Hobbit', 'fallohide'],
      ['Hobbit', 'Harfoot Hobbit', 'harfoot'],
      ['Hobbits', 'Harfeet', 'harfoot'],
      ['Hobbit', 'Stoor', 'stoor'],
      ['Hobbit', null, 'hobbit'],
      ['Troll', 'Cave Troll', 'cavetroll'],
      ['Troll', 'Hill Troll', 'hilltroll'],
      ['Troll', 'Mountain Troll', 'mountaintroll'],
      ['Troll', 'Olog', 'troll'],
      ['Troll', null, 'troll'],
      ['Man', 'Black Númenórean', 'numenorean'],
      ['Black Númenórean', '', 'numenorean'],
      // Melker's run (2026-11-25, ADR 0166 addendum 46): MUME's own pair.
      ['Black Númenórean', null, 'numenorean'],
      ['Man', 'Númenórean', 'numenorean'],
      ['Half-elven', null, 'halfelf'],
      ['Elf', 'Half-Elf', 'halfelf'],
      ['Half-elf', 'Half-Elven', 'halfelf'],
      ['Bear', null, 'beorning'],
      ['Bears', '', 'beorning'],
      ['Man', 'Beorning', 'beorning'],
      ['Beorning', null, 'beorning'],
      ['Man', 'Dúnadan', 'dunadan'],
      ['Man', 'Dúnadan Man', 'dunadan'],
      ['Man', 'Dúnedain', 'dunadan'],
      ['Man', 'Eriadorian Man', 'eriadorian'],
      ['Men', 'Eriadoran', 'eriadorian'],
      ['Man', 'Rohirrim', 'rohirrim'],
      ['Human', null, 'human'],
      ['Men', null, 'human'],
      ['Elf', 'Silvan Elf', 'silvan'],
      ['Elf', 'Sindarin Elf', 'sinda'],
      ['Elf', 'Sinda', 'sinda'],
      ['Elves', 'Sindar', 'sinda'],
      ['Elf', 'Noldorin Elf', 'noldo'],
      ['Elf', 'Noldo', 'noldo'],
      ['Elves', 'Noldor', 'noldo'],
      ['Elves', null, 'elf'],
      ['Dwarf', 'Broadbeam Dwarf', 'broadbeam'],
      ['Dwarf', 'Longbeard Dwarf', 'longbeard'],
      ['Dwarves', 'Firebeards', 'firebeard'],
      ['Dwarves', null, 'dwarf'],
      ['Wizard of the West', null, 'neutral'],
      ['Dunadan', null, 'neutral'],
      ['', '', 'neutral'],
      [null, null, 'neutral'],
    ];
    for (const [race, sub, want] of rows) expect(portraitOf(race, sub), `${race} / ${sub}`).toBe(want);
  });

  it('a subrace word counts only beside its own race', () => {
    expect(subraceKind('Cave', null)).toBeNull();
    expect(subraceKind('Man', 'Cave')).toBeNull();
    expect(subraceKind('Dwarf', 'Noldorin')).toBeNull();
    expect(subraceKind('Elf', 'Stoor')).toBeNull();
    expect(subraceKind('Half-elf', 'Sindarin')).toBeNull();
    expect(portraitOf('Man', 'Cave')).toBe('human');
    expect(portraitOf('Dwarf', 'Noldorin')).toBe('dwarf');
  });

  it('is the subrace, else raceKind, else neutral', () => {
    expect(portraitOf('DWARF')).toBe(raceKind('DWARF'));
    expect(portraitOf('troll', 'CAVE TROLL')).toBe(subraceKind('troll', 'CAVE TROLL'));
    expect(raceKind('nothing known')).toBeNull();
    // The race level is unchanged by the subraces: one kind per race.
    expect(raceKind('Orc', 'Zaugurz Orc')).toBe('orc');
    expect(raceKind('Troll', 'Mountain Troll')).toBe('troll');
  });
});

describe('the drawings', () => {
  const sexes = ['male', 'female'] as const;
  const sizes = ['large', 'medium'] as const;

  it('one per id in a lazy chunk, both sexes and sizes, a standalone still SVG in the 200 square', async () => {
    expect(PORTRAIT_IDS).toHaveLength(28);
    expect(new Set(PORTRAIT_IDS).size).toBe(28);
    for (const sub of Object.keys(SUBRACE_RACE)) expect(isPortraitId(sub), sub).toBe(true);
    for (const id of PORTRAIT_IDS) {
      expect(PORTRAIT_GROUP[id], id).toBeDefined();
      const draw = await loadDraw(id);
      expect(draw, id).not.toBeNull();
      for (const sex of sexes)
        for (const size of sizes) {
          const uid = `t${id}${sex[0]}${size[0]}-`;
          const svg = draw!({ sex, size, uid });
          const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
          const root = doc.documentElement;
          expect(root.tagName.toLowerCase(), `${id} ${sex} ${size}`).toBe('svg');
          expect(root.getAttribute('viewBox')).toBe('0 0 200 200');
          expect(root.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
          // Still images: nothing that moves, no style sheet, no script.
          expect(svg).not.toMatch(/<(animate|animateTransform|animateMotion|set|style|script)\b/);
          // Every def id is this drawing's own, so two drawings never clash.
          for (const m of svg.matchAll(/\sid="([^"]+)"/g)) expect(m[1]!.startsWith(uid), `${id}: ${m[1]}`).toBe(true);
          for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) expect(m[1]!.startsWith(uid), `${id}: url(#${m[1]})`).toBe(true);
        }
    }
  });

  it('every drawing differs from every other, the women from the men, but the neutral figure is one', async () => {
    const seen = new Map<string, string>();
    for (const id of PORTRAIT_IDS) {
      const draw = (await loadDraw(id))!;
      for (const sex of sexes) {
        const svg = draw({ sex, size: 'large', uid: 'u-' });
        if (id === 'neutral' && sex === 'female') {
          expect(svg).toBe(draw({ sex: 'male', size: 'large', uid: 'u-' }));
          continue;
        }
        expect(seen.get(svg), `${id} ${sex} draws as ${seen.get(svg)}`).toBeUndefined();
        seen.set(svg, `${id} ${sex}`);
      }
    }
    expect(seen.size).toBe(55);
  });

  it('the Medium drawing is its own, and the pixel buckets climb by about a quarter', async () => {
    const d = (await loadDraw('longbeard'))!;
    expect(d({ sex: 'male', size: 'medium', uid: 'u-' })).not.toBe(d({ sex: 'male', size: 'large', uid: 'u-' }));
    expect(sizeFor(40)).toBe('medium');
    expect(sizeFor(71)).toBe('medium');
    expect(sizeFor(72)).toBe('large');
    expect(bucketPx(1)).toBe(32);
    expect(bucketPx(80)).toBeGreaterThanOrEqual(80);
    expect(bucketPx(200)).toBeGreaterThanOrEqual(200);
    expect(bucketPx(200)).toBeLessThan(260);
    expect(bucketPx(5000)).toBe(1024);
    for (const px of [33, 99, 360, 700]) expect(bucketPx(bucketPx(px))).toBe(bucketPx(px));
  });

  it('the stand-in silhouette takes the pane\'s colours', () => {
    const svg = figureSvg(document);
    expect(svg.getAttribute('viewBox')).toBe('0 0 60 75');
    expect(svg.querySelector('[fill]')).toBeNull();
  });
});

describe('raster files', () => {
  it('only the names the build found, by sex, under the base', () => {
    const have = rasterIds(['/public/portraits/orc-male.webp', '/public/portraits/orc.webp', '/public/portraits/neutral.webp', '/public/portraits/goblin-male.webp', '/public/portraits/README.md']);
    expect([...have].sort()).toEqual(['neutral', 'orc-male']);
    expect(rasterName('orc', 'female')).toBe('orc-female');
    expect(rasterName('neutral', 'female')).toBe('neutral');
    expect(portraitImage('orc', 'male', have, '/')).toBe('/portraits/orc-male.webp');
    expect(portraitImage('orc', 'male', have, '/app/')).toBe('/app/portraits/orc-male.webp');
    // Never the other sex's file: both are drawn.
    expect(portraitImage('orc', 'female', have, '/')).toBeNull();
    expect(portraitImage('neutral', 'female', have, '/')).toBe('/portraits/neutral.webp');
    // A race with no file keeps its drawing: no fallback to neutral.webp.
    expect(portraitImage('troll', 'male', have)).toBeNull();
    expect(portraitImage('cavetroll', 'male', have)).toBeNull();
    expect(isPortraitId('goblin')).toBe(false);
  });

  it("a subrace: its own file, else its race's of the same sex, else its own drawing", () => {
    expect(portraitRace('cavetroll')).toBe('troll');
    expect(portraitRace('zaugurz')).toBe('orc');
    expect(portraitRace('troll')).toBeNull();
    expect(portraitRace('neutral')).toBeNull();
    const have = rasterIds(['/public/portraits/orc-male.webp', '/public/portraits/zaugurz-female.webp', '/public/portraits/neutral.webp']);
    expect(portraitImage('zaugurz', 'female', have, '/')).toBe('/portraits/zaugurz-female.webp');
    expect(portraitImage('zaugurz', 'male', have, '/')).toBe('/portraits/orc-male.webp');
    expect(portraitImage('tarkhnarb', 'male', have, '/')).toBe('/portraits/orc-male.webp');
    expect(portraitImage('morruhk', 'female', have, '/')).toBeNull();
    expect(portraitImage('dunadan', 'male', have, '/')).toBeNull();
    expect(portraitImage('halfelf', 'male', have, '/')).toBeNull();
  });

  it('none are in the repository today: nothing is requested', () => {
    for (const id of PORTRAIT_IDS) for (const sex of ['male', 'female'] as const) expect(portraitImage(id, sex)).toBeNull();
  });
});

describe('in the pane', () => {
  const panes: CharacterPane[] = [];
  afterEach(() => {
    for (const p of panes.splice(0)) p.dispose();
    document.body.innerHTML = '';
  });

  it('the race picks the figure, built only when the portrait changes', () => {
    const bus = new Bus();
    const frames: (() => void)[] = [];
    const ctx = createPaneContext({
      doc: document,
      bus,
      settings: new SettingsStore({ factory: null, storage: null, win: null }),
      game: new GameState().attach(bus),
      cells: { get: () => ({ w: 9, h: 17, px: 14.95 }), subscribe: () => () => {} },
      requestFrame: (cb) => frames.push(cb),
      connState: () => 'playing',
      sender: { sendCommand: () => {}, sendGmcp: () => {} },
    });
    const pane = new CharacterPane(ctx);
    panes.push(pane);
    document.body.append(pane.el);
    pane.place({ rect: { x: 0, y: 0, w: 48, h: 10 }, content: { x: 0, y: 0, w: 48, h: 10 }, framed: false }, { w: 9, h: 17 });
    const gmcp = (pkg: string, data: unknown): void => {
      bus.emit('gmcp', { pkg, data });
      while (frames.length) frames.shift()!();
    };
    const disc = (): HTMLElement => pane.content.querySelector<HTMLElement>('.wc-cc-disc')!;
    const asked = (): string[] => art.mock.calls.map((c) => `${c[1]}|${c[2]}|${c[3]}`);
    gmcp('Char.Vitals', { hp: 10, maxhp: 20 });
    expect(disc().dataset.portrait).toBe('neutral');
    // Until an image is ready, the neutral silhouette in the pane's colours.
    expect(disc().querySelector('.wc-cc-fig')).not.toBeNull();
    gmcp('Char.StatusVars', { race: 'Orc', subrace: 'Tarkhnarb Orc' });
    expect(disc().dataset.portrait).toBe('tarkhnarb');
    expect(disc().dataset.sex).toBe('male');
    const n = art.mock.calls.length;
    expect(asked().at(-1)).toBe('tarkhnarb|male|large');
    // The same portrait from other words, and a repaint: no new bake.
    gmcp('Char.StatusVars', { subrace: 'Uruk-Tarkhnarb' });
    gmcp('Char.Vitals', { hp: 12 });
    expect(art.mock.calls.length).toBe(n);
    gmcp('Char.StatusVars', { subrace: 'Orc' });
    expect(disc().dataset.portrait).toBe('orc');
    gmcp('Char.StatusVars', { subrace: 'Zaugurz Orc' });
    expect(disc().dataset.portrait).toBe('zaugurz');
    gmcp('Char.StatusVars', { race: 'Troll', subrace: 'Cave Troll' });
    expect(disc().dataset.portrait).toBe('cavetroll');
    expect(asked().slice(-3)).toEqual(['orc|male|large', 'zaugurz|male|large', 'cavetroll|male|large']);
    // The bake is asked at the disc's device pixels, rounded up to a bucket.
    for (const c of art.mock.calls) expect(c[4]).toBe(bucketPx(c[4]));
  });
});
