// @vitest-environment happy-dom
// Stage 42b (ADR 0127): the lantern kit's controls and widgets: their DOM,
// ARIA and disabled states, the icon set, and the tokens (dark and Paper;
// the inlay's are the wordmark's own constants).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Check,
  Field,
  Fold,
  GlassButton,
  ICONS,
  Icon,
  LookFlash,
  OrnRule,
  Rule,
  Seal,
  Seg,
  Select,
  Stars,
  Table,
  TableRow,
  Tabs,
  TextArea,
  Toggle,
  Well,
  keyboardInset,
  useKeyboardInset,
  useListCursor,
  useLocalFlash,
} from '../../src/chrome/kit/look';
import { INLAY_TOKENS } from '../../src/start/wordmark-svg';

afterEach(() => {
  render(null, document.body);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount(node: preact.ComponentChild): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => render(node, host));
  return host;
}

const $ = <T extends Element = HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`no ${sel}`);
  return el;
};

const click = (el: Element): void => {
  act(() => void (el as HTMLElement).click());
};

describe('GlassButton', () => {
  it('renders the label with its letter, the icon and the variants', () => {
    const host = mount(
      <GlassButton id="NEW" label="New" letter="n" icon="plus" primary small keepIcon selected onClick={() => {}} />,
    );
    const b = $(host, 'button.wc-lk-btn');
    expect(b.getAttribute('data-btn')).toBe('NEW');
    expect(b.className.split(' ').sort()).toEqual(['is-primary', 'is-sel', 'is-small', 'keep-ic', 'wc-lk-btn']);
    expect(b.tabIndex).toBe(-1);
    expect(b.getAttribute('aria-keyshortcuts')).toBe('N');
    expect($(b, 'u.wc-sk').textContent).toBe('N');
    expect(b.firstElementChild?.tagName.toLowerCase()).toBe('svg');
  });

  it('puts the icon after the label with iconAfter', () => {
    const host = mount(<GlassButton label="Next" icon="next" iconAfter onClick={() => {}} />);
    expect($(host, 'button').lastElementChild?.tagName.toLowerCase()).toBe('svg');
  });

  it('is icon-only without a label, named by its title', () => {
    const host = mount(<GlassButton icon="find" title="Find" onClick={() => {}} />);
    const b = $(host, 'button');
    expect(b.classList.contains('is-icon')).toBe(true);
    expect(b.getAttribute('aria-label')).toBe('Find');
    expect(b.textContent).toBe('');
  });

  it('ignores presses when disabled and never takes the focus', () => {
    const run = vi.fn();
    const host = mount(<GlassButton label="Export" disabled danger onClick={run} />);
    const b = $(host, 'button');
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.classList.contains('is-danger')).toBe(true);
    click(b);
    expect(run).not.toHaveBeenCalled();
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    b.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });
});

