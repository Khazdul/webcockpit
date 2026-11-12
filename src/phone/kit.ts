// What the phone layer uses of the rest of the app, handed in at mount
// instead of imported (stage 51 rule 1: desktop does not change).
//
// The phone layer is a chunk of its own, loaded only on a phone. A module
// it imported that the desktop loads at start (the fight view, the status
// texts, the theme helpers …) would be shared between the two, and the
// bundler would then cut the desktop's start-up code into other chunks
// than before. So this chunk imports nothing of the app but types: the
// shell, which has all of these loaded anyway, passes them in as one
// object (`PHONE_KIT`, src/app/phone-kit.ts) and `mountPhoneLayer` keeps
// it here for the layer's modules. Unit tests set it themselves.
//
// Type-only imports are erased when compiled, so they add no edge. The
// look kit's controls (`Seg`, `Toggle`) live in the chrome chunk, which is
// lazy on every device: the shell passes them too (`PhoneControls`), so
// the kit is not cut out of the chrome chunk either. Preact is the one
// thing this chunk imports.

import type { AppStatusState } from '../app/status';
import type { Seg, Toggle } from '../chrome/kit/look-controls';
import type { GroupFight, Member, Vital, VitalPct } from '../gmcp/group';
import type { FightView, MemberEnv } from '../panes/group-model';
import type { AppearanceSettings, FontId } from '../settings/types';
import type { InputColor } from '../theme/presets';

export interface PhoneKit {
  /** The Group pane's fight card view (src/panes/group-model.ts). */
  fightView(f: GroupFight, tankMember: Member | null, selfName: string | null, env: Pick<MemberEnv, 'light' | 'colors' | 'vitals'>): FightView | null;
  /** A vital's share 0–1 (src/gmcp/group.ts). */
  vitalPct(kind: 'hp', v: Vital): VitalPct;
  /** The Group pane's dark colours: what `fightView` wants of a pane (the card has its own). */
  groupColors: MemberEnv['colors'];
  /** `Link: 38ms` (src/app/status.ts). */
  formatLink(ms: number | null, suspect: boolean): string;
  /** True while a connection is open or opening. */
  isLive(s: Readonly<AppStatusState>): boolean;
  /** The status' capture text while a run is recorded. */
  captureRecording: string;
  /** The appearance change for a new background (src/theme/presets.ts). */
  backgroundPatch(from: string, to: string): Partial<AppearanceSettings>;
  /** Whether a background is light (Paper). */
  isLight(bg: string): boolean;
  /** The font size limits. */
  fontSizeMin: number;
  fontSizeMax: number;
  /** The fonts: the label of one, the one that renders a stored id, the ones offered here. */
  fontLabel(id: FontId): string;
  effectiveFont(id: FontId): FontId;
  fontChoices(): FontId[];
  /** The input colours in the desktop's order (src/theme/presets.ts), and one's CSS colour on a terminal background (src/theme/apply.ts). */
  inputColors(): { id: InputColor; label: string }[];
  inputColor(id: InputColor, termBg: string): string;
  /** The phone's too-small limit (src/layout/phone.ts). */
  minCols: number;
  minRows: number;
  /** Page fullscreen (src/core/fullscreen.ts): whether the browser can, the toggle, and the refusal notice. */
  canFullscreen(doc: Document): boolean;
  toggleFullscreen(doc: Document): void;
  onFullscreenRefused(fn: () => void): () => void;
}

/** The look kit's controls of the settings page (src/chrome/kit/look-controls.tsx). */
export interface PhoneControls {
  Seg: typeof Seg;
  Toggle: typeof Toggle;
}

let kit: PhoneKit | null = null;
let controls: PhoneControls | null = null;

/** Sets the kit's controls (the shell at mount, from the chrome chunk; unit tests). */
export function setPhoneControls(c: PhoneControls): void {
  controls = c;
}

/** The kit's controls; throws before `setPhoneControls`. */
export function phoneControls(): PhoneControls {
  if (!controls) throw new Error('phone layer: no controls');
  return controls;
}

/** Sets the kit (the shell at mount; unit tests). */
export function setPhoneKit(k: PhoneKit): void {
  kit = k;
}

/** The kit; throws before `setPhoneKit`. */
export function phoneKit(): PhoneKit {
  if (!kit) throw new Error('phone layer: no kit');
  return kit;
}
