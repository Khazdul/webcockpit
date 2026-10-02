// The script manual's guide (stage 10): how to write a Lua script for
// WebCockpit, as data for the HELP view. The A–Z API reference is built by
// the UI from SCRIPT_API (lua-api.ts) and the Lua reference from LUA_REF
// (lua-ref.ts); this file holds the chapters.
//
// Every statement describes what the code does: src/scripts/host.ts (the
// API), header.ts, colors.ts, patterns.ts, guard.ts, library.ts,
// src/lua/sandbox.ts and runtime.ts (limits), ADR 0051. Every Lua example
// compiles and calls only API and Lua library functions
// (tests/unit/script-manual.test.ts).
//
// Pure data: no imports besides the section type.

import type { HelpSection } from "./help";

const GETTING_STARTED: HelpSection = {
  group: "guide",
  heading: "Getting started",
  text: [
    "A script is a small Lua 5.4 program that reacts to the game: it can watch the lines MUME sends, add aliases and keys, run timers, read GMCP data and send commands. Scripts live in a library beside the profile, not in it. A script that is on runs whichever profile you use.",
    "Open the Scripts page with ESC → Options → Scripts, or Options → Scripts on the start page. It lists every script:",
    "- [X] turns a script on or off. A dot after the name means it is running; ! means it is on but failed to load, with the problem in red under its row.",
    "- EDIT opens the script in the editor. The panel on the right shows the selected script's help: summary, aliases, keys, help text and settings.",
    "- Scripts with a lock are bundled with WebCockpit. They are read-only and are updated with each release. DUPLICATE in the editor makes your own copy, named <name>-copy, which you can change. The copy starts off, with the same settings and an empty store.",
    "Your first script, step by step:",
    "- Press NEW and give it a name: a letter, then letters, digits, _ or -, at most 32 characters.",
    "- The editor opens with a template: a header (the comment lines at the top) and one trigger. Change it, or write your own below the header.",
    "- Press Ctrl+S to save. A new script starts off: turn it on with its toggle on the Scripts page, or type #script enable <name>.",
    "- From then on every save applies at once: the script stops, everything it made (triggers, aliases, keys, timers, handlers) is removed, and its code runs again from the top.",
    "The editor helps while you type:",
    "- Errors are marked in red: a dot in the margin, a red band on the line and the message on hover. The code is only compiled for this, never run. The status row above the footer shows the first error. An error elsewhere shows at once; one in the line you are typing (or code you have not finished, such as a function without its end) waits until you leave the line, pause for a moment, or save.",
    "- Tab indents and Shift+Tab dedents (a selection: its lines). Enter after a line that opens a block (function …(), if … then, for … do, while … do, repeat) adds the end (or until) below, unless the block has one already.",
    "- A known name typed in the wrong case is corrected when you finish the word: temptrigger( becomes tempTrigger(. Ctrl+Z undoes the correction, and that spelling is then left alone.",
    "- An error the saved script hit while running is marked on its line too, dashed, until you edit that line or save.",
    "- Ctrl+Space completes API and Lua names and keywords; for, if, while and function expand to a whole block, and Tab moves between its fields. The mouse over a name shows its help. Inside a call's parentheses a pop-up shows its parameters, the current one marked (ESC closes it). F1 opens this manual at the name under the cursor.",
    "- Ctrl+F finds and replaces. ESC leaves the editor and asks first when there are unsaved changes.",
  ],
  examples: [
    {
      note: "The template NEW starts from:",
      lang: "lua",
      code: '-- @name     myscript\n-- @summary  What this script does\n-- @api      1\n-- @help     How to use it: one line per @help tag.\n\ntempTrigger("You are hungry.", function()\n  echo("Time to eat!")\nend)',
    },
    {
      note: "A first change: eat instead of just saying so.",
      lang: "lua",
      code: 'tempTrigger("You are hungry.", function()\n  send("eat bread")\nend)',
    },
  ],
};

const LUA_BASICS: HelpSection = {
  group: "guide",
  heading: "Lua basics",
  text: [
    "A short primer on the Lua you need for scripts. Every Lua function a script can use is in the Lua reference at the end of this manual, and the editor shows the same help on hover and while you type.",
    "Values. A value is nil (nothing), a boolean (true or false), a number (42, 3.5), a string (\"text\"), a table or a function. type(v) tells which.",
    "Variables. local name = value makes a variable that lives until the end of its block: the function, loop or file it is in. Without local the name is global to your script (other scripts never see it). Use local nearly always. A variable that was never set is nil, not an error.",
    "Strings. Write them in double or single quotes, or as [[long strings]] that keep backslashes and line breaks. Join them with .. (two dots), and #s is the length. Strings have methods: line:upper(), line:find(\"orc\"), line:match(\"%d+\"). They never change in place; the methods return new strings.",
    "Tables. One structure for lists and records. A list: local mobs = { \"orc\", \"troll\" }. mobs[1] is \"orc\" (counting starts at 1), #mobs is 2, and table.insert(mobs, \"wolf\") adds one at the end. A record: local me = { name = \"Gandalf\", hp = 100 }. me.name and me[\"name\"] are the same field. gmcp, state and settings are tables too.",
    "Conditions. if … then … elseif … then … else … end. Compare with == and ~= (not equal), <, <=, > and >=; combine with and, or and not. Only false and nil count as false: 0 and \"\" are true.",
    "Loops. for i = 1, 10 do … end counts. for i, v in ipairs(list) do … end walks a list in order; for k, v in pairs(t) do … end walks every key of a table. while cond do … end and repeat … until cond loop on a condition. break leaves a loop.",
    "Functions. local function name(a, b) … return a + b end. A function is a value: tempTrigger takes one, usually written in place as function() … end. A function may return several values: local ok, err = pcall(f).",
    "Comments. -- starts a comment to the end of the line; --[[ … ]] spans several lines.",
    "Common mistakes:",
    "- Not equal is ~=, not !=.",
    "- Lists start at 1, not 0, and #t counts up to the first nil.",
    "- Join strings with .., not +: \"HP: \" + 5 is an error.",
    "- = sets a variable, == compares: if hp = 0 then is a syntax error.",
    "- A missing field is nil, and indexing nil is an error: gmcp.Char.Vitals.hp fails while gmcp.Char is nil. Test step by step: local v = gmcp.Char and gmcp.Char.Vitals.",
    "- Every if, for, while, do and function needs its own end.",
    "- A local made inside a block is gone after its end; declare it before the block to keep it.",
  ],
  examples: [
    {
      note: "Values, strings and a condition:",
      lang: "lua",
      code: 'local name = "Gandalf"\nlocal hp, maxhp = 80, 120\nlocal pct = math.floor(hp * 100 / maxhp)\nif pct < 50 and name ~= "" then\n  echo(name .. " is hurt: " .. pct .. "%")\nend',
    },
    {
      note: "A list and a record:",
      lang: "lua",
      code: 'local mobs = { "orc", "troll" }\ntable.insert(mobs, "wolf")\nfor i, mob in ipairs(mobs) do\n  echo(i .. ": " .. mob)\nend\n\nlocal me = { name = "Frodo", hp = 40 }\nme.hp = me.hp + 10\nfor key, value in pairs(me) do\n  print(key, value)\nend',
    },
    {
      note: "A function with a default, and several return values:",
      lang: "lua",
      code: 'local function split(text, sep)\n  sep = sep or ","\n  local a, b = text:match("^(.-)" .. sep .. "(.*)$")\n  return a, b\nend\nlocal first, rest = split("orc,troll")',
    },
  ],
};