describe('Seg', () => {
  const opts = [
    { value: 'lite', label: 'Lite', letter: 'l' },
    { value: 'editor', label: 'Editor' },
    { value: 'off', label: 'Off', disabled: true },
  ];

  it('is a radiogroup of radios with aria-checked (one choice)', () => {
    const change = vi.fn();
    const host = mount(<Seg label="View" options={opts} value="lite" onChange={change} selected={1} />);
    const g = $(host, '.wc-lk-seg');
    expect(g.getAttribute('role')).toBe('radiogroup');
    expect(g.getAttribute('aria-label')).toBe('View');
    const b = [...host.querySelectorAll<HTMLElement>('.wc-lk-opt')];
    expect(b.map((x) => x.getAttribute('role'))).toEqual(['radio', 'radio', 'radio']);
    expect(b.map((x) => x.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(b.map((x) => x.getAttribute('data-opt'))).toEqual(['lite', 'editor', 'off']);
    expect(b[1]!.classList.contains('is-sel')).toBe(true);
    expect(b[2]!.getAttribute('aria-disabled')).toBe('true');
    click(b[0]!);
    click(b[2]!);
    expect(change).not.toHaveBeenCalled();
    click(b[1]!);
    expect(change).toHaveBeenCalledWith('editor');
  });

  it('reports a click on the chosen option with onReclick (wave 3), never as a change', () => {
    const change = vi.fn();
    const again = vi.fn();
    const host = mount(<Seg label="View" options={opts} value="lite" onChange={change} onReclick={again} />);
    click(host.querySelectorAll<HTMLElement>('.wc-lk-opt')[0]!);
    expect(again).toHaveBeenCalledWith('lite');
    expect(change).not.toHaveBeenCalled();
  });

  it('is a group of checkboxes with multi (chips)', () => {
    const change = vi.fn();
    const host = mount(<Seg label="Kinds" multi kind="pills" options={opts.slice(0, 2)} values={['editor']} onChange={change} />);
    const g = $(host, '.wc-lk-seg');
    expect(g.getAttribute('role')).toBe('group');
    expect(g.classList.contains('is-pills')).toBe(true);
    const b = [...host.querySelectorAll<HTMLElement>('.wc-lk-opt')];
    expect(b.map((x) => x.getAttribute('role'))).toEqual(['checkbox', 'checkbox']);
    expect(b.map((x) => x.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    click(b[0]!);
    click(b[1]!);
    expect(change.mock.calls).toEqual([
      ['lite', true],
      ['editor', false],
    ]);
  });
});

describe('Tabs', () => {
  it('is a tablist of tabs with aria-selected', () => {
    const change = vi.fn();
    const host = mount(
      <Tabs
        label="Sections"
        tabs={[
          { value: 'a', label: 'General' },
          { value: 'b', label: 'Panes', id: 'panes' },
        ]}
        value="a"
        onChange={change}
      />,
    );
    expect($(host, '.wc-lk-tabs').getAttribute('role')).toBe('tablist');
    const t = [...host.querySelectorAll<HTMLElement>('.wc-lk-tab')];
    expect(t.map((x) => [x.getAttribute('role'), x.getAttribute('aria-selected'), x.getAttribute('data-tab')])).toEqual([
      ['tab', 'true', 'a'],
      ['tab', 'false', 'panes'],
    ]);
    click(t[1]!);
    expect(change).toHaveBeenCalledWith('b');
  });
});

describe('Field and TextArea', () => {
  it('renders a labelled input in a well, with a hint', () => {
    const input = vi.fn();
    const commit = vi.fn();
    const host = mount(
      <Field id="name" label="Profile name" value="Gibur" onInput={input} onCommit={commit} hint="Up to 24 letters." maxLength={24} mono />,
    );
    const f = $(host, '.wc-lk-field');
    expect(f.getAttribute('data-field')).toBe('name');
    expect(f.classList.contains('is-mono')).toBe(true);
    expect($(f, '.wc-lk-lbl').textContent).toBe('Profile name');
    const i = $<HTMLInputElement>(f, 'input');
    expect(i.value).toBe('Gibur');
    expect(i.maxLength).toBe(24);
    expect(i.getAttribute('aria-invalid')).toBeNull();
    expect(i.getAttribute('aria-describedby')).toBe($(f, '.wc-lk-fhint').id);
    act(() => {
      i.value = 'Gib';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(input).toHaveBeenCalledWith('Gib');
    expect(commit).toHaveBeenCalledWith('Gib');
  });

  it('shows an error instead of the hint, invalid and described by it', () => {
    const host = mount(<Field value="a/b" onInput={() => {}} error="No slashes." hint="A hint." />);
    const f = $(host, '.wc-lk-field');
    expect(f.classList.contains('is-bad')).toBe(true);
    expect(f.querySelector('.wc-lk-fhint')).toBeNull();
    const i = $(f, 'input');
    expect(i.getAttribute('aria-invalid')).toBe('true');
    expect(i.getAttribute('aria-describedby')).toBe($(f, '.wc-lk-ferr').id);
    expect($(f, '.wc-lk-ferr').textContent).toBe('No slashes.');
  });

  it('focuses and selects with autoFocus and selectAll, and hands out its element', () => {
    let el: HTMLInputElement | null = null;
    const host = mount(<Field value="Gibur" onInput={() => {}} autoFocus selectAll inputRef={(e) => {
          el = e;
        }} />);
    const i = $<HTMLInputElement>(host, 'input');
    expect(el).toBe(i);
    expect(document.activeElement).toBe(i);
    expect([i.selectionStart, i.selectionEnd]).toEqual([0, 5]);
  });

  it('TextArea is a textarea with its rows', () => {
    const host = mount(<TextArea value={'one\ntwo'} onInput={() => {}} rows={3} label="Comment" />);
    const t = $<HTMLTextAreaElement>(host, '.wc-lk-field.is-area textarea');
    expect(t.getAttribute('rows')).toBe('3');
    expect(t.value).toBe('one\ntwo');
  });
});

describe('Check, Toggle, Select', () => {
  it('Check is a checkbox that flips', () => {
    const change = vi.fn();
    const host = mount(<Check id="auto" label="Log in automatically" checked onChange={change} />);
    const c = $(host, '.wc-lk-check');
    expect(c.getAttribute('role')).toBe('checkbox');
    expect(c.getAttribute('aria-checked')).toBe('true');
    expect(c.getAttribute('data-field')).toBe('auto');
    expect(c.tabIndex).toBe(-1);
    click(c);
    expect(change).toHaveBeenCalledWith(false);
  });

  it('Toggle is a switch with On / Off', () => {
    const change = vi.fn();
    const host = mount(<Toggle label="Weather" on={false} onChange={change} />);
    const t = $(host, '.wc-lk-toggle');
    expect(t.getAttribute('role')).toBe('switch');
    expect(t.getAttribute('aria-checked')).toBe('false');
    expect(t.getAttribute('aria-label')).toBe('Weather');
    expect($(t, '.wc-lk-tstate').textContent).toBe('Off');
    expect(t.querySelector('.wc-lk-groove .wc-lk-knob')).not.toBeNull();
    click(t);
    expect(change).toHaveBeenCalledWith(true);
  });

  it('Toggle draws less with only (wave 3): the state alone, or the switch alone; the label stays its name', () => {
    const host = mount(
      <>
        <Toggle label="Weather" on onChange={() => {}} only="state" />
        <Toggle label="Snow" on onChange={() => {}} only="switch" />
      </>,
    );
    const [a, b] = [...host.querySelectorAll<HTMLElement>('.wc-lk-toggle')];
    expect($(a!, '.wc-lk-tstate').textContent).toBe('On');
    expect(a!.querySelector('.wc-lk-tlabel')).toBeNull();
    expect(b!.querySelector('.wc-lk-tstate, .wc-lk-tlabel')).toBeNull();
    expect(b!.getAttribute('aria-label')).toBe('Snow');
  });

  it('Select is a native select with its label', () => {
    const change = vi.fn();
    const host = mount(
      <Select
        id="font"
        label="Font"
        value="b"
        onChange={change}
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
      />,
    );
    const s = $<HTMLSelectElement>(host, '.wc-lk-select[data-field="font"] select');
    expect(s.getAttribute('aria-label')).toBe('Font');
    expect([...s.options].map((o) => o.textContent)).toEqual(['Alpha', 'Beta']);
    expect(s.value).toBe('b');
    act(() => {
      s.value = 'a';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(change).toHaveBeenCalledWith('a');
  });
});

describe('Table', () => {
  const heads = [
    { key: 'char', label: 'Character', sort: true },
    { key: 'date', label: 'Date', sort: true },
    { key: 'exp', label: 'Exp', align: 'end' as const },
  ];

  it('has sortable heads with data-dir and aria-sort, and its rows', () => {
    const sort = vi.fn();
    const row = vi.fn();
    const host = mount(
      <Table cols="1fr 100px 80px" heads={heads} sort={{ key: 'date', dir: -1 }} onSort={sort}>
        <TableRow id="r1" on onClick={row} data-i={0}>
          <span class="wc-lk-td">Gibur</span>
        </TableRow>
        <TableRow id="r2">
          <span class="wc-lk-td">Rasta</span>
        </TableRow>
      </Table>,
    );
    const t = $(host, '.wc-lk-tbl');
    expect(t.getAttribute('role')).toBe('table');
    expect(t.style.getPropertyValue('--lk-cols')).toBe('1fr 100px 80px');
    const th = [...host.querySelectorAll<HTMLElement>('.wc-lk-th')];
    expect(th.map((h) => [h.getAttribute('data-dir'), h.getAttribute('aria-sort')])).toEqual([
      [null, 'none'],
      ['-1', 'descending'],
      [null, null],
    ]);
    expect(th[2]!.classList.contains('is-end')).toBe(true);
    click(th[0]!);
    click(th[2]!);
    expect(sort.mock.calls).toEqual([['char']]);
    const rows = [...host.querySelectorAll<HTMLElement>('.wc-lk-tbody > .wc-lk-tr')];
    expect(rows.map((r) => [r.getAttribute('data-id'), r.classList.contains('is-on')])).toEqual([
      ['r1', true],
      ['r2', false],
    ]);
    expect(rows[0]!.getAttribute('data-i')).toBe('0');
    click(rows[0]!);
    expect(row).toHaveBeenCalledTimes(1);
  });

  it('a TableRow takes a list cursor’s rowProps whole: a touch tap tells itself from a click', () => {
    const activated: number[] = [];
    function List() {
      const lc = useListCursor({ count: 2, activateOn: 'dblclick', onActivate: (i) => activated.push(i) });
      return (
        <Table cols="1fr" heads={heads}>
          {[0, 1].map((i) => (
            <TableRow key={i} on={lc.i === i} {...lc.rowProps(i)}>
              <span class="wc-lk-td">{i}</span>
            </TableRow>
          ))}
        </Table>
      );
    }
    const host = mount(<List />);
    const row = () => [...host.querySelectorAll<HTMLElement>('.wc-lk-tbody > .wc-lk-tr')][1]!;
    const tap = (): void => {
      act(() => void row().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })));
      click(row());
    };
    // 'tap-selects' (the default with dblclick): the first tap chooses the row, a tap on the chosen row opens it.
    tap();
    expect(row().classList.contains('is-on')).toBe(true);
    expect(activated).toEqual([]);
    tap();
    expect(activated).toEqual([1]);
  });

  it('stacks its rows below `stackBelow` px of its own width', () => {
    let fire: ((w: number) => void) | null = null;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: (e: { contentRect: { width: number } }[]) => void) {
          // The first observer is the stacking one (the gutter's comes after it).
          fire ??= (w) => cb([{ contentRect: { width: w } }]);
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    const host = mount(<Table cols="1fr" heads={heads} stackBelow={560} scroll />);
    const t = $(host, '.wc-lk-tbl');
    expect(t.classList.contains('is-scroll')).toBe(true);
    expect($(t, '.wc-lk-tbody').classList.contains('wc-lk-scroll')).toBe(true);
    // The rows' scrollbar gutter as measured (none here), for the heads' padding.
    expect(t.style.getPropertyValue('--lk-gut')).toBe('0px');
    expect(t.classList.contains('is-stacked')).toBe(false);
    act(() => fire!(400));
    expect(t.classList.contains('is-stacked')).toBe(true);
    act(() => fire!(800));
    expect(t.classList.contains('is-stacked')).toBe(false);
  });
});

describe('text pieces', () => {
  it('Rule, OrnRule, Well, Stars, Seal', () => {
    const host = mount(
      <>
        <Rule title="Settings">
          <button class="reset">Reset all</button>
        </Rule>
        <OrnRule />
        <Well mono class="log">
          text
        </Well>
        <Stars n={3} />
        <Stars n={9} max={4} />
        <Seal size={20} />
      </>,
    );
    expect($(host, '.wc-lk-rule > .wc-lk-sec').textContent).toBe('Settings');
    expect(host.querySelector('.wc-lk-rule > .wc-lk-hair + .reset')).not.toBeNull();
    expect($(host, '.wc-lk-orn').getAttribute('role')).toBe('separator');
    expect($(host, '.wc-lk-well').className).toBe('wc-lk-well wc-lk-mono log');
    const stars = [...host.querySelectorAll('.wc-lk-stars')];
    expect(stars.map((s) => [s.getAttribute('aria-label'), s.querySelector('.wc-lk-star-on')?.textContent?.length])).toEqual([
      ['3 of 5', 3],
      ['4 of 4', 4],
    ]);
    const seal = $<HTMLImageElement>(host, 'img.wc-lk-seal');
    expect(seal.getAttribute('src')).toMatch(/favicon\.svg$/);
    expect(seal.getAttribute('width')).toBe('20');
  });

  it('Fold opens and closes its content', () => {
    const toggle = vi.fn();
    const host = mount(
      <Fold label="Commands" open={false} onToggle={toggle}>
        <p class="inner">x</p>
      </Fold>,
    );
    const h = $(host, '.wc-lk-fold-h');
    expect(h.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.inner')).toBeNull();
    click(h);
    expect(toggle).toHaveBeenCalledTimes(1);
    act(() =>
      render(
        <Fold label="Commands" open onToggle={toggle}>
          <p class="inner">x</p>
        </Fold>,
        host,
      ),
    );
    expect(h.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.wc-lk-fold.is-open .wc-lk-fold-b .inner')).not.toBeNull();
  });

  it('a Fold takes an aside at its head’s right end and an id; a Rule takes a node as its head (wave 3)', () => {
    const host = mount(
      <Rule id="help" title={<Fold id="kept" label="Kept" aside={<b class="n">9</b>} open={false} onToggle={() => {}} />} />,
    );
    const r = $(host, '.wc-lk-rule');
    expect(r.getAttribute('data-rule')).toBe('help');
    expect(r.querySelector('.wc-lk-sec')).toBeNull();
    const f = $(r, '.wc-lk-fold');
    expect(f.getAttribute('data-fold')).toBe('kept');
    expect(f.classList.contains('has-aside')).toBe(true);
    expect($(f, '.wc-lk-fold-h > .wc-lk-fold-a .n').textContent).toBe('9');
    expect(r.querySelector(':scope > .wc-lk-hair')).not.toBeNull();
  });
});

describe('the flash', () => {
  it('a controlled LookFlash shows a local flash for its time', () => {
    vi.useFakeTimers();
    let show: ((t: string, k?: 'ok' | 'fail', ms?: number) => void) | null = null;
    function Page() {
      const [flash, s] = useLocalFlash();
      show = s;
      return <LookFlash flash={flash} />;
    }
    const host = mount(<Page />);
    expect($(host, '.wc-lk-flash').textContent).toBe('');
    act(() => show!('Saved.', 'ok', 500));
    expect($(host, '.wc-lk-flash .is-ok').textContent).toBe('Saved.');
    act(() => show!('Failed.', 'fail', 500));
    expect($(host, '.wc-lk-flash .is-fail').textContent).toBe('Failed.');
    act(() => void vi.advanceTimersByTime(600));
    expect($(host, '.wc-lk-flash').textContent).toBe('');
  });

  it('useLocalFlash clears its flash and tells whether one shows (wave 3)', () => {
    vi.useFakeTimers();
    let api: ReturnType<typeof useLocalFlash> | null = null;
    function Page() {
      api = useLocalFlash();
      return <LookFlash flash={api[0]} />;
    }
    const host = mount(<Page />);
    expect(api![2].showing()).toBe(false);
    act(() => api![1]('Applied.'));
    expect(api![2].showing()).toBe(true);
    act(() => api![2].clear());
    expect(api![2].showing()).toBe(false);
    expect($(host, '.wc-lk-flash').textContent).toBe('');
  });
});

describe('the soft keyboard', () => {
  const vv = (o: Partial<VisualViewport>) => ({ height: 844, offsetTop: 0, scale: 1, ...o }) as VisualViewport;

  it('keyboardInset is the layout viewport the visual one does not cover', () => {
    expect(keyboardInset({ innerHeight: 844, visualViewport: null })).toBe(0);
    expect(keyboardInset({ innerHeight: 844, visualViewport: vv({}) })).toBe(0);
    expect(keyboardInset({ innerHeight: 844, visualViewport: vv({ height: 500 }) })).toBe(344);
    expect(keyboardInset({ innerHeight: 844, visualViewport: vv({ height: 500, offsetTop: 40 }) })).toBe(304);
    // A pinch zoom (no keyboard) is not an inset.
    expect(keyboardInset({ innerHeight: 844, visualViewport: vv({ height: 422, offsetTop: 200, scale: 2 }) })).toBe(0);
  });

  it('useKeyboardInset follows the visual viewport', () => {
    const listeners: Record<string, () => void> = {};
    const fake = {
      height: 844,
      offsetTop: 0,
      scale: 1,
      addEventListener: (t: string, f: () => void) => (listeners[t] = f),
      removeEventListener: () => {},
    };
    vi.stubGlobal('visualViewport', fake);
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => (f(0), 1));
    vi.stubGlobal('innerHeight', 844);
    let seen = -1;
    function Probe() {
      seen = useKeyboardInset();
      return null;
    }
    mount(<Probe />);
    expect(seen).toBe(0);
    fake.height = 520;
    act(() => listeners.resize!());
    expect(seen).toBe(324);
  });
});

describe('icons', () => {
  const NAMES = (
    'door person scroll hourglass star quill info back check plus pencil rename import export trash ' +
    'book save find duplicate reset lock fold up down prev next close play pause start back10 fwd10 display ' +
    'fullscreen filter stats backup restore help action alias highlight macro substitute exclude include comment ' +
    'title html text folder drop'
  ).split(' ');

  it('draws every name of the API', () => {
    expect(Object.keys(ICONS).sort()).toEqual([...NAMES].sort());
    const host = mount(
      <>
        {NAMES.map((n) => (
          <Icon key={n} name={n as keyof typeof ICONS} />
        ))}
      </>,
    );
    const svgs = [...host.querySelectorAll('svg.wc-lk-ic')];
    expect(svgs).toHaveLength(NAMES.length);
    expect(svgs.filter((s) => s.childElementCount === 0).length).toBe(0);
  });

  it('draws a page’s own icon in its box', () => {
    const host = mount(<Icon draw={<path d="M1 1h10" />} box={24} class="mine" />);
    const s = $(host, 'svg');
    expect(s.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(s.getAttribute('class')).toBe('wc-lk-ic mine');
  });
});

describe('tokens', () => {
  const css = readFileSync(resolve(__dirname, '../../src/chrome/kit/look-tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  /** The declarations of the first rule whose selector list is exactly `sel`. */
  const block = (sel: string): Record<string, string> => {
    const i = css.indexOf(sel + ' {');
    if (i < 0) throw new Error(`no rule ${sel}`);
    const body = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
    return Object.fromEntries(
      body
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim().replace(/\s+/g, ' ')]),
    );
  };
  const dark = block('.wc-look');
  const paper = block('[data-light] .wc-look,\n.wc-look[data-light]');

  it('defines every token of the API on .wc-look', () => {
    const api = (
      '--lk-text --lk-dim --lk-faint --lk-item --lk-on --lk-head --lk-accent --lk-danger --lk-ok --lk-soon --lk-gold ' +
      '--lk-well --lk-well-edge --lk-rule --lk-win-fill --lk-win-fill-large --lk-display --lk-serif --lk-sc --lk-mono ' +
      '--lk-box-m --lk-inlay-hi --lk-inlay-mid --lk-inlay-lo --lk-inlay-ink --lk-rivet-hi --lk-rivet-mid --lk-rivet-lo --lk-ts'
    ).split(' ');
    expect(api.filter((t) => !(t in dark))).toEqual([]);
    expect(dark['--lk-mono']).toContain('var(--font-mono');
    expect(dark['--lk-ts']).toBe('1');
  });

  it('has a Paper value for every colour token the controls read', () => {
    const colours = Object.keys(dark).filter(
      (t) => !/^--lk-(display|serif|sc|mono|iron|iron-lo|grain|box-m|ts|inlay|rivet)/.test(t),
    );
    expect(colours.length).toBeGreaterThan(30);
    expect(colours.filter((t) => !(t in paper))).toEqual([]);
    expect(paper['--lk-text']).not.toBe(dark['--lk-text']);
  });

  it('takes the inlay from the wordmark (one source)', () => {
    expect(dark['--lk-inlay-hi']).toBe(INLAY_TOKENS.hi);
    expect(dark['--lk-inlay-mid']).toBe(INLAY_TOKENS.mid);
    expect(dark['--lk-inlay-lo']).toBe(INLAY_TOKENS.lo);
    expect(dark['--lk-inlay-ink']).toBe(INLAY_TOKENS.ink);
    expect([dark['--lk-rivet-hi'], dark['--lk-rivet-mid'], dark['--lk-rivet-lo']]).toEqual(INLAY_TOKENS.rivet);
    // The banded metal: the day metal's stops, the first three through the tokens.
    const stops = INLAY_TOKENS.day.map(([o, c], i) => `${i < 3 ? `var(--lk-inlay-${['hi', 'mid', 'lo'][i]})` : c} ${Math.round(o * 100)}%`);
    expect(dark['--lk-inlay-metal']).toBe(`linear-gradient(180deg, ${stops.join(', ')})`);
  });

  it('shrinks the box margin on the phone and the motion with reduced motion', () => {
    expect(css).toMatch(/@media \(max-width: 600px\) \{\s*\.wc-look \{\s*--lk-box-m: 6px;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.wc-look \{\s*--lk-ts: 0\.2;/);
  });
});
