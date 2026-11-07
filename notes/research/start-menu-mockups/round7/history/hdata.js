/* Round 7 · history group · shared data and model (throwaway mockup code).
   The History sessions (as layout/history.js, plus run summaries), history-model.ts re-done (sort, cells),
   and a deterministic Statistics model per session (statistics.tsx / stats-layout.ts data: allies,
   achievements, kills, PvPs, XP/h and TP/h series, the XP ruler). window.HD. Needs base.js (WC). */
(() => {
'use strict';
const NOW = new Date(2026, 10, 7, 1, 30).getTime();   // fixed "now" so every screenshot agrees
const DAY = 864e5;
// [character, 'YYYY-MM-DD HH:MM', minutes, saved, rating, runs, hasLog, level, kills, pkills, deaths]
const RAW = [
  ['Gibur', '2026-11-06 21:12', 221, false, 0, 2, true, 41, 64, 2, 1],
  ['Gibur', '2026-11-05 19:40', 125, true, 4, 1, true, 40, 31, 0, 0],
  ['Taube', '2026-11-05 12:03', 48, false, 0, 1, true, 22, 9, 0, 0],
  ['Rasta', '2026-11-04 22:15', 72, false, 0, 1, true, 74, 3, 4, 1],
  ['Gibur', '2026-11-03 20:30', 298, true, 5, 3, true, 40, 88, 3, 0],
  ['Gibur', '2026-11-01 21:00', 200, false, 0, 1, true, 39, 52, 0, 2],
  ['Rasta', '2026-10-31 23:40', 122, false, 0, 2, true, 74, 6, 2, 0],
  ['Melker', '2026-10-31 09:14', 3, false, 0, 1, false, 3, 0, 0, 0],
  ['Taube', '2026-10-30 20:10', 93, true, 0, 1, true, 21, 17, 0, 1],
  ['Gibur', '2026-10-29 19:55', 167, false, 0, 1, true, 38, 40, 1, 0],
  ['Gittan', '2026-10-28 21:22', 65, false, 0, 1, true, 17, 14, 0, 0],
  ['Gibur', '2026-10-27 20:05', 302, false, 0, 2, true, 37, 71, 0, 1],
  ['Rasta', '2026-10-26 15:19', 38, false, 0, 1, true, 73, 2, 1, 0],
  ['Gibur', '2026-10-25 22:41', 110, false, 0, 1, true, 36, 28, 0, 0],
  ['Taube', '2026-10-24 19:03', 135, false, 0, 1, true, 20, 22, 0, 0],
  ['Gibur', '2026-10-18 20:20', 372, true, 5, 3, true, 34, 103, 2, 1],
  ['Rasta', '2026-10-12 21:00', 144, true, 3, 1, true, 73, 5, 3, 0],
  ['Gittan', '2026-10-03 19:40', 161, true, 2, 2, true, 15, 30, 0, 1],
  ['Gibur', '2026-09-29 21:54', 243, true, 4, 1, true, 28, 60, 0, 0],
  ['Rasta', '2026-09-26 21:00', 302, true, 4, 1, true, 73, 8, 5, 1],
  ['Rasta', '2026-09-25 22:03', 144, true, 5, 2, true, 72, 4, 2, 0],
  ['Melker', '2026-09-25 21:54', 7, true, 0, 2, true, 2, 1, 0, 0],
  ['Taube', '2026-09-14 18:30', 190, true, 3, 1, true, 14, 35, 0, 0],
];
const parse = (s) => { const [d, t] = s.split(' '), [y, m, dd] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number); return new Date(y, m - 1, dd, h, mi).getTime(); };
const EMPTY = WC.qs.has('empty');
const SESSIONS = EMPTY ? [] : RAW.map(([c, st, min, saved, rating, runs, hasLog, level, kills, pkills, deaths], i) => {
  const start = parse(st);
  return { id: 's' + i, character: c, start, end: start + min * 6e4, saved, rating, runs, hasLog, level, kills, pkills, deaths,
    expiresDays: saved ? null : Math.max(0, Math.ceil((start + 14 * DAY - NOW) / DAY)) };
});

// ---- history-model.ts
const p2 = (n) => String(n).padStart(2, '0');
const fmtDate = (t) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const fmtTime = (t) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const fmtDur = (ms) => { const m = Math.max(0, Math.round(ms / 6e4)); return m >= 60 ? `${Math.floor(m / 60)}h${p2(m % 60)}m` : `${m}m`; };
const fmtDurLong = (ms) => { const m = Math.max(0, Math.round(ms / 6e4)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
const stars = (n) => '★'.repeat(Math.max(0, Math.min(5, n)));
const LONG = (t) => new Date(t).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const DAYHEAD = (t) => new Date(t).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const SHORT = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const minutesOfDay = (t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
function sortSessions(list, { key, dir }) {
  const cmp = (a, b) => {
    if (key === 'expires' || key === 'rating') {
      if (a.saved !== b.saved) return a.saved ? -1 : 1;
      if (key === 'rating') return (a.rating - b.rating) * dir;
      return ((a.expiresDays ?? 0) - (b.expiresDays ?? 0)) * dir;
    }
    if (key === 'char') return a.character.localeCompare(b.character) * dir;
    if (key === 'date') return (a.start - b.start) * dir;
    if (key === 'time') return (minutesOfDay(a.start) - minutesOfDay(b.start)) * dir;
    return ((a.end - a.start) - (b.end - b.start)) * dir;
  };
  return [...list].sort((a, b) => cmp(a, b) || b.start - a.start);
}
const nextSort = (cur, key) => cur.key === key ? { key, dir: cur.dir > 0 ? -1 : 1 } : { key, dir: key === 'char' ? 1 : -1 };
const names = () => [...new Set(SESSIONS.map((s) => s.character))].sort((a, b) => a.localeCompare(b));
/** The real button rules (history.tsx `disabled`). */
function disabled(a, s) {
  switch (a) {
    case 'log': case 'export': return !s || !s.hasLog;
    case 'stats': case 'rate': case 'delete': return !s;
    case 'save': return !s || s.saved;
    case 'backup': return SESSIONS.length === 0;
    default: return false;
  }
}

const ICON = {
  play: '<svg viewBox="0 0 16 16"><path d="M4.5 3.2 12.5 8l-8 4.8z"/></svg>',
  stats: '<svg viewBox="0 0 16 16"><path d="M2.5 13.5h11M4.5 11V7.5M8 11V4M11.5 11V6"/></svg>',
  star: '<svg viewBox="0 0 16 16"><path d="M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4L2.2 6.5l4-.6z"/></svg>',
  save: '<svg viewBox="0 0 16 16"><path d="M3 2.5h8l2 2v9H3z"/><path d="M5.5 2.5v3h5v-3M5.5 13.5v-4h5v4"/></svg>',
  export: '<svg viewBox="0 0 16 16"><path d="M8 10.2V2.2M4.8 5.4 8 2.2l3.2 3.2M2.5 13.5h11"/></svg>',
  del: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9"/></svg>',
  backup: '<svg viewBox="0 0 16 16"><path d="M8 2v8M4.8 7 8 10.2 11.2 7M2.5 13.5h11"/></svg>',
  restore: '<svg viewBox="0 0 16 16"><path d="M3 8a5 5 0 1 0 1.6-3.7"/><path d="M3 2.5v3h3"/></svg>',
  hourglass: '<svg viewBox="0 0 16 16"><path d="M4 2h8M4 14h8M5 2c0 3.5 6 3.5 6 6s-6 2.5-6 6M11 2c0 3.5-6 3.5-6 6s6 2.5 6 6"/></svg>',
};
const ACTIONS = [
  { id: 'log', label: '<u class="sk">R</u>un log', key: 'r', icon: ICON.play, cls: 'primary' },
  { id: 'stats', label: 'S<u class="sk">t</u>ats', key: 't', icon: ICON.stats },
  { id: 'rate', label: 'R<u class="sk">a</u>te', key: 'a', icon: ICON.star },
  { id: 'save', label: '<u class="sk">S</u>ave', key: 's', icon: ICON.save },
  { id: 'export', label: 'E<u class="sk">x</u>port', key: 'x', icon: ICON.export },
  { id: 'delete', label: '<u class="sk">D</u>elete', key: 'd', icon: ICON.del, cls: 'danger' },
];
const FOOT_ACTIONS = [
  { id: 'backup', label: '<u class="sk">B</u>ackup', key: 'b', icon: ICON.backup },
  { id: 'restore', label: 'Rest<u class="sk">o</u>re', key: 'o', icon: ICON.restore },
];
const KEYMAP = { r: 'log', t: 'stats', a: 'rate', s: 'save', x: 'export', d: 'delete', b: 'backup', o: 'restore' };
const storageText = () => (SESSIONS.length ? 'Storage: 46 MB of 299 GB' : 'Storage: 12 KB of 299 GB');

// ---- Statistics model (deterministic per session)
const fmtK = (n) => { const v = Math.round(Math.abs(n)), s = n < 0 && v > 0 ? '-' : ''; let t;
  if (v < 1000) t = String(v); else if (v < 99950) t = (v / 1000).toFixed(1) + 'k'; else if (v < 999500) t = Math.round(v / 1000) + 'k'; else t = (v / 1e6).toFixed(1) + 'M'; return s + t; };
const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600); return h > 0 ? `${h}:${p2(Math.floor(s / 60) % 60)}:${p2(s % 60)}` : `${p2(Math.floor(s / 60))}:${p2(s % 60)}`; };
const MOBS = [['a mountain troll', 1840], ['a cave troll', 2210], ['a snarling warg', 610], ['an orc tracker', 480], ['a hill troll', 1530], ['a huge black spider', 720],
  ['a stone troll', 2650], ['an orc scout', 390], ['a wild boar', 140], ['a goblin', 260], ['the Troll-chief', 9800], ['a black crebain', 90]];
const FOES = [['Ugluk', 'the Orc'], ['Lugdush', 'the Uruk-hai'], ['Gorbag', 'the Troll'], ['Snaga', 'the Orc'], ['Mauhur', 'the Uruk-hai']];
const ALLIES = ['Dori', 'Ecthel', 'Lindir', 'Gittan', 'Melker', 'Halbarad', 'Taube'];
const ACHIEVE = ['Walked the Last Bridge at night', 'Slew a stone troll alone', 'Crossed the Misty Mountains', 'Saw the sun rise from Weathertop', 'Visited every room of the Prancing Pony'];
function statsOf(s) {
  const r = WC.util.rng(s.id.charCodeAt(1) * 977 + s.kills * 13 + 7);
  const dur = s.end - s.start, hrs = dur / 3.6e6;
  const allies = ALLIES.filter((n) => n !== s.character && r() < .55).sort();
  const kinds = MOBS.filter(() => r() < .7);
  let left = s.kills;
  const kills = kinds.map(([name, xp], i) => {
    const n = i === kinds.length - 1 ? left : Math.max(1, Math.min(left, Math.round(r() * s.kills / 3)));
    left -= n; const per = Math.round(xp * (.85 + r() * .3));
    return { name, n, xpPer: per, xpTotal: per * n };
  }).filter((k) => k.n > 0).sort((a, b) => b.xpTotal - a.xpTotal);
  const pvps = FOES.slice(0, Math.min(FOES.length, s.pkills ? 1 + Math.floor(r() * s.pkills) : 0)).map(([n, race]) => {
    const k = 1 + Math.floor(r() * 2); return { label: `*${n} ${race}*`, n: k, xp: k * Math.round(14000 + r() * 22000) };
  });
  const killTotal = { n: kills.reduce((a, k) => a + k.n, 0), xp: kills.reduce((a, k) => a + k.xpTotal, 0) };
  const pvpTotal = { n: pvps.reduce((a, k) => a + k.n, 0), xp: pvps.reduce((a, k) => a + k.xp, 0) };
  const milestones = [];
  const levelUps = s.id === 's0' ? [s.level] : r() < .5 ? [s.level] : [];
  const nAch = Math.floor(r() * 3);
  for (let i = 0; i < nAch; i++) milestones.push({ at: r() * dur, text: '★ ' + ACHIEVE[Math.floor(r() * ACHIEVE.length)], kind: 'achievement' });
  levelUps.forEach((L) => milestones.push({ at: dur * (.3 + r() * .5), text: `↑ Reached level ${L}`, kind: 'level' }));
  milestones.sort((a, b) => a.at - b.at);
  const N = 36;
  const series = (scale) => Array.from({ length: N }, (_, i) => { const w = Math.sin(i / N * Math.PI * 2.3 + r() * 2) * .5 + .6; return Math.max(0, Math.round(scale * w * (.4 + r() * .9))); });
  const gained = killTotal.xp + pvpTotal.xp - s.deaths * 12000;
  const xph = series(hrs > 0 ? Math.abs(gained) / hrs : 0), tph = series(hrs > 0 ? 40 + r() * 60 : 0);
  const fromLevel = levelUps.length ? s.level - 1 : s.level, toLevel = s.level + 1;
  const per = Math.max(Math.abs(gained) * (levelUps.length ? 1.25 : 1.6), 40000);   // XP per level, made up so the band reads
  const lv = (L) => (L - fromLevel) * per;
  const fromXp = lv(fromLevel), toXp = lv(toLevel);
  const startXp = Math.round(fromXp + per * (levelUps.length ? .45 : .22));
  const nowXp = Math.min(toXp - per * .05, startXp + gained);
  return { allies, milestones, kills, pvps, killTotal, pvpTotal, xph, tph, durMs: dur,
    ruler: s.kills === 0 && s.pkills === 0 ? null : { startXp, nowXp, delta: nowXp - startXp, fromLevel, toLevel, fromXp, toXp, levels: Array.from({ length: toLevel - fromLevel + 1 }, (_, i) => ({ L: fromLevel + i, xp: lv(fromLevel + i) })) } };
}

window.HD = { NOW, DAY, SESSIONS, EMPTY, p2, fmtDate, fmtTime, fmtDur, fmtDurLong, fmtK, fmtClock, stars, LONG, DAYHEAD, SHORT, minutesOfDay,
  sortSessions, nextSort, names, disabled, ICON, ACTIONS, FOOT_ACTIONS, KEYMAP, storageText, statsOf };
})();
