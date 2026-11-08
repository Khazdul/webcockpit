// @vitest-environment happy-dom
// Stage 42-0 (ADR 0127): the lantern kit's barrel exports the whole stage 42
// API (so the parallel packages and the page stages code against one set
// of names), the places are real, and the gallery shell finds its sections.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import * as look from '../../src/chrome/kit/look';
import { InlineBack, LookPlaceCtx, useLookPlace } from '../../src/chrome/kit/look';
import { FrameStack, useNav } from '../../src/chrome/kit/stack';
import { kitSections } from '../../src/chrome/kit/gallery';
import { findInSections } from '../../src/editor/look-manual-find';
import { LOOK_CODE_CLASS, lookCodeTheme } from '../../src/editor/look-code';
import { EMPTY_QUERY } from '../../src/editor/manual-search';

afterEach(() => render(null, document.body));

describe('the kit barrel', () => {
  it('exports every name of the stage 42 API', () => {
    const names = [
      // 42a
      'lookFrame', 'isLookFrame', 'SceneryCtx', 'useScenery', 'LookPlaceCtx', 'useLookPlace', 'Box', 'BoxHead',
      'BoxBody', 'BoxFoot', 'useBoxSettled', 'BackButton', 'InlineBack', 'MOTION', 'reducedMotion', 'useReducedMotion',
      // 42b
      'GlassButton', 'Seg', 'Tabs', 'Field', 'TextArea', 'Check', 'Toggle', 'Select', 'Table', 'TableRow', 'Rule',
      'OrnRule', 'Fold', 'Well', 'Stars', 'LookFlash', 'useLocalFlash', 'useKeyboardInset', 'Seal', 'Icon', 'ICONS',
      // 42c
      'Dialog', 'KeyHelp', 'openKeyHelp', 'Popover', 'useListCursor', 'useGridCursor', 'useButtonZone', 'letterOf',
      'letterAt', 'KeyLabel', 'letterAction',
      // 42d
      'useWindowChrome',
    ];
    const missing = names.filter((n) => !(n in look));
    expect(missing).toEqual([]);
  });

  it('gives the editor stubs their names', () => {
    expect(LOOK_CODE_CLASS).toBe('wc-code');
    expect(lookCodeTheme()).toBeDefined();
    const r = findInSections([{ group: 'intro', heading: 'Timers', text: ['A timer runs.', 'timer'] }], { ...EMPTY_QUERY, search: 'timer' });
    expect(r.matches.map((m) => [m.section, m.block])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
  });
});

describe('places', () => {
  function Where() {
    return <span class="where">{useLookPlace()}</span>;
  }

  it('is start by default and what the host provides', () => {
    render(
      <>
        <Where />
        <LookPlaceCtx.Provider value="window">
          <Where />
        </LookPlaceCtx.Provider>
        <LookPlaceCtx.Provider value="menu">
          <Where />
        </LookPlaceCtx.Provider>
      </>,
      document.body,
    );
    expect([...document.querySelectorAll('.where')].map((e) => e.textContent)).toEqual(['start', 'window', 'menu']);
  });

  it('draws InlineBack only in a window, and only on a sub-page', async () => {
    let pushed = false;
    function Sub() {
      return <InlineBack />;
    }
    function Root() {
      const nav = useNav();
      if (!pushed) {
        pushed = true;
        queueMicrotask(() => nav.push(<Sub />));
      }
      return <InlineBack />;
    }
    const backs = () => document.querySelectorAll('.wc-frame:not([hidden]) .wc-lk-iback').length;
    await act(async () => {
      render(
        <LookPlaceCtx.Provider value="window">
          <FrameStack root={<Root />} active />
        </LookPlaceCtx.Provider>,
        document.body,
      );
      await Promise.resolve();
    });
    expect(backs()).toBe(1);
    await act(async () => document.querySelector<HTMLElement>('.wc-lk-iback')!.click());
    expect(backs()).toBe(0);
    pushed = false;
    render(null, document.body);
    await act(async () => {
      render(<FrameStack root={<Root />} active />, document.body);
      await Promise.resolve();
    });
    expect(backs()).toBe(0);
  });
});

describe('the gallery shell', () => {
  it('lists the sections in this folder, never the index', () => {
    const ids = kitSections().map((s) => s.id);
    expect(ids).not.toContain('index');
    expect(new Set(ids).size).toBe(ids.length);
  });
});
