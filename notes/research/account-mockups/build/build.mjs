// Builds the account mockups (stage 60) from build/skel/ (capture.mjs),
// build/mock.css, build/states.js and build/shell.js. Throwaway tooling.
//
//   node notes/research/account-mockups/build/build.mjs
//
// Every output is one self-contained HTML file (fonts, sky and CSS inline,
// no network): a "shell" with a tab bar and a stage. The stage is an
// <iframe srcdoc> that holds the real start page's DOM and CSS as captured,
// with the state's own content put in by states.js. The phone view is the
// same document in a 390 px frame, with the pointer media queries turned
// to the phone's side (a desktop browser would otherwise answer "fine").

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repo = path.resolve(root, '../../..');
const skel = (f) => path.join(here, 'skel', f);
const read = (f) => fs.readFileSync(f, 'utf8');
const b64 = (f) => fs.readFileSync(f).toString('base64');

// ------------------------------------------------------------------ fonts
const FONTS = [
  ['Cinzel', 'bold', 'normal', 'Cinzel-Bold-latin.woff2'],
  ['Cormorant Garamond', 'normal', 'italic', 'CormorantGaramond-MediumItalic-latin.woff2'],
  ['Cormorant Garamond', 'normal', 'normal', 'CormorantGaramond-Medium-latin.woff2'],
  ['Cormorant SC', 'normal', 'normal', 'CormorantSC-SemiBold-latin.woff2'],
  ['Hack', 'normal', 'normal', 'Hack-Regular.woff2'],
];
const fontCss = FONTS.map(
  ([fam, w, st, file]) =>
    `@font-face{font-family:"${fam}";src:url(data:font/woff2;base64,${b64(path.join(repo, 'public/fonts', file))}) format("woff2");font-weight:${w};font-style:${st};font-display:block;}`,
).join('\n');

// -------------------------------------------------------------------- CSS
// The sheets the mockups need, as source text: the page's own inline
// styles (no id), the theme tokens, the start surface, the look kit, the
// Profiles page (variant C shows it) and the phone. The game's own sheets
// (panes, map, editor, replay …) are left out.
const KEEP = [
  '',
  'src/ui/ui.css',
  'src/chrome/kit/kit.css',
  'src/chrome/kit/look.css',
  'src/chrome/kit/look-controls.css',
  'src/chrome/kit/look-overlay.css',
  'src/start/geometry.css',
  'src/chrome/start.css',
  'src/chrome/frames/profiles.css',
  'src/phone/phone.css',
];
const sheets = JSON.parse(read(skel('css.json')));
let realCss = sheets
  .filter((s) => KEEP.includes(s.id))
  .map((s) => `/* ---- ${s.id || 'index.html'} ---- */\n${s.css}`)
  .join('\n');
