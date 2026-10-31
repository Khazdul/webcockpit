// The menu bar's icons (ADR 0099): stroke paths in a 24-unit box, drawn
// in the ghost look (thin grey strokes, lit on hover). The paths are the
// approved 30a mockups' (notes/research/fixed-menu-mockups/30a-1-bar);
// the moon, the inward fullscreen corners and the popup's close cross are
// drawn in the same style.

const SVG_NS = 'http://www.w3.org/2000/svg';

export const ICON = {
  sun: 'M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7z M12 2v2.5 M12 19.5V22 M2 12h2.5 M19.5 12H22 M4.9 4.9l1.8 1.8 M17.3 17.3l1.8 1.8 M4.9 19.1l1.8-1.8 M17.3 6.7l1.8-1.8',
  moon: 'M20.5 14.2A8.6 8.6 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z',
  profile: 'M12 4a4 4 0 1 1 0 8a4 4 0 1 1 0-8z M4.5 20.5c0-4.2 3.4-6.3 7.5-6.3s7.5 2.1 7.5 6.3',
  scripts: 'M9 20h9a2 2 0 0 0 2-2v-1h-9v1a2 2 0 0 1-4 0V6a2 2 0 0 0-4 0v2h4 M5 4h12a2 2 0 0 1 2 2v11 M10.5 8.5h5 M10.5 12h5',
  panes: 'M4 4h16v16H4z M14 4v16 M14 12h6',
  settings: 'M4 7h9 M17 7h3 M15 4.5v5 M4 12h3 M11 12h9 M9 9.5v5 M4 17h11 M19 17h1 M17 14.5v5',
  fullscreen: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  fullscreenExit: 'M9 4v5H4 M15 4v5h5 M20 15h-5v5 M4 15h5v5',
  exit: 'M12 3v8 M6.6 6.6a7.6 7.6 0 1 0 10.8 0',
} as const;

/** The popups' close cross, in a 12-unit box. */
export const CLOSE_X = 'M2 2l8 8M10 2l-8 8';

/** An `<svg class=cls>` with one stroke path `d`; returns the svg and its path. */
export function strokeIcon(doc: Document, d: string, cls: string, box = 24): { svg: SVGSVGElement; path: SVGPathElement } {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${box} ${box}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', cls);
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return { svg, path };
}
