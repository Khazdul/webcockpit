// The HELP view's manual for writing a profile (ADR 0037): content as
// data, and its layout into cell rows. No DOM, no Preact; unit tested.
//
// Every statement describes what the engine in src/script/engine does, not
// what tt++ does. tests/unit/editor-help.test.ts keeps it honest: every
// example is loaded or typed into a real engine and must give no message,
// the examples that carry a `check` must send and show exactly what they
// say, and every command the engine runs must have a section. The client
// commands the menus cover (#connect, #disconnect, #reconnect, #replay,
// #runlog) are left out on purpose; the test keeps them out.
//
// `#help` on the input line prints from the same data (src/app/help-command.ts).
//
// `_send` is gone (ADR 0040) and is not mentioned here.
//
// This file must not import the engine: the editor is a lazy chunk, and a
// shared import would move engine code between the start-up chunks. The
// engine's numbers quoted in the text (REPEAT_MAX, the event names) are
// checked by the test instead.

import { COMMANDS, type CommandEntry } from '../script/commands';
import { wrapText } from '../chrome/kit/nav';
import { type TokenClass, tokenizeLine } from './syntax';

// ---------------------------------------------------------------- content

/** What an example does when it is used; run by the unit test. */
export interface HelpCheck {
  /**
   * What happens, in order: `['type', text]` a typed line, `['line', text]`
   * a line from the game, `['key', name]` a key press, `['wait', seconds]`,
   * `['event', name, %0, %1 …]`. Instead of the four lists below.
   */
  steps?: ReadonlyArray<readonly [kind: 'type' | 'line' | 'key' | 'wait' | 'event', ...args: string[]]>;
  /** Lines typed on the input line, in order. */
  type?: readonly string[];
  /** Lines received from the game, in order. */
  lines?: readonly string[];
  /** Keys pressed (key names as in `#macro`). */
  keys?: readonly string[];
  /** Seconds to let pass afterwards. */
  wait?: number;
  /** Events to fire: name and arguments (%0, %1 …). */
  events?: ReadonlyArray<readonly [name: string, ...args: string[]]>;
  /** Exactly what is sent to the game. */
  sends?: readonly string[];
  /** Exactly the text of the lines shown in the game window. */
  shows?: readonly string[];
  /** Exactly the confirmation and listing rows the typed commands give (`#message`). */
  says?: readonly string[];
  /** Variables afterwards. */
  vars?: Readonly<Record<string, string>>;
}

export interface HelpExample {
  /** The text as it would stand in a profile (or on the input line). */
  code: string;
  /** One line above the code. */
  note?: string;
  /** `input`: typed on the input line instead of loaded as a profile. */
  via?: 'profile' | 'input';
  check?: HelpCheck;
}

export type HelpGroup = 'intro' | 'basics' | 'commands' | 'end';

export interface HelpSection {
  group: HelpGroup;
  heading: string;
  /** Commands (names without `#`) this section documents. */
  covers?: readonly string[];
  syntax?: readonly string[];
  text: readonly string[];
  examples?: readonly HelpExample[];
  /**
   * Words that name the section for `#help <topic>` on the input line
   * (lower case); the first one is listed by `#help`.
   */
  topics?: readonly string[];
}

export const MANUAL_URL = 'tintin.mudhalla.net/manual/';

const INTRO: readonly HelpSection[] = [
  {
    group: 'intro',
    heading: 'Writing a profile',
    text: [
      'A profile is a text file of TinTin++ (tt++) commands: your actions, aliases, highlights, macros, substitutes, variables and timers. It is loaded when you connect, and again when you apply changes.',
      'LITE is a simplified view where you can edit your settings.',
      'EDITOR lets you edit the whole settings file directly (experienced users).',
      'What is different from tt++ here:',
      '- Every command sent to the game is echoed in the game window. Write game commands as they are; no echo helper is needed.',
      '- File, shell, session and screen commands (#read, #system, #session, #split …) are kept in the text but do nothing.',
      '- Some scripting commands are not supported yet. They are listed at the end.',
      `The TinTin++ manual describes the language in full: ${MANUAL_URL}`,
    ],
  },
];

