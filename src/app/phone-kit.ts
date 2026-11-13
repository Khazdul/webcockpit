// The phone layer's kit (src/phone/kit.ts): what the layer uses of the
// app, as one object the shell hands it at mount. Everything here is
// loaded at start on every device already; the phone layer's own chunk is
// not, and imports none of it (see kit.ts for why).

import { STATUS as CAPTURE_STATUS } from '../capture/recorder';
import { canFullscreen, onFullscreenRefused, toggleFullscreen } from '../core/fullscreen';
import { vitalPct } from '../gmcp/group';
import { PHONE_MIN_COLS, PHONE_MIN_ROWS } from '../layout/phone-game';
import { fightView } from '../panes/group-model';
import { GROUP_DARK } from '../panes/palette';
import type { PhoneKit } from '../phone/kit';
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from '../settings/types';
import { isLight } from '../theme/color';
import { FONTS, effectiveFont, fontChoices } from '../theme/fonts';
import { inputColor } from '../theme/apply';
import { INPUT_COLORS, INPUT_COLOR_IDS, backgroundPatch } from '../theme/presets';
import { formatLink, isLive } from './status';

export const PHONE_KIT: PhoneKit = {
  fightView,
  vitalPct,
  groupColors: GROUP_DARK,
  formatLink,
  isLive,
  captureRecording: CAPTURE_STATUS.recording,
  backgroundPatch,
  isLight,
  fontSizeMin: FONT_SIZE_MIN,
  fontSizeMax: FONT_SIZE_MAX,
  fontLabel: (id) => FONTS[id].label,
  effectiveFont,
  fontChoices,
  inputColors: () => INPUT_COLOR_IDS.map((id) => ({ id, label: INPUT_COLORS[id].label })),
  inputColor,
  minCols: PHONE_MIN_COLS,
  minRows: PHONE_MIN_ROWS,
  canFullscreen,
  toggleFullscreen: (doc) => void toggleFullscreen(doc),
  onFullscreenRefused,
};
