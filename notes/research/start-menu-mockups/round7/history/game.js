/* Round 7 · history group · a fake player cockpit and playback engine for the player mockups (throwaway).
   The stage is what the real player shows (ADR 0018): the recorded cockpit — game text in monospace with
   the DOS ANSI palette, and the side panes (Map, Timers, Group, Comm; Character and UI off as recorded) —
   with no input row. The text is generated, deterministic, MUME-like output over a whole session (two runs,
   3 h 41 min), with the four marker kinds at fixed places, and export comments for the replay.
   GAME.create(host, opts) → engine { pos, duration, playing, speed, run, runs, marks, comments, play(),
     pause(), toggle(), seek(ms), skip(ms), setSpeed(s), on(fn), moveCursor(n), cursorMoved, panes, font,
     theme, setFont(f), setTheme(t), togglePane(id), resetPanes(), stage }   opts: { comments: bool, start: ms } */
(() => {
'use strict';
const p2 = (n) => String(n).padStart(2, '0');
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600); return h > 0 ? `${h}:${p2(Math.floor(s / 60) % 60)}:${p2(s % 60)}` : `${p2(Math.floor(s / 60))}:${p2(s % 60)}`; };
const H_ = (h, m, s = 0) => ((h * 60 + m) * 60 + s) * 1000;
// ------------------------------------------------------------------ the session
const SESSION = { character: 'Gibur', level: 41, start: new Date(2026, 10, 6, 21, 12).getTime(), duration: H_(3, 41, 7), runs: [H_(1, 58, 20), H_(1, 42, 47)] };
const SPECIAL = [
  { at: H_(0, 48, 10), kind: 'level', tip: 'Reached level 41' },
  { at: H_(1, 21, 30), kind: 'achievement', tip: 'Achievement: Walked the Last Bridge at night' },
  { at: H_(2, 31, 5), kind: 'pkill', tip: 'Killed *Ugluk the Orc*', foe: 'Ugluk', race: 'the Orc' },
  { at: H_(2, 31, 52), kind: 'pkill', tip: 'Killed *Lugdush the Uruk-hai*', foe: 'Lugdush', race: 'the Uruk-hai' },
  { at: H_(3, 9, 50), kind: 'death', tip: 'Died (level 41)' },
];
const COMMENTS = [
  { at: 2000, text: "Gibur's first long night in the Trollshaws after the patch. Watch the ford at 2:31." },
  { at: H_(2, 30, 30), text: 'Here they come: two Uruks from the west bank, and Dori is still resting.' },
  { at: H_(3, 9, 20), text: 'And this is where I should have fled.' },
];
const HOLD = 3200;
// ------------------------------------------------------------------ text
const c = (n, t) => `<span class="a${n}">${t}</span>`;
const ROOMS = [
  ['The Great East Road', ['The road runs straight and wide here, its old paving stones half-sunk in', 'the grass. To the east the land climbs towards a line of bare hills, and', 'far behind, a thin smoke rises from the chimneys of Bree.'], 'east, west'],
  ['The Last Bridge', ['A bridge of three stone arches spans the swift Hoarwell. The water runs', 'loud and grey beneath, and the parapets are worn smooth by the hands of', 'many travellers.'], 'east, west'],
  ['Trollshaws, Among Old Trees', ['Gnarled oaks crowd close about a narrow path. The ground is trampled and', 'torn, and a sour smell hangs between the trunks.'], 'north, south, west'],
  ['A Ford of the Bruinen', ['The river spreads wide and shallow over a bed of round stones. On the far', 'bank the path climbs into dark pines.'], 'north, east, west'],
  ['A Stony Ravine', ['Grey cliffs close in on both sides. Loose rocks clatter down now and then', 'from somewhere above, and the wind moans in the cracks.'], 'north, south'],
  ['Trollshaws, A Clearing', ['A ring of trees stands back from a patch of bitter grass. Bones lie half', 'buried near a blackened fire-pit.'], 'north, east, south, west'],
];
const MOBS = ['a large troll', 'a cave troll', 'a snarling warg', 'an orc tracker', 'a hill troll', 'a huge black spider'];
const HITS = ['slash', 'pierce', 'hit', 'crush'];
const HOW = ['hard', 'very hard', 'extremely hard', ''];
const PARTS = ['body', 'head', 'left arm', 'right leg', 'left leg', 'right arm'];
const COND = ['Fine', 'Fine', 'Hurt', 'Wounded', 'Fine'];
const MV = ['', ' Mv:Tired', '', ''];
const COMM = [
  ['narrate', 'Ecthel', 'narrates', 'anyone near Rivendell? need a lift east', 3],
  ['tell', 'Dori', 'tells you', 'more coming, 2 trolls', 2],
  ['say', 'You', 'say', 'ready when you are', 6],
  ['narrate', 'Lindir', 'narrates', 'scouts report orcs at the ford', 3],
  ['tell', 'Dori', 'tells you', 'rest a bit, I am out of mana', 2],
  ['sing', 'Lindir', 'sings', 'A Elbereth Gilthoniel', 5],
  ['say', 'Dori', 'says', 'follow me, stay close', 6],
  ['pray', 'Dori', 'prays', 'Mahal, mend my wounds', 5],
  ['narrate', 'Halbarad', 'narrates', 'Weathertop clear for now', 3],
  ['yell', '*Ugluk the Orc*', 'yells', 'kill them all', 9],
];
function prompt(r, cmd) { const cond = COND[Math.floor(r() * COND.length)]; return `*= HP:${cond}${MV[Math.floor(r() * MV.length)]}&gt;${cmd ? ' ' + c(7, cmd) : ''}`; }
function generate() {
  const r = WC.util.rng(4242);
  const E = [];   // { t, html, comm?, cls?, kind? }
  let t = 900, room = 0, spec = 0, run = 0;
  const push = (html, extra = {}) => { E.push({ t, html, ...extra }); };
  const gap = (a, b) => { t += Math.round((a + r() * (b - a)) * 1000); };
  const roomBlock = (i) => { const [n, d, x] = ROOMS[i]; push(c(14, n)); d.forEach((l) => push(l)); push(c(8, `Exits: ${x}.`)); };
  roomBlock(0); gap(.5, 1); push(c(11, 'Dori the Dwarf is standing here.')); push(c(11, 'Ecthel is resting here.')); gap(.4, 1); push(prompt(r));
  while (t < SESSION.duration - 4000) {
    // the run boundary
    if (run === 0 && t >= SESSION.runs[0] - 30000) {
      push(prompt(r, 'quit')); gap(.3, .6); push('Goodbye, friend.. Come back soon!'); gap(.2, .4); push(c(3, '#Connection closed.'), { sys: true });
      t = SESSION.runs[0] + 400; run = 1;
      push(c(15, 'Welcome to the land of Middle-earth. May your visit here be... Interesting.'), { runStart: true }); gap(.3, .8);
      roomBlock(3); push(prompt(r)); gap(2, 5); continue;
    }
    // a special event
    if (spec < SPECIAL.length && t >= SPECIAL[spec].at - 15000) {
      const s = SPECIAL[spec++];
      if (s.kind === 'level') { push(prompt(r, 'kill troll')); gap(.4, 1); push('You slash a large troll\'s body extremely hard.'); gap(.4, 1); push(c(9, 'A large troll is dead! R.I.P.')); gap(.2, .4); push('You receive your share of experience.'); t = s.at; push(c(10, 'You raise a level!'), { mark: s }); gap(.2, .5); push(prompt(r)); }
      else if (s.kind === 'achievement') { roomBlock(1); gap(.5, 1); t = s.at; push(c(13, 'Achievement unlocked: Walked the Last Bridge at night.'), { mark: s }); gap(.4, 1); push(prompt(r)); }
      else if (s.kind === 'pkill') {
        push(c(9, `*${s.foe} ${s.race}* arrives from the west.`)); gap(.5, 1.2); push(prompt(r, 'kill *orc*')); gap(.3, .8);
        for (let i = 0; i < 4; i++) { push(`You ${HITS[i % 4]} *${s.foe}*'s ${PARTS[i]} ${HOW[i % 3]}.`); gap(.6, 1.4); push(c(1, `*${s.foe}* hits you ${HOW[(i + 1) % 3]} in your ${PARTS[(i + 2) % 6]}.`)); gap(.6, 1.4); }
        t = s.at; push(c(9, `*${s.foe} ${s.race}* is dead! R.I.P.`), { mark: s }); gap(.2, .4); push('You receive your share of experience.'); gap(.2, .5); push(prompt(r));
      } else if (s.kind === 'death') {
        push(prompt(r, 'kill troll')); gap(.4, .9);
        for (let i = 0; i < 4; i++) { push(c(1, `A cave troll hits you ${HOW[2]} in your ${PARTS[i]}.`)); gap(.5, 1.1); }
        push(prompt(r, 'flee')); gap(.3, .6); push('PANIC! You couldn\'t escape!'); gap(.5, .9);
        t = s.at; push(c(9, 'You are dead! Sorry...'), { mark: s }); gap(.6, 1.2); push('You feel the world slip away, and wake in a cold place.'); gap(.4, .9); push(prompt(r));
      }
      gap(4, 8); continue;
    }
    const k = r();
    if (k < .3) {   // travel
      const dir = ['n', 'e', 's', 'w'][Math.floor(r() * 4)];
      push(prompt(r, dir)); gap(.2, .5); room = (room + 1 + Math.floor(r() * 3)) % ROOMS.length; roomBlock(room);
      if (r() < .4) { const m = MOBS[Math.floor(r() * MOBS.length)]; push(c(11, `${m[0].toUpperCase()}${m.slice(1)} is here, looking for trouble.`)); }
      if (r() < .5) { gap(.3, .8); push('Dori arrives from the ' + { n: 'south', e: 'west', s: 'north', w: 'east' }[dir] + '.'); }
      gap(.3, .6); push(prompt(r));
    } else if (k < .55) {   // fight
      const mob = MOBS[Math.floor(r() * MOBS.length)], Mob = mob[0].toUpperCase() + mob.slice(1), word = mob.split(' ').pop();
      push(prompt(r, 'kill ' + word)); gap(.3, .8);
      const n = 3 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        push(`You ${HITS[Math.floor(r() * 4)]} ${mob}'s ${PARTS[Math.floor(r() * 6)]} ${HOW[Math.floor(r() * 4)]}.`.replace(' .', '.')); gap(.5, 1.6);
        if (r() < .6) { push(c(1, `${Mob} hits you ${HOW[Math.floor(r() * 3)]} in your ${PARTS[Math.floor(r() * 6)]}.`)); gap(.4, 1.2); }
        if (r() < .4) { push(`Dori ${HITS[Math.floor(r() * 4)]}s ${mob}'s ${PARTS[Math.floor(r() * 6)]} hard.`); gap(.4, 1); }
        if (i === 1) push(prompt(r));
      }
      push(c(9, `${Mob} is dead! R.I.P.`)); gap(.2, .4); push('You receive your share of experience.'); gap(.2, .6); push(prompt(r));
    } else if (k < .78) {   // comm
      const [ch, who, verb, msg, col] = COMM[Math.floor(r() * (COMM.length - 1))];
      const line = who === 'You' ? `${c(col, 'You ' + verb)} ${c(col, `'${msg}'`)}` : `${c(col, `${who} ${verb} '${msg}'`)}`;
      if (who === 'You') push(prompt(r, `${verb} ${msg}`));
      push(line, { comm: { ch, who, verb, msg, col } }); gap(.4, 1); push(prompt(r));
    } else if (k < .88) {   // rest
      push(prompt(r, 'rest')); gap(.2, .4); push('You sit down and rest your tired bones.'); gap(3, 7); push('You feel rested.'); gap(.5, 1); push(prompt(r, 'stand')); gap(.2, .4); push('You stand up.'); push(prompt(r));
    } else {   // ambience
      push(['The river keeps running over the stones.', 'A crow caws somewhere to the north.', 'The wind picks up, rattling the branches.', 'Far off, a wolf howls.'][Math.floor(r() * 4)]); gap(.5, 1); push(prompt(r));
    }
    gap(3.5, 9.5);
  }
  push(prompt(r, 'save')); push('Saving Gibur.'); E.forEach((e) => { e.t = Math.min(e.t, SESSION.duration); });
  return E;
}
function wrap(text, w = 72) { const out = []; let line = ''; for (const word of text.split(/\s+/)) { if (line && line.length + 1 + word.length > w) { out.push(line); line = word; } else line = line ? line + ' ' + word : word; } if (line) out.push(line); return out; }
// ------------------------------------------------------------------ the stage
const PANE_LIST = [['character', 'Character'], ['timers', 'Timers'], ['group', 'Group'], ['comm', 'Comm'], ['ui', 'UI'], ['map', 'Map']];
const RECORDED = { character: false, timers: true, group: true, comm: true, ui: false, map: true };
const BASE_DIR = (() => { const s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^/]*$/, '') : ''; })();
function create(host, opts = {}) {
  const E = generate();
  const marks = E.filter((e) => e.mark).map((e) => ({ offset: e.t, kind: e.mark.kind, tip: e.mark.tip }));
  const comments = opts.comments ? COMMENTS.map((x) => ({ ...x })) : [];
  // comments become entries (yellow ## rows) with a hold
  if (comments.length) {
    for (const cm of comments) {
      const i = E.findIndex((e) => e.t >= cm.at);
      const rows = wrap(cm.text, 70).map((l, k) => ({ t: cm.at, html: `<span class="gs-cm">## ${l}</span>`, hold: k === 0 ? HOLD : 0, note: k === 0 ? cm : null }));
      E.splice(i < 0 ? E.length : i, 0, ...rows);
    }
  }
  const stage = WC.el('div', { class: 'gs', 'data-theme': 'default', 'data-font': 'default' });
  stage.innerHTML = `
    <div class="gs-out"><div class="gs-rows"></div></div>
    <aside class="gs-side">
      <section class="gs-pane gs-map" data-p="map"><span class="gs-pt">Map</span><div class="gs-mapimg" style="background-image:url(${BASE_DIR}map-crop.jpg)"></div></section>
      <div class="gs-duo">
        <section class="gs-pane" data-p="timers"><span class="gs-pt">Timers</span><div class="gs-pb"><div class="gs-timer"><i>❦</i> Herblore <b>+</b><span class="gs-tl"></span></div><div class="gs-timer"><i>✶</i> Bless <span class="gs-tm">3:12</span></div></div></section>
        <section class="gs-pane" data-p="group"><span class="gs-pt">Group</span><div class="gs-pb gs-group"></div></section>
      </div>
      <section class="gs-pane" data-p="character"><span class="gs-pt">Character</span><div class="gs-pb gs-char"><b>Gibur</b> <span class="a8">Man · Warrior · Level 41</span><div class="gs-bars"><i style="--v:.82;--c:#3fb950"></i><i style="--v:1;--c:#58a6ff"></i><i style="--v:.55;--c:#d29922"></i></div></div></section>
      <section class="gs-pane" data-p="ui"><span class="gs-pt">UI</span><div class="gs-pb gs-ui"></div></section>
      <section class="gs-pane gs-commp" data-p="comm"><span class="gs-pt">Comm</span><div class="gs-ch"><span class="a3">Narr</span> <span class="a2">Tell</span> <span class="a6">Says</span> <span class="a9">Yell</span> <span class="a5">Pray</span> <span class="a11">Emot</span> <span class="a3">Whis</span> <span class="a14">Ques</span> <span class="a5">Song</span></div><div class="gs-pb gs-comm"></div></section>
    </aside>`;
  host.append(stage);
  const out = stage.querySelector('.gs-out'), rowsEl = stage.querySelector('.gs-rows'), commEl = stage.querySelector('.gs-comm'), uiEl = stage.querySelector('.gs-ui');
  stage.querySelector('.gs-group').innerHTML = [['Dori', .9, .3, .7, 'pc'], ['Ecthel', .7, .8, .9, 'pc'], ['a large dog', 1, 1, .8, 'npc'], ['Gibur', .82, 1, .55, 'me']]
    .map(([n, h, m, v, k]) => `<div class="gs-gm ${k}"><span>${k === 'npc' ? '◇' : '♟'} ${n}</span><i style="--v:${h};--c:#3fb950"></i><i style="--v:${m};--c:#58a6ff"></i><i style="--v:${v};--c:#d29922"></i></div>`).join('');
  const panes = { ...RECORDED };
  const eng = { E, marks, comments, stage, duration: SESSION.duration, session: SESSION, runs: SESSION.runs, pos: 0, playing: false, speed: 1, k: 0,
    font: 'default', theme: 'default', panes, cursor: null, cursorMoved: false, ended: false, hold: 0, note: null, seeking: false };
  const subs = [];
  eng.on = (fn) => subs.push(fn);
  const emit = (what) => subs.forEach((f) => f(what));
  const rowHtml = (e) => `<div class="gs-row${e.runStart ? ' gs-runs' : ''}" data-t="${e.t}">${e.html}</div>`;
  const commHtml = (e) => { const m = e.comm; return `<div>${m.who === 'You' ? `You ${c(m.col, m.verb)}` : `${m.who} ${c(m.col, m.verb)}`} '${m.msg}'</div>`; };
  const uiHtml = (e) => `<div><span class="a${e.mark.kind === 'death' ? 9 : e.mark.kind === 'pkill' ? 11 : 10}">◆</span> ${e.mark.tip}</div>`;
  const find = (ms) => { let lo = 0, hi = E.length; while (lo < hi) { const m = (lo + hi) >> 1; if (E[m].t <= ms) lo = m + 1; else hi = m; } return lo; };
  function rebuild() {
    const k = eng.k, from = Math.max(0, k - 260);
    rowsEl.innerHTML = E.slice(from, k).map(rowHtml).join('');
    const cm = []; const ui = [];
    for (let i = k - 1; i >= 0 && (cm.length < 14 || ui.length < 8); i--) { if (E[i].comm && cm.length < 14) cm.unshift(E[i]); if (E[i].mark && ui.length < 8) ui.unshift(E[i]); }
    commEl.innerHTML = cm.map(commHtml).join(''); uiEl.innerHTML = ui.map(uiHtml).join('') || '<div class="a8">No events yet.</div>';
    clearCursor(); toTail();
  }
  const toTail = () => { out.scrollTop = out.scrollHeight; };
  function append(i) {
    const e = E[i];
    rowsEl.insertAdjacentHTML('beforeend', rowHtml(e));
    if (rowsEl.childElementCount > 420) for (let n = 0; n < 60; n++) rowsEl.firstElementChild.remove();
    if (e.comm) { commEl.insertAdjacentHTML('beforeend', commHtml(e)); if (commEl.childElementCount > 14) commEl.firstElementChild.remove(); }
    if (e.mark) { uiEl.insertAdjacentHTML('beforeend', uiHtml(e)); }
  }
  eng.seek = (ms) => {
    eng.pos = Math.max(0, Math.min(eng.duration, ms)); eng.k = find(eng.pos); eng.hold = 0; eng.note = null; eng.ended = eng.pos >= eng.duration;
    eng.seeking = true; rebuild(); emit('state');
    setTimeout(() => { eng.seeking = false; if (!eng.playing) cursorToEnd(); emit('state'); }, 0);
  };
  eng.skip = (d) => eng.seek(eng.pos + d);
  eng.play = () => { if (eng.ended || eng.pos >= eng.duration) eng.seek(0); if (eng.cursorMoved && eng.cursor) { const t = +eng.cursor.dataset.t; clearCursor(); eng.seek(t); } clearCursor(); eng.playing = true; toTail(); emit('state'); };
  eng.pause = () => { eng.playing = false; cursorToEnd(); emit('state'); };
  eng.toggle = () => (eng.playing ? eng.pause() : eng.play());
  eng.setSpeed = (s) => { if (SPEEDS.includes(s)) { eng.speed = s; emit('state'); } };
  eng.speedStep = (d) => { const i = SPEEDS.indexOf(eng.speed) + d; if (i >= 0 && i < SPEEDS.length) eng.setSpeed(SPEEDS[i]); };
  Object.defineProperty(eng, 'run', { get: () => (eng.pos >= SESSION.runs[0] ? 1 : 0) });
  // the pause cursor (a band on a line; ↑↓ PgUp PgDn End move it; Space resumes from it)
  function clearCursor() { if (eng.cursor) eng.cursor.classList.remove('cur'); eng.cursor = null; eng.cursorMoved = false; }
  function cursorToEnd() { clearCursor(); const r = rowsEl.lastElementChild; if (r) { r.classList.add('cur'); eng.cursor = r; } }
  eng.moveCursor = (n) => {
    if (eng.playing) eng.pause();
    let r = eng.cursor || rowsEl.lastElementChild; if (!r) return;
    if (n === Infinity) r = rowsEl.lastElementChild; else for (let i = 0; i < Math.abs(n); i++) { const x = n < 0 ? r.previousElementSibling : r.nextElementSibling; if (!x) break; r = x; }
    eng.cursor && eng.cursor.classList.remove('cur'); r.classList.add('cur'); eng.cursor = r; eng.cursorMoved = r !== rowsEl.lastElementChild;
    r.scrollIntoView({ block: 'nearest' }); emit('cursor');
  };
  out.addEventListener('click', (e) => { if (eng.playing) return; const r = e.target.closest('.gs-row'); if (r) { eng.cursor && eng.cursor.classList.remove('cur'); r.classList.add('cur'); eng.cursor = r; eng.cursorMoved = r !== rowsEl.lastElementChild; emit('cursor'); } });
  out.addEventListener('wheel', (e) => { if (eng.playing || !e.deltaY) return; e.preventDefault(); eng.moveCursor(e.deltaY < 0 ? -1 : 1); }, { passive: false });
  // viewer settings
  eng.setFont = (f) => { eng.font = f; stage.dataset.font = f; toTail(); emit('settings'); };
  eng.setTheme = (t) => { eng.theme = t; stage.dataset.theme = t; emit('settings'); };
  eng.togglePane = (id) => { panes[id] = !panes[id]; applyPanes(); emit('settings'); };
  eng.resetPanes = () => { Object.assign(panes, RECORDED); applyPanes(); emit('settings'); };
  eng.paneList = () => PANE_LIST.map(([id, label]) => ({ id, label, on: panes[id] }));
  eng.canReset = () => PANE_LIST.some(([id]) => panes[id] !== RECORDED[id]);
  function applyPanes() {
    stage.querySelectorAll('.gs-pane').forEach((p) => { p.hidden = !panes[p.dataset.p]; });
    const duo = stage.querySelector('.gs-duo'); duo.hidden = !panes.timers && !panes.group;
    stage.classList.toggle('no-side', !PANE_LIST.some(([id]) => panes[id]));
  }
  applyPanes();
  // the clock
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(250, now - last); last = now;
    if (eng.playing) {
      if (eng.hold > 0) { eng.hold -= dt; if (eng.hold <= 0) { eng.hold = 0; eng.note = null; emit('note'); } }
      else {
        eng.pos = Math.min(eng.duration, eng.pos + dt * eng.speed);
        while (eng.k < E.length && E[eng.k].t <= eng.pos) {
          const e = E[eng.k]; append(eng.k); eng.k++;
          if (e.hold) { eng.hold = e.hold; eng.note = e.note; eng.pos = e.t; emit('note'); while (eng.k < E.length && E[eng.k].t <= e.t && E[eng.k].html.includes('gs-cm')) { append(eng.k); eng.k++; } break; }
        }
        toTail();
        if (eng.pos >= eng.duration) { eng.playing = false; eng.ended = true; cursorToEnd(); emit('state'); emit('end'); }
      }
      emit('tick');
    }
    requestAnimationFrame(frame);
  }
  eng.seek(opts.start ?? H_(0, 12, 41));
  requestAnimationFrame(frame);
  if (opts.autoplay !== false) eng.play();
  return eng;
}
window.GAME = { create, fmtClock, SPEEDS, SESSION, PANE_LIST };
})();