const LUA_PATTERNS: HelpSection = {
  group: "guide",
  heading: "Lua patterns",
  syntax: [
    ".     any character       %a     letter                %d    digit",
    "%s    space               %w     letter or digit       %p    punctuation",
    "%l    lower case          %u     upper case            %x    hex digit",
    "[abc] a, b or c           [^,]   not a comma           [%w_] word character",
    "*     0 or more, longest  -      0 or more, shortest",
    "+     1 or more           ?      0 or 1",
    "^     start of the text   $      end of the text",
    "( )   capture             %1     the first capture",
    "%b()  a balanced (…)      %f[%w] frontier: a word start",
    "%A %D %S %W …  the opposite: not a letter, not a digit …",
    "%.    a literal dot; % escapes any symbol: %% %( %[ %- %+",
  ],
  text: [
    "string.match, find, gmatch and gsub take Lua patterns. They look like regular expressions but are smaller, and % takes the place of the backslash: %d is a digit, %s a space, %. a real dot. tempRegexTrigger and tempAlias take JavaScript regular expressions instead, and tempTrigger plain text.",
    "Patterns have no alternation (a|b), no counted repeats ({2,3}) and no repeats of a group ((ab)+). Use two patterns or a loop instead.",
    "The repeat - takes the shortest run and * the longest: in \"a (b) (c)\", %((.-)%) captures b, but %((.*)%) captures b) (c.",
    "Each ( ) capture gives the text it matched: match returns all captures, or the whole match when there are none. With ^ and $ the pattern must match the whole line.",
    "To find plain text, pass true as find's fourth argument: line:find(\"a.b\", 1, true) looks for a, a dot and b.",
    "A pattern with two or more .- .* or .+ can take very long to fail on a long line, so scripts refuse it with pattern too complex. Anchor it and prefer narrow classes such as %a+, %S+ or [^']+.",
  ],
  examples: [
    {
      note: "Captures from a game line:",
      lang: "lua",
      code: 'local who, msg = line:match("^(%a+) tells you \'(.*)\'$")\nif who then\n  uiMessage("tell", who .. ": " .. msg)\nend',
    },
    {
      note: "Every number in a line, and a trimmed, squeezed copy:",
      lang: "lua",
      code: 'for n in line:gmatch("%d+") do\n  print(tonumber(n))\nend\nlocal trimmed = line:match("^%s*(.-)%s*$")\nlocal squeezed = line:gsub("%s+", " ")',
    },
  ],
};

const HEADER: HelpSection = {
  group: "guide",
  heading: "The header",
  syntax: [
    "-- @name     <name>",
    "-- @summary  <one line>",
    "-- @api      1",
    "-- @alias    <alias>  <what it does>",
    "-- @key      <key>  <what it does>",
    '-- @setting  <name> <type> <default> "<label>"',
    "-- @help     <a line of help>",
  ],
  text: [
    "The header is the run of -- comment lines (blank lines may come between them) at the top of the script, before the first line of code. A --[[ block comment also ends it. Each tag is a comment line -- @tag value. Other comment lines in the header are fine; unknown tags are ignored.",
    "- @name is the script's name: a letter, then letters, digits, _ or -, at most 32 characters, unique among all scripts. When you save with a new free name, the script is renamed; a name that is taken or not valid is not used and you get a warning.",
    "- @summary is one line, shown in #script list and at the top of the help.",
    "- @api says which version of the script API the script is written for. It must be 1. A script without it, or with another number, does not load.",
    "- @alias and @key document an alias or a key for the help: the first word is the alias or key, the rest says what it does. They do not make the alias or bind the key; tempAlias and tempKey do. Both may repeat. The profile editor warns about a macro on a key that an enabled script declares with @key.",
    "- @setting declares a setting the player can change: its name (letters, digits and _), its type (number, string or boolean), its default and a label in quotes. A boolean default is true or false (on, off, yes, no, 1 and 0 work too); a string default may be quoted. The script reads it as settings.<name>. A bad @setting line is skipped and shown as a problem in the editor.",
    "- @help adds one line to the help text. It may repeat; an empty @help gives a blank line.",
    "The Scripts page and #script help build the script's help from these tags: summary, aliases, keys, help text and each setting with its current value and the #script set command that changes it.",
  ],
  examples: [
    {
      note: "A full header:",
      lang: "lua",
      code: '-- @name     autoeat\n-- @summary  Eats and drinks when you need it\n-- @api      1\n-- @alias    ae      Turn it on or off\n-- @key      F9      Eat now\n-- @setting  food    string  bread  "What to eat"\n-- @setting  drink   string  water  "What to drink from"\n-- @setting  enabled boolean true   "Eat and drink by itself"\n-- @help     Eats when you are hungry and drinks when you are thirsty.\n-- @help\n-- @help     Change the food with #script set autoeat food apple.',
    },
  ],
};