const BASICS: readonly HelpSection[] = [
  {
    group: 'basics',
    heading: 'Braces and ;',
    topics: ['braces'],
    text: [
      'A command starts with # and takes its arguments in braces. A ; separates commands. Inside braces the commands may stand on several lines; a line break counts as a space.',
      'Put \\ before ; { } $ or % to send the character itself.',
      'Command words ignore case and can be shortened as in tt++: #act, #al, #hi, #mac, #sub, #var, #show, #tick.',
    ],
    examples: [
      {
        code: '#alias {gc} {get all corpse;put all pack}',
        check: { type: ['gc'], sends: ['get all corpse', 'put all pack'] },
      },
      {
        code: '#alias {prep} {\n    remove staff;\n    wield sword;\n    wear shield\n}',
        check: { type: ['prep'], sends: ['remove staff', 'wield sword', 'wear shield'] },
      },
      {
        note: 'A literal ; in what is sent:',
        code: '#alias {wink} {say \\;-)}',
        check: { type: ['wink'], sends: ['say ;-)'] },
      },
    ],
  },
  {
    group: 'basics',
    heading: 'Arguments %0 %1 …',
    topics: ['arguments'],
    text: [
      'In an alias, %1 to %99 are the words typed after the name and %0 is all of them. Commands that use no %N get what was typed after the name added at the end.',
      'In an action or a substitute, %1 %2 … are the parts of the line that the same wildcards in the Pattern matched, and %0 is the whole matched text.',
    ],
    examples: [
      {
        code: '#alias {gp} {get %1 pack;wear %1}',
        check: { type: ['gp cloak'], sends: ['get cloak pack', 'wear cloak'] },
      },
      {
        note: 'No %N in Commands, so the rest is added:',
        code: '#alias {k} {kill}',
        check: { type: ['k orc', 'k'], sends: ['kill orc', 'kill'] },
      },
    ],
  },
  {
    group: 'basics',
    heading: 'Variables $name',
    topics: ['variables'],
    text: [
      '#variable {target} {orc} stores text under a name. $target puts it in: in commands for the game, #showme text, conditions, patterns and New text. Use ${target} when letters follow directly.',
      'A variable that does not exist stays as written ($target is sent as it is), so give the variables you use a starting value at the top of the profile. Names use letters, digits and _.',
    ],
    examples: [
      {
        code: '#variable {target} {orc}\n#alias {kt} {kill $target}\n#alias {bt} {bash ${target}s}',
        check: { type: ['kt', 'bt', 'say $nothing'], sends: ['kill orc', 'bash orcs', 'say $nothing'] },
      },
    ],
  },
  {
    group: 'basics',
    heading: 'Patterns',
    topics: ['patterns'],
    text: [
      'A Pattern is text to look for anywhere in a line, with upper and lower case as written. ^ first ties it to the start of the line, $ last ties it to the end.',
      'Wildcards: %1 … %99 match any text and keep it as that argument. %* any text, %+ at least one character, %? at most one, %. exactly one. %d digits, %w letters and digits, %s spaces, %S anything but spaces. %+1..d is one digit or more, %+2..4d two to four, %+3d exactly three.',
      '{orc|troll} is a regular expression: either word. Wildcards other than %N fill the next free argument. %i at the end makes the whole Pattern ignore case. \\ before a character matches that character itself.',
      'A $variable in a Pattern is read each time a line is checked.',
    ],
    examples: [
      {
        code: "#action {^%1 tells you '%2'} {#showme {<Fffcc00>## TELL from %1<099>}}",
        check: {
          lines: ["Gimli tells you 'wait for me'", "You tell Gimli 'ok'"],
          shows: ['## TELL from Gimli', "Gimli tells you 'wait for me'", "You tell Gimli 'ok'"],
        },
      },
      {
        code: '#action {^You have %+1..d gold} {#variable {gold} {%1}}\n#action {^the {orc|troll} flees%i} {#showme {## It ran: %1}}',
        check: {
          lines: ['You have 250 gold coins.', 'The Troll flees north.'],
          vars: { gold: '250' },
          shows: ['You have 250 gold coins.', '## It ran: Troll', 'The Troll flees north.'],
        },
      },
      {
        code: '#variable {leader} {Gimli}\n#action {^$leader leaves %1.} {%1}',
        check: { lines: ['Gimli leaves north.', 'Legolas leaves east.'], sends: ['north'] },
      },
    ],
  },
  {
    group: 'basics',
    heading: 'Priorities',
    topics: ['priorities'],
    text: [
      'Actions, aliases, highlights and substitutes take an optional third argument, the priority: a number, 5 when left out. Lower runs first; equal priorities run in the order they were defined.',
      'Every action that matches a line runs. Of the aliases only the first match runs. Defining an entry with a Pattern that already exists replaces the old one.',
    ],
    examples: [
      {
        code: '#action {^You are thirsty.} {drink water} {7}\n#action {thirsty} {#showme {## Thirsty}} {2}',
        check: { lines: ['You are thirsty.'], shows: ['## Thirsty', 'You are thirsty.'], sends: ['drink water'] },
      },
    ],
  },
  {
    group: 'basics',
    heading: 'Colours',
    topics: ['colours', 'colors'],
    text: [
      'In #showme and in New text: <Frrggbb> sets the text colour and <Brrggbb> the background, in hex (<Fff8800> is orange; <Frgb> is the short form). <099> goes back to the default colours.',
      'The three-digit tt++ codes work too, <abc>: a is 0 reset, 1 bold, 3 italic, 4 underline, 5 blink, 7 reverse, 8 keep; b is the text colour and c the background: 0 black, 1 red, 2 green, 3 yellow, 4 blue, 5 magenta, 6 cyan, 7 white, 8 keep, 9 default.',
      '#highlight takes colour names: black red green yellow blue magenta cyan white. A capital letter or the word light makes it bright (Red, light red). b red sets the background. Styles: underscore, blink, reverse, bold, italic. A colour code works as well.',
    ],
    examples: [
      {
        code: '#alias {ready} {#showme {<Fffcc00>## READY <148>now<099> go}}',
        check: { type: ['ready'], shows: ['## READY now go'] },
      },
      {
        code: '#highlight {You are hungry.} {light yellow}\n#highlight {*BASH*} {bold Red b blue}\n#highlight {sanctuary} {<Fff8800>}',
      },
    ],
  },
  {
    group: 'basics',
    heading: 'Keys',
    topics: ['keys'],
    text: [
      'A macro is bound to a key name: F1 … F12, Numpad0 … Numpad9, NumpadAdd, NumpadSubtract, NumpadMultiply, NumpadDivide, NumpadEnter, ArrowUp, PageUp, letters and digits (A, 1), with Ctrl+, Alt+ and Shift+ in that order in front: Ctrl+A, Alt+1, Ctrl+Shift+F1.',
      'Names are physical keys, the same on every keyboard layout. The easy way is LITE → MACROS: press Enter on the Key cell and then the key.',
      'Not bindable: ESC, Enter, and keys the browser keeps (Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Tab). A bound key no longer does what it did on the input line: a macro on A means a is not typed.',
    ],
    examples: [
      {
        code: '#macro {Numpad8} {north}\n#macro {Ctrl+F} {flee}\n#macro {Alt+1} {cast \'cure light\'}',
        check: { keys: ['Numpad8', 'Ctrl+F', 'Alt+1'], sends: ['north', 'flee', "cast 'cure light'"] },
      },
    ],
  },
  {
    group: 'basics',
    heading: 'Typing commands',
    topics: ['typing'],
    text: [
      'Everything in a profile can also be typed on the input line while you play. A definition you type (#alias, #action, #highlight, #substitute, #gag, #macro, #variable, #ticker, #event) is written to the profile at once, and the matching #un… command removes it from the profile. ESC → Profile shows the same entries, see What is saved.',
      'A typed command is confirmed with one row in the game window: the entry as it stands in the profile, or what happened to it (removed, not found). Commands run by an alias, action, macro or timer are not confirmed, and neither is a profile while it loads. #message switches the confirmations off, one kind at a time.',
      'Typed without Commands, a command lists what exists, in the same form: #alias shows all aliases, #alias {k*} those starting with k, #variable all variables, #ticker and #delay the running timers.',
      '#3 north repeats a command (at most 100 times). When typing, braces may be left out around single words (#var target orc); the profile gets the line with all its braces.',
      'While a profile loads, nothing is sent to the game. A profile should only define things at its top level.',
    ],
    examples: [
      { via: 'input', code: '#var target orc', check: { vars: { target: 'orc' }, says: ['#variable {target} {orc}'] } },
      { via: 'input', code: '#alias gc get all corpse;#unalias gc', check: { says: ['#alias {gc} {get all corpse}', '#alias {gc} removed'] } },
      { via: 'input', code: '#3 north', check: { sends: ['north', 'north', 'north'] } },
    ],
  },
  {
    group: 'basics',
    heading: 'What is saved',
    topics: ['saved'],
    text: [
      'The profile text is what is saved, and it is what runs: the entries you see in the editor are the ones in the game.',
      'Typed on the input line: a definition is saved at once. It is added to the profile, or it replaces the entry with the same Pattern, name or Key. An #un… command removes the entry. A variable is saved with the value it got. Nothing else in the profile changes.',
      'Made by a script (the Commands of an alias, action, macro, ticker or event): lasts for the session, so an alias that arms a temporary action does not fill the profile. One exception: when a script changes a variable that has its own #variable line at the top level of the profile, the new value is written to that line.',
      '#delay is never saved. #class open and close are not saved: an entry typed while a class is open is saved as an ordinary entry. Nothing is saved in offline replay mode. When a typed line cannot be saved, a [SYSTEM] line says so.',
    ],
  },
];

