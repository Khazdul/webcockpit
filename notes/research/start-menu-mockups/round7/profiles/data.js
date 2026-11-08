/* Round 7 · profiles group · shared mockup data (real shapes from src/, realistic MUME content).
   PDATA.profiles      the Profile list (Name, Selected) — as chrome/frames/profiles.tsx
   PDATA.doc()         Gibur's profile as LITE sees it: entries per kind (logic.ts KINDS, FIELD_LABELS)
   PDATA.text(doc)     the whole profile text EDITOR shows (tt++), incl. variables/tickers LITE does not list
   PDATA.help          the manual (editor/help.ts): groups and sections, real headings and text
   PDATA.imports       import results (import/types.ts ImportResult) for JMC, Mudlet, TinTin++ unchanged, failure
   PDATA.exportLog     the Export editor's log sample (Rasta, 2026-09-25) with comments, excludes and marks
   Throwaway mockup code. */
(() => {
'use strict';
const empty = new URLSearchParams(location.search).has('empty');

const profiles = [
  { name: 'default' },
  { name: 'Gibur', selected: true },
  { name: 'Gittan' },
  { name: 'Melker' },
  { name: 'Rasta' },
  { name: 'Taube' },
];

const KINDS = ['action', 'alias', 'highlight', 'macro', 'substitute'];
const KIND = {
  action: { title: 'Actions', label: '<u class="sk">A</u>ctions', key: 'a', one: 'action', many: 'actions', pattern: 'Pattern', body: 'Commands' },
  alias: { title: 'Aliases', label: 'Al<u class="sk">i</u>ases', key: 'i', one: 'alias', many: 'aliases', pattern: 'Pattern', body: 'Commands' },
  highlight: { title: 'Highlights', label: 'Hi<u class="sk">g</u>hlights', key: 'g', one: 'highlight', many: 'highlights', pattern: 'Pattern', body: 'Color' },
  macro: { title: 'Macros', label: '<u class="sk">M</u>acros', key: 'm', one: 'macro', many: 'macros', pattern: 'Key', body: 'Commands' },
  substitute: { title: 'Substitutes', label: '<u class="sk">S</u>ubstitutes', key: 's', one: 'substitute', many: 'substitutes', pattern: 'Text', body: 'New text' },
};

let nextId = 1;
const E = (pattern, body, extra = {}) => ({ id: nextId++, pattern, body, ...extra });
function doc() {
  if (empty) return { action: [], alias: [], highlight: [], macro: [], substitute: [] };
  return {
    action: [
      E("^%1 tells you '%2'", '#showme {<Fffcc00>## TELL from %1<099>}'),
      E('^%1 is dead! R.I.P.', 'get all corpse;\nbury corpse'),
      E('^ZBLAM! %1 doesn\'t want you riding %2 anymore.', 'stand;\nride $mount'),
      E('^You are hungry.', 'eat bread'),
      E('^You are thirsty.', 'drink waterskin'),
      E('^You feel less protected.', '#showme {<faa>## SANC DOWN<099>}'),
      E('^You flee head over heels.', '#showme {<Fff8800>## FLED<099>};\n#variable {target} {}'),
      E('^You have %+1..d gold', '#variable {gold} {%1}'),
      E('^the {orc|troll} flees%i', '#showme {## It ran: %1}'),
      E('^$leader leaves %1.', '%1'),
      E('^You receive your share of experience.', '#showme {## XP}'),
      E('^Your blood freezes as you hear %1 death cry.', '#showme {<Fff4444>## DEATH CRY<099>}'),
    ],
    alias: [
      E('#help', '#showme {## see the MUME wiki}'),
      E('bt', 'bash $target'),
      E('fl', 'flee'),
      E('gc', 'get all corpse;put all pack'),
      E('gp', 'get %1 pack;wear %1'),
      E('gv', 'give %1 {to %2'),
      E('kt', 'kill $target'),
      E('prep', 'remove staff;\nwield sword;\nwear shield'),
      E('ride', 'ride $mount;lead $mount'),
      E('rr', 'remove ring;#delay {1.5} {wear ring}'),
      E('t', '#variable {target} {%1};#showme {<Fffaa00>## TARGET: <Fffffff>$target<099>}'),
      E('wh', 'where %1'),
    ],
    highlight: [
      E('*BASH*', 'bold Red b blue'),
      E('ZBLAM', 'reverse red'),
      E('You are hungry.', 'light yellow'),
      E('You feel less protected.', 'underscore Red'),
      E('narrates', 'cyan'),
      E('sanctuary', '<Fff8800>'),
      E('tells you', 'Green'),
      E('the Trollshaws', 'yellow b blue'),
    ],
    macro: [
      E('F1', 'bash $target'),
      E('F5', 'rescue $leader', { warn: 'F5 is also bound by script group-heal; this macro wins.' }),
      E('Numpad8', 'north'),
      E('Numpad2', 'south'),
      E('Numpad4', 'west'),
      E('Numpad6', 'east'),
      E('Numpad9', 'up'),
      E('Numpad3', 'down'),
      E('Alt+1', "cast 'cure light' gibur"),
      E('Ctrl+E', 'emote grins.', { warn: 'Ctrl+E overrides the input line (moves to the end).' }),
      E('\\eOq', 'look', { custom: true }),
    ],
    substitute: [
      E('A large dog', '<Fffaa00>A large dog (aggro)<099>'),
      E('brutally', '<Fff4444>BRUTALLY<099>'),
      E('Ecthel', 'Ecthel (lead)'),
      E('You receive your share of experience.', '## XP'),
    ],
  };
}

/** tt++ text for EDITOR (the profile file: LITE shows only the five kinds). */
function text(d) {
  const b = (s) => (s.includes('\n') ? '{\n    ' + s.replace(/\n/g, '\n    ') + '\n}' : `{${s}}`);
  const L = [];
  L.push('#nop {Gibur — Man warrior. Profile for MUME, mume.org:4242.}', '');
  L.push('#variable {target} {orc}', '#variable {leader} {Ecthel}', '#variable {mount} {pony}', '#variable {gold} {250}', '');
  L.push('#nop ---- actions ----');
  for (const e of d.action) L.push(`#action {${e.pattern}} ${b(e.body)}`);
  L.push('', '#nop ---- aliases ----');
  for (const e of d.alias) L.push(`#alias {${e.pattern}} ${b(e.body)}`);
  L.push('', '#nop ---- highlights ----');
  for (const e of d.highlight) L.push(`#highlight {${e.pattern}} {${e.body}}`);
  L.push('', '#nop ---- keys ----');
  for (const e of d.macro) L.push(`#macro {${e.pattern}} ${b(e.body)}`);
  L.push('', '#nop ---- substitutes ----');
  for (const e of d.substitute) L.push(`#substitute {${e.pattern}} {${e.body}}`);
  L.push('', '#ticker {herbs} {#showme {<Fa0d080>## herbs ready<099>}} {300}', '#event {SESSION CONNECTED} {#showme {## Welcome back, Gibur}}');
  return L.join('\n') + '\n';
}

/* ------------------------------------------------------------------ manual (editor/help.ts, abridged) */
const help = [
  { group: 'Introduction', heading: 'Writing a profile', text: [
    'A profile is a text file of TinTin++ (tt++) commands: your actions, aliases, highlights, macros, substitutes, variables and timers. It is loaded when you connect, and again when you apply changes.',
    'LITE is a simplified view where you can edit your settings. A change takes effect by itself once you finish it: when you leave the field, go to another entry or kind, click in the game, add or delete an entry, bind a key or pick a highlight colour. Not while you type, so a half-written pattern never fires.',
    'EDITOR lets you edit the whole settings file directly (experienced users). Its changes take effect with Ctrl+S, or when you go back to LITE; until then it shows Modified.',
    'Ctrl+S applies at once in either view. While you are connected the changes go into the running game; otherwise they are saved and load on the next connect.',
    'Profile → Import on the start page also reads settings from TinTin++, JMC (.set files), Powwow and Mudlet. Choose the main file together with the files it #reads; a report then shows what was translated, what was kept as #nop and why.',
  ] },
  { group: 'Basics', heading: 'Braces and ;', text: [
    'A command starts with # and takes its arguments in braces. A ; separates commands. Inside braces the commands may stand on several lines; a line break counts as a space.',
    'Put \\ before ; { } $ or % to send the character itself.',
    'Command words ignore case and can be shortened as in tt++: #act, #al, #hi, #mac, #sub, #var, #show, #tick.',
  ], ex: [{ code: '#alias {gc} {get all corpse;put all pack}' }, { code: '#alias {prep} {\n    remove staff;\n    wield sword;\n    wear shield\n}' }, { note: 'A literal ; in what is sent:', code: '#alias {wink} {say \\;-)}' }] },
  { group: 'Basics', heading: 'Arguments %0 %1 …', text: [
    'In an alias, %1 to %99 are the words typed after the name and %0 is all of them. Commands that use no %N get what was typed after the name added at the end.',
    'In an action or a substitute, %1 %2 … are the parts of the line that the same wildcards in the Pattern matched, and %0 is the whole matched text.',
  ], ex: [{ code: '#alias {gp} {get %1 pack;wear %1}' }, { note: 'No %N in Commands, so the rest is added:', code: '#alias {k} {kill}' }] },
  { group: 'Basics', heading: 'Variables $name', text: [
    '#variable {target} {orc} stores text under a name. $target puts it in: in commands for the game, #showme text, conditions, patterns and New text. Use ${target} when letters follow directly.',
    'A variable that does not exist stays as written ($target is sent as it is), so give the variables you use a starting value at the top of the profile.',
  ], ex: [{ code: '#variable {target} {orc}\n#alias {kt} {kill $target}\n#alias {bt} {bash ${target}s}' }] },
  { group: 'Basics', heading: 'Patterns', text: [
    'A Pattern is text to look for anywhere in a line, with upper and lower case as written. ^ first ties it to the start of the line, $ last ties it to the end.',
    'Wildcards: %1 … %99 match any text and keep it as that argument. %* any text, %+ at least one character, %? at most one, %. exactly one. %d digits, %w letters and digits, %s spaces. %+1..d is one digit or more.',
    '{orc|troll} is a regular expression: either word. %i at the end makes the whole Pattern ignore case. A $variable in a Pattern is read each time a line is checked.',
  ], ex: [{ code: "#action {^%1 tells you '%2'} {#showme {<Fffcc00>## TELL from %1<099>}}" }, { code: '#action {^You have %+1..d gold} {#variable {gold} {%1}}\n#action {^the {orc|troll} flees%i} {#showme {## It ran: %1}}' }] },
  { group: 'Basics', heading: 'Priorities', text: [
    'Actions, aliases, highlights and substitutes take an optional third argument, the priority: a number, 5 when left out. Lower runs first; equal priorities run in the order they were defined.',
    'Every action that matches a line runs. Of the aliases only the first match runs. Defining an entry with a Pattern that already exists replaces the old one.',
  ], ex: [{ code: '#action {^You are thirsty.} {drink water} {7}\n#action {thirsty} {#showme {## Thirsty}} {2}' }] },
  { group: 'Basics', heading: 'Colours', text: [
    'In #showme, in New text and in #highlight: <Frrggbb> sets the text colour and <Brrggbb> the background, in hex (<Fff8800> is orange). <099> goes back to the default colours.',
    '#highlight takes colour names: black red green yellow blue magenta cyan white. A capital letter or the word light makes it bright (Red, light red). b before a colour sets the background (b red). Styles: underscore, blink, reverse, bold, italic.',
  ], ex: [{ code: '#highlight {You are hungry.} {light yellow}\n#highlight {*BASH*} {bold Red b blue}\n#highlight {sanctuary} {<Fff8800>}' }] },
  { group: 'Basics', heading: 'Keys', text: [
    'A macro is bound to a key name: F1 … F24, Numpad0 … Numpad9, ArrowUp, Home, PageUp, letters and digits (A, 1), with Ctrl+, Alt+ and Shift+ in that order in front: Ctrl+A, Alt+1, Ctrl+Shift+F1.',
    'Names are physical keys, the same on every keyboard layout. The easy way is LITE → Macros: choose the Key cell and press the key.',
    'Not bindable: ESC, Enter, and keys the browser keeps (Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Tab). A script can bind a key too; a macro on the same key wins, and the editor warns about it.',
  ], ex: [{ code: "#macro {Numpad8} {north}\n#macro {Ctrl+F} {flee}\n#macro {Alt+1} {cast 'cure light'}" }] },
  { group: 'Basics', heading: 'Typing commands', text: [
    'Everything in a profile can also be typed on the input line while you play. A definition you type (#alias, #action, #highlight …) is written to the profile at once, and the matching #un… command removes it.',
  ], ex: [{ code: '#var target orc\n#alias gc get all corpse;#unalias gc\n#3 north' }] },
  { group: 'Basics', heading: 'What is saved', text: ['Typed definitions are saved. Made by Commands (of an alias, action, macro, ticker or event): lasts for the session. #delay is never saved.'] },
  { group: 'Basics', heading: 'Scripts', text: ['Scripts are small Lua programs kept beside the profile, not in it. The Scripts window lists them: turn one on or off, change its settings, read its help, or open it in the editor.'] },
  { group: 'Commands', heading: '#action', syntax: ['#action {pattern} {commands} {priority}', '#unaction {pattern}'], text: ['Runs the commands when a line from the game matches the pattern. #unaction removes one by its Pattern; a * matches any text.'], ex: [{ code: '#action {^You are hungry.} {eat bread}' }] },
  { group: 'Commands', heading: '#alias', syntax: ['#alias {pattern} {commands} {priority}', '#unalias {pattern}'], text: ['Runs the commands instead of what you typed when the line starts with the pattern.'], ex: [{ code: '#alias {look} {look;exits}' }] },
  { group: 'Commands', heading: '#class', syntax: ['#class {name} {open}', '#class {name} {close}', '#class {name} {kill}'], text: ['Groups entries so they can be removed together.'] },
  { group: 'Commands', heading: '#delay', syntax: ['#delay {seconds} {commands}', '#undelay {name}'], text: ['Runs the commands after a pause. Never saved.'], ex: [{ code: '#alias {rr} {remove ring;#delay {1.5} {wear ring}}' }] },
  { group: 'Commands', heading: '#event', syntax: ['#event {name} {commands}'], text: ['Runs the commands when something happens in the client: SESSION CONNECTED, SESSION DISCONNECTED, GMCP events.'] },
  { group: 'Commands', heading: '#gag', syntax: ['#gag {pattern}'], text: ['Hides lines that match.'] },
  { group: 'Commands', heading: '#highlight', syntax: ['#highlight {pattern} {colour} {priority}', '#unhighlight {pattern}'], text: ['Colours the matching text. See Colours.'] },
  { group: 'Commands', heading: '#if', syntax: ['#if {condition} {commands} #else {commands}'], text: ['Runs commands when a condition holds.'] },
  { group: 'Commands', heading: '#macro', syntax: ['#macro {key} {commands}', '#unmacro {key}'], text: ['Binds a key. See Keys.'] },
  { group: 'Commands', heading: '#showme', syntax: ['#showme {text}'], text: ['Prints text in the game window; it is not sent to the game.'] },
  { group: 'Commands', heading: '#substitute', syntax: ['#substitute {pattern} {new text} {priority}', '#unsubstitute {pattern}'], text: ['Shows the new text in place of the matched text.'] },
  { group: 'Commands', heading: '#ticker', syntax: ['#ticker {name} {commands} {seconds}', '#unticker {name}'], text: ['Runs the commands every so many seconds.'] },
  { group: 'Commands', heading: '#variable', syntax: ['#variable {name} {value}', '#unvariable {name}'], text: ['Stores text under a name. See Variables $name.'] },
];

/* ------------------------------------------------------------------ imports (import/types.ts ImportResult) */
const imports = {
  jmc: {
    files: ['bolger.set', 'paths.set', 'spells.set'], chosen: ['bolger.set', 'paths.set', 'colours.set'],
    format: 'jmc', formatName: 'JMC', signals: ['.set file name', 'JMC state header', '#hot/#hotkey with Ctrl+/Alt+'],
    entry: 'bolger.set', name: 'bolger', lines: 431,
    counts: { translated: 412, kept: 9, skipped: 6, warnings: 4 },
    fileWarnings: [
      'JMC fires only the first matching action (#multiaction OFF); WebCockpit fires every matching action, in priority order.',
      'bolger.set was read as windows-1252.',
      'colours.set was not read by bolger.set; it was added at the end.',
    ],
    missingFiles: ['spells.set'],
    items: [
      { file: 'bolger.set', line: 3, outcome: 'kept', reason: 'JScript file (scripts are not translated)', source: '#use {bolger.js}' },
      { file: 'bolger.set', line: 18, outcome: 'kept', reason: 'Status bar setting (no equivalent)', source: '#status {1} {HP: $hp} {green}' },
      { file: 'bolger.set', line: 41, outcome: 'kept', reason: 'Regex alias (not supported)', source: '#alias {/^k(\\w+)$/} {kill $1}' },
      { file: 'bolger.set', line: 57, outcome: 'kept', reason: 'Groups cannot be switched off here; the group\'s rules are active', source: '#group disable {pk}' },
      { file: 'bolger.set', line: 88, outcome: 'kept', reason: 'Output window (no equivalent)', source: '#woutput {1} {narrate} {%0}' },
      { file: 'bolger.set', line: 102, outcome: 'kept', reason: 'Highlight with colorcodes (no equivalent)', source: '#highlight {bold,light red} {*BASH*}' },
      { file: 'paths.set', line: 12, outcome: 'kept', reason: 'Mapper command (no equivalent)', source: '#map {e}' },
      { file: 'paths.set', line: 30, outcome: 'kept', reason: 'Unsupported JMC command #loop', source: '#loop {1,5} {get herb %0}' },
      { file: 'bolger.set', line: 140, outcome: 'kept', reason: 'Unbalanced braces', source: '#action {^%0 tells you {%1} {tell %0 busy' },
      { file: 'bolger.set', line: 1, outcome: 'skipped', reason: 'Client setting (WebCockpit fires every matching action)', source: '#multiaction off' },
      { file: 'bolger.set', line: 2, outcome: 'skipped', reason: 'Speedwalk on: walks like 3n2w in bodies are expanded', source: '#speedwalk on' },
      { file: 'bolger.set', line: 5, outcome: 'skipped', reason: 'Client setting with no meaning here', source: '#echo off' },
      { file: 'bolger.set', line: 6, outcome: 'skipped', reason: 'Tick size noted; used if #tickon follows', source: '#ticksize 60' },
      { file: 'bolger.set', line: 9, outcome: 'skipped', reason: 'Group scope (local/global) has no meaning here', source: '#group local {pk}' },
      { file: 'paths.set', line: 1, outcome: 'skipped', reason: 'Client setting (WebCockpit applies every matching substitute)', source: '#multisubstitute off' },
      { file: 'bolger.set', line: 7, outcome: 'translated', reason: 'Tick timer → #ticker', warning: 'The ticker runs every 60 s and is not synced to the game', source: '#tickon' },
      { file: 'bolger.set', line: 63, outcome: 'translated', reason: 'TEXT action (matches colour codes)', warning: 'Check the colour: the pattern now matches the text only', source: '#action TEXT {^%0 narrates \'%1\'} {#output {cyan} {%0: %1}}' },
      { file: 'bolger.set', line: 77, outcome: 'translated', reason: 'Key Ctrl+Num8 written as Ctrl+Numpad8', warning: 'Ctrl+Numpad8 overrides nothing on the input line, but your browser may take it', source: '#hot {Ctrl+Num8} {run n}' },
      { file: 'paths.set', line: 44, outcome: 'translated', reason: 'Inlined paths2.set', warning: 'paths2.set was read in place of the #read line', source: '#read {paths2.set}' },
    ],
  },
  mudlet: {
    files: ['elwing.mpackage'], chosen: ['elwing.mpackage'],
    format: 'mudlet', formatName: 'Mudlet', signals: ['MudletPackage version 1.001', 'package archive'],
    entry: 'elwing.xml', name: 'elwing', lines: 188,
    counts: { translated: 141, kept: 5, skipped: 2, warnings: 2 },
    fileWarnings: ['No start value in Mudlet for target, mount; they start empty.'],
    missingFiles: [],
    items: [
      { file: 'elwing.xml', line: 212, outcome: 'kept', reason: 'Lua that cannot be translated (a function call with a table)', source: 'cecho(string.format("<red>%s<reset> is here", matches[2]))' },
      { file: 'elwing.xml', line: 260, outcome: 'kept', reason: 'Regex with backreferences', source: '<regex>^(\\w+) and \\1</regex>' },
      { file: 'elwing.xml', line: 301, outcome: 'kept', reason: 'Regex with nested capture groups', source: '<regex>^((\\w+) the (\\w+)) arrives</regex>' },
      { file: 'elwing.xml', line: 344, outcome: 'kept', reason: 'Event sysDataSendRequest never fires in WebCockpit', source: '<eventHandlerList><string>sysDataSendRequest</string>' },
      { file: 'elwing.xml', line: 380, outcome: 'kept', reason: 'Variable inventory is a table', source: '<variable><name>inventory</name><valueType>5</valueType>' },
      { file: 'elwing.xml', line: 12, outcome: 'skipped', reason: '#button is not a rule', source: '<Button isActive="yes"><name>Flee</name>' },
      { file: 'elwing.xml', line: 30, outcome: 'skipped', reason: '#label is not a rule', source: '<HostPackage><name>Elwing UI</name>' },
      { file: 'elwing.xml', line: 98, outcome: 'translated', reason: 'Event renamed to SESSION CONNECTED', warning: 'Arguments differ: tt++ passes a table in %0/%1 and JSON in %2; here %0 is the package and %1 the JSON.', source: '<string>sysConnectionEvent</string>' },
      { file: 'elwing.xml', line: 156, outcome: 'translated', reason: 'Tick timer → #ticker', warning: 'The ticker runs every 60 s and is not synced to the game', source: '<Timer><time>00:01:00.000</time>' },
    ],
  },
  tintin: {
    files: ['tuva.tin'], chosen: ['tuva.tin'],
    format: 'tintin', formatName: 'TinTin++', signals: ['#class', '#ticker', '<xyz> colour codes'],
    entry: 'tuva.tin', name: 'tuva', lines: 214, unchanged: true,
    counts: { translated: 214, kept: 0, skipped: 0, warnings: 0 }, fileWarnings: [], missingFiles: [], items: [],
  },
  fail: { files: ['melker.mpackage'], chosen: ['melker.mpackage'], error: 'melker.mpackage holds no XML file; it was not imported.' },
};

/* ------------------------------------------------------------------ export editor sample (export-model.ts) */
// a slice of Rasta's 5 h run (the real log is 70,098 lines; the mockup shows ~180 rows)
const exportSession = { character: 'Rasta', level: 73, date: '2026-09-25', start: '21:00', lines: 70098, title: 'mume-Rasta-2026-09-25T21-00' };
function exportLog() {
  const R = [];
  const room = (name, desc, exits, here = []) => { R.push({ t: 'in', s: `<c>${name}</c>` }); R.push({ t: 'in', s: desc }); R.push({ t: 'in', s: `<g>Exits: ${exits}.</g>` }); for (const h of here) R.push({ t: 'in', s: `<y>${h}</y>` }); };
  const out = (s) => R.push({ t: 'out', s });
  const say = (s, c = 'w') => R.push({ t: 'in', s: c === 'w' ? s : `<${c}>${s}</${c}>` });
  R.push({ t: 'sys', s: '[SYSTEM] Rasta logged in.' });
  room('The Last Bridge', 'A great stone bridge spans the Hoarwell here, its three arches worn smooth by the river below.', 'east, west', ['A ranger of the North stands here, watching the road.']);
  out('east');
  room('The Great East Road', 'The road runs straight between low hills. Far to the north, dark trees crowd the slopes of the Trollshaws.', 'east, west, north');
  say("Ecthel narrates 'trolls spotted near the ford, who is up?'", 'b');
  out("narrate 'on my way, 2 min'");
  say("You narrate 'on my way, 2 min'", 'b');
  out('north');
  room('Edge of the Trollshaws', 'Gnarled trees close in on the path. Broken branches and great footprints lead away into the gloom.', 'south, north, east');
  out('north');
  room('A Dark Clearing', 'The ground is trampled and littered with bones. A foul smell hangs in the still air.', 'south, west', ['A large hill troll is here, chewing on something.', 'A stone troll stands here, looking for something to eat.']);
  out('kill troll');
  say('You attack the large hill troll!', 'r');
  say('The large hill troll hits you hard.', 'r');
  say('You slash the large hill troll extremely hard.');
  say('*BASH* The stone troll slams into you!', 'r');
  say('Ecthel arrives from the south.', 'y');
  say("Ecthel tells you 'rescue me if it turns'", 'g');
  for (let i = 0; i < 6; i++) { say(i % 2 ? 'You pierce the large hill troll very hard.' : 'The large hill troll misses you.'); }
  say('The large hill troll is dead! R.I.P.', 'r');
  say('You receive your share of experience.');
  out('get all corpse');
  say('You get a bag of gold coins from the corpse of the large hill troll.');
  say('There were 312 coins.', 'y');
  out('bury corpse');
  say('You bury the corpse of the large hill troll.');
  out('rescue ecthel');
  say('Banzai! You rescue Ecthel!', 'r');
  for (let i = 0; i < 5; i++) { say(i % 2 ? 'The stone troll hits you hard.' : 'You slash the stone troll hard.'); }
  say('You flee head over heels.', 'r');
  say('<Fff8800>## FLED</Fff8800>', 'o');
  room('Edge of the Trollshaws', 'Gnarled trees close in on the path. Broken branches and great footprints lead away into the gloom.', 'south, north, east');
  out('rest');
  say('You sit down and rest your tired bones.');
  say("Ecthel tells you 'nice, it ran too'", 'g');
  for (let i = 0; i < 4; i++) say('You feel a bit better.');
  out('stand');
  out('north');
  room('A Dark Clearing', 'The ground is trampled and littered with bones. A foul smell hangs in the still air.', 'south, west', ['A stone troll is here, licking its wounds.']);
  out('kill troll');
  for (let i = 0; i < 6; i++) say(i % 2 ? 'You slash the stone troll extremely hard.' : 'The stone troll misses you.');
  say('The stone troll is dead! R.I.P.', 'r');
  say('Congratulations! You have reached level 73!', 'y');
  say('You receive your share of experience.');
  out('get all corpse');
  say("Ecthel narrates 'two trolls down at the clearing, gg'", 'b');
  out('west');
  room('Among the Trees', 'Moss covers every stone. Somewhere a stream runs unseen.', 'east, south');
  for (let i = 0; i < 18; i++) say(['The wind picks up.', 'A crow caws somewhere to the north.', 'You hear the howling of wolves far away.', 'The river keeps running over the stones.'][i % 4]);
  out('south');
  room('The Great East Road', 'The road runs straight between low hills.', 'east, west, north');
  out('west');
  room('The Last Bridge', 'A great stone bridge spans the Hoarwell here.', 'east, west');
  say('Rasta has been idle, and is pulled into the void.', 'w');
  R.push({ t: 'sys', s: '[SYSTEM] Rasta logged out.' });
  return R;
}

window.PDATA = { profiles, KINDS, KIND, doc, text, help, imports, exportSession, exportLog };
})();