const TRIGGERS: HelpSection = {
  group: "guide",
  heading: "Triggers",
  syntax: [
    "tempTrigger(substring, fn) → id",
    "tempRegexTrigger(regex, fn) → id",
    "killTrigger(id)",
  ],
  text: [
    "A trigger calls a function for every game line that matches. It is the script's #action.",
    "- tempTrigger(substring, fn) matches a line that contains substring anywhere, as plain text. It is case-sensitive.",
    "- tempRegexTrigger(regex, fn) matches a regular expression. The syntax is JavaScript's, not the PCRE Mudlet uses; the common parts (\\d, \\w, \\s, classes, groups, (?: ), ^ and $) are the same. It is case-sensitive. Use ^ and $ to match a whole line.",
    'In a Lua string a backslash must be doubled: "^You receive (\\\\d+) coins\\\\.$". A long string keeps backslashes as they are: [[^You receive (\\d+) coins\\.$]].',
    "Inside the function:",
    "- line is the whole line, as text without colours.",
    "- matches[1] is the matched text, matches[2], matches[3] … the groups of a regex. A group that did not take part is an empty string.",
    "- deleteLine() hides the line (a gag). replaceLine(text) shows text instead; cecho colour tags work in it. highlight(color) colours the whole line, highlight(color, text) each occurrence of text.",
    "Only the shown copy changes. Other triggers still see the line as the game sent it, and the profile's substitutes, gags and highlights apply to the replaced text. Script highlights are applied last.",
    "Every trigger that matches a line runs: the profile's actions and the script triggers of every script. Rules of the same priority run in this order: the client's own and the profile's first, then script triggers in the order they were made. Script triggers have priority 5, the default for profile actions too.",
    "Text written by echo, cecho and print is not a game line: triggers never see it.",
    "A trigger lasts until killTrigger(id) or until the script stops. You never need to remove triggers when the script is saved or turned off; WebCockpit does it.",
  ],
  examples: [
    {
      note: "Pick up the coins after a kill:",
      lang: "lua",
      code: 'tempTrigger("is dead! R.I.P.", function()\n  send("get coins all.corpse")\nend)',
    },
    {
      note: "Groups in a regex, and a long string for the backslashes:",
      lang: "lua",
      code: 'tempRegexTrigger([[^(\\w+) tells you \'(.*)\'$]], function()\n  uiMessage("tell", matches[2] .. ": " .. matches[3])\n  highlight("light yellow")\nend)',
    },
    {
      note: "A trigger that removes itself after the first match:",
      lang: "lua",
      code: 'local id\nid = tempTrigger("You are hungry.", function()\n  send("eat bread")\n  killTrigger(id)\nend)',
    },
  ],
};

const ALIASES: HelpSection = {
  group: "guide",
  heading: "Aliases",
  syntax: ["tempAlias(regex, fn) → id", "killAlias(id)"],
  text: [
    "An alias calls a function for a command you type. tempAlias(regex, fn) matches the command with a JavaScript regular expression.",
    'The regex is not anchored for you, as in Mudlet: "^cl$" matches only cl, while "cl" matches every command that contains cl. Start almost every alias with ^ and end it with $ or a space.',
    "Inside the function, command (and line) is the typed command, and matches holds the match and its groups, as in a trigger.",
    "Only one alias takes a command. The command is used up: it is not sent to the game, unless the function returns false. Then the next alias that matches may take it, and if none does, it is sent to the game as typed.",
    "A profile alias of the same priority wins over a script alias. Aliases also match commands that expandAlias runs.",
    "killAlias(id) removes an alias. Like triggers, aliases are removed when the script stops.",
  ],
  examples: [
    {
      note: "An alias with an optional word: cl, cl on, cl off.",
      lang: "lua",
      code: 'local on = true\n\ntempAlias("^cl(?: (on|off))?$", function()\n  if matches[2] == "on" then\n    on = true\n  elseif matches[2] == "off" then\n    on = false\n  else\n    on = not on\n  end\n  echo("Coin looter " .. (on and "on." or "off."))\nend)',
    },
    {
      note: "Watch a command but let it through:",
      lang: "lua",
      code: 'tempAlias("^flee$", function()\n  cecho("<yellow>Fleeing!<reset>")\n  return false\nend)',
    },
  ],
};