// The fonts are embedded above; no other file is fetched (no network).
realCss = realCss.replace(/@font-face\s*\{[^}]*\}/g, '').replace(/url\((["']?)\/[^)]*\)/g, 'none');
// Smaller: the comments go.
realCss = realCss.replace(/\/\*[\s\S]*?\*\//g, '');

const mockCss = read(path.join(here, 'mock.css'));
const statesJs = read(path.join(here, 'states.js'));
const shellJs = read(path.join(here, 'shell.js'));
const shellCss = read(path.join(here, 'shell.css'));

const icons = JSON.parse(read(skel('icons.json')));
const sheet = JSON.parse(read(skel('p-sheet.json')));
const htmlAttrs = (v) => {
  const a = JSON.parse(read(skel(`${v}-html.json`)));
  return Object.entries(a)
    .map(([k, val]) => `${k}="${String(val).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
    .join(' ');
};

const DATA = {
  css: fontCss + '\n' + realCss + '\n' + mockCss,
  attrs: { d: htmlAttrs('d'), p: htmlAttrs('p') },
  skel: { d: read(skel('d-dialog.html')), p: read(skel('p-dialog.html')) },
  sky: { d: 'data:image/jpeg;base64,' + b64(skel('d-sky-main.jpg')), p: 'data:image/jpeg;base64,' + b64(skel('p-sky-main.jpg')) },
  game: 'data:image/jpeg;base64,' + b64(skel('p-game.jpg')),
  icons: icons.icons,
  sheet: sheet.html,
};

// A </script> inside the JSON would end the script element.
const json = (o) => JSON.stringify(o).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

function page(title, groups, intro) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
${shellCss}
</style>
</head>
<body>
<header class="sh-bar" id="sh-bar">
  <div class="sh-row">
    <strong class="sh-title">${title}</strong>
    <nav class="sh-groups" id="sh-groups" aria-label="Pages"></nav>
    <div class="sh-view" role="radiogroup" aria-label="View">
      <button type="button" data-view="d">Desktop</button><button type="button" data-view="p">Phone</button>
    </div>
  </div>
  <div class="sh-row"><nav class="sh-states" id="sh-states" aria-label="States"></nav></div>
  <p class="sh-note" id="sh-note"></p>
</header>
<main class="sh-stage" id="sh-stage"><iframe id="sh-frame" title="Mockup"></iframe></main>
<script>
const MK_DATA = ${json(DATA)};
const MK_GROUPS = ${json(groups)};
const MK_INTRO = ${json(intro ?? '')};
</script>
<script id="mk-states">
${statesJs}
</script>
<script>
${shellJs}
</script>
</body>
</html>
`;
}

// The files: one per page, and the combined one.
const FILES = [
  ['entry.html', 'Account entry on the start page', ['entry-a', 'entry-b', 'entry-c']],
  ['login.html', 'Log in', ['login']],
  ['create.html', 'Create account', ['create', 'create2']],
  ['recovery-code.html', 'Recovery code', ['code']],
  ['recover.html', 'Recovery', ['recover']],
  ['account.html', 'Account page and dialogs', ['account', 'dialogs']],
  ['account-mockups.html', 'Account mockups', null],
];
for (const [file, title, groups] of FILES) {
  const html = page(title, groups);
  fs.writeFileSync(path.join(root, file), html);
  console.log(file, (html.length / 1024).toFixed(0) + ' KB');
}

// ------------------------------------------------------------- index.html
// The review page: the files, and every state's two screenshots (shots/,
// made by shoot.mjs) linking into its file at that state.
const win = {};
new Function('window', 'document', statesJs)(win, {});
const states = win.MK_STATES;
const groups = [];
for (const s of states) {
  let g = groups.find((x) => x.id === s.group);
  if (!g) groups.push((g = { id: s.group, label: s.groupLabel, states: [] }));
  g.states.push(s);
}
const fileOf = (gid) => FILES.find(([, , gs]) => gs && gs.includes(gid))[0];
const shot = (s, v) =>
  s.only && s.only !== v
    ? ''
    : `<a class="shot is-${v}" href="${fileOf(s.group)}#${s.id}.${v}"><img loading="lazy" src="shots/${s.id}.${v === 'd' ? 'desktop' : 'phone'}.jpg" alt="${s.label}, ${v === 'd' ? 'desktop' : 'phone'}"></a>`;
const index = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Account mockups (stage 60)</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; padding: 20px 24px 60px; background: #0f0e0c; color: #c9c1b4; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
h1 { margin: 0 0 4px; font-size: 20px; color: #efe4cf; }
h2 { margin: 34px 0 4px; padding-top: 14px; border-top: 1px solid #2c2823; font-size: 16px; color: #e6d7b8; }
h3 { margin: 18px 0 6px; font-size: 13px; font-weight: 600; color: #b9ad98; }
p { margin: 4px 0; max-width: 100ch; }
a { color: #d9b87a; }
nav { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; }
nav a { padding: 3px 10px; border: 1px solid #3a342c; border-radius: 4px; text-decoration: none; background: #1b1815; }
nav a.main { background: #d9b87a; color: #1a1206; border-color: #d9b87a; font-weight: 600; }
.note { color: #948a7b; }
.pair { display: flex; gap: 10px; align-items: flex-start; margin: 0 0 6px; }
.shot { display: block; border: 1px solid #2c2823; border-radius: 4px; overflow: hidden; background: #000; }
.shot img { display: block; height: 300px; width: auto; }
@media (max-width: 760px) { .shot img { height: 170px; } }
</style>
</head>
<body>
<h1>Account mockups (stage 60)</h1>
<p>Throwaway mockups of the account entry on the start page and of the account pages, in the real look (the start page's own DOM and CSS, captured). Each picture opens that state in its file; there the tabs switch states and the Desktop / Phone toggle switches view. README.md beside this file has the variants, the recommendation and the open questions.</p>
<nav><a class="main" href="account-mockups.html">Everything in one file</a>${FILES.filter(([, , g]) => g)
  .map(([f, t]) => `<a href="${f}">${t}</a>`)
  .join('')}</nav>
${groups
  .map(
    (g) =>
      `<h2 id="${g.id}">${g.label}</h2>` +
      g.states.map((s) => `<h3>${s.label}</h3><p class="note">${s.note}</p><div class="pair">${shot(s, 'd')}${shot(s, 'p')}</div>`).join('\n'),
  )
  .join('\n')}
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'index.html'), index);
console.log('index.html', (index.length / 1024).toFixed(0) + ' KB', states.length + ' states');
