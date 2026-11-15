// The share links' glyphs (stage 64 C1, round 12's mockups): a link and a
// flag in the kit's manner (look-icons.tsx: 16 × 16, round caps and joins,
// stroke only), passed to the kit as `IconDraw`. The kit has neither; they
// may join `look-icons` when the watch page and the gallery use them too.

import type { IconDraw } from '../kit/look';

export const LINK_ICON: IconDraw = {
  draw: <path d="M6.6 9.4 9.4 6.6M7.3 4.6 8.5 3.4a2.7 2.7 0 0 1 3.8 3.8L11.1 8.4M8.7 11.4 7.5 12.6a2.7 2.7 0 0 1-3.8-3.8L4.9 7.6" />,
};

export const FLAG_ICON: IconDraw = {
  draw: <path d="M4 14V2.6M4 3.2h7.6L9.8 5.9l1.8 2.8H4" />,
};
