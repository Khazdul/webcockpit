// The mockups' states (stage 65, round 13; after round 12's). Runs in two
// places: in the review shell, where it only lists the states
// (window.MK_STATES), and inside the stage's document, where `window.MK`
// names the state to draw over the captured page (build/skel). Throwaway:
// the built DOM as captured, the new content in the built classes where
// they exist and in mk-* classes where not. Every name, title and number
// here is invented.
(function () {
  'use strict';

  const MK = window.MK || { view: 'd', icons: {} };
  const view = MK.view;
  const touch = view !== 'd';
  const ic = (name, cls) => ((MK.icons && MK.icons[name]) || '').replace('class="wc-lk-ic', 'class="wc-lk-ic ' + (cls || ''));
  // Glyphs the kit has not got, drawn in its manner (16 × 16, stroked paths).
  const glyph = (d, cls) => `<svg class="wc-lk-ic ${cls || ''}" viewBox="0 0 16 16" aria-hidden="true">${d.map((p) => `<path d="${p}"></path>`).join('')}</svg>`;
  const LINK = () => glyph(['M6.6 9.4 9.4 6.6', 'M7.3 4.6 8.5 3.4a2.7 2.7 0 0 1 3.8 3.8L11.1 8.4', 'M8.7 11.4 7.5 12.6a2.7 2.7 0 0 1-3.8-3.8L4.9 7.6']);
  const FLAG = () => glyph(['M4 14V2.6', 'M4 3.2h7.6L9.8 5.9l1.8 2.8H4']);
  const BUBBLE = (cls) => glyph(['M2.6 3.4h10.8v7.2H7.2L4.4 13v-2.4H2.6z'], cls);
  const EYE = (cls) => glyph(['M1.8 8s2.3-4.2 6.2-4.2S14.2 8 14.2 8s-2.3 4.2-6.2 4.2S1.8 8 1.8 8z', 'M8 6.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z'], cls);
  const STARG = (cls) => glyph(['M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4-2.9-2.8 4-.6z'], cls);
  const DICE = (cls) => glyph(['M3 3h10v10H3z', 'M5.6 5.6h.1M10.4 5.6h.1M8 8h.1M5.6 10.4h.1M10.4 10.4h.1'], cls);
  const TRASH = () => ic('trash') || glyph(['M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9']);
  const COPY = () => ic('duplicate');
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const STAR_PATH = 'M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95z';

  // ----------------------------------------------------------------- the words and data
  /** [title, sender, character, level, length, date, mean, votes, comments, views] */
  const RUNS = [
    ['Gibur and the Witch-king’s lieutenant', 'fenwick', 'Gibur', 41, '4 h 04 min', '14 Nov', 4.8, 23, 11, 412],
    ['Orc raid on the Old Forest Road', 'marrowfield', 'Ugluk', 33, '1 h 52 min', '13 Nov', 4.6, 18, 7, 297],
    ['Holding the Fords of Isen', 'brego', 'Eothain', 37, '2 h 20 min', '12 Nov', 4.5, 15, 4, 188],
    ['Ghost of Weathertop', 'saelind', 'Saelind', 19, '48 min', '13 Nov', 4.4, 9, 3, 96],
    ['Clearing the ranger camp', 'fenwick', 'Rasta', 42, '1 h 15 min', '15 Nov', 4.3, 12, 5, 37],
    ['Three trolls at the Last Bridge', 'hollin', 'Brannoc', 29, '1 h 03 min', '11 Nov', 4.2, 8, 2, 140],
    ['Lost in Mirkwood, found by spiders', 'quillon', 'Pip', 9, '37 min', '10 Nov', 4.1, 14, 9, 233],
    ['The siege of the Osgiliath bridge', 'tarnwise', 'Grishvak', 40, '3 h 11 min', '9 Nov', 4.0, 6, 1, 77],
    ['A quiet night in Bree', 'elanor_s', 'Elanor', 14, '58 min', '14 Nov', 3.9, 5, 0, 41],
    ['Ambush below Caradhras', 'aldwyn', 'Thorgrim', 35, '1 h 40 min', '12 Nov', 3.8, 7, 2, 85],
    ['Barrow-downs by moonlight', 'fenwick', 'Aldereth', 24, '3 h 25 min', '8 Nov', 3.8, 4, 1, 59],
    ['Racing the sun to Rivendell', 'ferny_b', 'Ferny', 21, '44 min', '11 Nov', 3.7, 3, 0, 33],
    ['Wargs at the Gladden', 'brandagamba', 'Hobb', 17, '1 h 12 min', '9 Nov', 3.6, 5, 2, 50],
    ['First kill in Moria', 'kuzzim', 'Kuzzim', 30, '2 h 02 min', '10 Nov', 3.5, 2, 1, 28],
    ['The long road to Dol Guldur', 'saelind', 'Saelind', 20, '2 h 48 min', '7 Nov', 3.4, 4, 0, 44],
    ['Mewlips under the hill', 'quillon', 'Pip', 10, '29 min', '9 Nov', 3.3, 3, 1, 22],
  ];
  const NEWRUNS = [4, 8, 1, 3, 0, 9, 5, 2, 12, 6, 13, 7, 11, 10, 15, 14].map((i, k) => {
    const r = RUNS[i].slice();
    r[5] = ['15 Nov', '15 Nov', '14 Nov', '14 Nov', '14 Nov', '13 Nov', '13 Nov', '12 Nov', '12 Nov', '12 Nov', '11 Nov', '11 Nov', '10 Nov', '10 Nov', '9 Nov', '9 Nov'][k];
    return r;
  });
  const HOF = [
    ['Gibur and the Witch-king’s lieutenant', 'Gibur', 4.8],
    ['The Balrog’s bridge, all of it', 'Morwen', 4.8],
    ['Orc raid on the Old Forest Road', 'Ugluk', 4.6],
    ['Holding the Fords of Isen', 'Eothain', 4.5],
    ['Ghost of Weathertop', 'Saelind', 4.4],
    ['Forty orcs and one door', 'Durlin', 4.4],
    ['Clearing the ranger camp', 'Rasta', 4.3],
    ['Three trolls at the Last Bridge', 'Brannoc', 4.2],
  ];
  const POSTERS = [['fenwick', 41], ['marrowfield', 36], ['brego', 22], ['saelind', 17], ['quillon', 12]];
  const WEST = [['Eothain', 'Man', 'warrior'], ['Arwenel', 'Elf', 'ranger'], ['Durlin', 'Dwarf', 'warrior'], ['Morwen', 'Man', 'mage'], ['Celebrin', 'Elf', 'cleric']];
  const DARK = [['Grishvak', 'Orc', 'warrior'], ['Ugluk', 'Uruk-hai', 'warrior'], ['Shagrat', 'Orc', 'thief'], ['Lurtz', 'Troll', 'warrior'], ['Gorbag', 'Orc', 'mage']];
  const NOTES = [
    ['hollin', 'anyone up for Moria tonight? 20:00 by the West-gate, bring light and rope', '2 min'],
    ['saelind', 'thanks to whoever left the lembas at the Prancing Pony', '14 min'],
    ['fenwick', 'Rasta is looking for a group in the Trollshaws, level 40 and up', '1 h', 'own'],
    ['brego', 'the Fords of Isen log is up: two hours, the first one waiting at the ford and then everything happens at once and nobody knows who is on which side until the orcs start shouting at each other', '2 h'],
    ['marrowfield', 'orcs at the ford again, bring light', '3 h'],
    ['quillon', 'lost my pony near Bree again. Grey, answers to Bill. Has anyone seen him?', '5 h'],
    ['elanor_s', 'the new tileset in Settings → Mapper is lovely', '8 h'],
    ['aldwyn', 'Caradhras is closed, snow to the waist', 'yesterday'],
    ['kuzzim', 'GG to the Osgiliath crew last night', 'yesterday'],
    ['tarnwise', 'selling a mithril coat, cheap, ask in Minas Tirith', '2 days'],
    ['ferny_b', 'first Hall of Fame run is up, be kind', '2 days'],
  ];
  const COMMENTS = [
    ['kuzzim', '2 days ago', 'I was the one at the ford. That bash at 41:20 was pure luck, I promise.'],
    ['saelind', 'yesterday', 'Lovely clean run. The acolytes never stood a chance.'],
    ['Norsy', '3 h ago', 'Watch from 38:00: the rangers come in from the east, and you can see the whole group turn at once.', 'own'],
    ['marrowfield', '1 h ago', 'next time wait for the second group before the bridge…'],
  ];
  const REASONS = ['Harassment', 'Real-life information about someone', 'Breaks MUME’s rules', 'Other'];
  const RULES = [
    'The log shows other players: no harassment.',
    'Nothing about people’s real lives.',
    'MUME’s own rules apply.',
    'You can take a run down whenever you like.',
    'We remove what breaks this.',
  ];
  const T = {
    title: 'Clearing the ranger camp',
    desc: 'Norsy and Kuzzim join at the ford; the rangers first, then the acolytes. The pkill is at 41:20.',
    url: 'https://mumecockpit.com/r/Ab3dE5fG7hJk',
  };

  // ----------------------------------------------------------------- states
  const S = [];
  const add = (s) => S.push(Object.assign({ views: ['d', 'p'] }, s));
  const topic = (id, label) => (dir, dirLabel) => (o) => add(Object.assign({ topic: id, topicLabel: label, dir, dirLabel }, o));
  const P = ['p'];

  // 1. The Community page
  {
    const t = topic('comm', '1 · The Community page');
    for (const v of ['a', 'b']) {
      const x = t(v, v === 'a' ? 'a · The reference’s order: boxes on top, the list, Runes at the foot' : 'b · The list, a column beside it with the boxes and Runes');
      const lay = v === 'a' ? 'A row of boxes over the list (Hall of Fame, Top posters, the run of the day, the warlords); the list; Random Runes at the foot (the page scrolls).' : 'The list on the left; a column on the right with the run of the day, Hall of Fame, Top posters, Random Runes and the warlords (the column scrolls by itself).';
      const base = { page: 'community', comm: { v } };
      const st = (id, label, c, note, views) => x(Object.assign({}, base, { id: `comm-${v}-${id}`, label, comm: Object.assign({ v }, c), note, views: views || ['d', 'p'] }));
      st('in', 'Logged in', { k: 'list' }, `${lay} Top (by stars, weighted) over the week is the default; New and Most watched beside it, the period beside that. Phone: the tabs Runs · Hall of Fame · Runes, Runs open.`);
      st('new', 'New · month', { k: 'list', sort: 'new', period: 'month' }, 'New over the month: newest first, the same row. Page 1 of 8 in the foot; ‹ › or PgUp / PgDn turn.');
      if (v === 'a') st('foot', 'Scrolled to the foot', { k: 'list', scroll: 'foot' }, 'Desktop: the page scrolled down past the list to the pager and Random Runes, the reference’s place. Phone: the tabs form, the Runes tab.');
      else st('foot', 'Column scrolled', { k: 'list', scroll: 'foot' }, 'Desktop: the right column scrolled down to Random Runes and the warlords. Phone: the tabs form, the Runes tab.');
      st('tab-hof', 'Phone: Hall of Fame tab', { k: 'list', tab: 'hof' }, 'The phone’s tabs form, the second tab: the boxes stacked (the run of the day first, then Hall of Fame, Top posters, the warlords).', P);
      st('tab-runes', 'Phone: Runes tab', { k: 'list', tab: 'runes' }, 'The third tab: the board, the field at its foot.', P);
      st('sec', 'Phone: sections', { k: 'list', form: 'sections' }, v === 'a' ? 'The other phone form: one long page in the reference’s order. The boxes come first (a sideways strip), then the list.' : 'The other phone form: one long page; the list first (10 rows, More), then the boxes, then the board.', P);
      st('sec-foot', 'Phone: sections, lower', { k: 'list', form: 'sections', scroll: 'mid' }, 'The sections form scrolled down.', P);
      st('guest', 'Guest', { k: 'list', guest: true }, 'A guest reads everything: no Published runs button; the board says “Log in to write”; the foot says how to take part.');
      st('empty', 'Empty', { k: 'empty' }, 'Nothing listed yet (the first days): the list says how a run gets here; the boxes say little. The warlords come from MUME and are there anyway.');
      st('loading', 'Loading', { k: 'loading' }, 'GET /api/gallery and /api/community on the way (cached 60 s, so short): stage 24’s bar in the list, the boxes faint.');
      st('offline', 'Offline', { k: 'offline' }, 'No network: one line and Try again where the list was; the boxes and the board are left out.');
      st('norunes', 'Runes off', { k: 'list', runes: false }, v === 'a' ? 'The flag runes off: the board is gone from the foot; the rest stays.' : 'The flag runes off: the column holds the boxes alone.');
    }
  }

  // 2. Random Runes
  {
    const t = topic('runes', '2 · Random Runes');
    const x = t('a', 'The board (drawn in 1b’s column; phone: the Runes tab)');
    const st = (id, label, r, note, extra) => x(Object.assign({ id: `runes-${id}`, label, page: 'community', comm: { v: 'b', k: 'list', scroll: 'foot', tab: 'runes', runesState: r }, note }, extra || {}));
    st('board', 'The board', 'board', 'The latest notes, newest first: “name: text” on one line, cut with … when long; the age at the right. A pointer over a note shows the whole text and Report (desktop); a tap opens it (phone). The field at the foot.');
    st('write', 'Writing', 'write', 'A note being written: one line, ≤ 500 with a count; Enter or Post sends. Left today: 4 of 5.');
    st('long', 'A long note opened', 'long', 'A note cut with … opens in place to its whole text (a pointer over it or a tap); Report under it.');
    st('limit', '5 today', 'limit', 'Five notes written today: the field is off and says when it opens again.');
    st('own', 'Own note', 'own', 'One’s own note is marked in gold and has Remove (no question: it is one line; a flash with Undo for a few seconds).');
    st('report', 'Report a note', 'report', 'Report on another’s note: the run’s Report dialog with the note quoted. Five accounts hide it until the owner has looked.');
    st('guest', 'Guest', 'guest', 'A guest reads; in the field’s place “Log in to write”, which opens Log in.', { comm: { v: 'b', k: 'list', scroll: 'foot', tab: 'runes', runesState: 'guest', guest: true } });
  }

  // 3. The watch page
  {
    const t = topic('watch', '3 · Stars and comments on the watch page');
    for (const v of ['a', 'b']) {
      const x = t(v, v === 'a' ? 'a · Stars in the band, comments under the frame' : 'b · A panel beside the frame (phone: under it)');
      const st = (id, label, w, note) => x({ id: `watch-${v}-${id}`, label, page: 'watch', watch: Object.assign({ v }, w), note });
      const where = v === 'a' ? 'The stars sit in the band beside the title and details' : 'The stars head the panel beside the frame (phone: under the frame, over the comments)';
      st('rated', 'Rated', { k: 'rated' }, `${where}: the client’s star control (History’s Rate), one’s own vote lit, the mean and the votes beside it; a click changes it.`);
      st('notyet', 'Not rated yet', { k: 'notyet' }, 'Not rated yet: the stars hollow, “Rate this run”; a pointer peeks, a click sets.');
      st('comments', 'Comments', { k: 'notyet', c: 'list', scroll: true }, v === 'a' ? 'The page scrolled under the frame: the comments, newest last; one’s own with Remove, the others with Report; the field ≤ 1 000 with a count and Post.' : 'The panel: the comments scroll under the stars, newest last; the field stays at the panel’s foot.');
      st('own', 'Own run', { k: 'own', owner: true, c: 'list', scroll: v === 'a' }, 'One’s own run (logged in as fenwick): no stars to give, “your run” beside the mean; Remove on every comment (the run’s sender), no Report on one’s own.');
      st('guest', 'Guest', { k: 'guest', guest: true, c: 'list' }, 'A guest: the mean, “Log in to rate” where the stars would be; the comments readable with Report off; “Log in to comment” where the field sits.');
      st('guest-c', 'Guest, comments', { k: 'guest', guest: true, c: 'list', scroll: true }, 'The guest’s view scrolled to the comments.');
      st('empty', 'No comments', { k: 'notyet', c: 'empty', scroll: v === 'a' }, 'No comments yet: one line and the field.');
    }
  }

  // 4. Hall of Fame in the export editor
  {
    const t = topic('hof', '4 · Hall of Fame in the export editor');
    const x = t('a', 'The fourth format and the listed share dialog');
    x({ id: 'hof-toggle', label: 'Hall of Fame chosen', page: 'export', hof: { k: 'toggle' }, note: 'Hall of Fame is the fourth choice, after Link (letter F). The file row says Title, as for Link. Export opens the share dialog in its listed form.' });
    x({ id: 'hof-guest', label: 'Guest', page: 'export', hof: { k: 'guest' }, note: 'A guest sees Link and Hall of Fame greyed (round 12’s pick 1a): “Log in to publish”.' });
    x({ id: 'hof-rules', label: 'First time (rules)', page: 'export', hof: { k: 'form', rules: true }, note: 'The listed form, the first publication of the account: stage 64’s rules and tick (one tick covers links and listing).' });
    x({ id: 'hof-form', label: 'The listed form', page: 'export', hof: { k: 'form' }, note: 'Title “Publish to the Hall of Fame”; the line under the size says who sees it: “Everyone can find this in the Community.” Publish.' });
    x({ id: 'hof-done', label: 'Published', page: 'export', hof: { k: 'done' }, note: 'The result: the link with Copy; where it shows; Open Community or Done.' });
    x({ id: 'hof-limit', label: '10 today', page: 'export', hof: { k: 'limit' }, note: 'At most 10 listings a day (429 too_many): the error line offers a link now and listing later.' });
  }

  // 5. The counter and the reactions mark
  {
    const t = topic('menu', '5 · The counter and the reactions mark');
    const x = t('a', 'The built rows, new figures');
    x({ id: 'menu-in', label: 'Logged in', page: 'in', menu: { news: '2 new' }, note: 'Community “3 new” (built, `?community=3`) and the owner row “fenwick · synced · 2 new”: two new stars or comments on one’s own runs. A press on the owner row opens the Account page’s Published runs view, which clears it.' });
    x({ id: 'menu-99', label: '99+', page: 'in', menu: { news: '99+ new', count: '99+ new' }, note: 'Each count stops at 99; more says “99+ new”. The gold never gives way; the name does (with …).' });
    x({ id: 'menu-guest', label: 'Guest', page: 'guest', menu: {}, note: 'A guest gets the counter too (from /api/stats/public, no extra request); no owner mark.' });
    x({ id: 'menu-none', label: 'Nothing new', page: 'in', menu: { count: null }, note: 'Nothing new: the rows say nothing, as today.' });
  }

  // 6. Published runs
  {
    const t = topic('pub', '6 · Published runs as a view of its own');
    const x = t('a', 'A row on the Account page, the view behind it');
    x({ id: 'pub-row', label: 'The row on the Account page', page: 'account', pub: { k: 'row' }, note: 'The Account page’s section shrinks to one row: the counts and the new reactions in gold, and Published runs (U) to open the view.' });
    x({ id: 'pub-view', label: 'The view', page: 'account', pub: { k: 'view' }, note: 'The view: per run the title, Listed / Link only, the stars and votes, comments, views, date and size; what is new since the last look in gold with a mark at the left (cleared when the view closes). The hidden run says so.' });
    x({ id: 'pub-edit', label: 'Edit', page: 'account', pub: { k: 'edit' }, note: 'Edit: the title, the description and the switch “Listed in the Community”. Unlisting keeps the stars and comments; listing again does not put it back on top of New.' });
    x({ id: 'pub-empty', label: 'Empty', page: 'account', pub: { k: 'empty' }, note: 'Nothing published: the row says how; the view is not opened.' });
  }

  // 7. Admin
  {
    const t = topic('admin', '7 · The admin’s queue with comments and notes');
    const x = t('a', 'The admin page, plain tool look');
    x({ id: 'admin-queue', label: 'The queue', page: 'admin', admin: 'queue', views: ['d'], note: 'The report queue lists three kinds: a run (stage 64’s card), a comment (its whole text, its writer, the run it is on) and a note (text and writer). Hide / Restore, Dismiss reports, Delete, Suspend the writer.' });
    x({ id: 'admin-confirm', label: 'Confirm Delete', page: 'admin', admin: 'confirm', views: ['d'], note: 'Delete on a comment asks first in the plain modal: the text, what happens to the count, the log.' });
  }

  window.MK_STATES = S.map((s) => ({ id: s.id, topic: s.topic, topicLabel: s.topicLabel, dir: s.dir, dirLabel: s.dirLabel, label: s.label, note: s.note, page: s.page, views: s.views, noshot: !!s.noshot }));
  if (!window.MK) return;

  // ------------------------------------------------------------------ apply
  const st = S.find((s) => s.id === MK.state) || S[0];
  const app = document.getElementById('app');
  const root = document.documentElement;
  root.classList.add('mk-' + view, touch ? 'mk-touch' : 'mk-mouse', 'mk-st-' + st.topic);

  // ------------------------------------------------------------ the kit's parts
  const U = (label, letter) => {
    if (!letter) return label;
    const i = label.toLowerCase().indexOf(letter.toLowerCase());
    return i < 0 ? label : label.slice(0, i) + `<u class="wc-sk">${label[i]}</u>` + label.slice(i + 1);
  };
  const btn = (id, label, letter, o = {}) =>
    `<button type="button" class="wc-lk-btn${o.small ? ' is-small' : ''}${o.primary ? ' is-primary' : ''}${o.danger ? ' is-danger' : ''}${o.off ? ' is-disabled' : ''}${o.iconOnly ? ' is-icon' : ''}" data-btn="${id}" tabindex="-1"${o.off ? ' aria-disabled="true"' : ''}${o.title ? ` title="${o.title}"` : ''}>${o.icon || ''}${label ? `<span>${U(label, letter)}</span>` : ''}</button>`;
  const field = (o) =>
    `<label class="wc-lk-field${o.area ? ' is-area' : ''}${o.mono ? ' is-mono' : ''}${o.cls ? ' ' + o.cls : ''}" data-field="${o.id}"><span class="wc-lk-lbl">${o.label}</span>` +
    (o.area
      ? `<textarea class="wc-lk-input" rows="${o.rows || 3}" placeholder="${esc(o.ph || '')}"${o.off ? ' disabled' : ''}>${esc(o.value || '')}</textarea>`
      : `<input class="wc-lk-input" type="text" value="${esc(o.value || '')}" placeholder="${esc(o.ph || '')}"${o.off ? ' disabled' : ''}${o.readonly ? ' readonly' : ''}>`) +
    (o.hint ? `<span class="wc-lk-fhint">${o.hint}</span>` : '') +
    '</label>';
  const check = (label, on, cls) =>
    `<button type="button" class="wc-lk-check${on ? ' is-on' : ''} ${cls || ''}" role="checkbox" aria-checked="${on}" tabindex="-1"><span class="wc-lk-cbox" aria-hidden="true"></span><span class="wc-lk-clabel">${label}</span></button>`;
  const toggle = (label, on) =>
    `<button type="button" class="wc-lk-toggle${on ? ' is-on' : ''}" role="switch" aria-checked="${on}" tabindex="-1"><span class="wc-lk-groove" aria-hidden="true"><i class="wc-lk-knob"></i></span><span class="wc-lk-tstate" aria-hidden="true">${on ? 'On' : 'Off'}</span><span class="wc-lk-tlabel" aria-hidden="true">${label}</span></button>`;
  const load = (frac, line) => `<div class="mk-load"><div class="mk-load-bar"><i style="transform: scaleX(${frac})"></i></div><div class="mk-load-l">${line}</div></div>`;
  const corners = '<i class="wc-lk-br wc-lk-b1"></i><i class="wc-lk-br wc-lk-b2"></i><i class="wc-lk-br wc-lk-b3"></i><i class="wc-lk-br wc-lk-b4"></i>';
  const seg = (opts, on, cls) =>
    `<div class="wc-lk-seg is-pills ${cls || ''}" role="radiogroup">${opts.map(([id, label, letter]) => `<button type="button" class="wc-lk-opt${id === on ? ' is-on' : ''}" role="radio" aria-checked="${id === on}" data-opt="${id}" tabindex="-1"><span>${U(label, letter)}</span></button>`).join('')}</div>`;
  const stars = (mean) => {
    const n = Math.round(mean);
    return `<span class="wc-lk-stars" role="img" aria-label="${n} of 5"><span class="wc-lk-star-on">${'★'.repeat(n)}</span><span class="wc-lk-star-off">${'★'.repeat(5 - n)}</span></span>`;
  };
  const rule = (title, extra) => `<div class="wc-lk-rule"><h3 class="wc-lk-sec">${title}</h3><i class="wc-lk-hair" aria-hidden="true"></i>${extra || ''}</div>`;

  function dialog(under, box, o) {
    const r = box ? box.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const html =
      `<div class="wc-frame" data-frame="9" data-overlay="" style="--wc-ov-l: ${r.left}px; --wc-ov-t: ${r.top}px; --wc-ov-w: ${r.width}px; --wc-ov-h: ${r.height}px;">` +
      `<div class="wc-lk-veil"><div class="wc-lk-dslot"><section class="wc-lk-dialog ${o.cls || ''}" data-dlg="${o.dlg}" role="dialog" aria-modal="true" aria-label="${o.title}" style="width: min(${o.width}px, 100%);">${corners}` +
      `<div class="wc-lk-hood"><span class="wc-lk-hood-t">${o.title}</span></div><div class="wc-lk-dwin"><div class="wc-lk-dialog-b">${o.body}</div>` +
      (o.err ? `<p class="wc-lk-dialog-err">${o.err}</p>` : '') +
      `<div class="wc-lk-btns wc-lk-dialog-btns">${o.buttons.join('')}</div></div></section></div></div></div>`;
    under.insertAdjacentHTML('afterend', html);
  }
  const reportBody = (what, quote) =>
    `<p class="wc-lk-qn mk-left">What is wrong with ${what}?</p>` +
    (quote ? `<p class="mk-quote">${quote}</p>` : '') +
    `<div class="wc-watch-reasons" role="radiogroup" aria-label="Reason">${REASONS.map((r, i) => check(r, i === 0, 'wc-watch-radio' + (i === 0 ? ' is-cur' : ''))).join('')}</div>` +
    field({ id: 'text', label: 'More (optional)', area: true, rows: 2, value: '', ph: 'What should we look at?', hint: '<span class="wc-watch-count">0 / 500</span>' }) +
    `<p class="wc-lk-qn wc-watch-left wc-watch-small">The writer is not told who reported.</p>`;

  // ------------------------------------------------------------ the start page
  const start = app.querySelector('.wc-start');
  let topFrame = null;
  if (start) {
    start.querySelector('.wc-start-skyhost').style.background = `#1b2340 url(${MK.sky}) center / cover no-repeat`;
    const okb = app.querySelector('.wc-okb-page');
    if (okb) okb.remove();
    app.style.removeProperty('--wc-okb-page-h');
    const frames = [...app.querySelectorAll('.wc-frame')];
    topFrame = frames.filter((f) => !f.hasAttribute('hidden') && !f.hasAttribute('data-overlay')).pop();
    const brand = start.querySelector('.wc-start-brand');
    const putBrand = () => brand && start.style.setProperty('--wc-brand-h', brand.offsetHeight + 'px');
    putBrand();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(putBrand);
  }
  const bigBox = () => topFrame.querySelector('.wc-lk-box');
  const after = (fn) => {
    requestAnimationFrame(() => requestAnimationFrame(fn));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(fn));
    setTimeout(fn, 250);
  };

  // ------------------------------------------------------------ 5. The menu
  if (st.menu) {
    const m = st.menu;
    const cnt = start.querySelector('.wc-sm-item[data-key="community"] .wc-sm-count');
    if (m.count === null && cnt) cnt.remove();
    else if (m.count && cnt) cnt.textContent = m.count;
    if (m.news) {
      const txt = start.querySelector('.wc-sm-owner .wc-so-text');
      txt.insertAdjacentHTML('beforeend', `<span class="wc-so-news"><span class="wc-so-sep"> · </span>${m.news}</span>`);
    }
  }

  // ------------------------------------------------------------ 1, 2. The Community page
  if (st.comm) {
    const c = st.comm;
    const v = c.v;
    const guest = !!c.guest;
    const runesOn = c.runes !== false;
    const phone = touch;
    const tabsForm = phone && c.form !== 'sections';
    const tab = tabsForm ? c.tab || 'runs' : null;
    const box = topFrame.querySelector('.wc-hist');
    box.classList.add('mk-comm', 'is-' + v);
    box.querySelector('.wc-lk-hood-t').textContent = 'Community';
    const win = box.querySelector('.wc-hist-win');
    if (!tabsForm) win.classList.remove('wc-htabs-win');
    // The owner row of the menu under the box is not seen; the menu row lit is Community.
    const hist = start.querySelector('.wc-sm-item[data-key="history"]');
    if (hist) hist.classList.remove('is-sel');
    const crow = start.querySelector('.wc-sm-item[data-key="community"]');
    if (crow) {
      crow.classList.add('is-sel');
      const cn = crow.querySelector('.wc-sm-count');
      if (cn) cn.remove();
    }
    if (guest) {
      const o = start.querySelector('.wc-sm-owner');
      if (o) o.outerHTML = '';
    }

    const sort = c.sort || 'top';
    const period = c.period || 'week';
    const rows = sort === 'new' ? NEWRUNS : RUNS;
    const sortSeg = seg([['top', 'Top', 't'], ['new', 'New', 'n'], ['watched', phone ? 'Watched' : 'Most watched', 'w']], sort, 'mk-c-sort');
    const perSeg = seg([['week', 'Week', 'k'], ['month', 'Month', 'm'], ['all', 'All time', 'a']], period, 'mk-c-per');
    const pubBtn = guest ? '' : btn('PUBLISHED', phone ? 'Mine' : 'Published runs', 'u', { small: true, icon: LINK() });

    // --- the list
    const cols = phone ? '' : v === 'a' ? '30px minmax(0, 1fr) 118px 100px 72px 150px 56px 64px' : '26px minmax(0, 1fr) 146px 48px 54px';
    const rowsShown = phone && c.form === 'sections' ? rows.slice(0, 10) : rows;
    const tableRow = (r, i) =>
      `<div class="wc-lk-tr${i === 0 && !phone ? ' is-cur' : ''}${r[1] === 'fenwick' && !guest ? ' mk-mine' : ''}" role="row">` +
      `<span class="wc-lk-td mk-c-rank">${sort === 'top' ? i + 1 : ''}</span>` +
      (v === 'b'
        ? `<span class="wc-lk-td mk-c-title is-2"><span class="mk-c-l1"><b>${r[0]}</b> <span class="mk-c-char">(${r[2]} L${r[3]})</span></span><span class="mk-c-sub"><span class="mk-c-by">${r[1]}</span> · ${r[4]} · ${r[5]}</span></span>`
        : `<span class="wc-lk-td mk-c-title"><b>${r[0]}</b> <span class="mk-c-char">(${r[2]} L${r[3]})</span></span>` +
          `<span class="wc-lk-td mk-c-by">${r[1]}</span>` +
          `<span class="wc-lk-td mk-c-len">${r[4]}</span>` +
          `<span class="wc-lk-td mk-c-date">${r[5]}</span>`) +
      `<span class="wc-lk-td mk-c-stars">${stars(r[6])}<span class="mk-c-mean">${r[6].toFixed(1)}<small> · ${r[7]}</small></span></span>` +
      `<span class="wc-lk-td mk-c-num">${BUBBLE('mk-ic-s')}${r[8]}</span>` +
      `<span class="wc-lk-td mk-c-num">${r[9]}</span></div>`;
    const phoneRow = (r, i) =>
      `<li class="wc-lk-row mk-c-prow${r[1] === 'fenwick' && !guest ? ' mk-mine' : ''}">` +
      `<div class="mk-c-p1">${sort === 'top' ? `<span class="mk-c-rank">${i + 1}</span>` : ''}<b>${r[0]}</b></div>` +
      `<div class="mk-c-p2"><span class="mk-c-char">${r[2]} L${r[3]}</span> · ${r[1]} · ${r[4]} · ${r[5]}</div>` +
      `<div class="mk-c-p3">${stars(r[6])}<span class="mk-c-mean">${r[6].toFixed(1)}<small> · ${r[7]}</small></span><span class="mk-c-n">${BUBBLE('mk-ic-s')}${r[8]}</span><span class="mk-c-n">${EYE('mk-ic-s')}${r[9]}</span></div></li>`;
    let list;
    if (c.k === 'loading') list = `<div class="mk-c-wait">${load(0.4, 'Loading the Community…')}</div>`;
    else if (c.k === 'offline')
      list = `<div class="mk-c-wait"><p class="wc-lk-q">Offline: the Community could not be loaded.</p><p class="wc-lk-qn">Try again when you are online. Your own runs are on the Account page.</p>${btn('RETRY', 'Try again', 't', { primary: true })}</div>`;
    else if (c.k === 'empty')
      list = `<div class="mk-c-wait"><p class="wc-lk-q">Nothing in the Hall of Fame yet.</p><p class="wc-lk-qn">${guest ? 'Runs come here when players publish them.' : 'Be the first: in History, Export a session and choose <b>Hall of Fame</b>.'}</p></div>`;
    else if (phone) list = `<ul class="wc-lk-rows is-flat mk-c-plist">${rowsShown.map(phoneRow).join('')}</ul>` + (c.form === 'sections' ? `<p class="mk-c-more">${btn('MORE', 'More runs', 'm', { small: true })}</p>` : '');
    else
      list =
        `<div class="wc-lk-tbl${v === 'b' ? ' is-scroll' : ''} mk-c-tbl" role="table" style="--lk-cols: ${cols}; --lk-gut: 10px;"><div class="wc-lk-throw" role="row">` +
        (v === 'b' ? ['', 'Title (character) · sender · length · listed', 'Stars · votes', 'Com.', 'Views'] : ['', 'Title (character)', 'Sender', 'Length', 'Listed', 'Stars · votes', 'Com.', 'Views']).map((h) => `<span class="wc-lk-th" role="columnheader">${h}</span>`).join('') +
        `</div><div class="wc-lk-tbody${v === 'b' ? ' wc-lk-scroll' : ''}" role="rowgroup">${rows.map(tableRow).join('')}</div></div>`;
    const pager = c.k === 'list' ? `<div class="mk-c-pager">${btn('PREV', '', '', { small: true, iconOnly: true, off: true, icon: ic('back') })}<span>Page <b>1</b> of ${sort === 'new' ? 8 : 3} · ${sort === 'new' ? '214 runs' : '71 runs this week'}</span>${btn('NEXT', '', '', { small: true, iconOnly: true, icon: ic('next') })}</div>` : '';

    // --- the boxes
    const faint = c.k === 'loading';
    const empty = c.k === 'empty';
    const mbox = (cls, title, body, extra) => `<section class="mk-box ${cls}${faint ? ' is-faint' : ''}"><h3 class="mk-box-h">${title}${extra || ''}</h3>${body}</section>`;
    const hofBox = mbox(
      'mk-hof',
      `${STARG('mk-ic-g')}Hall of Fame`,
      empty ? '<p class="mk-box-none">Nothing rated yet.</p>' : `<ol class="mk-hof-l">${HOF.map(([t, ch, m]) => `<li><span class="mk-hof-t">${t}</span><span class="mk-hof-m">${m.toFixed(1)}</span></li>`).join('')}</ol>`,
      '<span class="mk-box-n">all time</span>',
    );
    const postBox = mbox(
      'mk-posters',
      'Top posters',
      empty ? '<p class="mk-box-none">No one yet.</p>' : `<ol class="mk-num-l">${POSTERS.map(([n, k]) => `<li><b>${k}</b><span>${n}</span></li>`).join('')}</ol>`,
    );
    const dayBox = mbox(
      'mk-day',
      `${DICE('mk-ic-g')}Run of the day`,
      empty
        ? '<p class="mk-box-none">The first listed run becomes tomorrow’s.</p>'
        : `<a class="mk-day-r"><span class="mk-day-k">Today</span><b>Lost in Mirkwood, found by spiders</b><span class="mk-day-d">Pip L9 · quillon · 10 Nov</span></a>` +
            `<a class="mk-day-r"><span class="mk-day-k">Yesterday</span><b>Holding the Fords of Isen</b><span class="mk-day-d">Eothain L37 · brego · 12 Nov</span></a>` +
            `<p class="mk-day-more">${btn('ANOTHER', 'Show another', 'o', { small: true, icon: DICE() })}</p>`,
    );
    const side = (h, list, cls) => `<div class="mk-war-s ${cls}"><h4>${h}</h4><ol>${list.map(([n, race, cl]) => `<li><b>${n}</b><span>${race} ${cl}</span></li>`).join('')}</ol></div>`;
    const mumeBox = mbox('mk-war', 'Warlords', `<div class="mk-war-2">${side('White lords', WEST, 'is-west')}${side('Sauron’s minions', DARK, 'is-dark')}</div><p class="mk-war-on">38 players on MUME</p>`);

    // --- Random Runes
    const rs = c.runesState || 'board';
    const noteLi = ([who, text, age, own], i) => {
      const isOwn = own && !guest;
      const open = (rs === 'long' && who === 'brego') || (phone && rs === 'board' && who === 'quillon');
      const hov = !phone && ((rs === 'board' && who === 'quillon') || (rs === 'own' && isOwn) || (rs === 'report' && who === 'marrowfield'));
      const acts = isOwn ? btn('REMOVE', 'Remove', '', { small: true, danger: true, icon: TRASH() }) : guest ? '' : btn('REPORT', 'Report', '', { small: true, icon: FLAG() });
      return `<li class="mk-note${isOwn ? ' is-own' : ''}${open ? ' is-open' : ''}${hov ? ' is-hov' : ''}"><span class="mk-note-t"><b>${who}:</b> ${esc(text)}</span><time>${age}</time>${open || hov ? `<span class="mk-note-acts">${acts}</span>` : ''}</li>`;
    };
    let write = '';
    if (guest || rs === 'guest') write = `<div class="mk-write is-guest"><span>Notes come from accounts.</span>${btn('LOGIN', 'Log in to write', 'l', { small: true, icon: ic('person') })}</div>`;
    else if (rs === 'limit') write = `<div class="mk-write">${field({ id: 'note', label: 'A note', value: '', ph: 'Five notes today, the most a day. The field opens again at midnight (UTC).', off: true })}${btn('POST', 'Post', 'o', { small: true, off: true })}</div>`;
    else if (rs === 'write') write = `<div class="mk-write">${field({ id: 'note', label: 'A note', value: 'Selling a dwarven axe in Bree, ask Gittan', hint: '<span class="mk-count-r">41 / 500 · 4 left today</span>' })}${btn('POST', 'Post', 'o', { small: true, primary: true })}</div>`;
    else write = `<div class="mk-write">${field({ id: 'note', label: 'A note', value: '', ph: 'Write a note: one line, everyone sees it with your name' })}${btn('POST', 'Post', 'o', { small: true, off: true })}</div>`;
    const notes = rs === 'own' ? [NOTES[2]].concat(NOTES.filter((n) => n !== NOTES[2])) : NOTES;
    const runesBox =
      runesOn && c.k !== 'offline'
        ? mbox(
            'mk-runes',
            'Random Runes',
            (c.k === 'empty' ? '<p class="mk-box-none">The board is empty. Say hello.</p>' : `<ul class="mk-notes">${(c.k === 'loading' ? notes.slice(0, 4) : notes).map(noteLi).join('')}</ul>`) + (c.k === 'loading' ? '' : write),
            '<span class="mk-box-n">the latest 50 · 30 days</span>',
          )
        : '';

    // --- assemble
    const head =
      `<div class="wc-lk-bhead mk-c-head">${sortSeg}${perSeg}<span class="mk-sp"></span>${pubBtn}</div>`;
    const footLine = guest ? 'Log in to publish, rate and comment.' : c.k === 'offline' ? '' : 'Your runs: History → Export → Hall of Fame.';
    const foot = `<div class="wc-lk-bfoot mk-c-foot"><div class="wc-lk-flash" role="status">${rs === 'own' && st.topic === 'runes' ? '' : ''}</div><span class="mk-c-footl">${footLine}</span>${!phone && v === 'b' ? pager : ''}</div>`;
    let body;
    const off = c.k === 'offline';
    if (!phone) {
      if (v === 'a') {
        body = `<div class="wc-lk-bbody wc-lk-scroll mk-c-body is-a">${off ? '' : `<div class="mk-c-boxes">${hofBox}${postBox}${dayBox}${mumeBox}</div>`}<div class="mk-c-list">${list}</div>${pager}${runesBox ? `<div class="mk-c-footbox">${runesBox}</div>` : ''}</div>`;
      } else {
        body = `<div class="wc-lk-bbody mk-c-body is-b"><div class="mk-c-list">${list}</div>${off ? '' : `<aside class="mk-c-col wc-lk-scroll">${dayBox}${hofBox}${postBox}${runesBox}${mumeBox}</aside>`}</div>`;
      }
    } else if (tabsForm) {
      const tabs = [['runs', 'Runs'], ['hof', 'Hall of Fame']].concat(runesOn ? [['runes', 'Runes']] : []);
      const strip = `<div class="wc-htabs mk-c-tabs" role="tablist">${tabs.map(([id, l], i) => `<button type="button" role="tab" class="wc-htab${id === tab ? ' is-on' : ''}" data-tab="${id}" tabindex="-1"><span class="wc-htab-k">${i + 1}</span><span class="wc-htab-l">${l}</span></button>`).join('')}</div>`;
      let inner;
      if (tab === 'runs' || off) inner = `${head}<div class="wc-lk-bbody wc-lk-scroll mk-c-body is-p"><div class="mk-c-list">${list}</div>${pager}</div>`;
      else if (tab === 'hof') inner = `<div class="wc-lk-bbody wc-lk-scroll mk-c-body is-p mk-c-stack">${dayBox}${hofBox}${postBox}${mumeBox}</div>`;
      else inner = `<div class="wc-lk-bbody mk-c-body is-p mk-c-runestab">${runesBox}</div>`;
      body = strip + inner;
    } else {
      const boxes = v === 'a' ? `<div class="mk-c-strip">${dayBox}${hofBox}${postBox}${mumeBox}</div>` : `<div class="mk-c-stack">${dayBox}${hofBox}${postBox}${mumeBox}</div>`;
      const parts = v === 'a' ? [off ? '' : boxes, rule('Runs'), `<div class="mk-c-list">${list}</div>`, pager, runesBox] : [`<div class="mk-c-list">${list}</div>`, off ? '' : rule('Hall of Fame'), off ? '' : boxes, runesBox];
      body = head + `<div class="wc-lk-bbody wc-lk-scroll mk-c-body is-p is-sections">${parts.join('')}</div>`;
    }
    const keepBack = win.querySelector('input[type=file]');
    win.innerHTML = phone ? body + (tab === 'runes' ? '' : foot) : head + body + foot;
    if (keepBack) keepBack.remove();
    // Scroll where the state says.
    after(() => {
      if (c.scroll === 'foot') {
        const el = !phone ? (v === 'a' ? win.querySelector('.mk-c-body') : win.querySelector('.mk-c-col')) : null;
        if (el) el.scrollTop = el.scrollHeight;
      }
      if (c.scroll === 'mid') {
        const el = win.querySelector('.mk-c-body');
        if (el) el.scrollTop = v === 'a' ? 560 : 900;
      }
      const notesEl = win.querySelector('.mk-notes');
      if (notesEl && phone) notesEl.scrollTop = 0;
    });

    if (rs === 'report' && st.topic === 'runes') {
      dialog(topFrame, bigBox(), {
        dlg: 'report',
        title: 'Report this note',
        width: 500,
        cls: 'mk-share',
        body: reportBody('this note by <b>marrowfield</b>', '“orcs at the ford again, bring light”'),
        buttons: [btn('CANCEL', 'Cancel', 'C'), btn('SEND', 'Send report', 'S', { primary: true, icon: FLAG() })],
      });
    }
    if (rs === 'own' && st.topic === 'runes') {
      // nothing more: the gold note with Remove is the state.
    }
  }

  // ------------------------------------------------------------ 3. The watch page
  if (st.page === 'watch') {
    const w = st.watch;
    const v = w.v;
    const pageEl = app.querySelector('.wc-watch-page');
    pageEl.classList.add('mk-wp', 'is-' + v);
    const band = pageEl.querySelector('.wc-watch-band');
    const slot = pageEl.querySelector('.wc-watch-slot');
    slot.innerHTML = `<img class="mk-w-img" alt="" src="${(MK.replay || {})[touch ? 'a' : v]}">`;
    if (touch) slot.style.height = '560px';
    else if (v === 'a') slot.style.height = '796px';

    // The star control (History's Rate, smaller).
    const control = (lit, peek) =>
      `<div class="wc-hd-stars mk-rate-s" role="radiogroup" aria-label="Your stars">${[1, 2, 3, 4, 5].map((i) => `<button type="button" role="radio" tabindex="-1" aria-checked="${i === lit}" class="${i <= lit ? 'is-lit' : ''}${peek && i <= peek ? ' is-peek' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"></path></svg></button>`).join('')}</div>`;
    let rate;
    if (w.k === 'rated') rate = `${control(4)}<p class="mk-rate-l"><span>Your stars: <b>four</b></span><span class="mk-rate-m">${stars(4.3).replace('wc-lk-stars', 'wc-lk-stars mk-rate-mini')}<b>4.3</b> · 12 votes</span></p>`;
    else if (w.k === 'notyet') rate = `${control(0, touch ? 0 : 3)}<p class="mk-rate-l"><span>Rate this run</span><span class="mk-rate-m"><b>4.3</b> · 12 votes</span></p>`;
    else if (w.k === 'own') rate = `<div class="mk-rate-static">${stars(4.3)}<b>4.3</b></div><p class="mk-rate-l"><span>12 votes · <i>your run</i></span></p>`;
    else rate = `<div class="mk-rate-static">${stars(4.3)}<b>4.3</b></div><p class="mk-rate-l"><span>12 votes · </span><a class="mk-login">Log in to rate</a></p>`;
    const rateBox = `<div class="mk-rate">${rate}</div>`;

    // The comments.
    const me = w.owner ? 'fenwick' : 'Norsy';
    const cmts = w.c === 'empty' ? [] : COMMENTS;
    const cLi = ([who, when, text, own]) => {
      const mine = own && !w.guest && !w.owner;
      const actions = w.guest ? '' : mine || w.owner ? btn('REMOVE', 'Remove', '', { small: true, danger: true, icon: TRASH() }) : '';
      const report = w.guest || mine || w.owner ? '' : btn('REPORT', 'Report', '', { small: true, icon: FLAG() });
      return `<li class="mk-cm${mine ? ' is-own' : ''}${who === 'fenwick' ? ' is-sender' : ''}"><div class="mk-cm-h"><b>${who}</b>${who === me ? '' : ''}<time>${when}</time><span class="mk-sp"></span>${actions}${report}</div><p class="mk-cm-t">${esc(text)}</p></li>`;
    };
    const form = w.guest
      ? `<div class="mk-cform is-guest"><span>Comments come from accounts.</span>${btn('LOGIN', 'Log in to comment', 'l', { small: true, icon: ic('person') })}</div>`
      : `<div class="mk-cform">${field({ id: 'comment', label: 'A comment', area: true, rows: v === 'b' && !touch ? 3 : 2, value: w.c === 'list' && !w.owner ? 'The turn at the bridge is the best part.' : '', ph: 'Write a comment: plain text, everyone sees it with your name', hint: `<span class="mk-count-r">${w.c === 'list' && !w.owner ? 39 : 0} / 1000</span>` })}<div class="mk-cform-b">${btn('POST', 'Post comment', 'o', { small: true, primary: w.c === 'list' && !w.owner, off: !(w.c === 'list' && !w.owner) })}</div></div>`;
    const list = cmts.length ? `<ul class="mk-cms">${cmts.map(cLi).join('')}</ul>` : `<p class="mk-cm-none">No comments yet.${w.guest ? '' : ' Be the first.'}</p>`;
    const cHead = rule(`Comments${cmts.length ? ` <span class="mk-cnum">${cmts.length}</span>` : ''}`);

    if (!touch && v === 'b') {
      const wrap = document.createElement('div');
      wrap.className = 'mk-wrow';
      slot.replaceWith(wrap);
      wrap.append(slot);
      wrap.insertAdjacentHTML('beforeend', `<aside class="mk-wpanel">${rateBox}${cHead}<div class="mk-wpanel-l">${list}</div>${form}</aside>`);
    } else {
      if (v === 'a') {
        if (touch) band.querySelector('.wc-watch-id').insertAdjacentHTML('afterend', rateBox);
        else band.querySelector('.wc-watch-acts').insertAdjacentHTML('beforebegin', rateBox);
        slot.insertAdjacentHTML('afterend', `<section class="mk-cmts">${cHead}${list}${form}</section>`);
      } else {
        slot.insertAdjacentHTML('afterend', `<section class="mk-cmts is-b">${rateBox}${cHead}${list}${form}</section>`);
      }
    }
    if (w.guest) {
      for (const b of band.querySelectorAll('[data-btn="REPORT"]')) b.classList.add('mk-dim');
    }
    if (w.scroll) after(() => (pageEl.scrollTop = pageEl.scrollHeight));
  }

  // ------------------------------------------------------------ 4. Hall of Fame in the export editor
  if (st.hof) {
    const h = st.hof;
    const exp = topFrame.querySelector('.wc-exp');
    const sg = exp.querySelector('.wc-exp-outs .wc-lk-seg');
    const grey = h.k === 'guest';
    sg.insertAdjacentHTML(
      'beforeend',
      `<button type="button" class="wc-lk-opt${h.k !== 'guest' ? ' is-on' : ''}${grey ? ' is-disabled' : ''}" role="radio" data-opt="HOF" tabindex="-1">${STARG()}<span>Hall of <u class="wc-sk">F</u>ame</span></button>`,
    );
    if (grey) {
      const l = sg.querySelector('[data-opt="LINK"]');
      l.classList.add('is-disabled');
      const opt = sg.querySelector('[data-opt="HOF"]');
      if (touch) exp.querySelector('.wc-exp-flash').innerHTML = '<span>Log in to publish. Account is on the start page.</span>';
      else
        after(() => {
          if (exp.querySelector('.mk-tip')) return;
          exp.style.position = 'relative';
          const o = opt.getBoundingClientRect();
          const r = exp.getBoundingClientRect();
          exp.insertAdjacentHTML('beforeend', `<span class="mk-tip" role="tooltip" style="left:${o.left - r.left + o.width / 2}px;top:${o.top - r.top - 8}px">Log in to publish</span>`);
        });
    } else {
      const html = sg.querySelector('[data-opt="HTML"]');
      html.classList.remove('is-on');
      const fl = exp.querySelector('.wc-exp-flabel');
      if (fl) fl.textContent = 'Title';
      const fn = exp.querySelector('.wc-exp-fn em');
      if (fn) fn.remove();
    }
    const box = bigBox();
    const sizeP = `<p class="wc-sh-size">${ic('save')}<span><b>1.2 MB</b> of 5 MB</span><span class="wc-sh-sizebar" aria-hidden="true"><i style="width:24%"></i></span></p>`;
    const listed = `<p class="wc-sh-anyone mk-listed">${STARG()}<span>Everyone can find this in the Community.</span></p><p class="wc-lk-qn mk-left mk-small">Listed under New at once. You can unlist it later under Published runs.</p>`;
    const rulesBox = `<div class="wc-sh-rules" data-rules=""><p class="wc-sh-rules-h">The rules, once for your account</p><ul class="wc-sh-rules-l">${RULES.map((r) => `<li>${r}</li>`).join('')}</ul><div class="wc-sh-tick">${check('I have read this and agree', false)}</div></div>`;
    if (h.k === 'form' || h.k === 'limit') {
      dialog(topFrame, box, {
        dlg: 'share',
        title: 'Publish to the Hall of Fame',
        width: 540,
        cls: 'mk-share',
        body:
          `<div class="wc-sh"><form class="wc-ac-dform">` +
          field({ id: 'title', label: 'Title', value: T.title }) +
          field({ id: 'desc', label: 'Description', area: true, rows: 3, value: T.desc, hint: `<span class="wc-sh-count">${T.desc.length} / 500</span>` }) +
          `</form>${sizeP}${listed}${h.rules ? rulesBox : ''}</div>`,
        err: h.k === 'limit' ? 'You have listed 10 runs today, the most a day. Choose Link now, and list it tomorrow under Published runs.' : null,
        buttons: [btn('CANCEL', 'Cancel', 'C'), btn('PUBLISH', 'Publish', 'U', { primary: true, icon: STARG(), off: !!h.rules || h.k === 'limit' })],
      });
    }
    if (h.k === 'done') {
      dialog(topFrame, box, {
        dlg: 'share-done',
        title: 'Published',
        width: 540,
        cls: 'mk-share',
        body:
          `<div class="wc-sh"><p class="wc-lk-q wc-sh-made">${T.title}</p><div class="wc-sh-linkrow">${field({ id: 'link', label: 'The link', value: T.url, mono: true, readonly: true })}${btn('COPY', 'Copy', 'C', { icon: COPY(), primary: true })}</div>` +
          `<p class="wc-sh-copied">Copied.</p><p class="wc-lk-qn wc-sh-note">It is in the Community now, first under New. Stars and comments show under Published runs on the Account page.</p></div>`,
        buttons: [btn('COMMUNITY', 'Open Community', 'm'), btn('DONE', 'Done', 'D', { primary: true })],
      });
    }
  }

  // ------------------------------------------------------------ 6. Published runs
  if (st.pub) {
    const p = st.pub;
    const form = topFrame.querySelector('.wc-ac-acct');
    const pubs = form.querySelector('.wc-ac-pubs');
    const INFO = {
      Ab3dE5fG7hJk: { listed: true, mean: 4.3, votes: 12, com: 5, views: 37, date: '15 Nov 2026', size: '1.2 MB', news: '1 star · 1 comment' },
      Qm7Rt2Lp9xWz: { listed: true, mean: 4.8, votes: 23, com: 11, views: 412, date: '14 Nov 2026', size: '2.4 MB' },
      Hn4Kc8Vb1sYe: { listed: false, mean: 0, votes: 0, com: 0, views: 5, date: '10 Nov 2026', size: '0.6 MB' },
      Zp6Wd3Fg5uNa: { listed: false, mean: 3.0, votes: 2, com: 1, views: 21, date: '3 Nov 2026', size: '1.9 MB', hidden: true },
    };
    if (p.k === 'row' || p.k === 'empty') {
      const none = p.k === 'empty';
      pubs.outerHTML = `<div class="mk-pubrow"><span class="mk-pubrow-w">${none ? '<b>None yet.</b> In History, Export a session and choose Link or Hall of Fame.' : '<b>4 runs</b> · 2 listed · 475 views · <span class="mk-gold">2 new</span>'}</span>${none ? '' : btn('PUBLISHED', 'Published runs', 'u', { small: true, icon: LINK() })}</div>`;
    } else {
      const sec = topFrame.querySelector('.wc-ac-account');
      sec.querySelector('.wc-lk-hood-t').textContent = 'Published runs';
      sec.classList.add('mk-pubview');
      for (const li of pubs.querySelectorAll('.wc-ac-pub')) {
        const i = INFO[li.dataset.pub];
        if (!i) continue;
        const fig = li.querySelector('.wc-ac-pub-fig');
        fig.innerHTML = `<span class="mk-chip${i.listed ? ' is-listed' : ''}">${i.listed ? STARG() + 'Listed' : LINK() + 'Link only'}</span>`;
        const l1 = li.querySelector('.wc-ac-pub-l1');
        l1.insertAdjacentHTML(
          'afterend',
          `<div class="mk-pub-r">${i.votes ? stars(i.mean) + `<b>${i.mean.toFixed(1)}</b><span>· ${i.votes} votes</span>` : '<span class="mk-faint">no votes</span>'}<span class="mk-pub-n">${BUBBLE('mk-ic-s')}${i.com}</span><span class="mk-pub-n">${EYE('mk-ic-s')}${i.views}</span><span class="mk-pub-dt">${i.date} · ${i.size}</span>` +
            (i.news ? `<span class="mk-pub-new">${i.news} new</span>` : '') +
            '</div>' +
            (i.hidden ? `<div class="mk-pub-hid">${FLAG()}<span>Hidden after reports. Only you can watch it until we have looked.</span></div>` : ''),
        );
        if (i.news) li.classList.add('mk-is-new');
        if (i.hidden) li.classList.add('mk-is-hidden');
      }
      // The view: the account's other sections go; its head names the view.
      const head = form.querySelector('.wc-ac-head');
      head.innerHTML = `<span class="wc-ac-head-name">fenwick</span><span class="wc-ac-head-since">4 of 150 · 6.1 MB, not counted against your 50 MB · <span class="mk-gold">2 new since you last looked</span></span>`;
      const keep = [head, pubs];
      for (const ch of [...form.children]) if (!keep.includes(ch)) ch.remove();
      if (p.k === 'edit') {
        dialog(topFrame, bigBox(), {
          dlg: 'pub-edit',
          title: 'Edit',
          width: 520,
          cls: 'mk-share',
          body:
            field({ id: 'title', label: 'Title', value: T.title }) +
            field({ id: 'desc', label: 'Description', area: true, rows: 3, value: T.desc, hint: `<span class="mk-count-r">${T.desc.length} / 500</span>` }) +
            `<div class="mk-listrow">${toggle('Listed in the Community', true)}</div>` +
            `<p class="wc-lk-qn mk-left mk-small">Off: only people with the link can watch it. The stars and comments stay. The run itself stays as it was cut.</p>`,
          buttons: [btn('CANCEL', 'Cancel', 'C'), btn('SAVE', 'Save', 'S', { primary: true })],
        });
      }
    }
  }

  // ------------------------------------------------------------ 7. Admin
  if (st.page === 'admin') {
    const runCard =
      `<article class="rq is-hidden"><div class="rq-head"><span class="rq-kind">Run</span><h3>Trollshaws hoard run</h3><span class="rq-state">hidden after 5 reports</span></div>` +
      `<p class="rq-who">by <b>fenwick</b> · Rasta (L28) · <code>Zp6Wd3Fg5uNa</code> · 1.9 MB · 21 views · link only</p>` +
      `<p class="rq-reasons"><span class="rq-r">Real-life information about someone <b>3</b></span><span class="rq-r">Harassment <b>2</b></span></p>` +
      `<p class="rq-from muted">Reported by brego, elanor_s, hollin, quillon, tarnwise</p><p class="rq-text">“His real name and town are in the narrates around 38:10.” · 2 h ago</p>` +
      `<p class="rq-acts"><a href="#">Watch</a> <button>Restore</button> <button class="danger">Delete</button> <span class="sep"></span> <button>Dismiss reports</button> <button>Suspend fenwick</button></p></article>`;
    const cmtCard =
      `<article class="rq"><div class="rq-head"><span class="rq-kind is-c">Comment</span><h3>on “Orc raid on the Old Forest Road”</h3><span class="rq-state">shown</span></div>` +
      `<blockquote class="rq-quote">you are the worst ranger on this game, everyone in Bree laughs at you, uninstall</blockquote>` +
      `<p class="rq-who">by <b>grimbeorn</b> · <code>c7Hq2Lm9Vx4T</code> · 15 Nov 11:02 · on the run by marrowfield (<code>Vt8Ky2Qa4mRc</code>)</p>` +
      `<p class="rq-reasons"><span class="rq-r">Harassment <b>3</b></span></p><p class="rq-from muted">Reported by aldwyn, ferny_b, marrowfield</p>` +
      `<p class="rq-acts"><a href="#">Open run</a> <button>Hide</button> <button class="danger">Delete</button> <span class="sep"></span> <button>Dismiss reports</button> <button>Suspend grimbeorn</button></p></article>`;
    const noteCard =
      `<article class="rq is-hidden"><div class="rq-head"><span class="rq-kind is-n">Note</span><h3>on Random Runes</h3><span class="rq-state">hidden after 5 reports</span></div>` +
      `<blockquote class="rq-quote">cheap gold, best prices, find me at shadyshop dot example</blockquote>` +
      `<p class="rq-who">by <b>goldmonger7</b> · <code>n2Xw8Rt5Kq1Z</code> · 15 Nov 09:40 · account 2 days old</p>` +
      `<p class="rq-reasons"><span class="rq-r">Breaks MUME’s rules <b>4</b></span><span class="rq-r">Other <b>1</b></span></p><p class="rq-from muted">Reported by brego, hollin, kuzzim, saelind, tarnwise</p><p class="rq-text">“selling gold for money” · 3 h ago</p>` +
      `<p class="rq-acts"><button>Restore</button> <button class="danger">Delete</button> <span class="sep"></span> <button>Dismiss reports</button> <button>Suspend goldmonger7</button></p></article>`;
    const log = [
      ['2026-11-15 14:02', 'a3f9…c1', 'comment.delete', 'comment Lp3Vc8Qe1sRt', 'insults a player'],
      ['2026-11-15 09:41', 'a3f9…c1', 'note.restore', 'note Kd5Ra8Tz2yBm', 'a joke, nothing wrong'],
      ['2026-11-14 21:17', 'a3f9…c1', 'suspend', 'account grimbeorn', 'second warning'],
      ['2026-11-14 21:15', 'a3f9…c1', 'run.delete', 'run Bn3Sg7Hk4wLe', ''],
      ['2026-11-13 18:30', 'a3f9…c1', 'note.hide', 'note Pe9Dm2Cq6vTa', 'spam'],
    ];
    app.innerHTML =
      `<header><h1>WebCockpit admin</h1><p id="status">Read 2026-11-15 16:40:12 UTC.</p></header><main class="mk-two">` +
      `<section class="mk-col1"><h2>Reports <span class="muted">12 open on 3 items · 1 run, 1 comment, 1 note</span></h2>${noteCard}${runCard}${cmtCard}</section>` +
      `<div class="mk-col2"><section><h2>Community</h2><dl class="figures"><div><dt>Listed</dt><dd>214</dd></div><div><dt>Comments</dt><dd>1,032</dd></div><div><dt>Notes</dt><dd>48</dd></div><div><dt>Votes</dt><dd>2,611</dd></div><div><dt>Hidden</dt><dd>2</dd></div></dl>` +
      `<p class="muted">Today: 9 listed, 61 comments, 12 notes, 140 votes.</p></section>` +
      `<section><h2>Published runs</h2><dl class="figures"><div><dt>Runs</dt><dd>1,284</dd></div><div><dt>Stored</dt><dd>1.31 GB</dd></div><div><dt>Views today</dt><dd>2,906</dd></div></dl></section>` +
      `<section><h2>Admin log <span class="muted">the newest 5 of 100</span></h2><table class="log"><thead><tr><th>When (UTC)</th><th>Who</th><th>Action</th><th>Target</th><th>Note</th></tr></thead><tbody>${log.map((r) => `<tr>${r.map((c, i) => `<td${i === 1 ? ' class="mono"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></section></div>` +
      `<section class="mk-rest"><h2 class="muted">Online now · Today · Use today · The last 30 days · Devices · Flags</h2><p class="muted">As today (stage 59), under these.</p></section></main>` +
      (st.admin === 'confirm'
        ? `<div class="modal-veil"><div class="modal" role="dialog" aria-modal="true"><h3>Delete this comment?</h3><blockquote class="rq-quote">you are the worst ranger on this game, everyone in Bree laughs at you, uninstall</blockquote><p>By <b>grimbeorn</b> on “Orc raid on the Old Forest Road”. The comment is deleted (no text is kept), the run’s count goes to 6, its 3 reports are marked handled and the action goes to the admin log.</p><label>Note for the log (optional)<input type="text" value="insults a player"></label><p class="modal-btns"><button>Cancel</button> <button class="danger solid">Delete comment</button></p></div></div>`
        : '');
  }
})();
