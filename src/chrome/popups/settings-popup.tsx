// The Settings popup (stage 30 S5, mockup 30a-3, ADR 0107): above the
// menu bar's Settings icon, four tabs of modern controls. Every change goes
// straight to the settings store and applies live (ADR 0010); the same
// settings as the TUI pages Options → Appearance, Text input, Mapper and
// Weather effects (frames/options*.tsx), which stay in the phone's ESC menu
// (the start page lost Options in stage 32).
//
//   SETTINGS                                                   ×
//   Appearance  Text input  Mapper  Weather effects
//   Font              [DejaVu Sans Mono      v]
//   Size              ───●──────── 15 px
//   …
//
// - Every tab page is drawn, stacked in one grid cell, and only the chosen
//   one is visible: the popup keeps one width and the height of its
//   tallest page, so switching tabs never moves it. The last tab chosen is
//   kept while the page lives.
// - Appearance: font (`fontChoices`, a stored font that is not installed
//   shows as the one drawn, `effectiveFont`), size and padding (sliders),
//   font colour, background (`backgroundPatch`: a preset background sets
//   its font colour and palette), input colour, bold brightens, scrollback,
//   the 16-colour ANSI palette (a click on a swatch chooses it and puts
//   the keys in its hex field; its Picker button opens the browser's
//   colour picker), Reset palette, Reset appearance and a small live preview (the TUI page's sample lines). A colour that
//   is not in a list is shown by its hex and kept (`colorChoices`).
// - Text input: auto-clear, autosuggest, cursor style, cursor blink.
// - Mapper: popups/mapper-settings.tsx (also the map pane's gear popup).
// - Weather effects: the master switch (the rest dims while it is off; a
//   browser without OffscreenCanvas is told so), the categories with their
//   help, and Blue day sky under Sky.

import type { RefObject, VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  CURSOR_STYLES,
  type CursorStyle,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  PADDING_MAX,
  PADDING_MIN,
  PADDING_STEP,
  SCROLLBACK_CHOICES,
  type WeatherSettings,
} from '../../settings';
import type { AppearanceSettings, FontId } from '../../settings/types';
import { inputColor } from '../../theme/apply';
import { FONTS, effectiveFont, fontChoices } from '../../theme/fonts';
import {
  ANSI_NAMES,
  DOS_PALETTE,
  INPUT_COLORS,
  INPUT_COLOR_IDS,
  type NamedColor,
  TERMINAL_BG_PRESETS,
  TERMINAL_FG_PRESETS,
  backgroundTheme,
  presetName,
} from '../../theme/presets';
import { weatherAvailable } from '../../weather/support';
import {
  PREVIEW,
  PREVIEW_AFTER,
  PREVIEW_ECHO,
  PREVIEW_PROMPT,
  type PreviewLine,
  backgroundPatch,
  colorChoices,
  groupDigits,
  parseHex,
} from '../frames/options';
import { DAY_SKY_HELP, MASTER_HELP, WEATHER_ROWS, WEATHER_UNSUPPORTED } from '../frames/options-weather';
import { useServices, useSettings } from '../kit/hooks';
import { type Choice, type DropdownOption, Dropdown, GhostButton, Row, Segmented, Slider, SwatchGrid, Tabs, Toggle } from './controls';
import { MapperSettings } from './mapper-settings';
import { type PopupPlace, PopupPanel, useHold } from './panel';

export type SettingsTab = 'appearance' | 'input' | 'mapper' | 'weather';

export const SETTINGS_TABS: readonly Choice<SettingsTab>[] = [
  { value: 'appearance', label: 'Appearance' },
  { value: 'input', label: 'Text input' },
  { value: 'mapper', label: 'Mapper' },
  { value: 'weather', label: 'Weather effects' },
];

/** The tab chosen last (kept while the page lives). */
let lastTab: SettingsTab = 'appearance';

/** `steel` → `Steel`, `bright black` → `Bright black`. */
export const capital = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/**
 * A colour list's options: the presets by name, with an off-palette value
 * first by its hex (as `colorChoices` cycles them), so it shows and stays.
 */
export function colorOptions(presets: readonly NamedColor[], cur: string): DropdownOption<string>[] {
  return colorChoices(presets, cur).map((hex) => ({ value: hex, label: capital(presetName(presets, hex) ?? hex), swatch: hex }));
}

