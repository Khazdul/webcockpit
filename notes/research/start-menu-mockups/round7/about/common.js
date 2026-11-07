/* Round 7 · Credits and About · shared mockup code (throwaway). Loaded after ../base/base.js and, for
   About, after about-text.js and notices.js.

   PG.boot(opts)        the start menu + how this page opens and closes (see "PAGE BOOT" below)
   PG.chronicle(f)      the real Credits chronicle (templates, FNV-1a hash, date phrase from
                        src/share/chronicle.ts) over a made-up run history; null when nothing passes
   PG.filters           the Spotlights settings (kinds × characters × period) the chronicle reads
   PG.settingsPopup()   the Spotlights settings popup in the new look
   PG.about()           ABOUT_TEXT parsed into sections (verbatim text, links marked)
   PG.notices()         THIRD_PARTY_NOTICES.md rendered to HTML
   PG.SEAL              the "M" favicon (public/favicon.svg) as an image URL
   URL: ?page opens the page at once · ?empty (no data) · ?filtered · ?error · ?loading (Credits)
        ?nointro, ?slow=N, ?rm as in the base. */
(() => {
'use strict';
const qs = new URLSearchParams(location.search);
const PG = (window.PG = {});
PG.qs = qs;
PG.VERSION = '0.2.6';
PG.COMMIT = '1544265';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
PG.esc = esc;

/* ===================================================================================== the "M" seal
   public/favicon.svg as built in 41b (iron M, cyan inlay), used as an <img> so its ids never clash. */
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-55.5 -778.4 866.8 866.8"><style>.o{stroke:#b9d0d3}</style><defs><path id="m" d="M805-714l8 136-327 486q0 0-11 18-11 18-21 44-11 27-10 54h-9l-56-103zm-719 641v73h-111v-10q1 0 9 0 7 0 7 0 27 0 48-16 21-17 25-47zm54 16q0 1 0 2 0 1 0 3 0 16 12 30 11 13 27 13h16v9h-62v-57zm12-657h9l45 127-73 587h-79zm9 0l352 481-78 257-304-420zm653 0l101 714h-214l-48-365 152-349zm69 641h22q5 30 25 47 21 16 48 16 0 0 8 0 7 0 8 0v10h-111zm-189 16h7v57h-62v-9h16q16 0 27-13 12-14 12-30 0-2 0-3 0-1 0-2z" transform="scale(0.78 1)"/><linearGradient id="face" gradientUnits="userSpaceOnUse" x1="0" y1="-720" x2="0" y2="0"><stop offset="0" stop-color="#7a6a5a"/><stop offset=".2" stop-color="#463b31"/><stop offset=".65" stop-color="#2a221c"/><stop offset="1" stop-color="#16110e"/></linearGradient><linearGradient id="inlay" gradientUnits="userSpaceOnUse" x1="0" y1="-720" x2="0" y2="0"><stop offset="0" stop-color="#d4fffc"/><stop offset=".25" stop-color="#3ee0de"/><stop offset=".5" stop-color="#119a9c"/><stop offset=".7" stop-color="#46d6d4"/><stop offset="1" stop-color="#0b6e70"/></linearGradient><mask id="core" maskUnits="userSpaceOnUse" x="-55.5" y="-778.41" width="866.82" height="866.82"><use href="#m" fill="#fff" stroke="#000" stroke-width="84" stroke-linejoin="round"/></mask></defs><use href="#m" class="o" fill="none" stroke-width="64" stroke-linejoin="round"/><use href="#m" fill="url(#face)"/><rect mask="url(#core)" x="-55.5" y="-778.41" width="866.82" height="866.82" fill="url(#inlay)"/></svg>`;
PG.SEAL = 'data:image/svg+xml,' + encodeURIComponent(FAVICON);

/* ===================================================================================== ABOUT
   ABOUT_TEXT (about-text.js, verbatim) → sections. Same rules as aboutLines(): an ALL-CAPS line is a
   heading, an indented `  key  description` line a key/value row, other lines paragraphs. */
const SEC_META = [
  { id: 'intro', nav: 'WebCockpit', sk: 'W' },
  { id: 'mume', nav: 'MUME', sk: 'M' },
  { id: 'pvp', nav: 'Built for PvP', sk: 'B' },
  { id: 'start', nav: 'Getting started', sk: 'G' },
  { id: 'inside', nav: 'What is inside', sk: 'I' },
  { id: 'settings', nav: 'Settings', sk: 'S' },
  { id: 'lua', nav: 'Lua scripts', sk: 'U' },
  { id: 'credits', nav: 'Credits', sk: 'C' },
  { id: 'licence', nav: 'Licence', sk: 'L' },
];
PG.NOTICES_META = { id: 'notices', nav: 'Third-party notices', sk: 'T', title: 'THIRD-PARTY NOTICES' };
const LINK = /\b((?:mume\.org|discord\.gg|github\.com|tintin\.mudhalla\.net)(?:\/[\w./-]*[\w/])?|LICENSE\.txt|fonts\/README\.md)/g;
const LOCAL = new Set(['LICENSE.txt', 'fonts/README.md']);
/** Text → HTML with the web addresses as links (as linked() in about.tsx) and game commands in mono. */
PG.linked = (text) => esc(text)
  .replace(LINK, (p) => LOCAL.has(p) ? `<a class="ab-a" href="#" data-local="${p}">${p}</a>` : `<a class="ab-a" href="https://${p}" target="_blank" rel="noopener noreferrer">${p}</a>`)
  .replace(/(#help|#weather demo|\?safe)\b/g, '<code class="ab-cmd">$1</code>');
/** Marks a label's shortcut letter (first match, case-insensitive) with u.sk. */
PG.sk = (label, letter) => { const i = label.toLowerCase().indexOf(letter.toLowerCase()); return i < 0 ? esc(label) : `${esc(label.slice(0, i))}<u class="sk">${esc(label[i])}</u>${esc(label.slice(i + 1))}`; };
PG.about = () => {
  const out = [{ title: null, blocks: [] }];
  for (const raw of window.ABOUT_TEXT.split('\n')) {
    const s = out[out.length - 1];
    if (raw === '') continue;
    if (/^[A-Z][A-Z —-]+$/.test(raw)) { out.push({ title: raw, blocks: [] }); continue; }
    const m = raw.startsWith('  ') && /^ {2}(\S+(?: \S+)*?) {2,}(.*)$/.exec(raw);
    if (m) { const last = s.blocks[s.blocks.length - 1]; const row = [m[1], m[2]]; if (last && last.kv) last.kv.push(row); else s.blocks.push({ kv: [row] }); }
    else s.blocks.push({ p: raw });
  }
  return out.map((s, i) => ({ ...SEC_META[i], ...s }));
};
/** One section's blocks as HTML (paragraphs and key/value lists). */
PG.blocksHtml = (sec, { kvClass = 'ab-kv' } = {}) => sec.blocks.map((b) => b.p ? `<p class="ab-p">${PG.linked(b.p)}</p>`
  : `<dl class="${kvClass}">${b.kv.map(([k, v]) => `<div class="ab-kvr"><dt>${esc(k)}</dt><dd>${PG.linked(v)}</dd></div>`).join('')}</dl>`).join('');
/** Clicks on the site's own files (LICENSE.txt, fonts/README.md) only flash in the mockup. */
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[data-local]');
  if (!a) return; e.preventDefault();
  WC.toast(`${esc(a.dataset.local)}<small>the site's own copy opens in a new tab — not in this mockup</small>`);
});

/* ===================================================================================== NOTICES
   A small Markdown renderer for THIRD_PARTY_NOTICES.md: ## headings, paragraphs, lists with continued
   lines, tables, fenced code, **bold**, `code`, bare URLs. */
PG.notices = () => {
  const lines = (window.NOTICES_MD || '').split('\n');
  const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(https?:\/\/[^\s)<]+[^\s)<.,;])/g, '<a class="ab-a" href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  let html = '', i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^# /.test(l) || l.trim() === '') { i++; continue; }
    if (/^## /.test(l)) { html += `<h4 class="nt-h">${inline(l.slice(3))}</h4>`; i++; continue; }
    if (/^```/.test(l)) { let j = i + 1, b = []; while (j < lines.length && !/^```/.test(lines[j])) b.push(lines[j++]); html += `<pre class="nt-pre">${esc(b.join('\n'))}</pre>`; i = j + 1; continue; }
    if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]), body = rows.slice(2).map(cells);
      html += `<div class="nt-tblw"><table class="nt-tbl"><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      continue;
    }
    if (/^- /.test(l)) {
      let items = [];
      while (i < lines.length && (/^- /.test(lines[i]) || /^ {2}\S/.test(lines[i]))) { if (/^- /.test(lines[i])) items.push(lines[i].slice(2)); else items[items.length - 1] += ' ' + lines[i].trim(); i++; }
      html += `<ul class="nt-ul">${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`; continue;
    }
    let p = []; while (i < lines.length && lines[i].trim() !== '' && !/^(#|```|\||- )/.test(lines[i])) p.push(lines[i++].trim());
    html += `<p class="nt-p">${inline(p.join(' '))}</p>`;
  }
  return html;
};