const KEYS: HelpSection = {
  group: "guide",
  heading: "Keys",
  syntax: ["tempKey(name, fn) → id", "killKey(id)"],
  text: [
    "tempKey(name, fn) calls fn when you press the key. Key names are the same as in the profile's #macro:",
    "- Function keys F1 to F24, numpad keys Numpad0 to Numpad9 (Numpad 0 works too), NumpadAdd, NumpadSubtract, NumpadMultiply, NumpadDivide, NumpadDecimal, NumpadEnter.",
    "- Arrow keys ArrowUp (or Up), ArrowDown, ArrowLeft, ArrowRight; Home, End, PageUp, PageDown, Insert, Delete, Tab, Backspace.",
    "- Modifiers before the key, joined with +: Ctrl+F1, Alt+a, Ctrl+Shift+F5, Alt+1. Case does not matter.",
    "- The tt++ escape forms work too: \\eOp is Numpad0, \\e[15~ is F5, ^G is Ctrl+G.",
    "Names are physical keys: Alt+a is the key labelled A on a US keyboard, whatever your layout prints there.",
    "Some keys cannot be bound, and tempKey raises an error for them:",
    "- keys that type text: a letter, digit, space or punctuation key alone or with Shift (with Ctrl or Alt they are fine);",
    "- ESC (it opens the menu) and Enter without Ctrl, Alt or Meta (it sends the input line);",
    "- keys the browser keeps: Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Shift+W, Ctrl+Shift+T, Ctrl+Shift+N, Ctrl+Tab and Ctrl+Shift+Tab.",
    "A profile macro on the same key wins over the script. When two scripts bind the same key, the one bound last wins. The profile editor warns about a macro on a key a running script has bound.",
    "killKey(id) removes a binding. Keys are released when the script stops.",
  ],
  examples: [
    {
      note: "Numpad keys for fighting:",
      lang: "lua",
      code: 'tempKey("Numpad5", function()\n  send("flee")\nend)\n\ntempKey("Ctrl+F1", function()\n  send("rescue " .. (getVariable("tank") or ""))\nend)',
    },
  ],
};

const TIMERS: HelpSection = {
  group: "guide",
  heading: "Timers",
  syntax: [
    "tempTimer(seconds, fn) → id",
    "tempTimer(seconds, fn, true) → id",
    "killTimer(id)",
    "getEpoch() → seconds",
  ],
  text: [
    "tempTimer(seconds, fn) calls fn once, after seconds. Fractions work: 0.5 is half a second. 0 calls it as soon as the current work is done.",
    "tempTimer(seconds, fn, true) repeats: fn is called every seconds until you stop it. A repeating timer runs at most every 50 milliseconds (0.05 seconds).",
    "killTimer(id) stops a timer. It returns false when the timer is already gone; a one-shot timer is gone once it has fired.",
    "Timers stop when the script stops. To wait inside a function, start a timer; there is no sleep, and a loop that waits would hit the instruction budget.",
    "Lua's os library is not there. getEpoch() gives the time now in seconds since 1970, with milliseconds as the fraction. Timers stop with the script, so for something that must last past a reload, keep its end time (getEpoch() plus the seconds) in the store and start a new timer for what is left when the script runs again.",
  ],
  examples: [
    {
      note: "Stand up two seconds after you fall:",
      lang: "lua",
      code: 'tempTrigger("You are knocked to the ground", function()\n  tempTimer(2, function()\n    send("stand")\n  end)\nend)',
    },
    {
      note: "Restart a timer instead of stacking several:",
      lang: "lua",
      code: 'local warn = nil\n\ntempTrigger("You feel less protected.", function()\n  if warn then killTimer(warn) end\n  warn = tempTimer(5, function()\n    cecho("<red>Armour is still down!<reset>")\n    warn = nil\n  end)\nend)',
    },
  ],
};

const EVENTS: HelpSection = {
  group: "guide",
  heading: "Events and GMCP",
  syntax: [
    "registerAnonymousEventHandler(event, fn) → id",
    "killAnonymousEventHandler(id)",
  ],
  text: [
    "registerAnonymousEventHandler(event, fn) calls fn when the event happens. fn gets the event name first, then the event's arguments. Event names are matched without regard to case.",
    "The events:",
    "- gmcp.<Package>.<Message>, such as gmcp.Char.Vitals or gmcp.Room.Info: MUME sent that GMCP message; the data is in the gmcp table. As in Mudlet, every level above the message fires too, the outer one first: Char.Vitals raises gmcp.Char and then gmcp.Char.Vitals, so a handler for gmcp.Char runs for every Char message. fn gets the name of its own level, then the full name: a gmcp.Char handler is called with gmcp.Char and gmcp.Char.Vitals.",
    "- sysLoadEvent: once, for this script only, right after its code has run.",
    "- sysConnectionEvent: the connection to MUME is made and the login starts.",
    "- sysDisconnectionEvent: the connection was lost or closed. The second argument is the reason.",
    "- The profile's #event names: SESSION CONNECTED (argument mume), SESSION DISCONNECTED (mume and the reason), IAC SB GMCP <Package> (the package and its JSON text) and IAC SB GMCP for every GMCP message.",
    "Any other name is accepted but never fires: API 1 has no events of your own.",
    "The gmcp table holds the last data of each GMCP message, as in Mudlet: gmcp.Char.Vitals.hp, gmcp.Room.Info.name. It is read-only.",
    "- Char.Vitals and Char.StatusVars merge: MUME often sends only what changed (a Char.Vitals with just hp), so each message is merged key by key into the last one, and gmcp.Char.Vitals always has every field seen so far. A JSON null removes a field.",
    "- Every other message replaces the last one. They are whole snapshots (Char.Name, Room.Info, Group.Set, Comm.Channel.List) or one member or event per message (Group.Add, Group.Update, Group.Remove, Room.Chars, Comm.Channel.Text, Event.*), so gmcp.Group.Update is only the latest update of one member.",
    '- Field names with a dash need brackets: gmcp.Char.Vitals["hp-string"].',
    "- A message that has not arrived is nil. Outside a GMCP handler, test the package first: if gmcp.Char and gmcp.Char.Vitals then … end.",
    "- The table is cleared when a new connection starts. What MUME sent earlier in the session is there even when the first script is turned on later.",
    "The state table is a read-only view of what WebCockpit's own panes know:",
    "- state.char: name, fullname, vitals (the Char.Vitals fields, such as state.char.vitals.hp and state.char.vitals.mood) and status (the Char.StatusVars fields, such as state.char.status.race).",
    "- state.group: a list of the group members in your room, without you. Each has id, type (ally, or npc for a mercenary or key NPC with a label), name, label and hp, mana and mp, each a table { value, max, word }. A field MUME has not told is nil; word is the band word such as wounded.",
    "- state.room: the last Room.Info (see below).",
    "Common MUME GMCP messages and their fields:",
    "- Char.Name: name, fullname.",
    "- Char.StatusVars: name, fullname, race, subrace, subclass, level, next-level-xp, next-level-tp.",
    "- Char.Vitals: hp, maxhp, hp-string, mana, maxmana, mana-string, mp, maxmp, mp-string, xp, tp, mood, alertness, position, spell-effort, opponent, buffer, opponent-hits, buffer-hits, sneak, climb, swim, ride, ridden, hidden, carrying, light, fog, weather, mount-moves. Each message carries only some of them.",
    "- Group.Set (a list of members), Group.Add (one member), Group.Update (some fields of one member, by id), Group.Remove (a member id). A member has id, type, name, label, hp, maxhp, hp-string, mana, maxmana, mana-string, mp, maxmp, mp-string. Group messages are about the members in your room. Each message is about one member, so read the whole group from state.group, which applies them all.",
    "- Room.Info: id, area, name, desc, environment and exits (exits.n.id, exits.n.flags …). Room.Chars: the characters in the room.",
    "- Event.Moved: dir. Event.Sun, Event.Moon and Event.Darkness: what. Event.Achieved: what.",
    "- Comm.Channel.Text: channel, talker, talker-type, destination, text. Comm.Channel.List: the channels.",
  ],
  examples: [
    {
      note: "React to a GMCP message:",
      lang: "lua",
      code: 'registerAnonymousEventHandler("gmcp.Room.Info", function()\n  local room = gmcp.Room.Info\n  if room.area == "Bree" then\n    echo("Back in Bree: " .. room.name)\n  end\nend)',
    },
    {
      note: "Say hello once connected, and note a lost connection:",
      lang: "lua",
      code: 'registerAnonymousEventHandler("sysConnectionEvent", function()\n  uiMessage("script", "Connected.")\nend)\n\nregisterAnonymousEventHandler("sysDisconnectionEvent", function(event, reason)\n  uiMessage("script", "Disconnected: " .. tostring(reason))\nend)',
    },
    {
      note: "Read the group from state:",
      lang: "lua",
      code: 'tempAlias("^hurt$", function()\n  for _, m in ipairs(state.group) do\n    local hp = m.hp\n    if hp.value and hp.max and hp.value < hp.max / 2 then\n      echo((m.label or m.name) .. " is hurt: " .. hp.value .. "/" .. hp.max)\n    end\n  end\nend)',
    },
  ],
};

