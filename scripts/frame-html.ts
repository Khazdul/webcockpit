// The shared replay's frame document (ADR 0154 "The watch page"):
// `r/frame.html`, the replay runtime in frame mode (src/replay/frame-main.ts)
// as one inline `<script>` and its CSS as one inline `<style>`, so the
// frame's CSP (public/_headers, the `/r/frame` rule) names both by hash
// and allows nothing else to run. Pure; vite.config.ts `frameDocumentPlugin`
// builds it, scripts/csp.ts fills the hashes.

/** Where the frame document is emitted, under the site's base. */
export const FRAME_FILE = 'r/frame.html';
/** The path the frame is loaded from (Cloudflare's `html_handling` serves `r/frame.html` there without a redirect). */
export const FRAME_PATH = 'r/frame';

/** JavaScript safe inside an inline `<script>` (as src/replay/export.ts `escapeScript`). */
export function escapeInlineScript(js: string): string {
  return js.replace(/<(\/script|!--)/gi, '\\x3C$1');
}

/** CSS safe inside an inline `<style>`: `</style` written with a CSS escape (it only occurs in strings). */
export function escapeInlineStyle(css: string): string {
  return css.replace(/<(\/style)/gi, '\\3C $1');
}

/** The frame document: the GPL notice, the CSS, an empty `#app`, the runtime. */
export function frameHtml(js: string, css: string, version: string): string {
  return [
    '<!doctype html>',
    '<!--',
    `  WebCockpit shared replay frame (WebCockpit ${version.replace(/-{2,}/g, '-')}).`,
    '  Free software under the GNU General Public License, version 2 or later;',
    '  source: https://github.com/Khazdul/webcockpit. Map code and tiles are',
    '  derived from MMapper (https://github.com/MUME/MMapper), GPL-2.0-or-later.',
    '-->',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>WebCockpit replay</title>',
    `<style>${escapeInlineStyle(`html,body{margin:0;height:100%;background:var(--term-bg,#000);color:var(--term-fg,#c0c0c0)}#app{height:100%}\n${css}`)}</style>`,
    '</head>',
    '<body>',
    '<div id="app"></div>',
    `<script>${escapeInlineScript(js)}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