/* ===================================================================================== CHRONICLE
   src/share/chronicle.ts, transcribed for the mockup: the same templates, hash and date phrase, so
   every sentence is the one the app prints for these (made-up) events. */
const CHRONICLE_OPENING = 'Here the scribes have set down, as well as memory allows, the deeds of your companions.';
const CHRONICLE_END = 'The End.';
const CHAPTER_HEADERS = ['The Tale of {name}', 'Concerning {name}', 'Of {name} and the Long Road', 'How {name} Went Out Into the World',
  'The Lay of {name}, Mostly True', 'The Deeds of {name}, As Far As They Are Known', 'Of {name}, and Things Better Left Unsung'];
const TEMPLATES = {
  pkill: ['{date} you met {victim} upon the road, and {victim} walked no further.', '{date} {victim} crossed your path, and there the tale of {victim} ends.',
    '{date} you sent {victim} on the long walk to the halls of waiting.', '{date} {victim} learned, briefly, what it costs to cross you.',
    '{date} a song was made of how {victim} fell before you. It was short.'],
  death: ['{date} you fell{atlevel}, and the world went grey for a while.', '{date} your light went out{atlevel}, though not for ever.',
    '{date} you were laid low{atlevel}, and the scribes put down their pens.', '{date} death found you{atlevel}, but you did not care to stay.',
    '{date} you walked the grey paths{atlevel}, and came back somewhat lighter.'],
  level: ['{date} you grew in strength and reached level {level}.', '{date} the long toil told at last, and you became level {level}.',
    '{date} you climbed to level {level}, and the road seemed shorter.', '{date} word went round the inns that you had reached level {level}.',
    '{date} you stood a little taller, being now of level {level}.'],
  achievement: ['{date} you won renown: {deed}.', '{date} it was written of you: {deed}.', '{date} came a deed worth the telling: {deed}.',
    '{date} the chroniclers noted, with some surprise: {deed}.', '{date} you did a thing long remembered: {deed}.'],
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth',
  'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'twenty-first', 'twenty-second', 'twenty-third',
  'twenty-fourth', 'twenty-fifth', 'twenty-sixth', 'twenty-seventh', 'twenty-eighth', 'twenty-ninth', 'thirtieth', 'thirty-first'];