const OUTPUT: HelpSection = {
  group: "guide",
  heading: "Output",
  syntax: [
    "send(cmd)",
    "expandAlias(cmd)",
    "echo(text)",
    "cecho(text)",
    "print(...)",
    "uiMessage(source, text)",
  ],
  text: [
    "- send(cmd) sends one command to the game as it is. No aliases run, and ; and # are not special.",
    "- expandAlias(cmd) runs cmd as if you had typed it: profile and script aliases match, ; separates commands and # commands work.",
    "- echo(text) writes plain text to the game window. A line break starts a new line.",
    "- cecho(text) writes text with colour tags (below).",
    "- print(...) writes its arguments separated by tabs: strings and numbers as they are, booleans as true or false, nil and tables by their type name.",
    "- uiMessage(source, text) writes a line to the UI messages pane: ▶ SOURCE: text. The source is shown in capitals, at most 20 characters.",
    "What echo, cecho and print write is not a game line: triggers do not see it and runs do not record it. Inside a trigger it shows after the game line; elsewhere at once.",
    "Colour tags for cecho and replaceLine, in angle brackets:",
    "- Colour names: <red>, <green>, <orange>, <gold>, <light_blue>, <dark_green>, <hot_pink> and many more (Mudlet's names; case, spaces and _ do not matter).",
    "- The theme's palette: <ansi_red>, <ansi_light_red> … and <ansi_0> to <ansi_255>.",
    "- A background after a colon: <white:red>, or <:blue> for the background alone.",
    "- RGB: <255,128,0>, and <255,128,0:0,0,64> with a background.",
    "- tt++ codes as in #showme: <F88ff00> and <Fa0f> (24-bit), <B204060> (background), <118> (attribute, foreground, background digits; 1 is bold), <abc> to <fff> (256 colours), <g00> to <g23> (greys).",
    "- Hex, as in Mudlet's hecho: <#ff8000>, and <#ffffff:#000080> with a background.",
    "- Styles: <b> bold, <i> italic, <u> underline; </b>, </i> and </u> turn them off again.",
    "- <reset> or <r> goes back to the default colours and style.",
    "Anything else in angle brackets is shown as text, also Mudlet's <s> (strikethrough) and <o> (overline), which WebCockpit cannot show.",
    "highlight(color) takes a profile colour name (red, light red, bold yellow, bg blue, or a tt++ code such as <F88ff00>), any of the tags above (<b><orange>, <#ff8000>), or a colour without brackets (orange, white:red, 255,128,0, #ff8000).",
  ],
  examples: [
    {
      lang: "lua",
      code: 'send("kill orc")\nexpandAlias("stand;flee")\necho("Plain text.")\ncecho("<green>Ready<reset> to loot. <white:red> DANGER <reset>")\ncecho("<F88ff00>tt++ colours<reset> and <b><#ff8000>hex<reset> work too.")\nprint("hp", 120, true, nil)\nuiMessage("loot", "Picked up 12 coins.")',
    },
  ],
};