/** The scrollback choices, with a stored value outside them kept. */
export function scrollbackOptions(cur: number): DropdownOption<number>[] {
  const list = SCROLLBACK_CHOICES.includes(cur) ? SCROLLBACK_CHOICES : [...SCROLLBACK_CHOICES, cur].sort((a, b) => a - b);
  return list.map((n) => ({ value: n, label: `${groupDigits(n)} lines` }));
}

export const CURSOR_CHOICES: readonly Choice<CursorStyle>[] = CURSOR_STYLES.map((c) => ({
  value: c,
  label: c === 'beam' ? 'Bar' : capital(c),
}));

export interface SettingsPopupProps {
  place: PopupPlace;
  onClose: () => void;
}

export function SettingsPopup(p: SettingsPopupProps): VNode {
  const [tab, setTabState] = useState<SettingsTab>(lastTab);
  const setTab = (t: SettingsTab): void => {
    lastTab = t;
    setTabState(t);
  };
  const pages: Record<SettingsTab, () => VNode> = {
    appearance: () => <AppearancePage />,
    input: () => <TextInputPage />,
    mapper: () => <MapperSettings />,
    weather: () => <WeatherPage />,
  };
  return (
    <PopupPanel cls="wc-sp-settings" label="Settings" title="Settings" place={p.place} onClose={p.onClose}>
      <Tabs label="Settings" value={tab} tabs={SETTINGS_TABS} onChange={setTab} />
      <div class="wc-sp-body">
        {SETTINGS_TABS.map((t) => (
          <div
            class={`wc-sp-page${t.value === tab ? '' : ' is-off'}`}
            role="tabpanel"
            aria-label={t.label}
            aria-hidden={t.value === tab ? undefined : 'true'}
            data-page={t.value}
          >
            {pages[t.value]()}
          </div>
        ))}
      </div>
    </PopupPanel>
  );
}

// ----------------------------------------------------------- appearance

