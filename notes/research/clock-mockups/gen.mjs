// Generates the 31a clock artboards (static markup) and local preview pages.
import { writeFileSync } from 'node:fs';
const S = process.argv[2];
const SUN = 'M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7z M12 2v2.5 M12 19.5V22 M2 12h2.5 M19.5 12H22 M4.9 4.9l1.8 1.8 M17.3 17.3l1.8 1.8 M4.9 19.1l1.8-1.8 M17.3 6.7l1.8-1.8';
const MOON = 'M20.5 14.2A8.6 8.6 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z';
// The moon's ink sits low in its box; this one is moved up 0.6 so its centre is the box's centre.
const MOON_C = 'M20.5 13.6A8.6 8.6 0 1 1 9.8 2.9a6.8 6.8 0 0 0 10.7 10.7z';
const ICONS = [
  { id: 'profile', label: 'Profile', gap: true, d: 'M12 4a4 4 0 1 1 0 8a4 4 0 1 1 0-8z M4.5 20.5c0-4.2 3.4-6.3 7.5-6.3s7.5 2.1 7.5 6.3' },
  { id: 'scripts', label: 'Scripts', d: 'M9 20h9a2 2 0 0 0 2-2v-1h-9v1a2 2 0 0 1-4 0V6a2 2 0 0 0-4 0v2h4 M5 4h12a2 2 0 0 1 2 2v11 M10.5 8.5h5 M10.5 12h5' },
  { id: 'panes', label: 'Panes', d: 'M4 4h16v16H4z M14 4v16 M14 12h6' },
  { id: 'settings', label: 'Settings', d: 'M4 7h9 M17 7h3 M15 4.5v5 M4 12h3 M11 12h9 M9 9.5v5 M4 17h11 M19 17h1 M17 14.5v5' },
  { id: 'full', label: 'Fullscreen', gap: true, d: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5' },
  { id: 'exit', label: 'Exit', d: 'M12 3v8 M6.6 6.6a7.6 7.6 0 1 0 10.8 0' },
];
const svg = (cls, d) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"></path></svg>`;
const rest = ICONS.map((i) => `${i.gap ? '<span class="sep"></span>' : ''}<button type="button" class="mb" aria-label="${i.label}">${svg('ic', i.d)}</button>`).join('');

// Arc (F): a semicircle 3 cells wide, the orb at fraction f of the period.
function arc(f) {
  const a = Math.PI * f, x = (13.5 - 10.5 * Math.cos(a)).toFixed(2), y = (14 - 10.5 * Math.sin(a)).toFixed(2);
  return `<svg class="arc" viewBox="0 0 27 17" aria-hidden="true"><path class="arc-rest" d="M3 14A10.5 10.5 0 0 1 24 14"></path><path class="arc-done" d="M3 14A10.5 10.5 0 0 1 ${x} ${y}"></path><circle class="orb" cx="${x}" cy="${y}" r="2.4"></circle><path class="arc-hz" d="M1 14.5h25"></path></svg>`;
}

// One clock, by variant. per: day | night; time; f: fraction of the period gone.
function clock(v, per, time, f, extra = '') {
  const day = per === 'day';
  const ic = day ? SUN : MOON;
  const icC = day ? SUN : MOON_C;
  const cls = `clk ${v} ${per}${extra ? ' ' + extra : ''}`;
  switch (v) {
    case 'now': return `<div class="${cls}"><span class="t">${time.padStart(5)}</span><span class="slot">${svg('ci', ic)}</span></div>`;
    case 'a': case 'b': case 'c': return `<div class="${cls}"><span class="t">${time}</span>${svg('ci', icC)}</div>`;
    case 'd': return `<div class="${cls}">${svg('ci', icC)}<span class="t">${time}</span></div>`;
    case 'e': return `<div class="${cls}"><span class="t">${time}</span><span class="trk"><span class="done" style="width: ${f * 100}%"></span><span class="orb" style="left: ${f * 100}%"></span></span></div>`;
    case 'f': return `<div class="${cls}">${arc(f)}<span class="t">${time}</span></div>`;
    case 'g': return `<div class="${cls}"><span class="chip">${svg('ci', icC)}<span class="t">${time}</span></span></div>`;
  }
}
const bar = (c) => `<div class="mn">${c}${rest}</div>`;
const zoom = (c, cap) => `<div class="zc"><div class="z"><div class="zin">${bar(c)}<span class="rimcut"></span></div></div><div class="cap">${cap}</div></div>`;
const real = (c, cap) => `<div class="zc"><div class="scene"><div class="gl">* o Mana:Burning&gt;</div><div class="ir"><span class="in">&gt; look<span class="caret"></span></span>${bar(c)}<span class="rimcut"></span></div></div><div class="cap">${cap}</div></div>`;

const ROWS = {
  small: [
    { v: 'now', name: 'Nu', desc: 'Som i dag: fet vit tid i full storlek, solen och månen i full färg, månen sitter lite lågt.', inst: [['day', '4:33', 0.4], ['night', '1:12', 0.7]] },
    { v: 'a', name: 'A · Tonad', desc: 'Tiden i vanlig vikt, mindre och ljusgrå (som spelets text). Solen och månen lika stora och lika tunna som de andra ikonerna, färgen lite dämpad, mitt i raden.', inst: [['day', '4:33', 0.4], ['night', '1:12', 0.7]] },
    { v: 'b', name: 'B · Spökgrå', desc: 'Klockan blir en spökikon som de andra: grå tid, solen och månen bara svagt färgade. Hovra så tänds den (vit tid, full färg), precis som ikonerna.', inst: [['day', '4:33', 0.4], ['night', '1:12', 0.7], ['day', '4:33', 0.4, 'hot', 'hovrad']] },
    { v: 'c', name: 'C · Periodens färg', desc: 'Ingen vit text alls: tiden tar solens bärnsten på dagen och månens blå på natten, dämpat. Klocka och ikon blir en enhet.', inst: [['day', '4:33', 0.4], ['night', '1:12', 0.7]] },
  ],
  big: [
    { v: 'd', name: 'D · Lugn tills skiftet', desc: 'Helt grå, ikonen först som de andra knapparna. Den sista minuten före skiftet tänds den i periodens färg som en påminnelse.', inst: [['day', '4:33', 0.4], ['day', '0:42', 0.97, 'near', 'sista minuten'], ['night', '1:12', 0.7]] },
    { v: 'e', name: 'E · Horisontlinje', desc: 'Ingen ikon. En tunn linje (5 rutor) där solen eller månen, som en prick, vandrar från vänster till höger under perioden. Tiden liten och grå framför. 2 rutor bredare än i dag.', inst: [['day', '4:33', 0.4], ['night', '1:12', 0.7]] },
    { v: 'f', name: 'F · Solbåge', desc: 'Ett litet solur: solen (eller månen) följer en båge över horisonten, den gångna delen ljusare. Tiden grå efter bågen. Samma bredd som i dag.', inst: [['day', '4:33', 0.4], ['night', '1:12', 0.7]] },
    { v: 'g', name: 'G · Bricka', desc: 'Klockan i en svagt nedsänkt bricka, som en liten display i panelen: dämpad ikon och tid i liten storlek. Skild från knapparna, men lågmäld.', inst: [['day', '4:33', 0.4], ['night', '1:12', 0.7]] },
  ],
};

const CSS = `
body{margin:0;background:#050505}
.board{width:1440px;box-sizing:border-box;padding:36px 48px 40px;background:#050505;color:#c0c0c0;font-family:Hack,"DejaVu Sans Mono","JetBrains Mono",ui-monospace,monospace;font-size:15px;line-height:17px;display:flex;flex-direction:column;gap:22px}
.hd{font-family:system-ui,sans-serif;color:#9a9a9a;font-size:13px;line-height:18px;max-width:1100px}
.row{display:flex;gap:36px;align-items:flex-start;padding-top:22px;border-top:1px solid #161616}
.lab{flex:0 0 250px;font-family:system-ui,sans-serif}
.name{color:#e6e6e6;font-size:17px;line-height:22px;font-weight:600;margin-bottom:6px}
.desc{color:#8f8f8f;font-size:13px;line-height:18px}
.zs{display:flex;flex-direction:column;gap:12px;flex:0 0 auto}
.rs{display:flex;flex-direction:column;gap:12px;flex:0 0 auto}
.zc{display:flex;flex-direction:column;gap:4px}
.cap{font-family:system-ui,sans-serif;font-size:11px;line-height:14px;color:#5f5f5f}
.z{zoom:2.5}
.zin{height:23px;display:flex;align-items:flex-end;background:#000;padding:0 0 0 12px;width:fit-content}
.scene{width:330px;background:#000;padding-top:4px;white-space:pre}
.gl{height:17px;color:#c0c0c0}
.ir{display:flex;align-items:flex-end;height:17px}
.in{flex:1 1 auto;color:#c0c0c0}
.caret{display:inline-block;width:9px;height:15px;margin-top:1px;background:#c0c0c0;vertical-align:top}
.rimcut{width:6px;height:17px;margin-left:7px;box-sizing:border-box;border:1px solid rgba(0,0,0,.56);border-right:0;border-bottom:0;background:#545454;box-shadow:inset 1px 0 0 rgba(239,239,239,.58)}
.mn{display:flex;align-items:center;height:17px}
.sep{width:1px;height:11px;background:#2c2c2c;margin:0 4px}
.mb{all:unset;display:flex;align-items:center;justify-content:center;width:22.5px;height:17px;border-radius:3px}
.ic{width:13px;height:13px;fill:none;stroke:#686868;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.clk{display:flex;align-items:center;height:17px;white-space:pre;font-variant-numeric:tabular-nums}
.ci{width:13px;height:13px;fill:none;stroke-linecap:round;stroke-linejoin:round;display:block}
.clk.day .ci{stroke:#ffb000}.clk.night .ci{stroke:#4a90e2}

/* Nu */
.clk.now{padding-left:9px}
.clk.now .t{color:#fff;font-weight:700}
.clk.now .slot{display:flex;align-items:center;width:18px;height:17px;margin-left:9px}
.clk.now .ci{stroke-width:2;margin-left:4.5px;position:relative;top:1px}

/* A */
.clk.a{padding:0 4px 0 18px;gap:6px}
.clk.a .t{color:#b4b4b4;font-size:13px;position:relative;top:.5px}
.clk.a .ci{stroke-width:1.7}
.clk.a.day .ci{stroke:#e0a336}.clk.a.night .ci{stroke:#5b93d6}

/* B */
.clk.b{padding:0 4px 0 18px;gap:6px;border-radius:3px}
.clk.b .t{color:#8e8e8e;font-size:13px;position:relative;top:.5px}
.clk.b .ci{stroke-width:1.7}
.clk.b.day .ci{stroke:#9c8452}.clk.b.night .ci{stroke:#5d7594}
.clk.b.hot .t{color:#ececec}.clk.b.hot.day .ci{stroke:#ffb000}.clk.b.hot.night .ci{stroke:#4a90e2}

/* C */
.clk.c{padding:0 4px 0 18px;gap:6px}
.clk.c .t{font-size:13px;position:relative;top:.5px}
.clk.c .ci{stroke-width:1.7}
.clk.c.day .t{color:#d9a54a}.clk.c.day .ci{stroke:#d9a54a}
.clk.c.night .t{color:#6f9bd6}.clk.c.night .ci{stroke:#6f9bd6}

/* D */
.clk.d{padding:0 4px 0 18px;gap:5px}
.clk.d .t{color:#7c7c7c;font-size:13px;position:relative;top:.5px}
.clk.d .ci{stroke-width:1.7}
.clk.d.day .ci,.clk.d.night .ci{stroke:#686868}
.clk.d.near .t{color:#e6b04e}.clk.d.near .ci{stroke:#ffb000}

/* E */
.clk.e{padding:0 6px 0 9px;gap:7px}
.clk.e .t{color:#8e8e8e;font-size:12px;position:relative;top:.5px}
.clk.e .trk{position:relative;width:45px;height:17px}
.clk.e .trk::before{content:"";position:absolute;left:0;right:0;top:8px;height:1px;background:#2c2c2c}
.clk.e .done{position:absolute;left:0;top:8px;height:1px;background:#585858}
.clk.e .orb{position:absolute;top:5.5px;width:6px;height:6px;margin-left:-3px;border-radius:50%}
.clk.e.day .orb{background:#e8a63a;box-shadow:0 0 4px rgba(255,176,0,.45)}
.clk.e.night .orb{background:#5b93d6;box-shadow:0 0 4px rgba(74,144,226,.4)}

/* F */
.clk.f{padding:0 4px 0 9px;gap:5px}
.clk.f .t{color:#8e8e8e;font-size:13px;position:relative;top:.5px}
.clk.f .arc{width:27px;height:17px;display:block;fill:none;stroke-linecap:round}
.clk.f .arc-rest{stroke:#2e2e2e;stroke-width:1;stroke-dasharray:1.5 2}
.clk.f .arc-done{stroke:#555;stroke-width:1}
.clk.f .arc-hz{stroke:#2c2c2c;stroke-width:1}
.clk.f.day .orb{fill:#e8a63a;stroke:none}
.clk.f.night .orb{fill:#5b93d6;stroke:none}

/* G */
.clk.g{padding:0 5px 0 9px}
.clk.g .chip{display:flex;align-items:center;gap:5px;height:13px;padding:0 6px 0 4px;border-radius:3px;background:#0c0c0c;border:1px solid #232323;box-shadow:inset 0 1px 2px rgba(0,0,0,.8)}
.clk.g .t{color:#a6a6a6;font-size:11.5px;line-height:13px;position:relative;top:.5px}
.clk.g .ci{width:10px;height:10px;stroke-width:2}
.clk.g.day .ci{stroke:#cf9a3c}.clk.g.night .ci{stroke:#5b8ccc}
`;

const capOf = (per, note) => note ?? (per === 'day' ? 'dag' : 'natt');
function board(kind, title, intro) {
  const rows = ROWS[kind].map((r) => {
    const z = r.inst.map(([per, time, f, extra, note]) => zoom(clock(r.v, per, time, f, extra), capOf(per, note) + ' · förstorad 2,5×')).join('');
    const rl = r.inst.filter((i) => !i[3]).map(([per, time, f]) => real(clock(r.v, per, time, f), capOf(per) + ' · verklig storlek')).join('');
    return `<div class="row"><div class="lab"><div class="name">${r.name}</div><div class="desc">${r.desc}</div></div><div class="zs">${z}</div><div class="rs">${rl}</div></div>`;
  }).join('\n');
  return `<div class="board"><div class="hd">${intro}</div>\n${rows}\n</div>`;
}

const BOARDS = [
  { file: 'Clock31a-small.dc.html', kind: 'small', title: '31a · Klockan: små justeringar', intro: 'Klockan i menyraden, små justeringar. Nu överst som jämförelse. Allt annat i raden (ikoner, avskiljare, Comm-panelens kant till höger) är som i dag.' },
  { file: 'Clock31a-big.dc.html', kind: 'big', title: '31a · Klockan: större omtag', intro: 'Klockan i menyraden, större omtag av hur den ser ut och passar in. Tooltipen (t.ex. Night in 4:33) finns kvar i alla.' },
];
for (const b of BOARDS) {
  const body = board(b.kind, b.title, b.intro);
  const dc = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>${b.title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>${CSS}</style>
</helmet>
${body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1440,"height":1020}}'>
class Component extends DCLogic {
  renderVals() {
    return {};
  }
}
</script>
</body>
</html>
`;
  writeFileSync(`${S}/canvas/project/${b.file}`, dc);
  writeFileSync(`${S}/preview-${b.kind}.html`, `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`);
}