const PANES: HelpSection = {
  group: "guide",
  heading: "Panes",
  syntax: [
    "createPane{id, title, dock, rows, cols}",
    "pane:clear()  pane:echo(text)  pane:cecho(text)",
    "pane:setLine(row, text)  pane:gauge(row, {value, max, color, label})",
    "pane:cechoLink(text, fn, hint)  pane:setLink(row, col, len, fn, hint)",
    "pane:size()  pane:onResize(fn)  pane:setTitle(text)",
    "pane:show()  pane:hide()  pane:visible()",
  ],
  text: [
    "A script can draw its own pane: text, colours, bars and clickable spans. It docks, floats, toggles and takes a colour like the Character or Group pane.",
    "createPane{id = \"main\", title = \"Status\", dock = \"right\", rows = 6} makes the pane and returns it. Call its methods with a colon: pane:echo(\"hi\"). dock is \"right\", \"left\", \"top\", \"bottom\" or \"float\"; rows (a side dock) and cols (the top or bottom dock) are the size you would like. They only place a new pane: from then on it stays where the player puts it, also after a reload or a restart.",
    "The pane is there while the script runs. Turning the script off, or saving it, takes the pane away; when the script creates it again, it comes back in the same place, with the colour and border the player chose. Options → Panes lists it under the built-in panes, by its title and script. createPane with an id the script already has returns the same pane.",
    "Writing text:",
    "- pane:echo(text) and pane:cecho(text) append to the last line, as Mudlet's echo: a \\n starts a new line. cecho takes the colour tags of Output.",
    "- pane:setLine(row, text) replaces one row (from 1), with colour tags. Rows past the end are added. This is the way to draw a status pane: one row per thing, redrawn when it changes.",
    "- pane:gauge(row, {value = 30, max = 60, color = \"orange\", label = \"30 min\"}) draws a full-width bar on a row, like the Group pane's bars.",
    "- pane:clear() empties the pane.",
    "A pane keeps at most 500 lines. Text wider than the pane is cut at its edge. When there are more lines than rows, the pane shows the newest lines, with ↑ N more rows on top.",
    "Links. Any span, down to one cell, can be clickable and have a tooltip:",
    "- pane:cechoLink(text, fn, hint) appends text (colour tags allowed) that calls fn when clicked.",
    "- pane:setLink(row, col, len, fn, hint) makes len cells of a row, from column col, a link. Draw the text first: setLine, gauge and clear remove the links on their rows.",
    "The pointer turns into a hand over a link, the link lights up and the hint shows under it. fn runs like any handler, with the instruction budget and the error rules of Sandbox and limits. In the log player and the HTML replay, links do nothing but keep their tooltips.",
    "Size. pane:size() returns rows, cols: the cells the pane has now (0, 0 while it is not shown). pane:onResize(fn) calls fn(rows, cols) when that changes, also when the pane is first shown; draw to fit there.",
    "pane:hide() and pane:show() switch the pane off and on, as its close cross and Options do; the choice is kept. pane:visible() tells whether it is on. pane:setTitle(text) changes the title.",
    "Pane methods are cheap: they change the pane's content, and the pane is drawn once per screen frame. Updating a pane from a trigger on every line is fine.",
  ],
  examples: [
    {
      note: "A status pane with a bar and a clickable order:",
      lang: "lua",
      code: 'local pane = createPane{id = "status", title = "Status", dock = "right", rows = 3}\n\nlocal function draw()\n  local v = gmcp.Char and gmcp.Char.Vitals\n  local hp, max = v and v.hp or 0, v and v.maxhp or 1\n  pane:gauge(1, {value = hp, max = max, color = "green", label = "HP " .. hp .. "/" .. max})\n  pane:setLine(2, "<yellow>[rest]<reset>  <yellow>[stand]")\n  pane:setLink(2, 1, 6, function() send("rest") end, "Rest to heal")\n  pane:setLink(2, 9, 7, function() send("stand") end, "Stand up")\nend\n\nregisterAnonymousEventHandler("gmcp.Char.Vitals", draw)\ndraw()',
    },
    {
      note: "A log pane and an alias that toggles it:",
      lang: "lua",
      code: 'local log = createPane{id = "tells", title = "Tells", dock = "float", rows = 6, cols = 40}\n\ntempRegexTrigger("^(\\\\w+) tells you \'(.*)\'$", function()\n  log:cecho("<cyan>" .. matches[2] .. "<reset>: " .. matches[3] .. "\\n")\nend)\n\ntempAlias("^tells$", function()\n  if log:visible() then log:hide() else log:show() end\nend)',
    },
  ],
};

const SETTINGS: HelpSection = {
  group: "guide",
  heading: "Settings and store",
  syntax: [
    "settings.<name>",
    "setSetting(name, value)",
    "scriptName",
    "store.get(key) → value",
    "store.set(key, value)",
  ],
  text: [
    "Settings are what the player may change without editing the code. Declare each one in the header with @setting; the script reads it as settings.<name>. An unset setting has its default. The settings table is read-only.",
    "The player changes a setting with #script set <script> <setting> <value>. The value is converted to the setting's type (a boolean takes true, false, on, off, yes, no, 1 or 0) and saved. The running script sees the new value at once, without a reload, so read settings.<name> when you need it rather than copying it into a local once.",
    "setSetting(name, value) lets the script save one of its own settings, as #script set does. The name must be declared with @setting. The save takes a moment: settings.<name> has the new value afterwards, not on the next line.",
    "scriptName is the script's own name. A Duplicate has another name than the original, so use scriptName when you tell the player a #script command.",
    "store is a small database for the script's own data, kept between sessions:",
    "- store.set(key, value) saves a string, number, boolean or a table of them under key. nil removes the key. Functions are not kept.",
    "- store.get(key) returns a copy of the value, or nil. Changing the table you got does not change the store until you store.set it again.",
    "- Values are in memory at once and written to the browser's storage about a second later, and when the page is hidden.",
    "- Each script has its own store. It survives reloads and new releases. Deleting a script deletes its store; a Duplicate starts with an empty one. In a browser without storage (some private windows) it lasts only for the page.",
  ],
  examples: [
    {
      note: "A setting the player can change, and one the script saves:",
      lang: "lua",
      code: '-- @name     autoeat\n-- @api      1\n-- @setting  food    string  bread "What to eat"\n-- @setting  enabled boolean true  "Eat by itself"\n\ntempTrigger("You are hungry.", function()\n  if settings.enabled then send("eat " .. settings.food) end\nend)\n\ntempAlias("^ae$", function()\n  setSetting("enabled", not settings.enabled)\n  echo("Change the food with #script set " .. scriptName .. " food <food>")\nend)',
    },
    {
      note: "Typed on the input line:",
      lang: "tt",
      code: "#script set autoeat food apple",
    },
    {
      note: "Data kept between sessions:",
      lang: "lua",
      code: 'local seen = store.get("seen") or {}\n\ntempRegexTrigger("^(\\\\w+) has arrived", function()\n  seen[matches[2]] = (seen[matches[2]] or 0) + 1\n  store.set("seen", seen)\nend)',
    },
  ],
};

