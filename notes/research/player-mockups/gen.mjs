// Generates the stage 32b player mockups: three directions (A, B, C), each
// as a Spotlights board and a run log board, as design-canvas artboards
// (`.dc.html`). Run: node gen.mjs <folder with canvas/project/>.
// Reference material, not code to copy into src/.
import { writeFileSync } from 'node:fs';
const S = process.argv[2];

// ------------------------------------------------------------------ icons

const P = {
  start: 'M6 5v14 M19 5.5L9.5 12l9.5 6.5z',
  back: 'M5.6 9.4A7.2 7.2 0 1 1 5 13.4 M5 4.6v4.8h4.8',
  fwd: 'M18.4 9.4A7.2 7.2 0 1 0 19 13.4 M19 4.6v4.8h-4.8',
  play: 'M8 5.2l11 6.8-11 6.8z',
  pause: 'M8.5 5.5v13 M15.5 5.5v13',
  panes: 'M4 4h16v16H4z M14 4v16 M14 12h6',
  view: 'M4 7h9 M17 7h3 M15 4.5v5 M4 12h3 M11 12h9 M9 9.5v5 M4 17h11 M19 17h1 M17 14.5v5',
  keys: 'M3.5 7h17v10h-17z M7 10.5h.01 M10.5 10.5h.01 M14 10.5h.01 M17 10.5h.01 M8 14h8',
  close: 'M6 6l12 12M18 6L6 18',
  prev: 'M14.5 6l-6 6 6 6',
  next: 'M9.5 6l6 6-6 6',
  chev: 'M9.5 6.5l5.5 5.5-5.5 5.5',
  filter: 'M4 5.5h16l-6.2 7.2v5.8l-3.6-1.8v-4z',
};
const ic = (d, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"></path></svg>`;
const ic10 = (d) => `<svg class="ic ic10" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"></path><text x="12" y="15.6" text-anchor="middle">10</text></svg>`;
const btn = (label, inner, cls = 'ib', click = '') =>
  `<button type="button" class="${cls}" aria-label="${label}" title="${label}"${click ? ` onClick="{{${click}}}"` : ''}>${inner}</button>`;

// ------------------------------------------------------------------ css

const CSS = `
body{margin:0;background:#000}
.board{position:relative;width:1440px;height:820px;overflow:hidden;color:#c0c0c0;font-family:"DejaVu Sans Mono","JetBrains Mono",ui-monospace,monospace;font-size:15px;line-height:17px}
.out{position:absolute;left:4px;white-space:pre}
.out div{min-height:1em}
.sys{color:#ffd75f}.rn{color:#5faf5f}.tell{color:#5faf5f}.hit{color:#d75f5f}.mob{color:#d7d75f}.ech{color:#87afd7}
.ui{font-size:13px;line-height:16px;color:#c0c0c0}
.glass{box-sizing:border-box;background:rgba(10,10,10,.95);border:1px solid #2a2a2a;border-radius:6px;box-shadow:0 10px 28px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.04)}
.ib{all:unset;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:4px;color:#767676}
.ib:hover{background:rgba(255,255,255,.07);color:#ececec}
.ib.on{background:rgba(255,255,255,.09);color:#ececec}
.ib.dis{opacity:.3;cursor:default}
.ib.dis:hover{background:none;color:#767676}
.ic{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ic10{width:21px;height:21px;stroke-width:1.5}
.ic10 text{fill:currentColor;stroke:none;font:700 8.5px "DejaVu Sans",sans-serif}
.pl{all:unset;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;border:1px solid #3a3a3a;color:#ececec;margin:0 2px}
.pl:hover{border-color:#707070;background:rgba(255,255,255,.07)}
.pl .ic{width:15px;height:15px}
.pl .fill{fill:currentColor;stroke:currentColor;stroke-width:1.2}
.pl .bars{stroke-width:3}
.chip{all:unset;cursor:pointer;flex:none;height:22px;line-height:22px;min-width:30px;text-align:center;padding:0 6px;border:1px solid #2e2e2e;border-radius:3px;color:#a8a8a8;font-size:12px}
.chip:hover,.chip.on{border-color:#5a5a5a;color:#ececec}
.time{color:#6e6e6e;white-space:pre;font-size:12px}
.time b{color:#d0d0d0;font-weight:400}
.ttl{color:#7a7a7a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.ttl b{color:#d8d8d8;font-weight:400}
.grow{flex:1}
.vs{flex:none;width:1px;height:16px;background:#262626;margin:0 4px}
.row{display:flex;align-items:center;gap:2px}

.pop{position:absolute;bottom:calc(100% + 8px);right:0;width:290px;z-index:20}
.ph{display:flex;align-items:center;justify-content:space-between;height:30px;padding:0 6px 0 12px}
.pt{color:#8a8a8a;letter-spacing:.08em;text-transform:uppercase;font-size:11px}
.x{all:unset;cursor:pointer;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:3px;color:#686868}
.x .ic{width:12px;height:12px;stroke-width:1.9}
.x:hover{background:rgba(255,255,255,.07);color:#ececec}
.r{display:flex;align-items:center;justify-content:space-between;min-height:30px;padding:0 12px;gap:12px}
.l{color:#9a9a9a}
.sub{color:#585858;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:8px 12px 4px}
.tg{all:unset;cursor:pointer;flex:none;position:relative;width:26px;height:14px;box-sizing:border-box;border-radius:7px;border:1px solid #3a3a3a;background:#111}
.tg i{position:absolute;top:2px;left:2px;width:8px;height:8px;border-radius:50%;background:#4a4a4a}
.tg.on{background:#3a3a3a;border-color:#5a5a5a}
.tg.on i{left:14px;background:#ececec}
.seg{display:flex;border:1px solid #2e2e2e;border-radius:3px;overflow:hidden;margin:0 12px 8px}
.sg{all:unset;cursor:pointer;flex:1;text-align:center;height:24px;line-height:24px;color:#7a7a7a;border-left:1px solid #2e2e2e;font-size:12px}
.sg:first-child{border-left:0}
.sg:hover{color:#d0d0d0}
.sg.on{background:#2a2a2a;color:#ececec}
.sws{display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:6px;padding:0 12px 12px}
.swb{all:unset;cursor:pointer;display:flex;align-items:center;gap:7px;height:26px;padding:0 7px;border:1px solid #262626;border-radius:3px;color:#8a8a8a;font-size:12px}
.swb:hover{border-color:#5a5a5a;color:#d0d0d0}
.swb.on{border-color:#a0a0a0;color:#ececec}
.swd{flex:none;width:12px;height:12px;border-radius:2px;border:1px solid rgba(255,255,255,.22);box-sizing:border-box}
.btns{display:flex;gap:8px;justify-content:flex-end;padding:8px 12px 10px;border-top:1px solid #1a1a1a;margin-top:4px}
.gb{all:unset;cursor:pointer;height:22px;line-height:22px;padding:0 9px;border-radius:3px;border:1px solid #2e2e2e;color:#a8a8a8;font-size:12px}
.gb:hover{border-color:#5a5a5a;color:#ececec;background:rgba(255,255,255,.05)}
.kr{display:flex;align-items:center;gap:10px;min-height:26px;padding:0 12px}
.kk{flex:0 0 104px;text-align:right}
.kk span{display:inline-block;color:#d0d0d0;background:#161616;border:1px solid #2e2e2e;border-radius:3px;padding:0 5px;font-size:11px;line-height:16px}
.ka{color:#9a9a9a;font-size:12px}
.kpad{padding:2px 0 8px}
.spop{width:auto;min-width:74px;padding:4px}
.spd{all:unset;cursor:pointer;display:block;text-align:right;padding:0 10px;height:24px;line-height:24px;border-radius:3px;color:#8a8a8a;font-size:12px}
.spd:hover{background:rgba(255,255,255,.06);color:#ececec}
.spd.on{color:#ffb000}

.mk{all:unset;cursor:pointer;position:absolute;font-size:10px;line-height:13px;padding:0 3px;border-radius:2px;background:#121212;border:1px solid #2e2e2e;white-space:pre}
.mk:hover{border-color:#8a8a8a;background:#1c1c1c}
.mk-death{color:#e07070}.mk-ach{color:#d7af5f}.mk-pvp{color:#e0915a}.mk-lvl{color:#87af87}

.cd{position:relative;height:2px;margin:0 14px 12px;background:#1a1a1a;border-radius:1px}
.cd i{position:absolute;top:0;bottom:0;background:#8a8a8a;border-radius:1px}
.ch{display:flex;align-items:center;gap:2px;height:32px;padding:0 6px 0 8px}
.cnt{color:#8a8a8a;font-size:11px;letter-spacing:.08em;min-width:84px;text-align:center;text-transform:uppercase}
.cb{padding:0 14px 12px}
.kind{display:flex;align-items:center;gap:7px;color:#9a9a9a;font-size:12px}
.dot{flex:none;width:7px;height:7px;border-radius:50%}
.lab{color:#ececec;font-size:16px;line-height:21px;margin-top:6px;font-weight:700}
.meta{color:#5e5e5e;font-size:11px;margin-top:4px}
.empty{padding:6px 14px 14px;color:#9a9a9a}
.empty small{display:block;color:#5e5e5e;font-size:11px;margin-top:4px}
.fs{border-top:1px solid #1e1e1e;padding:4px 0}
.fr{all:unset;cursor:pointer;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 10px 0 12px}
.fr:hover .l{color:#d8d8d8}
.sum{color:#d0d0d0;font-size:12px}
.chev{width:12px;height:12px;color:#686868;transition:transform .12s}
.chev.open{transform:rotate(90deg)}
.fb{padding:0 12px 6px 12px;margin:0 12px 4px;border-left:1px solid #222}
.fbr{display:flex;align-items:center;justify-content:space-between;gap:10px;height:26px}
.fbr .l{display:flex;align-items:center;gap:7px;font-size:12px}
.cbx{all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;height:24px;color:#c0c0c0;font-size:12px}
.cbx i{flex:none;width:12px;height:12px;border:1px solid #4a4a4a;border-radius:2px;box-sizing:border-box;position:relative}
.cbx.on i{background:#d8d8d8;border-color:#d8d8d8}
.cbx.on i::after{content:"";position:absolute;left:3px;top:0;width:3px;height:7px;border:solid #000;border-width:0 1.6px 1.6px 0;transform:rotate(45deg)}
.cbx.dis{opacity:.45;cursor:default}
.selw{position:relative;display:inline-flex}
.sel{appearance:none;-webkit-appearance:none;cursor:pointer;height:24px;padding:0 26px 0 8px;border:1px solid #2e2e2e;border-radius:3px;background:#0f0f0f;color:#d0d0d0;font:inherit;font-size:12px}
.sel:hover{border-color:#5a5a5a}
.selw .ic{position:absolute;right:7px;top:6px;width:11px;height:11px;color:#686868;transform:rotate(90deg);pointer-events:none}
.fsum{all:unset;cursor:pointer;display:block;padding:0 14px 12px;color:#5e5e5e;font-size:11px}
.fsum:hover{color:#a8a8a8}
.kcs{display:flex;flex-wrap:wrap;gap:6px;padding:4px 12px 8px}
.kc{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border:1px solid #262626;border-radius:11px;color:#5e5e5e;font-size:12px}
.kc .dot{opacity:.35}
.kc:hover{border-color:#5a5a5a}
.kc.on{color:#d8d8d8;border-color:#454545;background:#161616}
.kc.on .dot{opacity:1}

.dock{position:absolute;top:4px;display:flex;flex-direction:column;gap:6px}
.pn{position:relative;box-sizing:border-box;border:1px solid #454545;border-radius:4px;padding:16px 8px 6px;overflow:hidden;font-size:14px;line-height:17px;white-space:pre}
.pnt{position:absolute;top:-1px;left:12px;font-size:10px;line-height:12px;padding:0 6px;border-radius:0 0 3px 3px;background:#2a2a2a;color:#9a9a9a}
`;

// ------------------------------------------------------------------ logic

const LOGIC = (mode, dir) => `class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.mode = '${mode}';
    this.dir = '${dir}';
    this.state = { playing: true, pos: this.mode === 'run' ? 12 : 2, sp: 2, pop: null, font: 'default', theme: 'default',
      panes: { character: true, timers: true, group: true, comm: true, ui: true, map: false },
      fOpen: false, kOpen: false, cOpen: false,
      kinds: { ach: true, death: true, lvl: true, pvp: true }, all: true, chars: { Gittan: true, Rasta: true }, period: 'All time' };
  }
  componentDidMount() {
    this.tick = setInterval(() => {
      const s = this.state;
      if (!s.playing) return;
      const d = this.dur();
      const np = s.pos + [0.25, 0.5, 1, 2, 4, 8][s.sp] * 0.25;
      if (np >= d) this.setState({ pos: d, playing: false }); else this.setState({ pos: np });
    }, 250);
  }
  componentWillUnmount() { clearInterval(this.tick); }
  spots() {
    const all = [
      { kind: 'death', name: 'Rasta', label: 'Death (level 42)', date: '2026-09-26', days: 36 },
      { kind: 'ach', name: 'Rasta', label: 'That was a quick trip!', date: '2026-09-26', days: 36 },
      { kind: 'pvp', name: 'Rasta', label: '*Ibuki the Half-Elf*', date: '2026-09-26', days: 36 },
      { kind: 'ach', name: 'Gittan', label: 'Put a barrow-wight to rest.', date: '2026-09-25', days: 37 },
      { kind: 'lvl', name: 'Rasta', label: 'Level 42', date: '2026-09-26', days: 36 }
    ];
    const s = this.state;
    const lim = { 'All time': 1e9, 'Last year': 365, 'Last 3 months': 92, 'Last month': 31, 'Last week': 7 }[s.period];
    return all.filter((x) => s.kinds[x.kind] && (s.all || s.chars[x.name]) && x.days <= lim);
  }
  dur() { return this.mode === 'run' ? 122 : this.spots().length * 13; }
  renderVals() {
    const s = this.state;
    const set = (p) => this.setState(p);
    const run = this.mode === 'run';
    const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
    const SEG = 13;
    const spots = run ? [] : this.spots();
    const dur = this.dur();
    const pos = Math.min(s.pos, dur);
    const pct = (x) => (Math.max(0, Math.min(1, x)) * 100).toFixed(2) + '%';
    const fmt = (t) => { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
    const seek = (t) => set({ pos: Math.max(0, Math.min(dur, t)) });
    const pop = (k) => () => set({ pop: s.pop === k ? null : k });
    const tg = (on) => (on ? 'tg on' : 'tg');
    const KC = { death: '#d75f5f', ach: '#d7af5f', pvp: '#e0915a', lvl: '#87af87' };
    const KL = { death: 'Death', ach: 'Achievement', pvp: 'PvP kill', lvl: 'Level-up' };
    const KS = { death: 'D', ach: 'A', pvp: 'K', lvl: 'L' };
    const KI = {
      death: 'M12 3.5c-4 0-7 2.9-7 6.8 0 2.3 1.1 4.1 2.8 5.1V19a1 1 0 0 0 1 1h6.4a1 1 0 0 0 1-1v-3.6c1.7-1 2.8-2.8 2.8-5.1 0-3.9-3-6.8-7-6.8z M8.4 10.8a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0z M13 10.8a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0z M10.7 20v-2.2 M13.3 20v-2.2',
      pvp: 'M4 4l9.5 9.5 M11.5 15.5l4-4 M14 14l4.5 4.5 M20 4l-9.5 9.5 M8.5 11.5l4 4 M10 14l-4.5 4.5',
      ach: 'M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z',
      lvl: 'M6.5 12.5l5.5-5.5 5.5 5.5 M6.5 18l5.5-5.5 5.5 5.5'
    };
    const KC2 = { death: '#e06c6c', ach: '#e3b341', pvp: '#e0915a', lvl: '#7fbf7f' };
    const f = dur > 0 ? pos / dur : 0;

    let marks = run
      ? [
          { t: 64, lab: 'AL', kind: 'ach', ks: ['ach', 'lvl'], tip: 'Achievement unlocked: That was a quick trip!  ·  Level 42', to: 61 },
          { t: 110, lab: 'K', kind: 'pvp', ks: ['pvp'], tip: 'Killed *Ibuki the Half-Elf*', to: 107 },
          { t: 120, lab: 'D', kind: 'death', ks: ['death'], tip: 'Death (level 42)', to: 117 }
        ]
      : spots.map((x, i) => ({ t: i * SEG + SEG * 0.7, lab: KS[x.kind], kind: x.kind, ks: [x.kind], tip: KL[x.kind] + ': ' + x.label, to: i * SEG }));
    marks = marks.map((m) => ({ icons: m.ks.map((k) => ({ d: KI[k], c: KC2[k] })), lab: m.lab, tip: m.tip, at: pct(m.t / dur), cls: 'mk mk-' + m.kind, seek: (e) => { e.stopPropagation(); seek(m.to); } }));

    const n = spots.length;
    const cur = n ? Math.min(n - 1, Math.floor(pos / SEG)) : 0;
    const sp = spots[cur];
    const inSeg = pos - cur * SEG;
    const rem = inSeg < SEG * 0.7 ? 1 - inSeg / (SEG * 0.7) : 0;
    const segs = spots.map((x, i) => ({
      left: pct((i * SEG) / dur), w: pct(SEG / dur), c: KC[x.kind], tip: KL[x.kind] + ': ' + x.label,
      cls: i === cur ? 'sgb on' : 'sgb', seek: (e) => { e.stopPropagation(); seek(i * SEG); }
    }));

    const kindsDef = [['ach', 'Achievements'], ['death', 'Deaths'], ['lvl', 'Level-ups'], ['pvp', 'PvP kills']];
    const kOn = kindsDef.filter(([k]) => s.kinds[k]).length;
    const flipKind = (k) => () => set({ kinds: Object.assign({}, s.kinds, { [k]: !s.kinds[k] }), pos: 0 });
    const names = ['Gittan', 'Rasta'];
    const cOn = names.filter((x) => s.chars[x]);
    const periods = ['All time', 'Last year', 'Last 3 months', 'Last month', 'Last week'];

    const paneDef = [['character', 'Character'], ['timers', 'Timers'], ['group', 'Group'], ['comm', 'Comm'], ['ui', 'UI'], ['map', 'Map']];
    const themeDef = [['default', 'Default', '#000000', '#c0c0c0'], ['dark', 'Dark', '#0c0c0c', '#c0c0c0'], ['teal', 'Teal', '#0b2b2b', '#c0c0c0'], ['paper', 'Paper', '#f2ecdc', '#2a2a2a'], ['sepia', 'Sepia', '#2b2117', '#d8c8a8'], ['slate', 'Slate', '#1e242b', '#c8d0d8']];
    const th = themeDef.find((t) => t[0] === s.theme);
    const fpx = { default: 15, small: 12, medium: 15, large: 18 }[s.font];
    const runNo = pos < 62 ? 1 : 2;
    const keys = run
      ? [['Space', 'Play / pause'], ['← →', 'Back / forward 10 s'], ['Home', 'To the start'], ['1 – 6', 'Speed'], ['↑ ↓', 'Cursor line (paused)'], ['Esc', 'Back to History']]
      : [['Space', 'Play / pause'], ['← →', 'Previous / next spotlight'], ['Shift ← →', 'Back / forward 10 s'], ['Home', 'To the start'], ['1 – 6', 'Speed'], ['Esc', 'Back to the start page']];

    return {
      isPlaying: s.playing, isPaused: !s.playing,
      cur: fmt(pos), dur: fmt(dur), pct: pct(f),
      toStart: () => seek(0), back10: () => seek(pos - 10), fwd10: () => seek(pos + 10),
      playPause: () => (!s.playing && pos >= dur ? set({ pos: 0, playing: true }) : set({ playing: !s.playing })),
      seekH: (e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * dur); },
      seekV: (e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientY - r.top) / r.height) * dur); },
      marks, segs, runTick: pct(62 / 122),
      speedLabel: SPEEDS[s.sp] + '×',
      speeds: SPEEDS.map((v, i) => ({ label: v + '×', cls: i === s.sp ? 'spd on' : 'spd', pick: () => set({ sp: i, pop: null }) })).reverse(),
      isSpeed: s.pop === 'speed', isPanes: s.pop === 'panes', isView: s.pop === 'view', isKeys: s.pop === 'keys',
      speedCls: s.pop === 'speed' ? 'chip on' : 'chip', panesCls: s.pop === 'panes' ? 'ib on' : 'ib', viewCls: s.pop === 'view' ? 'ib on' : 'ib', keysCls: s.pop === 'keys' ? 'ib on' : 'ib',
      openSpeed: pop('speed'), openPanes: pop('panes'), openView: pop('view'), openKeys: pop('keys'), closePop: () => set({ pop: null }),
      paneList: paneDef.map(([id, label]) => ({ label, cls: tg(s.panes[id]), flip: () => set({ panes: Object.assign({}, s.panes, { [id]: !s.panes[id] }) }) })),
      pv: s.panes,
      resetPanes: () => set({ panes: { character: true, timers: true, group: true, comm: true, ui: true, map: false } }),
      fonts: [['default', 'Default'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']].map(([id, label]) => ({ label, cls: s.font === id ? 'sg on' : 'sg', pick: () => set({ font: id }) })),
      themes: themeDef.map(([id, label, bg]) => ({ label, bg, cls: s.theme === id ? 'swb on' : 'swb', pick: () => set({ theme: id }) })),
      boardBg: th[2], outFg: th[3], outFs: fpx + 'px', outLh: (fpx + 2) + 'px',
      keys: keys.map(([k, a]) => ({ k, a })),
      spotHdr: n ? 'Spotlight ' + (cur + 1) + ' / ' + n + '  ·  ' + sp.date : 'No spotlights', spotWho: sp ? sp.name : 'Spotlights',
      runNo, runDate: runNo === 1 ? '2026-09-26 21:00' : '2026-09-26 22:02',

      hasSpots: n > 0, noSpots: n === 0, nSpots: n,
      cnt: n ? 'Spotlight ' + (cur + 1) + ' / ' + n : 'Spotlight 0 / 0',
      kindIcon: sp ? KI[sp.kind] : '', kindColor2: sp ? KC2[sp.kind] : '#555',
      speedDown: () => s.sp > 0 && set({ sp: s.sp - 1 }), speedUp: () => s.sp < 5 && set({ sp: s.sp + 1 }),
      sdCls: s.sp > 0 ? 'ib sm' : 'ib sm dis', suCls: s.sp < 5 ? 'ib sm' : 'ib sm dis',
      kindLabel: sp ? KL[sp.kind] : '', kindColor: sp ? KC[sp.kind] : '#555', label: sp ? sp.label : '', meta: sp ? sp.name + '  ·  ' + sp.date : '',
      prevCls: n && cur > 0 ? 'ib' : 'ib dis', nextCls: n && cur < n - 1 ? 'ib' : 'ib dis',
      prev: () => cur > 0 && seek((cur - 1) * SEG), next: () => cur < n - 1 && seek((cur + 1) * SEG),
      cdShow: rem > 0, cdSide: pct((1 - rem) / 2),

      fOpen: s.fOpen, fClosed: !s.fOpen, flipF: () => set({ fOpen: !s.fOpen }), filterCls: s.fOpen ? 'ib on' : 'ib',
      kOpen: s.kOpen, cOpen: s.cOpen, flipK: () => set({ kOpen: !s.kOpen }), flipC: () => set({ cOpen: !s.cOpen }),
      kChev: s.kOpen ? 'ic chev open' : 'ic chev', cChev: s.cOpen ? 'ic chev open' : 'ic chev',
      kinds: kindsDef.map(([k, label]) => ({ label, d: KI[k], c2: KC2[k], c: KC[k], cls: tg(s.kinds[k]), chip: s.kinds[k] ? 'kc on' : 'kc', flip: flipKind(k) })),
      kindsSum: kOn === 4 ? 'All' : kOn === 0 ? 'None' : kOn + ' of 4',
      allCls: tg(s.all), flipAll: () => set({ all: !s.all, pos: 0 }),
      chars: names.map((x) => ({ name: x, cls: 'cbx' + (s.all || s.chars[x] ? ' on' : '') + (s.all ? ' dis' : ''), flip: () => !s.all && set({ chars: Object.assign({}, s.chars, { [x]: !s.chars[x] }), pos: 0 }) })),
      charsSum: s.all ? 'All' : cOn.length ? cOn.join(', ') : 'None',
      period: s.period, periods: periods.map((v) => ({ v })), setPeriod: (e) => set({ period: e.target.value, pos: 0 }),
      fSummary: (kOn === 4 ? 'All kinds' : kOn + ' kinds') + '  ·  ' + (s.all ? 'All characters' : cOn.join(', ') || 'No characters') + '  ·  ' + s.period
    };
  }
}`;

// ------------------------------------------------------------------ parts

const TIME = `<span class="time"><b>{{cur}}</b> / {{dur}}</span>`;
const PLAY = `<button type="button" class="pl" aria-label="Play or pause" title="Play / pause (Space)" onClick="{{playPause}}"><sc-if value="{{isPlaying}}" hint-placeholder-val="{{true}}">${ic(P.pause, 'ic bars')}</sc-if><sc-if value="{{isPaused}}" hint-placeholder-val="{{false}}">${ic(P.play, 'ic fill')}</sc-if></button>`;
const TRANSPORT = (spot) =>
  btn('To the start (Home)', ic(P.start), 'ib', 'toStart') +
  btn(spot ? 'Back 10 s (Shift+←)' : 'Back 10 s (←)', ic10(P.back), 'ib', 'back10') +
  PLAY +
  btn(spot ? 'Forward 10 s (Shift+→)' : 'Forward 10 s (→)', ic10(P.fwd), 'ib', 'fwd10');
const SPEED = `<button type="button" class="{{speedCls}}" aria-label="Speed" title="Speed (1–6)" onClick="{{openSpeed}}">{{speedLabel}}</button>`;
const PANES_BTN = `<button type="button" class="{{panesCls}}" aria-label="Panes" title="Panes" onClick="{{openPanes}}">${ic(P.panes)}</button>`;
const VIEW_BTN = `<button type="button" class="{{viewCls}}" aria-label="Display settings" title="Display: font size and colours" onClick="{{openView}}">${ic(P.view)}</button>`;
const KEYS_BTN = `<button type="button" class="{{keysCls}}" aria-label="Keys" title="Keys" onClick="{{openKeys}}">${ic(P.keys)}</button>`;
const CLOSE_BTN = (spot) => btn(spot ? 'Back to the start page (Esc)' : 'Back to History (Esc)', ic(P.close), 'ib', '');

const popHead = (t) => `<div class="ph"><span class="pt">${t}</span><button type="button" class="x" aria-label="Close" onClick="{{closePop}}">${ic(P.close)}</button></div>`;
const POP_PANES = (style = '') => `<sc-if value="{{isPanes}}" hint-placeholder-val="{{false}}"><div class="pop glass ui" role="dialog" aria-label="Panes"${style}>${popHead('Panes')}
<sc-for list="{{paneList}}" as="p" hint-placeholder-count="6"><div class="r"><span class="l">{{p.label}}</span><button type="button" class="{{p.cls}}" aria-label="{{p.label}}" onClick="{{p.flip}}"><i></i></button></div></sc-for>
<div class="btns"><button type="button" class="gb" onClick="{{resetPanes}}">Reset layout</button></div></div></sc-if>`;
const POP_VIEW = (style = '') => `<sc-if value="{{isView}}" hint-placeholder-val="{{false}}"><div class="pop glass ui" role="dialog" aria-label="Display"${style}>${popHead('Display')}
<div class="sub">Font size</div><div class="seg"><sc-for list="{{fonts}}" as="o" hint-placeholder-count="4"><button type="button" class="{{o.cls}}" onClick="{{o.pick}}">{{o.label}}</button></sc-for></div>
<div class="sub">Colours</div><div class="sws"><sc-for list="{{themes}}" as="t" hint-placeholder-count="6"><button type="button" class="{{t.cls}}" onClick="{{t.pick}}"><span class="swd" style="background: {{t.bg}}"></span>{{t.label}}</button></sc-for></div></div></sc-if>`;
const POP_KEYS = (style = '') => `<sc-if value="{{isKeys}}" hint-placeholder-val="{{false}}"><div class="pop glass ui" role="dialog" aria-label="Keys"${style}>${popHead('Keys')}
<div class="kpad"><sc-for list="{{keys}}" as="k" hint-placeholder-count="6"><div class="kr"><span class="kk"><span>{{k.k}}</span></span><span class="ka">{{k.a}}</span></div></sc-for></div></div></sc-if>`;
const POP_SPEED = (left) => `<sc-if value="{{isSpeed}}" hint-placeholder-val="{{false}}"><div class="pop glass ui spop" role="menu" aria-label="Speed" style="right: auto; left: ${left}px"><sc-for list="{{speeds}}" as="o" hint-placeholder-count="6"><button type="button" class="{{o.cls}}" role="menuitemradio" onClick="{{o.pick}}">{{o.label}}</button></sc-for></div></sc-if>`;

// Horizontal timeline: markers above a thin track, a gold playhead.
const TL_CSS = `
.tl{position:relative;height:30px;cursor:pointer}
.tl-tr{position:absolute;left:0;right:0;top:19px;height:3px;background:#262626;border-radius:2px}
.tl-dn{position:absolute;left:0;top:19px;height:3px;background:#5e5e5e;border-radius:2px}
.tl-hd{position:absolute;top:14px;width:3px;height:13px;margin-left:-1px;background:#ffb000;border-radius:1px;box-shadow:0 0 6px rgba(255,176,0,.45)}
.tl-rn{position:absolute;top:16px;width:1px;height:9px;background:#5a5a5a}
.tl .mk{top:0;transform:translateX(-50%)}
.sgb{all:unset;cursor:pointer;position:absolute;top:17px;height:7px;border-radius:2px;opacity:.35}
.sgb:hover{opacity:.7}
.sgb.on{opacity:.9}
`;
const TIMELINE = (spot) => `<div class="tl" onClick="{{seekH}}" title="Click to jump">
<div class="tl-tr"></div>
${spot ? `<sc-for list="{{segs}}" as="g" hint-placeholder-count="5"><button type="button" class="{{g.cls}}" style="left: {{g.left}}; width: calc({{g.w}} - 3px); background: {{g.c}}" title="{{g.tip}}" aria-label="{{g.tip}}" onClick="{{g.seek}}"></button></sc-for>` : `<div class="tl-dn" style="width: {{pct}}"></div><div class="tl-rn" style="left: {{runTick}}" title="Run 2 starts"></div>`}
<sc-for list="{{marks}}" as="m" hint-placeholder-count="3"><button type="button" class="{{m.cls}}" style="left: {{m.at}}" title="{{m.tip}}" aria-label="{{m.tip}}" onClick="{{m.seek}}">{{m.lab}}</button></sc-for>
<div class="tl-hd" style="left: {{pct}}"></div>
</div>`;

// Vertical rail at the right edge (direction A), as today's strip.
const RAIL_CSS = `
.rail{position:absolute;right:10px;top:10px;bottom:10px;width:4px;background:#1c1c1c;border-radius:2px;cursor:pointer}
.rail-dn{position:absolute;left:0;right:0;top:0;background:#4e4e4e;border-radius:2px}
.rail-hd{position:absolute;left:-5px;width:14px;height:3px;margin-top:-1px;background:#ffb000;border-radius:1px;box-shadow:0 0 6px rgba(255,176,0,.45)}
.rmk{position:absolute;right:22px;top:10px;bottom:10px;width:0}
.rmk .mk{right:0;transform:translateY(-50%)}
`;
const RAIL = `<div class="rail" onClick="{{seekV}}" title="Click to jump"><div class="rail-dn" style="height: {{pct}}"></div><div class="rail-hd" style="top: {{pct}}"></div></div>
<div class="rmk"><sc-for list="{{marks}}" as="m" hint-placeholder-count="5"><button type="button" class="{{m.cls}}" style="top: {{m.at}}" title="{{m.tip}}" aria-label="{{m.tip}}" onClick="{{m.seek}}">{{m.lab}}</button></sc-for></div>`;

// ---------------------------------------------------- spotlight info card

const CARD_HEAD = (extra = '') => `<div class="ch"><button type="button" class="{{prevCls}}" aria-label="Previous spotlight" title="Previous (←)" onClick="{{prev}}">${ic(P.prev)}</button><span class="cnt">{{cnt}}</span><button type="button" class="{{nextCls}}" aria-label="Next spotlight" title="Next (→)" onClick="{{next}}">${ic(P.next)}</button><span class="grow"></span>${extra}</div>`;
const CARD_BODY = `<sc-if value="{{hasSpots}}" hint-placeholder-val="{{true}}"><div class="cb"><div class="kind"><span class="dot" style="background: {{kindColor}}"></span>{{kindLabel}}</div><div class="lab">{{label}}</div><div class="meta">{{meta}}</div></div>
<div class="cd"><sc-if value="{{cdShow}}" hint-placeholder-val="{{true}}"><i style="left: {{cdSide}}; right: {{cdSide}}"></i></sc-if></div></sc-if>
<sc-if value="{{noSpots}}" hint-placeholder-val="{{false}}"><div class="empty">No spotlights match your settings.<small>Change the kinds, characters or period below.</small></div></sc-if>`;
const FOLD_KINDS = `<button type="button" class="fr" onClick="{{flipK}}" aria-expanded="{{kOpen}}"><svg class="{{kChev}}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P.chev}"></path></svg><span class="l">Kinds</span><span class="grow"></span><span class="sum">{{kindsSum}}</span></button>
<sc-if value="{{kOpen}}" hint-placeholder-val="{{false}}"><div class="fb"><sc-for list="{{kinds}}" as="k" hint-placeholder-count="4"><div class="fbr"><span class="l"><span class="dot" style="background: {{k.c}}"></span>{{k.label}}</span><button type="button" class="{{k.cls}}" aria-label="{{k.label}}" onClick="{{k.flip}}"><i></i></button></div></sc-for></div></sc-if>`;
const FOLD_CHARS = `<button type="button" class="fr" onClick="{{flipC}}" aria-expanded="{{cOpen}}"><svg class="{{cChev}}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P.chev}"></path></svg><span class="l">Characters</span><span class="grow"></span><span class="sum">{{charsSum}}</span></button>
<sc-if value="{{cOpen}}" hint-placeholder-val="{{false}}"><div class="fb"><div class="fbr"><span class="l">All characters</span><button type="button" class="{{allCls}}" aria-label="All characters" onClick="{{flipAll}}"><i></i></button></div>
<sc-for list="{{chars}}" as="c" hint-placeholder-count="2"><button type="button" class="{{c.cls}}" onClick="{{c.flip}}"><i></i>{{c.name}}</button></sc-for></div></sc-if>`;
const PERIOD = `<div class="r"><span class="l">Period</span><span class="selw"><select class="sel" aria-label="Period" value="{{period}}" onChange="{{setPeriod}}"><sc-for list="{{periods}}" as="o" hint-placeholder-count="5"><option value="{{o.v}}">{{o.v}}</option></sc-for></select>${ic(P.chev)}</span></div>`;
const CHIPS = `<div class="sub">Kinds</div><div class="kcs"><sc-for list="{{kinds}}" as="k" hint-placeholder-count="4"><button type="button" class="{{k.chip}}" onClick="{{k.flip}}"><span class="dot" style="background: {{k.c}}"></span>{{k.label}}</button></sc-for></div>`;

const CARD = {
  A: `<div class="card glass ui" style="position: absolute; top: 14px; right: 44px; width: 330px">${CARD_HEAD()}${CARD_BODY}<div class="fs">${FOLD_KINDS}${FOLD_CHARS}${PERIOD}</div></div>`,
  B: `<div class="card glass ui" style="position: absolute; top: 14px; right: 16px; width: 330px">${CARD_HEAD(`<button type="button" class="{{filterCls}}" aria-label="Filter" title="Kinds, characters, period" onClick="{{flipF}}">${ic(P.filter)}</button>`)}${CARD_BODY}
<sc-if value="{{fClosed}}" hint-placeholder-val="{{true}}"><button type="button" class="fsum" onClick="{{flipF}}">{{fSummary}}</button></sc-if>
<sc-if value="{{fOpen}}" hint-placeholder-val="{{false}}"><div class="fs">${FOLD_KINDS}${FOLD_CHARS}${PERIOD}</div></sc-if></div>`,
  C: `<div class="card glass ui" style="position: absolute; top: 14px; right: 16px; width: 360px">${CARD_HEAD()}${CARD_BODY}<div class="fs">${CHIPS}${FOLD_CHARS}${PERIOD}</div></div>`,
};

// ------------------------------------------------------------- game text

const L = (t, c = '') => `<div${c ? ` class="${c}"` : ''}>${t}</div>`;
const RUN_TEXT = [
  L('[SYSTEM] Rasta logged in.', 'sys'), L('Reconnecting.'), L(''),
  L('Rivendell Stables', 'rn'), L('Fresh straw and the smell of horses. A path leads south.'),
  L('A citizen mercenary (MERC) stands here, guarding you.'), L('Exits: south.'), L(''),
  L('*&gt;'), L(`Norsy tells you 'bats first, then the rangers?'`, 'tell'), L(''),
  L('*&gt; <span class="ech">tell norsy sure, meet at the ford</span>'), L(`You tell Norsy 'sure, meet at the ford'`, 'tell'), L(''),
  L('*&gt; <span class="ech">s</span>'), L('The Courtyard', 'rn'), L('A wide courtyard paved with smooth grey stones. The Last Homely'),
  L('House rises to the north; a gate opens to the south.'), L('Exits: north, south.'), L(''),
  L('*&gt; <span class="ech">s</span>'), L('The Ford of Bruinen', 'rn'), L('The river runs shallow and loud over the stones here.'),
  L('Norsy is standing here.', 'mob'), L('Exits: north, west.'), L(''), L('*&gt;'),
].join('\n');
const SPOT_TEXT = [
  L('*&gt; <span class="ech">e</span>'), L('A Dark Cave', 'rn'), L('The air is thick and smells of old bones. Water drips somewhere.'),
  L('A stone-troll is standing here, picking its teeth.', 'mob'), L('Exits: west.'), L(''),
  L('* HP:Healthy R:Healthy&gt; <span class="ech">kill troll</span>'), L(`You slash a stone-troll's body hard.`),
  L('A stone-troll crushes you very hard.', 'hit'), L(`You slash a stone-troll's left leg.`), L(''),
  L('* HP:Wounded R:Healthy troll:Fine&gt;'), L('A stone-troll crushes you extremely hard.', 'hit'),
  L('A stone-troll crushes you very hard.', 'hit'), L(''), L('* HP:Hurt R:Healthy troll:Fine&gt;'),
].join('\n');
const OUT = (spot, bottom) =>
  `<div class="out" style="${spot ? `bottom: ${bottom}px` : 'top: 2px'}; color: {{outFg}}; font-size: {{outFs}}; line-height: {{outLh}}">${spot ? SPOT_TEXT : RUN_TEXT}</div>`;

// The run log's docked panes (simplified), each hidden from the Panes menu.
const pane = (id, title, border, bg, body, h) =>
  `<sc-if value="{{pv.${id}}}" hint-placeholder-val="{{true}}"><div class="pn" style="flex: ${h ? `0 0 ${h}px` : '1 1 0'}; border-color: ${border}; background: ${bg}"><span class="pnt">${title}</span>${body}</div></sc-if>`;
const DOCK = (right, bottom, width) => `<div class="dock" style="right: ${right}px; bottom: ${bottom}px; width: ${width}px">
${pane('character', 'Character', '#5a5a5a', '#0b0b0b', 'Rasta                L41\nMood  brave   Alert normal\nPos   standing  Wimpy  40', 76)}
${pane('timers', 'Timers', '#7a4040', '#140b0b', '<span style="color: #8a6a6a">no timers</span>', 60)}
${pane('group', 'Group', '#3f6a3f', '#0b120b', '<span style="color: #9ad09a">Norsy</span>\n<span style="color: #9ad09a">a citizen mercenary (MERC)</span>', 70)}
${pane('comm', 'Comm', '#3f557a', '#0b0e14', `<span style="color: #d7af5f">Nar</span> <span style="color: #5faf5f">Tel</span> <span style="color: #5fafaf">Sa</span> <span style="color: #af5faf">Ye</span>\n\n<span style="color: #d7875f">Norsy</span> <span style="color: #5faf5f">tells</span> you 'bats first,\nthen the rangers?'`, 0)}
${pane('ui', 'UI', '#4a4a4a', '#0a0a0a', '', 60)}
${pane('map', 'Map', '#4a4a4a', '#0a0a0a', '<span style="color: #5e5e5e">[map]</span>', 120)}
</div>`;

// ------------------------------------------------------------------ boards

function board(dir, mode) {
  const spot = mode === 'spot';
  let body = '';
  let css = CSS;
  if (dir === 'A') {
    css += RAIL_CSS + `
.boxA{position:absolute;right:44px;bottom:12px;width:${spot ? 412 : 416}px;padding:6px 6px 6px 10px}
.boxA .t1{display:flex;align-items:center;gap:6px;height:26px;padding-right:0}
`;
    const head = spot ? '' : `<div class="t1"><span class="ttl"><b>Rasta</b> L42  ·  Run {{runNo}} of 2  ·  {{runDate}}</span><span class="grow"></span>${KEYS_BTN}${CLOSE_BTN(false)}</div>`;
    const tail = spot ? `<span class="vs"></span>${VIEW_BTN}${KEYS_BTN}${CLOSE_BTN(true)}` : `<span class="vs"></span>${PANES_BTN}${VIEW_BTN}`;
    body = `${spot ? OUT(true, 12) : OUT(false)}
${spot ? '' : DOCK(44, 96, 360)}
${spot ? CARD.A : ''}
${RAIL}
<div class="boxA glass ui">${head}<div class="row">${TRANSPORT(spot)}<span style="width: 6px"></span>${SPEED}<span style="width: 8px"></span>${TIME}<span class="grow"></span>${tail}</div>
${spot ? '' : POP_PANES()}${POP_VIEW()}${POP_KEYS()}${POP_SPEED(118)}</div>`;
  } else if (dir === 'B') {
    css += TL_CSS + `
.boxB{position:absolute;right:${spot ? 16 : 396}px;bottom:12px;width:600px;padding:6px 8px 6px 12px}
.boxB .t1{display:flex;align-items:center;gap:6px;height:26px}
`;
    const title = spot
      ? `<span class="ttl"><b>Spotlights</b>  ·  {{nSpots}} in the reel</span>`
      : `<span class="ttl"><b>Rasta</b> L42  ·  Run {{runNo}} of 2  ·  {{runDate}}</span>`;
    body = `${OUT(true, 108)}
${spot ? '' : DOCK(4, 4, 380)}
${spot ? CARD.B : ''}
<div class="boxB glass ui"><div class="t1">${title}<span class="grow"></span>${KEYS_BTN}${CLOSE_BTN(spot)}</div>
${TIMELINE(spot)}
<div class="row">${TRANSPORT(spot)}<span style="width: 10px"></span>${TIME}<span class="grow"></span>${SPEED}<span class="vs"></span>${spot ? '' : PANES_BTN}${VIEW_BTN}</div>
${spot ? '' : POP_PANES()}${POP_VIEW()}${POP_KEYS()}${POP_SPEED(spot ? 499 : 471)}</div>`;
    if (!spot) body = body.replace(OUT(true, 108), OUT(false));
  } else {
    css += TL_CSS + `
.barC{position:absolute;left:0;right:0;bottom:0;height:78px;box-sizing:border-box;padding:4px 16px 6px;background:rgba(10,10,10,.97);border-top:1px solid #222}
.barC .pop{right:16px}
.barC .row{height:36px}
.barC .mid{flex:1;text-align:center}
`;
    const title = spot
      ? `<span class="ttl"><b>Spotlights</b>  ·  {{nSpots}} in the reel</span>`
      : `<span class="ttl"><b>Rasta</b> L42  ·  Run {{runNo}} of 2  ·  {{runDate}}</span>`;
    body = `${spot ? OUT(true, 86) : OUT(false)}
${spot ? '' : DOCK(4, 84, 380)}
${spot ? CARD.C : ''}
<div class="barC ui">${TIMELINE(spot)}
<div class="row">${TRANSPORT(spot)}<span style="width: 10px"></span>${TIME}<span class="mid">${title}</span>${SPEED}<span class="vs"></span>${spot ? '' : PANES_BTN}${VIEW_BTN}${KEYS_BTN}<span class="vs"></span>${CLOSE_BTN(spot)}</div>
${spot ? '' : POP_PANES()}${POP_VIEW()}${POP_KEYS()}${POP_SPEED(spot ? 1266 : 1238)}</div>`;
  }
  const names = { A: 'Kompakt ruta', B: 'Tidslinje i rutan', C: 'Bottenlist' };
  const title = `32 · ${dir} ${names[dir]} · ${spot ? 'Spotlights' : 'Run log'}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>${css}</style>
</helmet>
<div class="board" style="background: {{boardBg}}">
${body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1440,"height":820}}'>
${LOGIC(mode, dir)}
</script>
</body>
</html>
`;
}

export const BOARDS = [];
for (const dir of ['A', 'B', 'C']) for (const mode of ['spot', 'run']) {
  const file = `Player32${dir}-${mode === 'spot' ? 'spotlights' : 'runlog'}.dc.html`;
  BOARDS.push({ dir, mode, file });
  writeFileSync(`${S}/canvas/project/${file}`, board(dir, mode));
}
console.log(BOARDS.map((b) => b.file).join('\n'));

// ------------------------------------------------- A2: the owner's pick, revised
// (2026-11-01): speed with ◄ ► beside it; the header line with the key
// hints stays (no Keys menu); kind icons in colour in the card, the filter
// and on the rail (instead of letters); the rail as in A.

const A2_CSS = `
.hdr{position:absolute;top:0;left:0;height:22px;display:flex;justify-content:center;align-items:center;gap:28px;font-size:12px;color:#646464;white-space:pre;pointer-events:none}
.hdr span{background:rgba(0,0,0,.82);padding:0 8px;border-radius:3px}
.hdr b{color:#c8c8c8;font-weight:400}
.boxA{position:absolute;right:44px;bottom:12px;padding:6px 6px 6px 10px}
.ib.sm{width:20px;height:24px}
.ib.sm .ic{width:12px;height:12px;stroke-width:2}
.spdc{display:flex;align-items:center;border:1px solid #262626;border-radius:4px;height:26px;margin-left:4px}
.spv{min-width:38px;text-align:center;color:#d0d0d0;font-size:12px}
.mi{all:unset;cursor:pointer;position:absolute;right:0;transform:translateY(-50%);display:flex;gap:1px;padding:2px 3px;border-radius:3px;background:rgba(0,0,0,.6)}
.mi:hover{background:#1e1e1e}
.mi svg,.ki{width:14px;height:14px;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.ki{flex:none;width:15px;height:15px}
.fbr .ki{width:13px;height:13px}
`;

const A2_RAIL = `<div class="rail" onClick="{{seekV}}" title="Click to jump"><div class="rail-dn" style="height: {{pct}}"></div><div class="rail-hd" style="top: {{pct}}"></div></div>
<div class="rmk"><sc-for list="{{marks}}" as="m" hint-placeholder-count="5"><button type="button" class="mi" style="top: {{m.at}}" title="{{m.tip}}" aria-label="{{m.tip}}" onClick="{{m.seek}}"><sc-for list="{{m.icons}}" as="k" hint-placeholder-count="1"><svg viewBox="0 0 24 24" aria-hidden="true" style="stroke: {{k.c}}"><path d="{{k.d}}"></path></svg></sc-for></button></sc-for></div>`;
const A2_SPEED = `<span class="spdc"><button type="button" class="{{sdCls}}" aria-label="Slower" title="Slower" onClick="{{speedDown}}">${ic(P.prev)}</button><span class="spv" title="Speed (1–6)">{{speedLabel}}</span><button type="button" class="{{suCls}}" aria-label="Faster" title="Faster" onClick="{{speedUp}}">${ic(P.next)}</button></span>`;
const KICON = (d, c, cls = 'ki') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" style="stroke: ${c}"><path d="${d}"></path></svg>`;
const A2_BODY = CARD_BODY.replace('<span class="dot" style="background: {{kindColor}}"></span>', KICON('{{kindIcon}}', '{{kindColor2}}'))
  .replace('<div class="kind">', '<div class="kind" style="color: {{kindColor2}}">');
const A2_KINDS = FOLD_KINDS.replace('<span class="dot" style="background: {{k.c}}"></span>', KICON('{{k.d}}', '{{k.c2}}'));
const A2_CARD = `<div class="card glass ui" style="position: absolute; top: 26px; right: 44px; width: 330px">${CARD_HEAD()}${A2_BODY}<div class="fs">${A2_KINDS}${FOLD_CHARS}${PERIOD}</div></div>`;

function boardA2(mode) {
  const spot = mode === 'spot';
  const hdr = spot
    ? `<div class="hdr" style="right: 44px"><span><b>{{spotWho}}</b>  ·  {{spotHdr}}</span><span>Space Play/Pause  ·  ← → Prev/next  ·  Shift ← → 10 s  ·  1–6 Speed  ·  Esc Back</span></div>`
    : `<div class="hdr" style="right: 410px"><span><b>Rasta</b> (L42)  ·  Run {{runNo}} of 2  ·  {{runDate}}</span><span>Space Play/Pause  ·  ← → 10 s  ·  1–6 Speed  ·  ↑↓ Cursor  ·  Esc Back</span></div>`;
  const tail = spot ? `<span class="vs"></span>${VIEW_BTN}${CLOSE_BTN(true)}` : `<span class="vs"></span>${PANES_BTN}${VIEW_BTN}${CLOSE_BTN(false)}`;
  const body = `${spot ? OUT(true, 12) : OUT(false).replace('top: 2px', 'top: 24px')}
${spot ? '' : DOCK(44, 70, 360)}
${spot ? A2_CARD : ''}
${hdr}
${A2_RAIL}
<div class="boxA glass ui"><div class="row">${TRANSPORT(spot)}${A2_SPEED}<span style="width: 10px"></span>${TIME}<span style="flex: 1; min-width: 12px"></span>${tail}</div>
${spot ? '' : POP_PANES()}${POP_VIEW()}</div>`;
  const title = `32 · A2 Kompakt, reviderad · ${spot ? 'Spotlights' : 'Run log'}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>${CSS + RAIL_CSS + A2_CSS}</style>
</helmet>
<div class="board" style="background: {{boardBg}}">
${body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1440,"height":820}}'>
${LOGIC(mode, 'A')}
</script>
</body>
</html>
`;
}
for (const mode of ['spot', 'run']) {
  const file = `Player32A2-${mode === 'spot' ? 'spotlights' : 'runlog'}.dc.html`;
  writeFileSync(`${S}/canvas/project/${file}`, boardA2(mode));
  console.log(file);
}
