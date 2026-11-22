// @vitest-environment happy-dom
// The Character card's portraits (stage 77 part E, ADR 0166 addenda 10
// and 11): the subrace → race → portrait lookup, the figures, the raster file rule, and that
// the pane builds a figure only when the portrait changes.
import { afterEach, describe, expect, it } from 'vitest';
import { SUBRACE_RACE, raceKind, subraceKind } from '../../src/gmcp/race';
import { PORTRAIT_IDS, isPortraitId, portraitImage, portraitOf, portraitRace, rasterIds } from '../../src/panes/portrait';
import { figureSvg } from '../../src/panes/portrait-figures';
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

describe('the figures', () => {
  it('one per id, in the 60 × 75 box, with no markup but shapes', () => {
    // Nine races, their eighteen subraces and the neutral figure.
    expect(PORTRAIT_IDS).toHaveLength(28);
    expect(new Set(PORTRAIT_IDS).size).toBe(28);
    for (const sub of Object.keys(SUBRACE_RACE)) expect(isPortraitId(sub), sub).toBe(true);
    for (const id of PORTRAIT_IDS) {
      const svg = figureSvg(document, id);
      expect(svg.getAttribute('viewBox')).toBe('0 0 60 75');
      expect(svg.getAttribute('class')).toBe('wc-cc-fig');
      expect(svg.dataset.portrait).toBe(id);
      expect(svg.children.length).toBeGreaterThan(2);
      for (const c of svg.children) expect(['path', 'rect', 'ellipse', 'circle']).toContain(c.tagName);
    }
  });

  it('the races keep their own fills, the neutral figure takes the pane’s', () => {
    expect(figureSvg(document, 'orc').querySelector('[fill="#ffcf4a"]')).not.toBeNull();
    expect(figureSvg(document, 'neutral').querySelector('[fill]')).toBeNull();
  });

  it('every subrace draws apart from its siblings and its race, but the Tarkhnarb is the orc', () => {
    const markup = (id: (typeof PORTRAIT_IDS)[number]): string => figureSvg(document, id).innerHTML;
    const subs = Object.keys(SUBRACE_RACE) as Array<keyof typeof SUBRACE_RACE>;
    const seen = new Map<string, string>();
    for (const id of PORTRAIT_IDS) {
      const m = markup(id);
      if (id === 'tarkhnarb') {
        expect(m).toBe(markup('orc'));
        continue;
      }
      expect(seen.get(m), `${id} draws as ${seen.get(m)}`).toBeUndefined();
      seen.set(m, id);
    }
    expect(subs).toHaveLength(18);
  });
});

describe('raster files', () => {
  it('only the ids the build found, under the base', () => {
    const have = rasterIds(['/public/portraits/orc.webp', '/public/portraits/neutral.webp', '/public/portraits/goblin.webp', '/public/portraits/README.md']);
    expect([...have].sort()).toEqual(['neutral', 'orc']);
    expect(portraitImage('orc', have, '/')).toBe('/portraits/orc.webp');
    expect(portraitImage('orc', have, '/app/')).toBe('/app/portraits/orc.webp');
    // A race with no file keeps its placeholder: no fallback to neutral.webp.
    expect(portraitImage('troll', have)).toBeNull();
    expect(portraitImage('cavetroll', have)).toBeNull();
    expect(isPortraitId('goblin')).toBe(false);
  });

  it('a subrace: its own file, else its race\'s, else its own placeholder', () => {
    expect(portraitRace('cavetroll')).toBe('troll');
    expect(portraitRace('zaugurz')).toBe('orc');
    expect(portraitRace('troll')).toBeNull();
    expect(portraitRace('neutral')).toBeNull();
    const have = rasterIds(['/public/portraits/orc.webp', '/public/portraits/zaugurz.webp', '/public/portraits/neutral.webp']);
    expect(portraitImage('zaugurz', have, '/')).toBe('/portraits/zaugurz.webp');
    expect(portraitImage('tarkhnarb', have, '/')).toBe('/portraits/orc.webp');
    expect(portraitImage('morruhk', have, '/')).toBe('/portraits/orc.webp');
    expect(portraitImage('dunadan', have, '/')).toBeNull();
    expect(portraitImage('halfelf', have, '/')).toBeNull();
  });

  it('none are in the repository today: nothing is requested', () => {
    for (const id of PORTRAIT_IDS) expect(portraitImage(id)).toBeNull();
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
    const fig = (): SVGElement => pane.content.querySelector<SVGElement>('.wc-cc-disc .wc-cc-fig')!;
    gmcp('Char.Vitals', { hp: 10, maxhp: 20 });
    expect(fig().dataset.portrait).toBe('neutral');
    gmcp('Char.StatusVars', { race: 'Orc', subrace: 'Tarkhnarb Orc' });
    const orc = fig();
    expect(orc.dataset.portrait).toBe('tarkhnarb');
    gmcp('Char.StatusVars', { subrace: 'Uruk-Tarkhnarb' });
    expect(fig()).toBe(orc);
    gmcp('Char.Vitals', { hp: 12 });
    expect(fig()).toBe(orc);
    gmcp('Char.StatusVars', { subrace: 'Orc' });
    expect(fig().dataset.portrait).toBe('orc');
    gmcp('Char.StatusVars', { subrace: 'Zaugurz Orc' });
    expect(fig().dataset.portrait).toBe('zaugurz');
    gmcp('Char.StatusVars', { race: 'Troll', subrace: 'Cave Troll' });
    expect(fig().dataset.portrait).toBe('cavetroll');
    expect(pane.content.querySelectorAll('.wc-cc-disc > *')).toHaveLength(1);
    expect(pane.content.querySelector('.wc-cc-disc img')).toBeNull();
  });
});