function AppearancePage(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const a = s.appearance;
  const hold = useHold();
  const [sel, setSel] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const palWrap = useRef<HTMLSpanElement>(null);
  const hexInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => void (noteTimer.current && clearTimeout(noteTimer.current)), []);

  const set = (patch: Partial<AppearanceSettings>): void => settings.update({ appearance: patch });
  const setAnsi = (i: number, hex: string): void =>
    settings.update((d) => {
      d.appearance.ansi[i] = hex;
    });
  const flash = (text: string): void => {
    setNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(''), 3000);
  };

  // A swatch chooses the colour and puts the keys in its hex field. The
  // browser's own picker opens only from the Picker button: it is a native
  // window that holds the keys while open, so the hex field could not be
  // typed in beside it (owner, 30c).
  const choose = (i: number): void => {
    setSel(i);
    // After the render that shows the field (and its new value).
    requestAnimationFrame(() => {
      const f = hexInput.current;
      if (!f) return;
      f.focus({ preventScroll: true });
      f.select();
    });
  };
  // The browser's colour picker, laid over the chosen swatch so it opens there.
  const openPicker = (): void => {
    const i = sel;
    const input = picker.current;
    const wrap = palWrap.current;
    if (i === null || !input || !wrap) return;
    const el = wrap.querySelectorAll<HTMLElement>('.wc-ck-pc')[i];
    if (el) {
      const r = el.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      input.style.left = `${r.left - w.left}px`;
      input.style.top = `${r.top - w.top}px`;
      input.style.width = `${r.width}px`;
      input.style.height = `${r.height}px`;
    }
    input.value = settings.get().appearance.ansi[i]!;
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch {
      input.click();
    }
  };

  const font = effectiveFont(a.font);
  const fonts: DropdownOption<FontId>[] = fontChoices().map((id) => ({
    value: id,
    label: FONTS[id].label,
    // Each name in its own font (owner, 30c): opening the list fetches the
    // families' regular files once (about 1.3 MB in all), then they are cached.
    font: FONTS[id].stack,
  }));
  const inputs: DropdownOption<(typeof INPUT_COLOR_IDS)[number]>[] = INPUT_COLOR_IDS.map((id) => ({
    value: id,
    label: INPUT_COLORS[id].label,
    swatch: inputColor(id, a.bg),
  }));
  const names = ANSI_NAMES.map(capital);
  return (
    <div class="wc-sp-appearance">
      <Row label="Font">
        <Dropdown label="Font" value={font} options={fonts} onChange={(f) => set({ font: f })} />
      </Row>
      <Row label="Size">
        <Slider label="Size" value={a.size} min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} unit="px" onHold={hold} onChange={(size) => set({ size })} />
      </Row>
      <Row label="Padding">
        <Slider
          label="Padding"
          value={a.padding}
          min={PADDING_MIN}
          max={PADDING_MAX}
          step={PADDING_STEP}
          unit="px"
          onHold={hold}
          onChange={(padding) => set({ padding })}
        />
      </Row>
      <Row label="Font colour">
        <Dropdown label="Font colour" value={a.fg.toLowerCase()} options={colorOptions(TERMINAL_FG_PRESETS, a.fg)} onChange={(fg) => set({ fg })} />
      </Row>
      <Row label="Background">
        <Dropdown
          label="Background"
          value={a.bg.toLowerCase()}
          options={colorOptions(TERMINAL_BG_PRESETS, a.bg)}
          onChange={(bg) => set(backgroundPatch(settings.get().appearance.bg, bg))}
        />
      </Row>
      <Row label="Input colour">
        <Dropdown label="Input colour" value={a.inputColor} options={inputs} onChange={(inputColor) => set({ inputColor })} />
      </Row>
      <Row label="Bold brightens colours">
        <Toggle label="Bold brightens colours" on={a.boldBright} onChange={(boldBright) => set({ boldBright })} />
      </Row>
      <Row label="Scrollback">
        <Dropdown
          label="Scrollback"
          value={s.output.scrollback}
          options={scrollbackOptions(s.output.scrollback)}
          onChange={(scrollback) => settings.update({ output: { scrollback } })}
        />
      </Row>
      <Row
        label="ANSI palette"
        top
        help={sel === null ? 'Click a colour to change it' : `${sel} ${names[sel]}`}
        class="wc-sp-palrow"
      >
        <span class="wc-sp-palw" ref={palWrap}>
          <SwatchGrid label="ANSI palette" colors={a.ansi} names={names} selected={sel} onPick={choose} />
          <input
            ref={picker}
            type="color"
            class="wc-sp-picker"
            tabIndex={-1}
            aria-hidden="true"
            onInput={(e) => {
              const hex = parseHex((e.currentTarget as HTMLInputElement).value);
              if (sel !== null && hex) setAnsi(sel, hex);
            }}
          />
          {/* Its room is kept while no colour is chosen, so choosing one does not move the popup. */}
          {/* Keyed by the colour, so the field starts with its value and the
              selection made when it is chosen is not reset by a later sync. */}
          <HexField
            key={sel ?? -1}
            index={sel ?? 0}
            value={a.ansi[sel ?? 0]!}
            shown={sel !== null}
            inputRef={hexInput}
            onSet={(hex) => sel !== null && setAnsi(sel, hex)}
            onPicker={openPicker}
          />
        </span>
      </Row>
      <Preview />
      <div class="wc-ck-btns wc-ck-foot">
        <span class="wc-ck-note" aria-live="polite">
          {note}
        </span>
        <GhostButton
          class="wc-sp-resetpal"
          onClick={() => {
            set({ ansi: (backgroundTheme(settings.get().appearance.bg)?.ansi ?? DOS_PALETTE).slice() });
            flash('Palette reset.');
          }}
        >
          Reset palette
        </GhostButton>
        <GhostButton
          class="wc-sp-reset"
          onClick={() => {
            settings.update({ appearance: settings.defaults().appearance });
            setSel(null);
            flash('Appearance reset.');
          }}
        >
          Reset appearance
        </GhostButton>
      </div>
    </div>
  );
}

/**
 * A palette colour as `#rrggbb`: a full hex applies as typed; `#rgb` on
 * Enter or when the field is left. The Picker button beside it opens the
 * browser's colour picker for the same colour.
 */
