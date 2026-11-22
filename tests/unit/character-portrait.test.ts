// @vitest-environment happy-dom
// The Character card's portraits (stage 77 part E, ADR 0166 addendum 10):
// the race → portrait lookup, the figures, the raster file rule, and that
// the pane builds a figure only when the portrait changes.
import { afterEach, describe, expect, it } from 'vitest';
import { raceKind } from '../../src/gmcp/race';
import { PORTRAIT_IDS, isPortraitId, portraitImage, portraitOf, rasterIds } from '../../src/panes/portrait';
import { figureSvg } from '../../src/panes/portrait-figures';
import { Bus } from '../../src/core/bus';
import { GameState } from '../../src/gmcp/state';
import { CharacterPane } from '../../src/panes/character';
import { createPaneContext } from '../../src/panes/context';
import { SettingsStore } from '../../src/settings';

describe('portraitOf', () => {
  it('the known pairs and the inferred ones', () => {
    const rows: Array<[string | null, string | null, string]> = [
      ['Orc', 'Tarkhnarb Orc', 'orc'],
      ['Orc', 'Zaugurz', 'orc'],
      ['Orc', null, 'orc'],
      ['Hobbit', 'Fallohide', 'hobbit'],
      ['Hobbit', 'Fallohide Hobbit', 'hobbit'],
      ['Troll', 'Cave Troll', 'troll'],
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
      ['Man', 'Dúnadan', 'human'],
      ['Man', 'Dúnadan Man', 'human'],
      ['Human', null, 'human'],
      ['Men', null, 'human'],
      ['Elf', 'Silvan Elf', 'elf'],
      ['Elf', 'Sindarin Elf', 'elf'],
      ['Elf', 'Noldorin Elf', 'elf'],
      ['Elves', null, 'elf'],
      ['Dwarf', 'Broadbeam Dwarf', 'dwarf'],
      ['Dwarves', null, 'dwarf'],
      ['Wizard of the West', null, 'neutral'],
      ['Dunadan', null, 'neutral'],
      ['', '', 'neutral'],
      [null, null, 'neutral'],
    ];
    for (const [race, sub, want] of rows) expect(portraitOf(race, sub), `${race} / ${sub}`).toBe(want);
  });

  it('is raceKind, with neutral for none', () => {
    expect(portraitOf('DWARF')).toBe(raceKind('DWARF'));
    expect(raceKind('nothing known')).toBeNull();
  });
});

describe('the figures', () => {
  it('one per id, in the 60 × 75 box, with no markup but shapes', () => {
    expect(PORTRAIT_IDS).toHaveLength(10);
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
});

describe('raster files', () => {
  it('only the ids the build found, under the base', () => {
    const have = rasterIds(['/public/portraits/orc.webp', '/public/portraits/neutral.webp', '/public/portraits/goblin.webp', '/public/portraits/README.md']);
    expect([...have].sort()).toEqual(['neutral', 'orc']);
    expect(portraitImage('orc', have, '/')).toBe('/portraits/orc.webp');
    expect(portraitImage('orc', have, '/app/')).toBe('/app/portraits/orc.webp');
    // A race with no file keeps its placeholder: no fallback to neutral.webp.
    expect(portraitImage('troll', have)).toBeNull();
    expect(isPortraitId('goblin')).toBe(false);
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
    expect(orc.dataset.portrait).toBe('orc');
    gmcp('Char.StatusVars', { subrace: 'Zaugurz' });
    expect(fig()).toBe(orc);
    gmcp('Char.Vitals', { hp: 12 });
    expect(fig()).toBe(orc);
    gmcp('Char.StatusVars', { race: 'Troll', subrace: 'Cave Troll' });
    expect(fig().dataset.portrait).toBe('troll');
    expect(pane.content.querySelectorAll('.wc-cc-disc > *')).toHaveLength(1);
    expect(pane.content.querySelector('.wc-cc-disc img')).toBeNull();
  });
});