const BRIDGE: HelpSection = {
  group: "guide",
  heading: "Profile bridge",
  syntax: [
    "getVariable(name) → value",
    "setVariable(name, value)",
    "export(name, fn)",
    "#lua {script} {function} {args}",
  ],
  text: [
    "A script and the profile can work together.",
    "- getVariable(name) reads a profile variable ($name without the $). The value is always a string; use tonumber for a number. It is nil when the variable is not set.",
    "- setVariable(name, value) sets one, as #variable in an action does. The value may be a string, number or boolean and is stored as text. The profile text is updated only for a variable the profile declares with #variable; any other lasts for the session.",
    "- export(name, fn) makes fn callable from the profile with #lua {script} {name} {args}. The arguments come as one string, joined by spaces; without arguments fn gets nothing (nil). Exporting a name again replaces it.",
    "#lua works on the input line and in aliases, actions and macros. When the script is not running, or has not exported the name, #lua says so in the game window.",
  ],
  examples: [
    {
      note: "A script that keeps the target:",
      lang: "lua",
      code: '-- @name     target\n-- @api      1\n\nexport("set", function(name)\n  setVariable("target", name or "")\n  cecho("<orange>Target:<reset> " .. (name or "none"))\nend)\n\ntempKey("F5", function()\n  local t = getVariable("target")\n  if t and t ~= "" then send("kill " .. t) end\nend)',
    },
    {
      note: "The profile calls it:",
      lang: "tt",
      code: "#alias {t %1} {#lua {target} {set} {%1}}",
    },
  ],
};

const COMMANDS: HelpSection = {
  group: "guide",
  heading: "In-game commands",
  syntax: [
    "#script list",
    "#script help <name>",
    "#script set <name> <setting> <value>",
    "#script enable <name>",
    "#script disable <name>",
    "#script reload <name>",
    "#lua {script} {function} {args}",
  ],
  text: [
    "These commands work on the input line and in the profile's aliases, actions and macros.",
    "- #script list shows every script, whether it is on and its summary.",
    "- #script help <name> shows a script's help in the game window, as the Scripts page does.",
    "- #script set <name> <setting> <value> changes a setting and saves it. The rest of the line is the value.",
    "- #script enable <name> and #script disable <name> turn a script on and off, as its toggle does. On and off are the same for every profile.",
    "- #script reload <name> stops a script that is on and runs it again from its saved code. A script that failed to load is tried again. A script that is off must be turned on with #script enable instead.",
    "- #lua {script} {function} {args} calls a function the script exported (see Profile bridge).",
    "Other forms, such as a tt++ #script line pasted from another client, do nothing. #help script shows these commands in the game window.",
  ],
};

const SANDBOX: HelpSection = {
  group: "guide",
  heading: "Sandbox and limits",
  text: [
    "Scripts are shared as files, so a script runs in a sandbox. It reaches the outside only through the API in this manual: no files, network, web page, passwords, profile text or other scripts' data.",
    "The Lua you have: the base functions (assert, error, ipairs, pairs, next, pcall, xpcall, select, tonumber, tostring, type, getmetatable, setmetatable, rawequal, rawget, rawlen, rawset) and the string, table, math, utf8 and coroutine libraries.",
    "What is not there:",
    "- io, os, package, require, debug, load, loadstring, dofile, collectgarbage and string.dump. There is no os.time or os.clock: use timers for time.",
    '- The library tables are read-only: you cannot add string.trim, but you can write local function trim(s). getmetatable("") gives false.',
    "- setmetatable refuses a metatable with __gc, and <close> variables are refused when the script loads.",
    "- xpcall works, but its message handler runs after the error has unwound, not at the point of the error.",
    "Each script has its own global variables. A global you set is seen by your script only.",
    "Limits, so one script cannot freeze the game:",
    "- Each call into a script (loading it, a trigger, alias, key, timer or event) may run 1 000 000 Lua instructions. Past that the call is stopped and the script is turned off.",
    "- All scripts together may use 32 MB of memory. A script that runs out is turned off.",
    "- A call that takes longer than one second turns the script off.",
    "- 5 errors within 10 seconds turn the script off.",
    "- string.find, match, gmatch and gsub refuse a pattern with two or more .* .+ or .- on a long string when it could take very long, with the error pattern too complex. Patterns such as (.-) tells you '(.-)' on a game line are fine. Use anchors and narrower classes such as %S+ or [^,]+.",
    "- If the page is closed or reloaded while a script is running (it hung the page), that script is turned off at the next start, with a UI message.",
    "A script that was turned off stays off until you turn it on again. Each time, a UI message says why.",
  ],
};

