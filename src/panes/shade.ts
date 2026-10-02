// Shade ramp for pane content (Inv §2.1 "Shade ramp", §10.4, §10.5).
//
// One hue (the pane colour's h, s; the None pane takes the terminal
// background's) walked down HSL lightness, dark or light by the pane's own
// effective background (L > 58 = light). Character and Group draw every
// colour from it, so they retint with the pane colour.
//
// Call `paneShade(settings, id)` at the start of every render: nothing is
// cached, so a live colour change shows in the next frame (Inv §10.5
// "Re-resolve every frame"). It is a few HSL conversions, cheap enough.

import type { PaneId } from '../layout/types';
import { type Settings, paneSettingsOf } from '../settings/types';
import { type ShadeRole, paneEffectiveBg, paneHs, isLight, shadeRamp, washout } from '../theme/color';

export interface PaneShade {
  /** The seven shades by role. */
  ramp: Record<ShadeRole, string>;
  /** The pane's effective background is light. */
  light: boolean;
  /** The pane's effective background. */
  bg: string;
}

/** The shade ramp of pane `id` under `s`, resolved now. */
export function paneShade(s: Readonly<Settings>, id: PaneId): PaneShade {
  const color = paneSettingsOf(s.panes, id).color;
  const termBg = s.appearance.bg;
  const bg = paneEffectiveBg(color, termBg);
  const light = isLight(bg);
  const [h, sat] = paneHs(color, termBg);
  return { ramp: shadeRamp(h, sat, light), light, bg };
}

/** A dark saturated fill, washed to a pastel on a light pane (group bars). */
export function fillFor(hex: string, light: boolean): string {
  return light ? washout(hex) : hex;
}
