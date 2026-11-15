// Builds the share links mockups (stage 64, round 12; after round 11's build) from build/skel/ (capture.spec.ts),
// build/mock.css, build/states.js and build/shell.js. Throwaway tooling.
//
//   node notes/research/start-menu-mockups/round12/build/build.mjs
//
// Every output is one self-contained HTML file (fonts, sky and CSS inline,
// no network): a "shell" with a tab bar and a stage. The stage is an
// <iframe srcdoc> that holds the real start page's DOM and CSS as captured,
// with the state's own content put in by states.js. The phone view is the
// same document in a 390 px frame,
// with the pointer media queries turned to the phone's side (a desktop
// browser would otherwise answer "fine").

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repo = path.resolve(root, '../../../..');
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
// History, Spotlights and Credits pages and the phone. The game's own
// sheets (panes, map, editor, replay …) are left out.
const KEEP = [
  '',
  'src/ui/ui.css',
  'src/chrome/kit/kit.css',
  'src/chrome/kit/look.css',
  'src/chrome/kit/look-controls.css',
  'src/chrome/kit/look-overlay.css',
  'src/start/geometry.css',
  'src/chrome/start.css',
  'src/chrome/frames/history.css',
  'src/chrome/frames/export.css',
  'src/chrome/frames/runs-cloud.css',
  'src/chrome/frames/history-dialogs.css',
  'src/chrome/frames/history-stats.css',
  'src/chrome/frames/history-tabs.css',
  'src/chrome/frames/spotlights.css',
  'src/chrome/frames/credits.css',
  'src/chrome/frames/profiles.css',
  'src/chrome/frames/import.css',
  'src/chrome/frames/account/account.css',
  'src/phone/phone.css',
  'src/menubar/menubar.css',
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
const htmlAttrs = (v) => {
  const a = JSON.parse(read(skel(`${v}-html.json`)));
  return Object.entries(a)
    .map(([k, val]) => `${k}="${String(val).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
    .join(' ');
};

const VIEWS = { d: 'desktop', p: 'phone' };
const PAGE_LIST = ['in', 'export', 'account'];
const each = (fn) => Object.fromEntries(Object.keys(VIEWS).map((v) => [v, fn(v)]));
// The admin page's own CSS (worker/admin/page.ts), as the Worker serves it.
const adminSrc = read(path.join(repo, 'worker/admin/page.ts'));
const adminCss = /export const ADMIN_CSS = `([\s\S]*?)`;/.exec(adminSrc)[1];
const DATA = {
  css: fontCss + '\n' + realCss + '\n' + mockCss,
  adminCss: adminCss + '\n' + read(path.join(here, 'admin.css')),
  attrs: each(htmlAttrs),
  // The watch page and the admin page are drawn whole by states.js.
  skel: each((v) =>
    Object.assign(Object.fromEntries(PAGE_LIST.map((p) => [p, read(skel(`${v}-${p}.html`))])), {
      watch: '<div id="app" class="mk-watchapp"></div>',
      admin: '<div id="app" class="mk-adminapp"></div>',
    }),
  ),
  sky: each((v) => 'data:image/jpeg;base64,' + b64(skel(`${v}-sky.jpg`))),
  replay: each((v) => ({ a: 'data:image/jpeg;base64,' + b64(skel(`${v}-replay-a.jpg`)), b: 'data:image/jpeg;base64,' + b64(skel(`${v}-replay-b.jpg`)) })),
  icons: icons.icons,
};

// A </script> inside the JSON would end the script element.
const json = (o) => JSON.stringify(o).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

function page(title, topics) {
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
<div class="sh-root" id="sh-root">
<header class="sh-bar" id="sh-bar">
  <div class="sh-row">
    <strong class="sh-title">${title}</strong>
    <nav class="sh-groups" id="sh-topics" aria-label="Topic"></nav>
    <div class="sh-view" role="radiogroup" aria-label="View">
      <button type="button" data-view="d">Desktop</button><button type="button" data-view="p">Phone</button>
    </div>
  </div>
  <div class="sh-row"><span class="sh-lab">Variant</span><nav class="sh-dirs" id="sh-dirs" aria-label="Variant"></nav></div>
  <div class="sh-row"><span class="sh-lab">State</span><nav class="sh-states" id="sh-states" aria-label="State"></nav></div>
  <p class="sh-note" id="sh-note"></p>
</header>
<main class="sh-stage" id="sh-stage"><iframe id="sh-frame" title="Mockup"></iframe></main>
</div>
<script>
const MK_DATA = ${json(DATA)};
const MK_TOPICS = ${json(topics)};
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

// The files: one per topic, and the combined one.
const ALL = 'start-menu-round12.html';
const FILES = [[ALL, 'Share links mockups round 12', null]];
for (const [file, title, topics] of FILES) {
  const html = page(title, topics);
  fs.writeFileSync(path.join(root, file), html);
  console.log(file, (html.length / 1024).toFixed(0) + ' KB');
}

// ------------------------------------------------------------- index.html
// The review page: the files, and every state's screenshots (shots/, made
// by shoot.mjs) linking into its file at that state.
const win = {};
new Function('window', 'document', statesJs)(win, {});
const states = win.MK_STATES.filter((s) => !s.noshot);
const fileOf = () => ALL;
const shot = (s, v) =>
  `<a class="shot is-${v}" href="${fileOf(s.topic)}#${s.id}.${v}"><img loading="lazy" src="shots/${s.id}.${VIEWS[v]}.jpg" alt="${s.label}, ${VIEWS[v]}"></a>`;
const topics = [];
for (const s of states) {
  let t = topics.find((x) => x.id === s.topic);
  if (!t) topics.push((t = { id: s.topic, label: s.topicLabel, dirs: [] }));
  let d = t.dirs.find((x) => x.id === s.dir);
  if (!d) t.dirs.push((d = { id: s.dir, label: s.dirLabel, states: [] }));
  d.states.push(s);
}
const index = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Share links mockups, round 12 (stage 64)</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; padding: 20px 24px 60px; background: #0f0e0c; color: #c9c1b4; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
h1 { margin: 0 0 4px; font-size: 20px; color: #efe4cf; }
h2 { margin: 34px 0 4px; padding-top: 14px; border-top: 1px solid #2c2823; font-size: 17px; color: #e6d7b8; }
h3 { margin: 22px 0 2px; font-size: 15px; color: #d9b87a; }
h4 { margin: 16px 0 4px; font-size: 13px; font-weight: 600; color: #b9ad98; }
p { margin: 4px 0; max-width: 100ch; }
a { color: #d9b87a; }
nav { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; }
nav a { padding: 3px 10px; border: 1px solid #3a342c; border-radius: 4px; text-decoration: none; background: #1b1815; }
nav a.main { background: #d9b87a; color: #1a1206; border-color: #d9b87a; font-weight: 600; }
.note { color: #948a7b; }
.pair { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; margin: 0 0 6px; }
.shot { display: block; border: 1px solid #2c2823; border-radius: 4px; overflow: hidden; background: #000; }
.shot img { display: block; height: 300px; width: auto; }
@media (max-width: 760px) { .shot img { height: 170px; } }
</style>
</head>
<body>
<h1>Share links mockups, round 12 (stage 64)</h1>
<p>Throwaway mockups for the six points of stage 64 (share links), in the real look: the export editor and the Account page as captured from a dev server with the account API's e2e fake (flags accounts, sync, runs and share on), the HTML replay as built by the dev app; the new parts (the Link option, the share and report dialogs, the watch page, the published runs, the admin queue) drawn over and around them. Each picture opens that state in the one file; there the tabs switch point, variant and state, and Desktop / Phone the view. README.md beside this file has each variant, a recommendation per point and what did not fit.</p>
<nav><a class="main" href="${ALL}">Everything in one file</a>${FILES.filter(([, , t]) => t)
  .map(([f, t]) => `<a href="${f}">${t}</a>`)
  .join('')}</nav>
${topics
  .map(
    (t) =>
      `<h2 id="${t.id}">${t.label}</h2>` +
      t.dirs
        .map(
          (d) =>
            `<h3 id="${t.id}-${d.id}">${d.label}</h3>` +
            d.states.map((s) => `<h4>${s.label}</h4><p class="note">${s.note}</p><div class="pair">${s.views.map((v) => shot(s, v)).join('')}</div>`).join('\n'),
        )
        .join('\n'),
  )
  .join('\n')}
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'index.html'), index);
console.log('index.html', (index.length / 1024).toFixed(0) + ' KB', states.length + ' states with shots');