const datePhrase = (us) => { const d = new Date(us / 1000); return `On the ${ORD[d.getDate() - 1]} of ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`; };
function stableHash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
// [character, 'YYYY-MM-DD HH:MM', kind, value]: level → level reached; death → level; pkill → 'Name the Race'; achievement → text
const EVENTS = [
  ['Gibur', '2026-09-12 21:40', 'level', 28],
  ['Gibur', '2026-09-19 22:05', 'achievement', 'Defeated an orc scout at the Ford of Bruinen.'],
  ['Rasta', '2026-09-20 23:12', 'pkill', 'Tharandil the Elf'],
  ['Gibur', '2026-09-29 22:31', 'death', 29],
  ['Gibur', '2026-10-03 20:12', 'pkill', 'Moraxus the Orc'],
  ['Gittan', '2026-10-03 20:58', 'level', 15],
  ['Taube', '2026-10-05 19:20', 'level', 20],
  ['Rasta', '2026-10-12 21:34', 'achievement', 'That was a quick trip!'],
  ['Gittan', '2026-10-15 22:10', 'death', 16],
  ['Gibur', '2026-10-18 21:47', 'level', 34],
  ['Gibur', '2026-10-18 23:02', 'achievement', 'Put a barrow-wight to rest.'],
  ['Taube', '2026-10-24 20:41', 'achievement', 'Crossed the Misty Mountains by the High Pass.'],
  ['Rasta', '2026-10-26 15:44', 'death', 73],
  ['Gibur', '2026-10-27 20:40', 'pkill', 'Grushnak the Troll'],
  ['Gittan', '2026-10-28 21:55', 'level', 17],
  ['Taube', '2026-10-30 21:02', 'level', 21],
  ['Melker', '2026-10-31 09:15', 'level', 2],
  ['Melker', '2026-10-31 09:16', 'level', 3],
  ['Rasta', '2026-10-31 23:58', 'level', 74],
  ['Gibur', '2026-11-03 21:15', 'death', 40],
  ['Rasta', '2026-11-04 22:31', 'pkill', 'Haldor the Dwarf'],
  ['Taube', '2026-11-05 12:20', 'level', 22],
  ['Taube', '2026-11-05 12:44', 'death', 22],
  ['Gibur', '2026-11-06 22:58', 'level', 41],
].map(([character, at, kind, v]) => {
  const [d, t] = at.split(' '), [y, mo, da] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number);
  return { character, runId: `${character.toLowerCase()}-${d}`, us: new Date(y, mo - 1, da, h, mi).getTime() * 1000, kind, v };
});
PG.CHARACTERS = [...new Set(EVENTS.map((e) => e.character))].sort();
const NOW_US = new Date(2026, 10, 7, 1, 30).getTime() * 1000;   // fixed "now" (as the History mockup)
function sentence(e) {
  const list = TEMPLATES[e.kind], t = list[stableHash(`${e.character}|${e.runId}|${e.us}|${e.kind}`) % list.length];
  const victim = e.kind === 'pkill' ? `*${e.v}*` : '', lvl = e.kind === 'level' ? String(e.v) : '';
  const deed = e.kind === 'achievement' ? e.v.trim().replace(/[.!]+$/, '') : '', atlevel = e.kind === 'death' ? ` at level ${e.v}` : '';
  return t.replaceAll('{date}', datePhrase(e.us)).replaceAll('{victim}', victim).replaceAll('{level}', lvl).replaceAll('{deed}', deed).replaceAll('{atlevel}', atlevel);
}
PG.OPEN_FILTERS = { achievements: true, deaths: true, levelUps: true, pvp: true, allCharacters: true, characters: [], period: 'all' };
PG.PERIODS = [['all', 'All time'], ['year', 'Last year'], ['3months', 'Last 3 months'], ['month', 'Last month'], ['week', 'Last week']];
PG.KINDS = [['achievements', 'achievement', 'Achievements'], ['deaths', 'death', 'Deaths'], ['levelUps', 'level', 'Level-ups'], ['pvp', 'pkill', 'PvP kills']];
PG.filters = qs.has('filtered')
  ? { achievements: false, deaths: false, levelUps: false, pvp: true, allCharacters: false, characters: ['Melker'], period: 'week' }
  : { ...PG.OPEN_FILTERS };
