// The wooden sign under a balloon (stage 69, ADR 0159): HTML text, never
// part of a skin's picture, so every skin shows the kill the same way and
// a new picture never has to carry words. Names and achievements come
// from the game: textContent only. One plank for every kind of notice: the
// rows a notice leaves empty are hidden (a level up is only its big line).

import './sign.css';
import type { SignContent } from './feed';

export interface Sign {
  /** The swinging element (hung from its top centre). */
  readonly el: HTMLElement;
  set(s: SignContent, joined: boolean): void;
  /** The swing, degrees (rounded: no style write when nothing moved). */
  swing(deg: number): void;
}

export function makeSign(doc: Document): Sign {
  const el = doc.createElement('div');
  el.className = 'wc-bsign';
  const plank = doc.createElement('div');
  plank.className = 'wc-bsign-plank';
  const mk = (cls: string): HTMLDivElement => {
    const d = doc.createElement('div');
    d.className = cls;
    plank.append(d);
    return d;
  };
  const who = mk('wc-bsign-who'), xp = mk('wc-bsign-xp'), more = mk('wc-bsign-more'), rate = mk('wc-bsign-rate');
  el.append(plank);
  let last = NaN;
  return {
    el,
    set(s, joined) {
      el.dataset.face = s.mood;
      el.dataset.kind = s.kind;
      who.textContent = s.title;
      who.hidden = !s.title;
      xp.textContent = s.big;
      xp.hidden = !s.big;
      if (s.unit) {
        const small = doc.createElement('small');
        small.textContent = s.unit;
        xp.append(small);
      }
      more.textContent = s.more;
      more.hidden = !s.more;
      rate.textContent = s.label;
      rate.hidden = !s.label;
      if (joined) {
        plank.classList.remove('wc-bsign-bump');
        // Restarted on the next frame (no forced layout).
        doc.defaultView?.requestAnimationFrame(() => plank.classList.add('wc-bsign-bump'));
      }
    },
    swing(deg) {
      const d = Math.round(deg * 10) / 10;
      if (d !== last) el.style.transform = `rotate(${(last = d)}deg)`;
    },
  };
}