const COMMAND_SECTIONS: readonly HelpSection[] = [
  {
    group: 'commands',
    heading: '#action',
    covers: ['action', 'unaction'],
    syntax: ['#action {pattern} {commands} {priority}', '#unaction {pattern}'],
    text: [
      'Runs Commands when a line from the game matches Pattern. Every matching action runs. Actions see the line as the game sent it, before substitutes and gags, and they also see #showme lines. They run on complete lines, not on the prompt.',
      '#unaction removes one by its Pattern; a * matches any text.',
    ],
    examples: [
      {
        code: '#action {^You are hungry.} {eat bread}',
        check: { lines: ['You are hungry.'], sends: ['eat bread'] },
      },
      {
        code: "#action {^%1 raises {his|her} hand.$} {#variable {asker} {%1};#showme {<F80ff80>## %1 wants to group<099>}}",
        check: {
          lines: ['Legolas raises his hand.'],
          vars: { asker: 'Legolas' },
          shows: ['## Legolas wants to group', 'Legolas raises his hand.'],
        },
      },
      {
        note: 'Typed, to remove every action about hunger:',
        via: 'input',
        code: '#unaction {*hungry*}',
        // The test's engine has no action to remove.
        check: { says: ['#action {*hungry*} not found'] },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#alias',
    covers: ['alias', 'unalias'],
    syntax: ['#alias {pattern} {commands} {priority}', '#unalias {pattern}'],
    text: [
      'Replaces a command you type (or that another entry sends). Pattern is normally a name: the first word typed. %1 %2 … are the words after it and %0 all of them.',
      'Pattern may also hold wildcards; it is then matched from the start of what was typed. An alias never calls itself: its own name in its Commands goes to the game.',
      'To define an action or another alias from inside an alias, write %%1 for the inner %1.',
    ],
    examples: [
      {
        note: 'Set a variable and confirm it:',
        code: '#variable {target} {}\n#alias {t} {#variable {target} {%1};#showme {<Fffaa00>## TARGET: <Fffffff>$target<099>}}',
        check: { type: ['t orc'], vars: { target: 'orc' }, shows: ['## TARGET: orc'] },
      },
      {
        note: 'Its own name goes to the game:',
        code: '#alias {look} {look;exits}',
        check: { type: ['look'], sends: ['look', 'exits'] },
      },
      {
        note: 'An alias that defines an action: %1 is the name typed now, %%1 is filled in when the action runs.',
        code: '#alias {follow} {#action {^%1 leaves %%1.} {%%1}}',
        check: { type: ['follow Gimli'], lines: ['Gimli leaves north.', 'Legolas leaves east.'], sends: ['north'] },
      },
      {
        note: 'A Pattern with wildcards:',
        code: '#alias {^%+1..d%w$} {#%1 %2}',
        check: { type: ['3n'], sends: ['n', 'n', 'n'] },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#class',
    covers: ['class'],
    syntax: ['#class {name} {open}', '#class {name} {close}', '#class {name} {kill}'],
    text: [
      'Groups entries so they can be removed together. Everything defined between open and close belongs to the class: entries, variables, tickers and delays. kill removes them all.',
      'Only open, close and kill are supported.',
    ],
    examples: [
      {
        code:
          '#alias {hunt} {\n    #class {hunt} {kill};\n    #class {hunt} {open};\n    #variable {prey} {%1};\n    #action {^%1 leaves %%1.} {%%1;kill %1};\n    #class {hunt} {close}\n}\n#alias {nohunt} {#class {hunt} {kill}}',
        check: {
          steps: [
            ['type', 'hunt Grishnakh'],
            ['line', 'Grishnakh leaves north.'],
            ['type', 'nohunt'],
            ['line', 'Grishnakh leaves east.'],
          ],
          sends: ['north', 'kill Grishnakh'],
        },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#delay',
    covers: ['delay', 'undelay'],
    syntax: ['#delay {seconds} {commands}', '#delay {name} {commands} {seconds}', '#undelay {name}'],
    text: [
      'Runs Commands once, after the time. Seconds may have decimals (0.5).',
      'With a name, a new delay of the same name replaces the old one and #undelay {name} cancels it.',
    ],
    examples: [
      {
        code: '#alias {rr} {remove ring;#delay {1.5} {wear ring}}',
        check: { type: ['rr'], wait: 2, sends: ['remove ring', 'wear ring'] },
      },
      {
        code: '#alias {nap} {sleep;#delay {nap} {wake;stand} {30}}\n#alias {up} {#undelay {nap};wake;stand}',
        check: { type: ['nap', 'up'], wait: 60, sends: ['sleep', 'wake', 'stand'] },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#else',
    covers: ['else'],
    syntax: ['#else {commands}'],
    text: ['Runs Commands when the #if (and every #elseif) before it in the same command list was false. See #if.'],
    examples: [
      {
        code: '#variable {target} {}\n#alias {kk} {#if {"$target" == ""} {#showme {## No target}};#else {kill $target}}',
        check: { type: ['kk', '#variable {target} {orc}', 'kk'], shows: ['## No target'], sends: ['kill orc'], says: ['#variable {target} {orc}'] },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#elseif',
    covers: ['elseif'],
    syntax: ['#elseif {condition} {commands}'],
    text: ['After an #if that was false: tests another condition. Only the first true branch of the chain runs. See #if.'],
    examples: [
      {
        code:
          '#variable {target} {}\n#variable {weapon} {bow}\n#macro {F5} {\n    #if {"$target" == ""} {#showme {<Fff4040>## No target<099>}};\n    #elseif {"$weapon" == "bow"} {shoot $target};\n    #else {kill $target}\n}',
        check: {
          steps: [
            ['key', 'F5'],
            ['type', '#variable {target} {orc}'],
            ['key', 'F5'],
            ['type', '#variable {weapon} {sword}'],
            ['key', 'F5'],
          ],
          shows: ['## No target'],
          sends: ['shoot orc', 'kill orc'],
          says: ['#variable {target} {orc}', '#variable {weapon} {sword}'],
        },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#event',
    covers: ['event', 'unevent'],
    syntax: ['#event {name} {commands}', '#unevent {name}'],
    text: [
      'Runs Commands when something happens in the client. The events are:',
      '- SESSION CONNECTED: the connection to MUME is up (the login prompt follows).',
      '- SESSION DISCONNECTED: the connection closed; %1 is the reason.',
      '- IAC SB GMCP <Package>: a GMCP message from MUME, for example IAC SB GMCP Char.Vitals; %0 is the package name and %1 its data as JSON text.',
      '- IAC SB GMCP: every GMCP message, same arguments.',
      'Other tt++ event names are accepted but never happen.',
    ],
    examples: [
      {
        code: '#variable {target} {orc}\n#event {SESSION DISCONNECTED} {#variable {target} {};#showme {<Fff4040>## Link lost: %1<099>}}',
        check: {
          events: [['SESSION DISCONNECTED', 'mume', 'closed by the server']],
          vars: { target: '' },
          shows: ['## Link lost: closed by the server'],
        },
      },
      {
        code: '#event {IAC SB GMCP Char.Name} {#showme {<F80c0ff>## %0: %1<099>}}',
        check: {
          events: [['IAC SB GMCP Char.Name', 'Char.Name', '{"name":"Gimli"}']],
          shows: ['## Char.Name: {"name":"Gimli"}'],
        },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#format',
    covers: ['format'],
    syntax: ['#format {variable} {format} {argument} {argument} …'],
    text: [
      'Builds a text and stores it in a variable. Each code in the format takes the next argument: %s text, %d whole number, %f number with decimals (%.1f), %u upper case, %l lower case, %n first letter capital, %L length. %t is the time now (HH:MM:SS).',
      'A number sets the width: %-8s pads on the right, %8s on the left. Inside Commands a code that starts with a digit needs %% (%%8s, %%03d), because %8 alone is an argument.',
    ],
    examples: [
      {
        code: '#alias {greet} {#format {who} {%n} {%1};say Well met, $who!}',
        check: { type: ['greet gimli'], vars: { who: 'Gimli' }, sends: ['say Well met, Gimli!'] },
      },
      {
        code: '#variable {hp} {87}\n#alias {rep} {#format {line} {%-8s%%4d hp} {%1} {$hp};#showme {## $line}}',
        check: { type: ['rep Gimli'], vars: { line: 'Gimli     87 hp' }, shows: ['## Gimli     87 hp'] },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#gag',
    covers: ['gag', 'ungag'],
    syntax: ['#gag {pattern}', '#ungag {pattern}'],
    text: [
      'Hides every line that matches Pattern. Actions still see the line. A gag looks at the line after substitutes have changed it.',
    ],
    examples: [
      {
        code: '#gag {^The day has begun.}\n#gag {%* flies in from %*}',
        check: { lines: ['The day has begun.', 'A crow flies in from the east.', 'You are hungry.'], shows: ['You are hungry.'] },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#help',
    covers: ['help'],
    syntax: ['#help', '#help command', '#help topic'],
    text: [
      'Typed on the input line. Alone, it lists the commands and the topics of this manual in the game window.',
      'With a command it shows that command here: #help alias. The word can be shortened as commands can, and the # may be left out or written: #help al, #help #alias, #help unalias. With a topic it shows that part of Basics: #help patterns.',
    ],
    examples: [
      { via: 'input', code: '#help' },
      { via: 'input', code: '#help highlight' },
      { via: 'input', code: '#help colours' },
    ],
  },
  {
    group: 'commands',
    heading: '#highlight',
    covers: ['highlight', 'unhighlight'],
    syntax: ['#highlight {pattern} {color} {priority}', '#unhighlight {pattern}'],
    text: [
      'Colours the text that matches Pattern in the game window, every time it occurs in a line. Only the matched text is coloured: a Pattern that covers the line (^%1 tells you %2) colours the whole line.',
      'Color is colour names or a colour code, see Colours. Highlights are applied after substitutes, in priority order; where two overlap, the later one wins.',
    ],
    examples: [
      {
        code: '#highlight {orc} {light red}\n#highlight {^%1 tells you %2} {Yellow}\n#highlight {You feel less protected.} {reverse Red}',
        check: { lines: ['An orc arrives.'], shows: ['An orc arrives.'] },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#if',
    covers: ['if'],
    syntax: ['#if {condition} {commands}', '#if {condition} {commands} {else commands}'],
    text: [
      'Runs Commands when the condition is true. #elseif and #else may follow in the same command list, after a ; or directly.',
      'Conditions: == != < > <= >= compare. Text goes in quotes, "$target" == "orc", and a * on the right-hand side matches any text: "$target" == "*orc*". && is and, || is or, ! is not; ( ) group.',
      'True means a number other than 0, or a text that is not empty and not "0".',
    ],
    examples: [
      {
        code: '#variable {hp} {100}\n#alias {heal} {#if {$hp < 50} {quaff potion} {#showme {## No need: $hp hp}}}',
        check: { type: ['heal', '#variable {hp} {31}', 'heal'], shows: ['## No need: 100 hp'], sends: ['quaff potion'], says: ['#variable {hp} {31}'] },
      },
      {
        code: "#action {^%1 has arrived from %2.$} {#if {\"%1\" == \"*orc*\" || \"%1\" == \"*troll*\"} {#showme {<Fff4040>## ENEMY from %2<099>}}}",
        check: {
          lines: ['A grim orc has arrived from the north.', 'A hobbit has arrived from the east.'],
          shows: ['## ENEMY from the north', 'A grim orc has arrived from the north.', 'A hobbit has arrived from the east.'],
        },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#macro',
    covers: ['macro', 'unmacro'],
    syntax: ['#macro {key} {commands}', '#unmacro {key}'],
    text: [
      'Runs Commands when the key is pressed on the input line. Key is a key name, see Keys. A macro has no arguments and no priority.',
    ],
    examples: [
      {
        code: '#variable {target} {orc}\n#macro {F1} {kill $target}\n#macro {F2} {#variable {target} {};#showme {## Target cleared}}',
        check: { keys: ['F1', 'F2'], sends: ['kill orc'], shows: ['## Target cleared'], vars: { target: '' } },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#math',
    covers: ['math'],
    syntax: ['#math {variable} {expression}'],
    text: [
      'Calculates and stores the result in a variable: + - * / and % (remainder), ** (power), ( ), and the comparisons of #if, which give 1 or 0.',
      'Whole numbers stay whole: 7 / 2 is 3, and 7.0 / 2 is 3.5.',
    ],
    examples: [
      {
        code: '#variable {kills} {0}\n#action {is dead! R.I.P.} {#math {kills} {$kills + 1};#showme {<Fffcc00>## Kills: $kills<099>}}',
        check: {
          lines: ['An orc is dead! R.I.P.', 'A troll is dead! R.I.P.'],
          vars: { kills: '2' },
          shows: ['## Kills: 1', 'An orc is dead! R.I.P.', '## Kills: 2', 'A troll is dead! R.I.P.'],
        },
      },
      {
        code: '#alias {share} {#math {part} {%1 / 3};#showme {## Each gets $part of %1}}',
        check: { type: ['share 100', 'share 100.0'], shows: ['## Each gets 33 of 100', '## Each gets 33.3 of 100.0'] },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#message',
    covers: ['message'],
    syntax: ['#message', '#message {kind}', '#message {kind} {on|off}'],
    text: [
      'Switches the confirmations of typed commands on or off, one kind at a time. All are on to begin with. The kinds are actions, aliases, classes, delays, events, gags, highlights, macros, substitutes, tickers and variables; a kind can be shortened as commands can (var, al, sub), and all means every kind.',
      'Alone, #message lists each kind and whether it is on. With a kind it switches that kind over; with on or off it sets it.',
      'Typed on the input line, the setting is saved: the profile gets a #message {kind} {off} line for each kind that is off, and none for a kind that is on. Only what is shown changes: with a kind off, its commands work and are saved as before, and the listing forms (#alias, #variable {name}) still answer.',
    ],
    examples: [
      {
        note: 'No confirmations when variables are set:',
        code: '#message {variables} {off}',
      },
      {
        via: 'input',
        code: '#message var off;#var target orc;#alias k kill $target',
        check: { vars: { target: 'orc' }, says: ['#message {variables} off', '#alias {k} {kill $target}'] },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#nop',
    covers: ['nop'],
    syntax: ['#nop text'],
    text: ['A comment: does nothing. Braces in the text must still be in pairs, and inside Commands a ; ends it.'],
    examples: [{ code: '#nop ---- Combat ----\n#alias {k} {kill %1}', check: { type: ['k orc'], sends: ['kill orc'] } }],
  },
  {
    group: 'commands',
    heading: '#showme',
    covers: ['showme'],
    syntax: ['#showme {text}'],
    text: [
      'Prints text in the game window, for you only; nothing is sent to the game. Colour codes and $variables work.',
      'The line is treated like a line from the game: actions, substitutes, gags and highlights apply to it.',
    ],
    examples: [
      {
        code: '#variable {spell} {armour}\n#alias {sp} {#showme {<F9aa8b7>## SPELL: <Fffffff>$spell<099>}}',
        check: { type: ['sp'], shows: ['## SPELL: armour'] },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#substitute',
    covers: ['substitute', 'unsubstitute'],
    syntax: ['#substitute {text} {new text} {priority}', '#unsubstitute {text}'],
    text: [
      'Replaces Text with New text in the game window, every time it occurs in a line (with ^, once). %1 %2 … matched in Text can be used in New text, and so can $variables.',
      'Actions still see the original line. A colour code in New text colours the new text only, not the rest of the line.',
    ],
    examples: [
      {
        code: '#substitute {%1 massacres %2} {%1 <Fff4040>MASSACRES<099> %2}\n#substitute {^You flee head over heels.} {<B800000><Fffffff> FLED <099>}',
        check: {
          lines: ['An orc massacres you with its hit.', 'You flee head over heels.'],
          shows: ['An orc MASSACRES you with its hit.', ' FLED '],
        },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#ticker',
    covers: ['ticker', 'unticker'],
    syntax: ['#ticker {name} {commands} {seconds}', '#unticker {name}'],
    text: [
      'Runs Commands every so many seconds until it is removed. A ticker of the same name replaces the old one. The shortest interval is 0.05 seconds.',
      'Tickers stop when the profile is loaded again; one defined at the top level of the profile starts with it. While you are not connected, what a ticker sends is dropped.',
    ],
    examples: [
      {
        code: '#alias {watch} {#ticker {watch} {where} {30}}\n#alias {nowatch} {#unticker {watch}}',
        check: { type: ['watch'], wait: 65, sends: ['where', 'where'] },
      },
    ],
  },
  {
    group: 'commands',
    heading: '#variable',
    covers: ['variable', 'unvariable'],
    syntax: ['#variable {name} {value}', '#variable {name}', '#unvariable {name}'],
    text: [
      'Stores Value under Name; $name puts it in, see Variables. With only a name it shows the value, with nothing it lists all variables.',
      "A #variable line at the top level of the profile is the variable's starting value, and it is updated when the value changes, see What is saved. #unvariable removes a variable; a * matches any text.",
    ],
    examples: [
      {
        code: '#variable {container} {pack}\n#alias {pa} {put %1 $container}\n#alias {setc} {#variable {container} {%1};#showme {## Container: $container}}',
        check: {
          type: ['pa sword', 'setc quiver', 'pa arrow'],
          sends: ['put sword pack', 'put arrow quiver'],
          shows: ['## Container: quiver'],
        },
      },
    ],
  },
];

/** `#a #b #c` for the commands in `list`. */
function names(list: readonly CommandEntry[]): string {
  return list.map((c) => '#' + c.name).join(' ');
}

/** The closing section, derived from the command table so it cannot drift. */
function endSections(): HelpSection[] {
  const unsupported = COMMANDS.filter((c) => c.tier === 'unsupported');
  const inert = COMMANDS.filter((c) => c.tier === 'inert');
  const byHint = new Map<string, CommandEntry[]>();
  for (const c of inert) {
    const h = c.hint ?? '';
    const l = byHint.get(h);
    if (l) l.push(c);
    else byHint.set(h, [c]);
  }
  const text = [
    'These tt++ commands are not supported yet. They stay in the profile as written and do nothing:',
    names(unsupported),
    'These are kept as written too and do nothing in a browser:',
  ];
  for (const [hint, list] of byHint) text.push(`- ${hint} ${names(list)}`);
  text.push('In the EDITOR view such a command has a wavy underline, and a note at the bottom says why when the cursor is on its line.');
  return [{ group: 'end', heading: 'Not supported', topics: ['unsupported'], text }];
}

/** Every section of the manual, in display order. */
export function helpSections(): HelpSection[] {
  return [...INTRO, ...BASICS, ...COMMAND_SECTIONS, ...endSections()];
}

// ----------------------------------------------------------------- layout

export type HelpLineKind = 'blank' | 'group' | 'heading' | 'syntax' | 'text' | 'note' | 'code';

export interface HelpSeg {
  text: string;
  /** A syntax class (`wc-syn-<cls>`), for code rows. */
  cls?: TokenClass;
}

export interface HelpLine {
  kind: HelpLineKind;
  /** Cells of indent before the text. */
  indent: number;
  segs: HelpSeg[];
}

const GROUP_TITLES: Readonly<Record<HelpGroup, string | null>> = {
  intro: null,
  basics: 'Basics',
  commands: 'Commands',
  end: null,
};

/** Indent of syntax rows and examples, in cells. */
export const CODE_INDENT = 4;

const cps = (s: string): number => [...s].length;

/**
 * One source line of code as rows of at most `width` cells, keeping its
 * tokens. A row breaks after a space when there is one in its second half,
 * else anywhere; continuation rows keep the line's own indent plus two.
 */
function codeRows(src: string, width: number): HelpSeg[][] {
  const chars = [...src];
  // A class per character, from the lexer (offsets are UTF-16 units).
  const cls: (TokenClass | undefined)[] = [];
  const toks = tokenizeLine(src);
  let unit = 0;
  let ti = 0;
  for (const ch of chars) {
    while (ti < toks.length && toks[ti]!.to <= unit) ti++;
    const t = toks[ti];
    cls.push(t && t.from <= unit ? t.cls : undefined);
    unit += ch.length;
  }
  const lead = /^ */.exec(src)![0].length;
  const cont = Math.min(lead + 2, Math.max(0, width - 8));
  const rows: HelpSeg[][] = [];
  let at = 0;
  do {
    const first = rows.length === 0;
    const room = Math.max(1, width - (first ? 0 : cont));
    let end = Math.min(chars.length, at + room);
    if (end < chars.length) {
      let sp = end;
      while (sp > at && chars[sp - 1] !== ' ') sp--;
      if (sp - at > room / 2) end = sp;
    }
    const row: HelpSeg[] = first || cont === 0 ? [] : [{ text: ' '.repeat(cont) }];
    for (let k = at; k < end; k++) {
      const last = row[row.length - 1];
      const c = cls[k];
      if (last && last.cls === c && (k > at || first)) last.text += chars[k];
      else row.push(c ? { text: chars[k]!, cls: c } : { text: chars[k]! });
    }
    rows.push(row);
    at = end;
  } while (at < chars.length);
  return rows;
}

/** Wraps a paragraph; a `- ` item keeps a hanging indent. */
function paragraph(out: HelpLine[], text: string, width: number): void {
  const item = text.startsWith('- ');
  const w = Math.max(10, width - (item ? 2 : 0));
  wrapText(item ? text.slice(2) : text, w).forEach((l, i) =>
    out.push({ kind: 'text', indent: 0, segs: [{ text: (item ? (i === 0 ? '- ' : '  ') : '') + l }] }),
  );
}

const isItem = (p: string | undefined): boolean => p !== undefined && p.startsWith('- ');

export interface HelpLayout {
  lines: HelpLine[];
  /** Row of each section heading, in order (for the n / p jump). */
  headings: number[];
}

/** Text wrapped to `width` cells as `text` rows (a `- ` item keeps a hanging indent). */
export function helpParagraph(text: string, width: number): HelpLine[] {
  const out: HelpLine[] = [];
  paragraph(out, text, Math.max(24, width));
  return out;
}

/**
 * The manual as rows `width` cells wide. `groups: false` leaves out the
 * group titles (one section shown alone, as `#help alias` does).
 */
export function helpLayout(
  width: number,
  sections: readonly HelpSection[] = helpSections(),
  opts: { groups?: boolean } = {},
): HelpLayout {
  const w = Math.max(24, width);
  const lines: HelpLine[] = [];
  const headings: number[] = [];
  const blank = (): void => {
    if (lines.length > 0 && lines[lines.length - 1]!.kind !== 'blank') lines.push({ kind: 'blank', indent: 0, segs: [] });
  };
  let group: HelpGroup | null = null;
  for (const s of sections) {
    blank();
    if (s.group !== group) {
      group = s.group;
      const title = GROUP_TITLES[group];
      if (title && opts.groups !== false) {
        lines.push({ kind: 'group', indent: 0, segs: [{ text: `─── ${title} ───` }] });
        blank();
      }
    }
    headings.push(lines.length);
    lines.push({ kind: 'heading', indent: 0, segs: [{ text: s.heading }] });
    for (const syn of s.syntax ?? []) {
      for (const row of codeRows(syn, w - CODE_INDENT)) {
        lines.push({ kind: 'syntax', indent: CODE_INDENT, segs: [{ text: row.map((r) => r.text).join('') }] });
      }
    }
    if (s.syntax?.length) blank();
    s.text.forEach((p, i) => {
      // Paragraphs are set apart; a list stays with its lead-in line.
      if (i > 0 && !isItem(p)) blank();
      paragraph(lines, p, w);
    });
    for (const ex of s.examples ?? []) {
      blank();
      if (ex.note) for (const l of wrapText(ex.note, w)) lines.push({ kind: 'note', indent: 0, segs: [{ text: l }] });
      for (const src of ex.code.split('\n')) {
        for (const row of codeRows(src, w - CODE_INDENT)) lines.push({ kind: 'code', indent: CODE_INDENT, segs: row });
      }
    }
  }
  return { lines, headings };
}

/** Plain text of a row (indent included), for tests and width checks. */
export function helpLineText(l: HelpLine): string {
  return ' '.repeat(l.indent) + l.segs.map((s) => s.text).join('');
}

/** Width of a row in cells. */
export function helpLineWidth(l: HelpLine): number {
  return l.indent + l.segs.reduce((n, s) => n + cps(s.text), 0);
}

/**
 * The section to put on the top row for `n` (`dir` 1: the next one) or `p`
 * (-1: the current one's heading when `top` is below it, else the previous
 * one). `section` is the current section.
 */
export function helpStep(headings: readonly number[], top: number, section: number, dir: 1 | -1): number {
  if (dir === 1) return Math.min(headings.length - 1, section + 1);
  return top > (headings[section] ?? 0) ? section : Math.max(0, section - 1);
}

// ------------------------------------------------------- navigation menu

export interface HelpMenuRow {
  kind: 'blank' | 'group' | 'entry';
  label: string;
  /** Index of the section (and of its row in `HelpLayout.headings`); -1 for labels and blanks. */
  section: number;
}

/**
 * The navigation menu: one entry per section in manual order, with the
 * group titles as labels. A blank row sets each group apart.
 */
export function helpMenu(sections: readonly HelpSection[] = helpSections()): HelpMenuRow[] {
  const rows: HelpMenuRow[] = [];
  let group: HelpGroup | null = null;
  sections.forEach((s, i) => {
    if (s.group !== group) {
      group = s.group;
      if (rows.length > 0) rows.push({ kind: 'blank', label: '', section: -1 });
      const title = GROUP_TITLES[group];
      if (title) rows.push({ kind: 'group', label: title, section: -1 });
    }
    rows.push({ kind: 'entry', label: s.heading, section: i });
  });
  return rows;
}

/** Width of the menu's text column: the longest label and a cell on each side. */
export function helpMenuWidth(menu: readonly HelpMenuRow[]): number {
  return menu.reduce((n, r) => Math.max(n, cps(r.label)), 0) + 2;
}

/** The menu row of section `section`, or 0. */
export function helpMenuRow(menu: readonly HelpMenuRow[], section: number): number {
  return Math.max(0, menu.findIndex((r) => r.kind === 'entry' && r.section === section));
}

/** The section the manual shows at row `top`: the last heading at or above it. */
export function helpCurrent(headings: readonly number[], top: number): number {
  let cur = 0;
  for (let i = 0; i < headings.length && headings[i]! <= top; i++) cur = i;
  return cur;
}

/** Cells between the menu's scrollbar and the manual. */
export const HELP_MENU_GAP = 3;
/** The narrowest manual column the menu may leave; below it the menu is hidden. */
export const HELP_MIN_W = 52;

export interface HelpFrame {
  /** Whether the menu is shown. */
  menu: boolean;
  /** Left cell of the menu. */
  menuAt: number;
  /** Left cell and width of the manual column (text, a blank cell, the scrollbar). */
  at: number;
  width: number;
}

/**
 * Where the menu and the manual go in a frame `cols` wide whose centred
 * column is `W` cells at `at`. The menu (`menuW` cells, its scrollbar and
 * the gap) goes in the left margin. With too little margin the manual moves
 * right, then narrows; under HELP_MIN_W the menu is dropped and the manual
 * keeps the centred column.
 */
export function helpFrame(cols: number, W: number, at: number, menuW: number): HelpFrame {
  const side = menuW + 1 + HELP_MENU_GAP;
  const menuAt = Math.max(1, at - side);
  const left = menuAt + side;
  const width = Math.min(W, cols - 1 - left);
  if (width < HELP_MIN_W) return { menu: false, menuAt: 0, at, width: W };
  return { menu: true, menuAt, at: left, width };
}