const ERRORS: HelpSection = {
  group: "guide",
  heading: "Errors and debugging",
  text: [
    "Errors read <script>:<line>: <message>, for example autoeat:12: attempt to index a nil value (field 'Vitals').",
    "- Syntax errors and header problems are marked in the editor while you type, before you save.",
    "- A script that fails to load (a syntax error, a missing @api 1, an error in its top-level code) stays on but does not run. The Scripts page shows ! and the message in red under its row, the editor's status row shows it, and a UI message says it. It is tried again when you save a new version or type #script reload <name>.",
    "- An error while the script runs (in a trigger, alias, timer …) goes to the UI messages and is the script's last error on the Scripts page. The editor marks the line. The script keeps running, unless it has 5 errors within 10 seconds.",
    "Ways to find a bug:",
    "- print(...) and echo show values in the game window; uiMessage keeps them in the UI messages pane, away from the game text.",
    "- pcall(fn, …) runs a function and catches its error: local ok, err = pcall(fn).",
    "- Save to apply a change; a script that is on is reloaded at once. #script reload <name> runs it again without a change.",
    "- A nil error on gmcp usually means the message has not arrived yet: test gmcp.Char before gmcp.Char.Vitals.",
  ],
  examples: [
    {
      note: "Show what a trigger sees:",
      lang: "lua",
      code: 'tempRegexTrigger("^(\\\\w+) tells you", function()\n  print("line:", line)\n  print("who:", matches[2])\nend)',
    },
    {
      note: "Catch an error and report it yourself:",
      lang: "lua",
      code: 'local ok, err = pcall(function()\n  local v = gmcp.Char.Vitals\n  echo("HP " .. v.hp)\nend)\nif not ok then uiMessage("debug", tostring(err)) end',
    },
  ],
};

const EXAMPLES: HelpSection = {
  group: "guide",
  heading: "Examples",
  text: [
    "Complete small scripts. Make a new script, paste one over the template, save and turn it on. The bundled coinlooter is a larger example: open it and press DUPLICATE to change your own copy.",
  ],
  examples: [
    {
      note: "Eat when hungry, drink when thirsty:",
      lang: "lua",
      code: '-- @name     autoeat\n-- @summary  Eats and drinks when you need it\n-- @api      1\n-- @setting  food  string bread "What to eat"\n-- @setting  drink string skin  "What to drink from"\n\ntempTrigger("You are hungry.", function()\n  send("eat " .. settings.food)\nend)\n\ntempTrigger("You are thirsty.", function()\n  send("drink " .. settings.drink)\nend)',
    },
    {
      note: "Warn when hit points run low (GMCP):",
      lang: "lua",
      code: '-- @name     hpwarn\n-- @summary  Warns when your hit points run low\n-- @api      1\n-- @setting  percent number 30 "Warn below this percentage"\n\nlocal warned = false\n\nregisterAnonymousEventHandler("gmcp.Char.Vitals", function()\n  local v = gmcp.Char.Vitals\n  if not v.hp or not v.maxhp or v.maxhp == 0 then return end\n  local low = v.hp * 100 / v.maxhp < settings.percent\n  if low and not warned then\n    cecho("<white:red> LOW HP <reset> " .. v.hp .. "/" .. v.maxhp)\n    uiMessage("hp", "Hit points low: " .. v.hp)\n  end\n  warned = low\nend)',
    },
    {
      note: "Count kills, kept between sessions:",
      lang: "lua",
      code: '-- @name     kills\n-- @summary  Counts your kills\n-- @api      1\n-- @alias    kills        Show the count\n-- @alias    kills reset  Start again from 0\n\nlocal kills = store.get("kills") or 0\n\ntempTrigger("You receive your share of experience.", function()\n  kills = kills + 1\n  store.set("kills", kills)\nend)\n\ntempAlias("^kills( reset)?$", function()\n  if matches[2] == " reset" then\n    kills = 0\n    store.set("kills", 0)\n  end\n  cecho("<cyan>Kills:<reset> " .. kills)\nend)',
    },
    {
      note: "A repeating timer with an on/off alias:",
      lang: "lua",
      code: '-- @name     xprate\n-- @summary  Shows the experience you gain each minute\n-- @api      1\n-- @alias    xpr  Turn the report on or off\n\nlocal timer = nil\nlocal last = nil\n\nlocal function report()\n  local v = gmcp.Char and gmcp.Char.Vitals\n  local xp = v and v.xp\n  if xp and last then\n    cecho("<cyan>XP this minute:<reset> " .. (xp - last))\n  end\n  last = xp\nend\n\ntempAlias("^xpr$", function()\n  if timer then\n    killTimer(timer)\n    timer = nil\n    echo("XP report off.")\n  else\n    last = nil\n    report()\n    timer = tempTimer(60, report, true)\n    echo("XP report on.")\n  end\nend)',
    },
    {
      note: "Colour tells, and rewrite a line:",
      lang: "lua",
      code: '-- @name     tells\n-- @summary  Makes tells stand out\n-- @api      1\n\ntempRegexTrigger([[^(\\w+) tells you \']], function()\n  highlight("light yellow")\n  highlight("bold white", matches[2])\nend)\n\ntempTrigger("You feel less protected.", function()\n  replaceLine("<white:red> ARMOUR IS GONE <reset>")\nend)',
    },
    {
      note: "A function the profile calls with #lua, and a key:",
      lang: "lua",
      code: '-- @name     healer\n-- @summary  Heals a group member by name\n-- @api      1\n-- @key      F6  Heal the last one\n-- @help     From the profile: #alias {h %1} {#lua {healer} {heal} {%1}}\n\nlocal last = nil\n\nlocal function heal(who)\n  last = who or last or "me"\n  send("cast \'cure light\' " .. last)\nend\n\nexport("heal", heal)\n\ntempKey("F6", function()\n  heal(nil)\nend)',
    },
  ],
};

/** The script manual's chapters, in menu order (group `guide`). */
export const SCRIPT_GUIDE: readonly HelpSection[] = [
  GETTING_STARTED,
  LUA_BASICS,
  LUA_PATTERNS,
  HEADER,
  TRIGGERS,
  ALIASES,
  KEYS,
  TIMERS,
  EVENTS,
  OUTPUT,
  PANES,
  SETTINGS,
  BRIDGE,
  COMMANDS,
  SANDBOX,
  ERRORS,
  EXAMPLES,
];
