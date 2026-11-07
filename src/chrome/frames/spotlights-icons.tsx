// The spotlight kinds' icons for the kit (stage 46): the player's drawings
// (src/player/icons.ts, 24 units) as `IconDraw`s, one copy for the wall's
// cards and chips and the viewer's head.

import { KIND_PATH, type KindIcon } from '../../player/icons';
import type { IconDraw } from '../kit/look';

export const KIND_ICON: Readonly<Record<KindIcon, IconDraw>> = {
  death: { draw: <path d={KIND_PATH.death} />, box: 24 },
  pkill: { draw: <path d={KIND_PATH.pkill} />, box: 24 },
  level: { draw: <path d={KIND_PATH.level} />, box: 24 },
  achievement: { draw: <path d={KIND_PATH.achievement} />, box: 24 },
};
