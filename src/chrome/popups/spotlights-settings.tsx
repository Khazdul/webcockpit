// The Spotlights settings popup (stage 30 S9, ADR 0110): what the
// Spotlights reel and Credits show, opened from the start page's
// "filtered" empty pages (the reel has the same filter in its card, stage
// 32c, ADR 0114; the rules and patches are shared, src/share/spotlights.ts). The
// popup's panel and controls are the settings popups' (ADR 0107), with
// their focus and key rules (ADR 0108); every change goes to the settings
// store at once, and the reel rebuilds from it.
//
//   SPOTLIGHTS                         ×
//   KINDS
//   Achievements                  [toggle]
//   Deaths                        [toggle]
//   Level-ups                     [toggle]
//   PvP kills                     [toggle]
//   ───────────────
//   CHARACTERS
//   All characters                [toggle]
//   [✓] Gittan                    (dim and disabled while All is on;
//   [✓] Rasta                      scrolls past about eight names)
//   ───────────────
//   Period                  [All time   ▾]
//
// - The characters are those of the recorded (sealed) runs, alphabetical
//   (`RunLibrary.characters()`), read when the popup opens. A checked name
//   that is no longer in the runs is not listed, and the next change to the
//   list writes only listed names. While All is on the remembered subset
//   shows dimmed; turning All off brings it back, or checks every listed
//   character when none of the remembered ones is listed.
// - ↑↓ move between the names (Tab goes on to the next control).

import type { VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { arrowFocus, plainKey } from '../../menubar/popup';
import { SPOTLIGHT_PERIODS, type SpotlightPeriod, type SpotlightSettings } from '../../settings';
import { PERIOD_LABELS, SPOTLIGHT_KINDS, allCharactersPatch, characterPatch, characterRows } from '../../share/spotlights';
import { useServices, useSettings } from '../kit/hooks';
import { Check, type DropdownOption, Dropdown, Row, Toggle } from './controls';
import { type PopupPlace, PopupPanel } from './panel';

export { PERIOD_LABELS, SPOTLIGHT_KINDS, allCharactersPatch, characterPatch, characterRows };

const PERIOD_CHOICES: readonly DropdownOption<SpotlightPeriod>[] = SPOTLIGHT_PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }));

export function SpotlightsSettings(): VNode {
  const { settings, runs } = useServices();
  const f = useSettings().spotlights;
  const [names, setNames] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    runs()
      .then((lib) => lib.characters())
      .then((list) => live && setNames(list.filter((n) => n !== '')))
      .catch(() => live && setNames([]));
    return () => {
      live = false;
    };
  }, [runs]);
  const patch = (p: Partial<SpotlightSettings>): void => settings.update({ spotlights: p });
  const rows = names ? characterRows(names, f) : [];
  const onListKey = (e: KeyboardEvent): void => {
    if (!plainKey(e)) return;
    const items = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.wc-ck-cb:not(:disabled)')];
    if (arrowFocus(e, items)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  return (
    <div class="wc-sp-spot-page">
      <div class="wc-ck-sub">Kinds</div>
      {SPOTLIGHT_KINDS.map((k) => (
        <Row key={k.key} label={k.label} class="wc-sp-kind">
          <Toggle label={k.label} on={f[k.key]} onChange={(on) => patch({ [k.key]: on })} />
        </Row>
      ))}
      <div class="wc-ck-sep" />
      <div class="wc-ck-sub">Characters</div>
      <Row label="All characters" class="wc-sp-allchars">
        <Toggle label="All characters" on={f.allCharacters} onChange={(on) => names && patch(allCharactersPatch(names, f, on))} />
      </Row>
      {names && names.length === 0 && <div class="wc-ck-note wc-sp-nochars">No characters recorded yet.</div>}
      {rows.length > 0 && (
        <div class={`wc-sp-chars${f.allCharacters ? ' is-dim' : ''}`} role="group" aria-label="Characters" onKeyDown={onListKey}>
          {rows.map((r) => (
            <Check
              key={r.name}
              label={r.name}
              on={r.on}
              disabled={f.allCharacters}
              onChange={(on) => names && patch(characterPatch(names, f, r.name, on))}
            />
          ))}
        </div>
      )}
      <div class="wc-ck-sep" />
      <Row label="Period" class="wc-sp-period">
        <Dropdown label="Period" value={f.period} options={PERIOD_CHOICES} onChange={(period) => patch({ period })} />
      </Row>
    </div>
  );
}

/** The popup: the settings popups' panel around `SpotlightsSettings`. */
export function SpotlightsPopup(p: { place: PopupPlace; onClose: () => void; focusOnOpen?: boolean }): VNode {
  return (
    <PopupPanel cls="wc-sp-spot" label="Spotlights settings" title="Spotlights" place={p.place} onClose={p.onClose} focusOnOpen={p.focusOnOpen ?? false}>
      <div class="wc-sp-body">
        <div class="wc-sp-page">
          <SpotlightsSettings />
        </div>
      </div>
    </PopupPanel>
  );
}