function HexField(p: {
  index: number;
  value: string;
  shown: boolean;
  inputRef: RefObject<HTMLInputElement>;
  onSet: (hex: string) => void;
  onPicker: () => void;
}): VNode {
  const [draft, setDraft] = useState(p.value);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setDraft(p.value);
    setBad(false);
  }, [p.value, p.index]);
  const commit = (): void => {
    const hex = parseHex(draft);
    if (!hex) return setBad(true);
    setBad(false);
    setDraft(hex);
    if (hex !== p.value.toLowerCase()) p.onSet(hex);
  };
  return (
    <span class={`wc-sp-hexrow${p.shown ? '' : ' is-off'}`} aria-hidden={p.shown ? undefined : 'true'}>
      <input
        ref={p.inputRef}
        type="text"
        class={`wc-ck-hex${bad ? ' is-bad' : ''}`}
        value={draft}
        maxLength={7}
        spellcheck={false}
        autocomplete="off"
        aria-label={`ANSI colour ${p.index}`}
        aria-invalid={bad ? 'true' : undefined}
        onInput={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          setDraft(v);
          setBad(false);
          if (/^#?[0-9a-f]{6}$/i.test(v.trim())) {
            const hex = parseHex(v)!;
            if (hex !== p.value.toLowerCase()) p.onSet(hex);
          }
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          e.stopPropagation();
          commit();
        }}
        onBlur={commit}
      />
      <GhostButton class="wc-sp-pick" onClick={p.onPicker} label={`Pick ANSI colour ${p.index}`}>
        Picker…
      </GhostButton>
      <span class="wc-ck-hint">{bad ? 'Use #rrggbb' : '#rrggbb'}</span>
    </span>
  );
}

/** The TUI page's sample lines in the terminal's colours, font and background. */
function Preview(): VNode {
  const line = ([text, ansi, bold = 0]: PreviewLine): VNode => {
    const color = ansi === null ? 'var(--term-fg)' : `var(--ansi-${ansi})`;
    return (
      <div class="wc-sp-pl">
        {bold > 0 && <span class="wc-bold wc-f1">{text.slice(0, bold)}</span>}
        <span style={{ color }}>{bold > 0 ? text.slice(bold) : text}</span>
      </div>
    );
  };
  return (
    <div class="wc-sp-preview" aria-label="Preview">
      {PREVIEW.map(line)}
      <div class="wc-sp-pl">
        <span style={{ color: 'var(--term-fg)' }}>{PREVIEW_PROMPT}</span>
        <span style={{ color: 'var(--term-echo)' }}>{PREVIEW_ECHO}</span>
      </div>
      {PREVIEW_AFTER.map(line)}
    </div>
  );
}

// ----------------------------------------------------------- text input

function TextInputPage(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const { input, appearance: a } = s;
  return (
    <div class="wc-sp-input">
      <Row label="Auto-clear input">
        <Toggle label="Auto-clear input" on={input.autoClear} onChange={(autoClear) => settings.update({ input: { autoClear } })} />
      </Row>
      <Row label="Autosuggest">
        <Toggle label="Autosuggest" on={input.autosuggest} onChange={(autosuggest) => settings.update({ input: { autosuggest } })} />
      </Row>
      <Row label="Cursor style">
        <Segmented
          label="Cursor style"
          value={a.cursorStyle}
          options={CURSOR_CHOICES}
          onChange={(cursorStyle) => settings.update({ appearance: { cursorStyle } })}
        />
      </Row>
      <Row label="Cursor blink">
        <Toggle label="Cursor blink" on={a.cursorBlink} onChange={(cursorBlink) => settings.update({ appearance: { cursorBlink } })} />
      </Row>
    </div>
  );
}

// -------------------------------------------------------------- weather

function WeatherPage(): VNode {
  const { settings } = useServices();
  const w = useSettings().weather;
  const flip = (k: keyof WeatherSettings, on: boolean): void =>
    settings.update((d) => {
      d.weather[k] = on;
    });
  const available = weatherAvailable();
  return (
    <div class="wc-sp-weather">
      <Row label="Weather effects" top help={available ? MASTER_HELP : WEATHER_UNSUPPORTED} class="wc-sp-master">
        <Toggle label="Weather effects" on={w.enabled} onChange={(on) => flip('enabled', on)} />
      </Row>
      <div class="wc-sp-wxrows">
        {WEATHER_ROWS.map((r) => (
          <>
            <Row label={r.label} top help={r.help} dim={!w.enabled} class={`wc-sp-wx-${r.key}`}>
              <Toggle label={r.label} on={w[r.key]} onChange={(on) => flip(r.key, on)} />
            </Row>
            {r.key === 'sky' && (
              <Row label="Blue day sky" top help={DAY_SKY_HELP} dim={!w.enabled || !w.sky} class="wc-sp-wx-daySky is-sub">
                <Toggle label="Blue day sky" on={w.daySky} onChange={(on) => flip('daySky', on)} />
              </Row>
            )}
          </>
        ))}
      </div>
    </div>
  );
}