const filtersOpen = (f) => f.achievements && f.deaths && f.levelUps && f.pvp && f.allCharacters && f.period === 'all';
function periodStartUs(period, nowUs) {
  if (period === 'all') return -Infinity;
  const d = new Date(nowUs / 1000), day = d.getDate();
  if (period === 'week') d.setDate(day - 7);
  else { const months = period === 'year' ? 12 : period === '3months' ? 3 : 1; d.setDate(1); d.setMonth(d.getMonth() - months); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); }
  return d.getTime() * 1000;
}
/** The chronicle as structure: { opening, chapters: [{ name, header, pre, post, deeds: [{ text, date, rest }] }], end }, or null. */
PG.chronicle = (f = PG.filters) => {
  if (qs.has('empty')) return null;
  const from = periodStartUs(f.period, NOW_US), names = f.allCharacters ? null : new Set(f.characters);
  const shown = (e) => PG.KINDS.some(([key, kind]) => kind === e.kind && f[key]) && (!names || names.has(e.character)) && e.us >= from;
  const by = new Map();
  for (const e of EVENTS) { if (!shown(e)) continue; const l = by.get(e.character) || []; l.push(e); by.set(e.character, l); }
  if (!by.size) return null;
  const chapters = [...by.entries()].map(([name, ev]) => ({ name, ev: ev.sort((a, b) => a.us - b.us) }))
    .sort((a, b) => a.ev[0].us - b.ev[0].us || a.name.localeCompare(b.name))
    .map(({ name, ev }) => {
      const header = CHAPTER_HEADERS[stableHash(name) % CHAPTER_HEADERS.length].replaceAll('{name}', name);
      const at = header.indexOf(name);
      return { name, header, pre: header.slice(0, at).trim(), post: header.slice(at + name.length).trim(),
        deeds: ev.map((e) => { const text = sentence(e), date = datePhrase(e.us); return { text, date, rest: text.slice(date.length), kind: e.kind }; }) };
    });
  return { opening: CHRONICLE_OPENING, chapters, end: CHRONICLE_END };
};
PG.CREDITS_EMPTY = {
  no_data: 'No chronicle yet. Your tale is written as you play: kills, deaths, level-ups and achievements each earn a line. Come back once you have made some history.',
  filtered: 'No chronicle entries match your settings.',
  error: "The chronicle could not be read from this browser's storage.",
};
/** Which empty page Credits shows now, or null when the chronicle has lines. */
PG.creditsEmpty = () => {
  if (qs.has('error')) return 'error';
  if (qs.has('empty')) return 'no_data';
  if (PG.chronicle()) return null;
  return filtersOpen(PG.filters) || !PG.chronicle(PG.OPEN_FILTERS) ? 'no_data' : 'filtered';
};
/** A deed sentence as HTML: the date phrase in small caps, the victim's asterisks kept. */
PG.deedHtml = (d) => `<span class="cr-date">${esc(d.date)}</span>${esc(d.rest)}`;

/* ===================================================================================== SETTINGS POPUP
   The Spotlights settings (spotlights-settings.tsx) in the new look: a small Lykta box (hood
   "Spotlights") under its opener. Kinds (toggles), Characters (All + checks, dim while All is on),
   Period. Every change is stored at once; onClose(changed) when it closes (Esc, ×, a click outside). */
PG.settingsPopup = (anchor, onClose) => {
  const f = PG.filters, before = JSON.stringify(f);
  const box = WC.el('section', { class: 'lp sp-pop', 'data-hood': 'Spotlights', role: 'dialog', 'aria-label': 'Spotlights settings' }, `
    <div class="win">
      <button class="ibtn icon small sp-x" type="button" aria-label="Close (Esc)"><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
      <h3 class="h-sec">Kinds</h3>
      <div class="sp-list">${PG.KINDS.map(([key, , label]) => `<label class="check sp-r"><span>${label}</span><input type="checkbox" class="tog" data-k="${key}"${f[key] ? ' checked' : ''}></label>`).join('')}</div>
      <hr class="hr">
      <h3 class="h-sec">Characters</h3>
      <label class="check sp-r"><span>All characters</span><input type="checkbox" class="tog" data-all${f.allCharacters ? ' checked' : ''}></label>
      <div class="sp-chars">${PG.CHARACTERS.map((n) => `<label class="check"><input type="checkbox" class="chk" data-c="${n}"${f.characters.includes(n) ? ' checked' : ''}> ${n}</label>`).join('')}</div>
      <hr class="hr">
      <label class="sp-r sp-per"><span class="h-sec" style="margin:0">Period</span><select class="select" data-period>${PG.PERIODS.map(([v, l]) => `<option value="${v}"${f.period === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>`);
  document.body.append(box); WC.decorate(box);
  const chars = box.querySelector('.sp-chars');
  const sync = () => { chars.classList.toggle('dim', f.allCharacters); chars.querySelectorAll('input').forEach((i) => { i.disabled = f.allCharacters; i.checked = f.characters.includes(i.dataset.c); }); };
  sync();
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.k) f[t.dataset.k] = t.checked;
    else if ('all' in t.dataset) {
      if (t.checked) f.allCharacters = true;
      else { const kept = PG.CHARACTERS.filter((n) => f.characters.includes(n)); f.allCharacters = false; f.characters = kept.length ? kept : [...PG.CHARACTERS]; }
    } else if (t.dataset.c) f.characters = PG.CHARACTERS.filter((n) => (n === t.dataset.c ? t.checked : f.characters.includes(n)));
    else if ('period' in t.dataset) f.period = t.value;
    sync();
  });
  // place it under the opener, centred on it, kept inside the window
  const place = () => {
    const a = anchor.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
    let x = a.left + a.width / 2 - w / 2, y = a.bottom + 14;
    if (y + h > innerHeight - 8) y = Math.max(8, a.top - h - 14);
    box.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px'; box.style.top = y + 'px';
  };
  place();
  box.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: WC.dur(260), easing: 'cubic-bezier(.2,.8,.2,1)' });
  const focusables = () => [...box.querySelectorAll('input:not([disabled]), select, .sp-x')];
  setTimeout(() => focusables()[0] && focusables()[0].focus({ preventScroll: true }), 30);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true; pop(); document.removeEventListener('pointerdown', outside, true);
    box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: WC.dur(180) }).finished.then(() => box.remove());
    onClose && onClose(JSON.stringify(f) !== before);
  };
  const outside = (e) => { if (!box.contains(e.target) && !anchor.contains(e.target)) close(); };
  document.addEventListener('pointerdown', outside, true);
  box.querySelector('.sp-x').addEventListener('click', close);
  // ↑↓ move between the controls (Tab works too); Space toggles (native); Esc closes
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (e.target.tagName === 'SELECT') return;
    const list = focusables(), i = list.indexOf(document.activeElement);
    const n = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]; n && n.focus(); e.preventDefault(); e.stopPropagation();
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }, true);
  const pop = WC.keys.push({ key: () => false, back: close });
  addEventListener('resize', place);
  return { close, box };
};

/* ===================================================================================== PAGE BOOT
   PG.boot({ key, box, mode, into, layer, onOpen, onShown, onClose }) builds the sky and the start menu
   and opens `box` when the menu item `key` is chosen (or at once with ?page).
     mode 'corner'  large box; the wordmark glides to a tiny mark in the top-left corner (round-7 layout
                    A's resting state, the neutral default) — click it to go back
     mode 'into'    large box; the wordmark glides into `into` (a .wm inside the page) and stays there
     mode 'stay'    normal box; the wordmark stays where it is and the box takes the menu panel's place
   layer: { key(e) } while open (Esc / Back close). Credits: the empty pages (normal box) open instead
   when PG.creditsEmpty() says so. Returns { menu, open, close, isOpen }. */
PG.boot = (opts) => {
  WC.sky.start();
  const menu = WC.startMenu({ onActivate(k) { if (k === opts.key) { api.open(); return true; } } });
  WC.decorate();
  const brand = menu.brand, body = document.body;
  let mark = null;
  if (opts.mode === 'corner') {
    mark = WC.el('div', { class: 'wm small bare', id: 'mark', title: 'Start (Esc)', 'aria-label': 'MUME Cockpit — back to the start' });
    body.prepend(mark); WC.Wordmark(mark);
    mark.addEventListener('click', () => { if (cur && !WC.busy) api.close(); });
  }
  if (opts.into) WC.Wordmark(opts.into);
  const EASE = 'cubic-bezier(.45,.05,.2,1)';
  let cur = null, held = [], pop = null;
  const placeStay = (box) => {
    const r = brand.getBoundingClientRect(), phone = innerWidth <= 600;
    const top = Math.round(r.bottom + (phone ? 18 : 18));
    box.style.top = top + 'px';
    box.style.setProperty('--avail', `${innerHeight - top - (phone ? 8 : 22)}px`);
  };
  addEventListener('resize', () => { if (cur && cur.mode === 'stay') placeStay(cur.box); });
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.height > 0; };

  async function show(box, mode, instant, layer) {
    WC.busy = true; menu.active = false;
    if (instant) body.classList.add('instant');
    body.classList.add('pg', 'pg-' + mode);
    box.classList.add('shown');
    if (mode === 'stay') placeStay(box);
    const D = instant ? 0 : WC.dur(1), anims = [];
    const target = mode === 'corner' ? mark : mode === 'into' ? opts.into : null;
    if (target) {
      if (box.querySelector('.box-body')) box.querySelector('.box-body').scrollTop = 0;
      const from = WC.rect(brand), to = target.querySelector('.wm-c').getBoundingClientRect();
      if (WC.RM || instant) {
        anims.push(brand.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260 * D, fill: 'forwards' }));
        anims.push(target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 * D, fill: 'forwards' }));
      } else {
        anims.push(brand.animate([{ transform: 'none', opacity: 1 }, { transform: WC.flyTo(from, to), opacity: 1, offset: .78 }, { transform: WC.flyTo(from, to), opacity: 0 }],
          { duration: 950 * D, easing: EASE, fill: 'forwards' }));
        anims.push(target.animate([{ opacity: 0 }, { opacity: 0, offset: .72 }, { opacity: 1 }], { duration: 950 * D, fill: 'forwards' }));
      }
    }
    const tx = mode === 'stay' ? 'translateX(-50%) ' : '';
    anims.push(box.animate([{ opacity: 0, transform: tx + 'translateY(22px) scale(.985)' }, { opacity: 1, transform: tx || 'none' }],
      { duration: (WC.RM ? 260 : mode === 'stay' ? 560 : 700) * D, delay: (WC.RM ? 0 : mode === 'stay' ? 140 : 180) * D, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }));
    held = held.concat(anims);
    cur = { box, mode, target };
    await Promise.all(anims.map((a) => a.finished));
    body.classList.add('landed'); body.classList.remove('instant');
    pop = WC.keys.push({ key: (e) => (layer && layer.key ? layer.key(e) : false), back: () => (layer && layer.back ? layer.back() : api.close()) });
    WC.busy = false;
  }
  async function hide(toMenu = true) {
    if (!cur) return;
    const { box, mode, target } = cur;
    WC.busy = true; pop && pop(); pop = null;
    body.classList.remove('landed');
    const D = WC.dur(1), anims = [];
    const tx = mode === 'stay' ? 'translateX(-50%) ' : '';
    anims.push(box.animate([{ opacity: 1, transform: tx || 'none' }, { opacity: 0, transform: tx + 'translateY(18px) scale(.985)' }], { duration: (WC.RM ? 220 : 420) * D, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }));
    if (target && toMenu) {
      const from = WC.rect(brand), to = target.querySelector('.wm-c').getBoundingClientRect();
      if (WC.RM || !visible(target)) {
        anims.push(target.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 * D, fill: 'forwards' }));
        anims.push(brand.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 * D, fill: 'forwards' }));
      } else {
        anims.push(target.animate([{ opacity: 1 }, { opacity: 0, offset: .22 }, { opacity: 0 }], { duration: 900 * D, fill: 'forwards' }));
        anims.push(brand.animate([{ transform: WC.flyTo(from, to), opacity: 0 }, { transform: WC.flyTo(from, to), opacity: 1, offset: .2 }, { transform: 'none', opacity: 1 }],
          { duration: 900 * D, easing: EASE, fill: 'forwards' }));
      }
    }
    if (toMenu) setTimeout(() => body.classList.remove('pg'), (WC.RM ? 120 : 250) * D);
    await Promise.all(anims.map((a) => a.finished));
    box.classList.remove('shown');
    body.classList.remove('pg-' + mode);
    anims.forEach((a) => a.cancel());
    if (toMenu) { held.forEach((a) => a.cancel()); held = []; }
    else held = held.filter((a) => { if (a.effect && a.effect.target === box) { a.cancel(); return false; } return true; });
    cur = null; WC.busy = false;
    if (toMenu) { menu.active = true; menu.select(menu.cur); }
  }

  /* ---- Credits' empty pages (normal box): no data / error (any key returns), filtered (Settings…) */
  let emptyBox = null;
  function emptyPage(kind) {
    if (!emptyBox) {
      emptyBox = WC.el('section', { class: 'lp box-normal pgbox emptybox', 'data-hood': 'Credits', 'data-back': '', 'aria-label': 'Credits' }, '<div class="win"><div class="box-body"></div></div>');
      body.append(emptyBox); WC.decorate(emptyBox);
    }
    const b = emptyBox.querySelector('.box-body');
    b.innerHTML = `<p class="empty-txt${kind === 'error' ? ' fail' : ''}">${esc(PG.CREDITS_EMPTY[kind])}</p>` +
      (kind === 'filtered' ? '<div class="btnrow" style="justify-content:center"><button class="ibtn" type="button" id="spBtn"><svg viewBox="0 0 16 16"><path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7"/><circle cx="11" cy="4.5" r="1.6"/><circle cx="5" cy="11.5" r="1.6"/></svg><span><u class="sk">S</u>ettings…</span></button></div>' : '');
    let popup = null;
    const openSettings = () => {
      if (popup) { popup.close(); return; }
      const btn = b.querySelector('#spBtn'); btn.classList.add('on');
      popup = PG.settingsPopup(btn, async (changed) => {
        popup = null; btn.classList.remove('on');
        if (!changed) return;
        const k = PG.creditsEmpty();
        if (k === null) { await hide(false); show(opts.box, opts.mode, false, opts.layer).then(() => opts.onShown && opts.onShown()); opts.onOpen && opts.onOpen(); }
        else if (k !== kind) { emptyPage.swap(k); }
      });
    };
    if (kind === 'filtered') b.querySelector('#spBtn').addEventListener('click', openSettings);
    if (kind !== 'filtered') b.querySelector('.empty-txt').addEventListener('click', () => !WC.busy && api.close());
    return {
      key(e) {
        if (kind === 'filtered') return WC.shortcut(e, { s: openSettings, Enter: openSettings, ' ': openSettings });
        if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(e.key)) return false;
        api.close(); return true;   // any key returns (as EmptyStateFrame)
      },
    };
  }
  emptyPage.swap = (k) => { const l = emptyPage(k); pop && pop(); pop = WC.keys.push({ key: l.key, back: () => api.close() }); };

  const api = {
    menu, brand, mark,
    get isOpen() { return !!cur; },
    get cur() { return cur; },
    async open(instant = false) {
      if (cur || WC.busy) return;
      if (opts.key === 'credits') {
        const k = PG.creditsEmpty();
        if (k) { const layer = emptyPage(k); return show(emptyBox, 'stay', instant, layer); }
      }
      opts.onOpen && opts.onOpen();
      await show(opts.box, opts.mode, instant, opts.layer);
      opts.onShown && opts.onShown();
    },
    async close() {
      if (!cur || WC.busy) return;
      const wasMain = cur.box === opts.box;
      await hide(true);
      if (wasMain && opts.onClose) opts.onClose();
    },
    placeStay,
  };
  if (qs.has('page')) api.open(true);
  return api;
};
})();
