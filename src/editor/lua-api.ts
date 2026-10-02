// The script API, version 1 (spec §2.10, ADR 0051), as one table of docs.
// The script editor's completion and hover help both read it. Pure; no
// CodeMirror, unit tested. Plain Lua (library, keywords, syntax) is in
// lua-ref.ts, in the same shape.

import type { SettingDecl } from "../scripts/header";
import { LUA_KEYWORDS, LUA_REF, LUA_REMOVED, LUA_SYNTAX, NOT_METHODS, type Snippet } from "./lua-ref";

export type ApiKind = "function" | "variable" | "table" | "tag" | "keyword";

export interface ApiDoc {
  /** The name as typed: `send`, `store.get`, `string.format`, `@setting`. */
  name: string;
  kind: ApiKind;
  /** The call form shown in the list and the hover: `send(cmd)`. */
  sig: string;
  /** One or two sentences. */
  doc: string;
  /** Plain Lua (lua-ref.ts): the standard library, keywords and syntax, ranked after the API. */
  lua?: boolean;
  /** Keywords: snippets offered by completion (lua-ref.ts). */
  snippets?: readonly Snippet[];
  /** A name the sandbox removes: hover says so, nothing completes it. */
  removed?: boolean;
  /** The parameters, in order (functions). */
  params?: readonly ApiParam[];
  /** What the function returns, when it returns something. */
  returns?: string;
  /** Longer text for the manual's reference entry, after `doc` (paragraphs). */
  more?: readonly string[];
  /** A short Lua example (lines separated by \n); shown on hover, in completion and in the manual. */
  example?: string;
}

export interface ApiParam {
  name: string;
  /** `string`, `number`, `function`, `boolean`, `table`, `any`; `?` for optional (`number?`). */
  type: string;
  doc: string;
}

/** The optional manual fields of an entry. */
type Extra = Pick<ApiDoc, "params" | "returns" | "more" | "example">;

const fn = (name: string, sig: string, doc: string, x: Extra): ApiDoc => ({
  name,
  kind: "function",
  sig,
  doc,
  ...x,
});
const v = (name: string, sig: string, doc: string, x: Extra): ApiDoc => ({
  name,
  kind: "variable",
  sig,
  doc,
  ...x,
});
const tag = (name: string, sig: string, doc: string, x: Extra): ApiDoc => ({
  name,
  kind: "tag",
  sig,
  doc,
  ...x,
});
const p = (name: string, type: string, doc: string): ApiParam => ({
  name,
  type,
  doc,
});

const ID = "An id (a number) for the matching kill function.";
const KILLED =
  "true when it was removed, false when the id is not one of this script's (or it is already gone).";

/** WebCockpit's script API (version 1). */
export const SCRIPT_API: readonly ApiDoc[] = [
  // Triggers and aliases.
  fn(
    "tempTrigger",
    "tempTrigger(substring, fn) → id",
    "Calls fn for every game line that contains substring. In fn, line is the line and matches[1] the match.",
    {
      params: [
        p(
          "substring",
          "string",
          "Text to look for anywhere in the line, literally and case-sensitively. Not empty.",
        ),
        p(
          "fn",
          "function",
          "Called with no arguments for each matching line; read line and matches.",
        ),
      ],
      returns: ID,
      more: [
        "Every trigger that matches a line runs, the profile's actions too: one match does not stop the others.",
        "The trigger lives until killTrigger(id) or until the script stops; you never need to clean up.",
      ],
      example:
        'tempTrigger("You are hungry.", function()\n  send("eat bread")\nend)',
    },
  ),
  fn(
    "tempRegexTrigger",
    "tempRegexTrigger(regex, fn) → id",
    "Calls fn for every game line the regular expression (JavaScript syntax) matches. matches[1] is the whole match, matches[2] … the groups.",
    {
      params: [
        p(
          "regex",
          "string",
          "A JavaScript regular expression, case-sensitive. Use ^ and $ to match the whole line.",
        ),
        p(
          "fn",
          "function",
          "Called with no arguments for each matching line; read line and matches.",
        ),
      ],
      returns: ID,
      more: [
        "The expression is JavaScript's, not Mudlet's PCRE; the common parts (\\w, \\d, \\s, groups, ?:, classes, anchors) are the same.",
        'A backslash must be doubled inside a Lua string ("\\\\."), or write the expression as a long string: [[^You receive (\\d+) coins\\.$]].',
        "A group that did not take part in the match gives an empty string.",
      ],
      example:
        'tempRegexTrigger("^(\\\\w+) tells you \'(.*)\'$", function()\n  uiMessage("tell", matches[2] .. ": " .. matches[3])\nend)',
    },
  ),
  fn(
    "tempAlias",
    "tempAlias(regex, fn) → id",
    "Calls fn for a typed command the regular expression matches (not anchored: use ^ and $). The command is consumed unless fn returns false.",
    {
      params: [
        p(
          "regex",
          "string",
          "A JavaScript regular expression matched against the typed command.",
        ),
        p(
          "fn",
          "function",
          "Called with no arguments; read matches and command. Return false to let the command go on.",
        ),
      ],
      returns: ID,
      more: [
        "Only one alias takes a command. A profile alias of the same priority wins over a script alias.",
        "When fn returns false, the next alias may take the command; if none does, it is sent to the game as typed.",
      ],
      example:
        'tempAlias("^k (\\\\w+)$", function()\n  send("kill " .. matches[2])\nend)',
    },
  ),
  fn(
    "killTrigger",
    "killTrigger(id)",
    "Removes a trigger made with tempTrigger or tempRegexTrigger.",
    {
      params: [
        p("id", "number", "The id tempTrigger or tempRegexTrigger returned."),
      ],
      returns: KILLED,
      example:
        'local id\nid = tempTrigger("You are hungry.", function()\n  send("eat bread")\n  killTrigger(id) -- only the first time\nend)',
    },
  ),
  fn("killAlias", "killAlias(id)", "Removes an alias made with tempAlias.", {
    params: [p("id", "number", "The id tempAlias returned.")],
    returns: KILLED,
    example:
      'local id = tempAlias("^hi$", function()\n  send("say Hello!")\nend)\ntempAlias("^nohi$", function()\n  killAlias(id)\nend)',
  }),
  fn(
    "deleteLine",
    "deleteLine()",
    "In a trigger: hides the current line (a gag).",
    {
      params: [],
      more: [
        "Outside a trigger (in a timer, key or alias) it does nothing. Other triggers still see the line.",
      ],
      example:
        'tempTrigger("You can\'t find any coins", function()\n  deleteLine()\nend)',
    },
  ),
  fn(
    "replaceLine",
    "replaceLine(text)",
    "In a trigger: shows text instead of the current line. cecho colour tags work.",
    {
      params: [
        p(
          "text",
          "string",
          "The new text; cecho colour tags work. A line break becomes a space.",
        ),
      ],
      more: [
        "Only the shown copy changes: other triggers and the run log see the line as the game sent it. The profile's substitutes, gags and highlights then apply to the new text.",
        "Outside a trigger it does nothing.",
      ],
      example:
        'tempTrigger("You are thirsty.", function()\n  replaceLine("<yellow>*** THIRSTY ***<reset>")\nend)',
    },
  ),
  fn(
    "highlight",
    "highlight(color[, text])",
    'In a trigger: colours the whole line, or each occurrence of text. color is a profile colour such as "light red" or "bold yellow", or a Mudlet name such as "orange".',
    {
      params: [
        p(
          "color",
          "string",
          'A profile colour ("red", "light red", "bold yellow", "<F88ff00>"), cecho tags ("<b><orange>"), a Mudlet name ("orange", "white:red"), "r,g,b" or "#rrggbb".',
        ),
        p(
          "text",
          "string?",
          "Colour only this text, each time it occurs in the line. Without it the whole line.",
        ),
      ],
      more: [
        "An unknown colour is an error. Highlights from scripts apply after the profile's. Outside a trigger it does nothing.",
      ],
      example:
        'tempRegexTrigger("^(\\\\w+) tells you", function()\n  highlight("light yellow")\n  highlight("bold white", matches[2])\nend)',
    },
  ),
  // Keys and timers.
  fn(
    "tempKey",
    "tempKey(name, fn) → id",
    'Calls fn when the key is pressed. Names as in the profile: "F5", "Alt+a", "Numpad0".',
    {
      params: [
        p(
          "name",
          "string",
          'A key name as in the profile\'s #macro: "F5", "Numpad 0", "Alt+a", "Ctrl+Shift+F1".',
        ),
        p(
          "fn",
          "function",
          "Called with no arguments when the key is pressed.",
        ),
      ],
      returns: ID,
      more: [
        "Keys that type text (a letter, digit or punctuation key alone or with Shift), ESC, Enter and the keys the browser keeps (Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Tab …) cannot be bound: tempKey raises an error.",
        "A profile macro on the same key wins over the script. When two scripts bind a key, the newest binding wins.",
      ],
      example: 'tempKey("F5", function()\n  send("flee")\nend)',
    },
  ),
  fn("killKey", "killKey(id)", "Removes a key binding made with tempKey.", {
    params: [p("id", "number", "The id tempKey returned.")],
    returns: KILLED,
    example:
      'local key = tempKey("Numpad5", function()\n  send("look")\nend)\nkillKey(key)',
  }),
  fn(
    "tempTimer",
    "tempTimer(seconds, fn[, repeat]) → id",
    "Calls fn after seconds; again every seconds when repeat is true (50 ms at least).",
    {
      params: [
        p(
          "seconds",
          "number",
          "Seconds to wait, 0 or more; fractions work (0.5).",
        ),
        p("fn", "function", "Called with no arguments when the time is up."),
        p(
          "repeat",
          "boolean?",
          "true: call fn again every seconds (at least 0.05) until killTimer. Default: once.",
        ),
      ],
      returns: ID,
      example: 'tempTimer(2.5, function()\n  send("stand")\nend)',
    },
  ),
  fn("killTimer", "killTimer(id)", "Stops a timer made with tempTimer.", {
    params: [p("id", "number", "The id tempTimer returned.")],
    returns: KILLED + " A one-shot timer that has fired is gone.",
    example:
      'local t = tempTimer(60, function()\n  echo("Another minute.")\nend, true)\ntempAlias("^stopclock$", function()\n  killTimer(t)\nend)',
  }),
  fn(
    "getEpoch",
    "getEpoch() → seconds",
    "The time now, in seconds since 1970 (with milliseconds as the fraction), as Mudlet's getEpoch. Use it for times that must outlast a reload, kept with store.set.",
    {
      params: [],
      returns: "Seconds since 1 January 1970 UTC, a number with a fraction.",
      example:
        'local ends = getEpoch() + 25 * 60\nstore.set("ends", ends)\nlocal left = math.floor(ends - getEpoch())',
    },
  ),
  // Events.
  fn(
    "registerAnonymousEventHandler",
    "registerAnonymousEventHandler(event, fn) → id",
    'Calls fn(event, …) for an event: "gmcp.Char.Vitals", "sysLoadEvent", "sysConnectionEvent", "sysDisconnectionEvent" or a #event name such as "SESSION CONNECTED".',
    {
      params: [
        p(
          "event",
          "string",
          "The event name; case does not matter. Any name is accepted, but only the events in the Events and GMCP section fire.",
        ),
        p(
          "fn",
          "function",
          "Called with the event name, then the event's arguments.",
        ),
      ],
      returns: ID,
      more: [
        'As in Mudlet, a GMCP message also raises every level above it, the outer one first: Char.Vitals raises "gmcp.Char", then "gmcp.Char.Vitals". A GMCP handler gets its own event name, then the full one; read the data from the gmcp table.',
      ],
      example:
        'registerAnonymousEventHandler("gmcp.Char.Vitals", function(event)\n  local hp = gmcp.Char.Vitals.hp\n  if hp and hp < 50 then cecho("<red>Low HP!<reset>") end\nend)',
    },
  ),
  fn(
    "killAnonymousEventHandler",
    "killAnonymousEventHandler(id)",
    "Removes an event handler.",
    {
      params: [
        p("id", "number", "The id registerAnonymousEventHandler returned."),
      ],
      returns: KILLED,
      example:
        'local h\nh = registerAnonymousEventHandler("gmcp.Char.Name", function()\n  echo("Welcome, " .. gmcp.Char.Name.name)\n  killAnonymousEventHandler(h)\nend)',
    },
  ),
  // Output.
  fn("send", "send(cmd)", "Sends cmd to the game as it is, without aliases.", {
    params: [p("cmd", "string", "One command. ; and # are not special here.")],
    example: 'send("kill orc")',
  }),
  fn(
    "expandAlias",
    "expandAlias(cmd)",
    "Runs cmd as if typed: profile and script aliases, ; and # commands.",
    {
      params: [
        p(
          "cmd",
          "string",
          "The text to run, like a line typed on the input line.",
        ),
      ],
      example: 'expandAlias("stand;flee")',
    },
  ),
  fn(
    "echo",
    "echo(text)",
    "Writes plain text to the game output. Triggers do not see it.",
    {
      params: [
        p("text", "string", "The text; each line break starts a new line."),
      ],
      more: [
        "Inside a trigger the text shows after the game line. Echoed lines are not recorded in runs.",
      ],
      example: 'echo("Looting is off.")',
    },
  ),
  fn(
    "cecho",
    "cecho(text)",
    "Writes coloured text: <red>, <white:blue>, <#ff8000>, <b>bold</b>, <reset> and tt++ <F88ff00> / <118> codes.",
    {
      params: [
        p(
          "text",
          "string",
          "Text with colour tags in angle brackets; see the Output section for the list.",
        ),
      ],
      more: [
        "Anything in angle brackets that is not a colour tag is shown as text. Triggers do not see the output.",
      ],
      example: 'cecho("<green>Ready.<reset> Type <yellow>cl<reset> to loot.")',
    },
  ),
  fn(
    "print",
    "print(...)",
    "Writes its arguments to the game output, separated by tabs.",
    {
      params: [
        p(
          "...",
          "any",
          "Values to show. Strings and numbers as text, booleans as true/false, others by type name (nil, table).",
        ),
      ],
      example: 'print("kills:", store.get("kills"))',
    },
  ),
  fn(
    "uiMessage",
    "uiMessage(source, text)",
    "Writes a line to the UI messages pane: ▶ SOURCE: text.",
    {
      params: [
        p(
          "source",
          "string",
          "A short label, shown in capitals (at most 20 characters; empty gives SCRIPT).",
        ),
        p("text", "string", "The message."),
      ],
      example: 'uiMessage("loot", "Picked up the coins.")',
    },
  ),
  // Profile bridge.
  fn(
    "getVariable",
    "getVariable(name) → value",
    "Reads a tt++ variable of the profile ($name). nil when unset.",
    {
      params: [p("name", "string", "The variable name without $.")],
      returns:
        "The value as a string (use tonumber for numbers), or nil when the variable is not set.",
      example:
        'local target = getVariable("target")\nif target then send("kill " .. target) end',
    },
  ),
  fn(
    "setVariable",
    "setVariable(name, value)",
    "Sets a tt++ variable of the profile, as #variable does.",
    {
      params: [
        p("name", "string", "The variable name without $. Not empty."),
        p("value", "any", "A string, number or boolean; stored as text."),
      ],
      more: [
        "As in an action: the profile text is updated only for a variable the profile declares with #variable; any other lasts for the session.",
      ],
      example:
        'tempAlias("^t (\\\\w+)$", function()\n  setVariable("target", matches[2])\nend)',
    },
  ),
  fn(
    "export",
    "export(name, fn)",
    "Makes fn callable from the profile: #lua {script} {name} {args}.",
    {
      params: [
        p(
          "name",
          "string",
          "The name #lua uses; no spaces. Exporting the same name again replaces it.",
        ),
        p(
          "fn",
          "function",
          "Called with the rest of the #lua line as one string, or with no argument when there is none.",
        ),
      ],
      example:
        'export("heal", function(who)\n  send("cast \'cure light\' " .. (who or "me"))\nend)\n-- In the profile: #lua {healer} {heal} {Rasta}',
    },
  ),
  // Data.
  {
    name: "store",
    kind: "table",
    sig: "store",
    doc: "Data this script keeps between sessions: store.get(key) and store.set(key, value).",
    more: [
      "Each script has its own store. It is kept in the browser and survives reloads and new releases; deleting the script deletes it. A Duplicate starts with an empty store.",
    ],
    example: 'local n = (store.get("deaths") or 0) + 1\nstore.set("deaths", n)',
  },
  fn(
    "store.get",
    "store.get(key) → value",
    "A value saved with store.set, or nil.",
    {
      params: [p("key", "string", "The key it was saved under.")],
      returns:
        "A copy of the saved value, or nil. Changing a table you got does not change the store until you store.set it again.",
      example: 'local kills = store.get("kills") or 0',
    },
  ),
  fn(
    "store.set",
    "store.set(key, value)",
    "Saves a string, number, boolean or table under key. nil removes it.",
    {
      params: [
        p("key", "string", "The key."),
        p(
          "value",
          "any",
          "A string, number, boolean or a table of them (copied); nil removes the key. Functions are not kept.",
        ),
      ],
      more: [
        "The value is in memory at once and written to the browser's storage about a second later, and when the page is hidden.",
      ],
      example:
        'store.set("kills", 12)\nstore.set("friends", { "Rasta", "Ithilwen" })',
    },
  ),
  // Panes (ADR 0053).
  fn(
    "createPane",
    "createPane{id, title, dock, rows, cols} → pane",
    "Makes the script's own pane and returns it. It docks, floats, toggles and is coloured like the built-in panes, and WebCockpit remembers where the player puts it.",
    {
      params: [
        p("id", "string", "The pane's id within the script: 1 to 32 letters, digits, _ or -."),
        p("title", "string?", "The frame title (default: the id). pane:setTitle changes it."),
        p("dock", "string?", "Where it goes the first time: \"right\" (default), \"left\", \"top\", \"bottom\" or \"float\"."),
        p("rows", "number?", "Wanted height in rows (default 8): in a side dock and a float."),
        p("cols", "number?", "Wanted width in columns (default 30): in the top or bottom dock and a float."),
      ],
      returns: "The pane, an object whose methods are called with a colon: pane:echo(\"text\").",
      more: [
        "dock, rows and cols only place a new pane. After that the pane stays where the player docked, floated or resized it, also after a reload, a restart or Reset layout of the other panes; Options → Panes lists it with its title and script, to switch it off, colour it or drop its border.",
        "The pane shows while the script runs. Turning the script off or saving it takes the pane away (it comes back where it was when the script creates it again). Calling createPane with an id the script already has returns the same pane.",
        "Rows and columns count from 1. Text wider than the pane is cut; more lines than fit show the newest, with ↑ N more rows on top. A pane keeps at most 500 lines.",
      ],
      example:
        'local pane = createPane{id = "hp", title = "Health", dock = "right", rows = 3}\npane:gauge(1, {value = 80, max = 120, color = "green", label = "HP 80/120"})',
    },
  ),
  fn(
    "pane:clear",
    "pane:clear()",
    "Empties the pane: every line and link goes.",
    {
      params: [p("pane", "pane", "A pane from createPane.")],
      example: 'pane:clear()\npane:echo("Nothing to show.")',
    },
  ),
  fn(
    "pane:echo",
    "pane:echo(text)",
    "Appends plain text to the pane. A \\n starts a new line.",
    {
      params: [p("pane", "pane", "A pane from createPane."), p("text", "string", "The text, as is (angle brackets are text).")],
      more: [
        "Text goes on the end of the last line, as Mudlet's echo: pane:echo(\"a\") then pane:echo(\"b\\n\") gives one line ab, and the next echo starts a new line. Use pane:setLine to replace a row instead.",
      ],
      example: 'pane:echo("Kills: " .. kills .. "\\n")',
    },
  ),
  fn(
    "pane:cecho",
    "pane:cecho(text)",
    "Appends coloured text to the pane, with the colour tags of cecho. A \\n starts a new line.",
    {
      params: [p("pane", "pane", "A pane from createPane."), p("text", "string", "Text with colour tags such as <red>, <b> or <reset>.")],
      example: 'pane:cecho("<green>ready<reset>\\n")',
    },
  ),
  fn(
    "pane:setLine",
    "pane:setLine(row, text)",
    "Replaces one row with coloured text (the cecho tags). Rows past the end are added as empty lines.",
    {
      params: [
        p("pane", "pane", "A pane from createPane."),
        p("row", "number", "The row, from 1 (at most 500)."),
        p("text", "string", "Text with colour tags; a \\n becomes a space."),
      ],
      more: ["The row's links go with its old text: add them again with pane:setLink after redrawing the row."],
      example: 'pane:setLine(1, "<b>Mercenaries</b>")\npane:setLine(2, "Bob  <yellow>waiting")',
    },
  ),
  fn(
    "pane:gauge",
    "pane:gauge(row, {value, max, color, label})",
    "Draws a full-width bar on one row, like the bars of the Group pane: value of max filled, label centred over it.",
    {
      params: [
        p("pane", "pane", "A pane from createPane."),
        p("row", "number", "The row, from 1."),
        p(
          "gauge",
          "table",
          "value and max (numbers; max defaults to 100), color (a colour name such as \"red\", \"<#ff8800>\" or \"orange\"; default green) and label (text over the bar).",
        ),
      ],
      more: ["The unfilled part takes the pane's track shade, so the bar follows the pane colour. Like setLine, it replaces the row and its links."],
      example: 'pane:gauge(2, {value = 30, max = 60, color = "orange", label = "30 min left"})',
    },
  ),
  fn(
    "pane:cechoLink",
    "pane:cechoLink(text, fn, hint)",
    "Appends coloured text that calls fn when it is clicked, with hint as its tooltip.",
    {
      params: [
        p("pane", "pane", "A pane from createPane."),
        p("text", "string", "Text with colour tags; it goes on the end of the last line, as pane:cecho (a \\n becomes a space)."),
        p("fn", "function", "Called with no arguments on a click."),
        p("hint", "string?", "The tooltip shown while the pointer is over the link; \\n breaks it into lines."),
      ],
      more: [
        "The pointer turns into a hand over a link and the link lights up. Links do nothing in the log player and the HTML replay, but keep their tooltips.",
      ],
      example: 'pane:cechoLink("<u>[pay]</u>", function()\n  send("pay mercenary")\nend, "Pay the mercenary")',
    },
  ),
  fn(
    "pane:setLink",
    "pane:setLink(row, col, len, fn, hint)",
    "Makes len cells of a row, from column col, call fn when clicked, with hint as their tooltip. Any span, down to one cell.",
    {
      params: [
        p("pane", "pane", "A pane from createPane."),
        p("row", "number", "The row, from 1."),
        p("col", "number", "The first column, from 1."),
        p("len", "number", "How many cells, at least 1."),
        p("fn", "function", "Called with no arguments on a click."),
        p("hint", "string?", "The tooltip."),
      ],
      more: [
        "The cells need no text. A link replaces the links it overlaps on that row; pane:setLine, pane:gauge and pane:clear remove the row's links.",
      ],
      example: 'pane:setLine(3, "[x] Bob")\npane:setLink(3, 2, 1, function()\n  send("order bob leave")\nend, "Send Bob away")',
    },
  ),
  fn(
    "pane:size",
    "pane:size() → rows, cols",
    "The pane's content size in cells now: rows and columns. Both are 0 while the pane is not shown.",
    {
      params: [p("pane", "pane", "A pane from createPane.")],
      returns: "rows, cols (two numbers).",
      example: 'local rows, cols = pane:size()\npane:setLine(1, string.rep("-", cols))',
    },
  ),
  fn(
    "pane:onResize",
    "pane:onResize(fn)",
    "Calls fn(rows, cols) when the pane's size changes, also when it is first shown. nil removes the handler.",
    {
      params: [
        p("pane", "pane", "A pane from createPane."),
        p("fn", "function?", "Called with the new rows and cols; nil removes it."),
      ],
      more: ["It is not called while the pane is hidden; pane:size() then gives 0, 0."],
      example: 'pane:onResize(function(rows, cols)\n  pane:setLine(1, string.rep("=", cols))\nend)',
    },
  ),
  fn(
    "pane:show",
    "pane:show()",
    "Switches the pane on, as its row in Options → Panes does.",
    {
      params: [p("pane", "pane", "A pane from createPane.")],
      more: ["On and off are the player's setting, kept across sessions; the close cross switches a pane off too."],
      example: 'tempAlias("^merc$", function()\n  if pane:visible() then pane:hide() else pane:show() end\nend)',
    },
  ),
  fn(
    "pane:hide",
    "pane:hide()",
    "Switches the pane off, as its close cross does. The script keeps writing to it.",
    {
      params: [p("pane", "pane", "A pane from createPane.")],
      example: "pane:hide()",
    },
  ),
  fn(
    "pane:visible",
    "pane:visible() → boolean",
    "true when the pane is switched on (it may still lack room in a small window).",
    {
      params: [p("pane", "pane", "A pane from createPane.")],
      returns: "true or false.",
      example: 'if not pane:visible() then echo("The pane is off; pane:show() brings it back.") end',
    },
  ),
  fn(
    "pane:setTitle",
    "pane:setTitle(text)",
    "Changes the title in the pane's frame and in Options → Panes.",
    {
      params: [p("pane", "pane", "A pane from createPane."), p("text", "string", "The new title (at most 60 characters).")],
      example: 'pane:setTitle("Mercenaries (" .. count .. ")")',
    },
  ),
  v(
    "settings",
    "settings.<name>",
    "The values of the header's @setting lines (read-only). Change one with #script set <script> <name> <value>.",
    {
      more: [
        "An unset setting has its default. When a setting changes, settings shows the new value at once, without a reload, so read settings.<name> when you need it instead of copying it once at load.",
      ],
      example:
        '-- @setting  auto  boolean true "Loot after kills"\nif settings.auto then send("get coins all.corpse") end',
    },
  ),
  fn(
    "setSetting",
    "setSetting(name, value)",
    "Saves one of this script's own @setting values, as #script set does. settings.<name> shows it once saved.",
    {
      params: [
        p(
          "name",
          "string",
          "A setting the header declares with @setting; another name is an error.",
        ),
        p(
          "value",
          "any",
          "A string, number or boolean, converted to the setting's type.",
        ),
      ],
      more: [
        "The save takes a moment: settings.<name> still has the old value right after the call. A value that does not convert gives a UI message.",
      ],
      example:
        'tempAlias("^autoloot (on|off)$", function()\n  setSetting("auto", matches[2] == "on")\nend)',
    },
  ),
  v(
    "scriptName",
    "scriptName",
    "This script's name, as on the Scripts page (a Duplicate has its own).",
    {
      example:
        'echo("Change it with #script set " .. scriptName .. " delay 1")',
    },
  ),
  v(
    "gmcp",
    "gmcp.<Package>.<Message>",
    "The last GMCP data from MUME, as in Mudlet: gmcp.Char.Vitals.hp, gmcp.Room.Info.name … (read-only).",
    {
      more: [
        'Char.Vitals and Char.StatusVars merge key by key into their last value, since MUME sends only what changed; a JSON null removes a key. Every other message replaces its last value (Group.Update is one member: read the group from state.group). GMCP from before the first script loaded is there; the table is cleared when a new connection starts. Names with a dash need brackets: gmcp.Char.Vitals["hp-string"].',
        "A package that has not arrived is nil: test gmcp.Char before you read gmcp.Char.Vitals outside a GMCP handler.",
      ],
      example:
        'local v = gmcp.Char and gmcp.Char.Vitals\nif v and v.hp then\n  echo("HP " .. v.hp .. "/" .. (v.maxhp or "?"))\nend',
    },
  ),
  v(
    "state",
    "state.char / state.group / state.room",
    "Read-only view of the character (name, vitals, status), the group members and the room.",
    {
      more: [
        "state.char has name, fullname, vitals (the Char.Vitals fields) and status (the Char.StatusVars fields). state.group is a list of the group members in your room, each with id, type, name, label and hp, mana, mp as { value, max, word }. state.room is the last Room.Info.",
      ],
      example:
        'for _, m in ipairs(state.group) do\n  echo(m.name .. ": " .. (m.hp.word or "?"))\nend',
    },
  ),
  v(
    "matches",
    "matches[1], matches[2] …",
    "In a trigger or alias: the whole match, then each group.",
    {
      more: [
        "An unmatched group is an empty string. matches is set again before each trigger or alias call.",
      ],
      example:
        'tempRegexTrigger("^(\\\\w+) has arrived", function()\n  echo("Hello, " .. matches[2])\nend)',
    },
  ),
  v(
    "line",
    "line",
    "In a trigger: the game line. In an alias: the typed command.",
    {
      example:
        'tempTrigger("R.I.P.", function()\n  uiMessage("death", line)\nend)',
    },
  ),
  v("command", "command", "In an alias: the typed command.", {
    example:
      'tempAlias("^say ", function()\n  echo("You said: " .. command)\n  return false -- send it too\nend)',
  }),
];

/** The header tags (spec §2.10 "Header"). */
export const HEADER_TAGS: readonly ApiDoc[] = [
  tag(
    "@name",
    "-- @name     coinlooter",
    "The script's name: a letter, then letters, digits, _ or -.",
    {
      more: [
        "At most 32 characters, unique among all scripts. Saving with a new free @name renames the script.",
      ],
      example: "-- @name     autoeat",
    },
  ),
  tag(
    "@summary",
    "-- @summary  Loots coins from corpses",
    "One line shown in the list and the help.",
    {
      example: "-- @summary  Eats when you get hungry",
    },
  ),
  tag(
    "@api",
    "-- @api      1",
    "The API version the script is written for. Must be 1.",
    {
      more: ["A script without it, or with another number, does not load."],
      example: "-- @api      1",
    },
  ),
  tag(
    "@alias",
    "-- @alias    cl  toggle on/off",
    "Documents an alias for the help: the alias, then what it does.",
    {
      more: ["It does not make the alias; tempAlias does. May repeat."],
      example:
        "-- @alias    cl      Turn looting on or off\n-- @alias    cl now  Loot at once",
    },
  ),
  tag("@key", "-- @key      F5  loot now", "Documents a key for the help.", {
    more: [
      "It does not bind the key; tempKey does. The profile editor warns about a macro on a key an enabled script declares. May repeat.",
    ],
    example: "-- @key      F5  flee",
  }),
  tag(
    "@setting",
    '-- @setting  delay number 0.5 "Seconds before looting"',
    "A setting: name, type (number, string or boolean), default and label. Read it as settings.delay.",
    {
      more: [
        "A boolean default is true or false (on/off, yes/no and 1/0 work too). A string default may be quoted. A bad @setting line is skipped and shown as a problem.",
      ],
      example:
        '-- @setting  food   string  bread "What to eat"\n-- @setting  quiet  boolean true  "Hide the eat messages"',
    },
  ),
  tag(
    "@help",
    "-- @help     Free text, one line per tag.",
    "A line of the help text.",
    {
      more: ["May repeat; an empty @help gives a blank line."],
      example:
        "-- @help     Eats when you get hungry.\n-- @help\n-- @help     Change the food with #script set autoeat food apple.",
    },
  ),
];

/** Hints for removed names, after "Not available in scripts". */
const REMOVED_HINT: Readonly<Record<string, string>> = {
  os: "There is no os.time or os.clock: use tempTimer for time.",
  io: "Scripts cannot read or write files; store.get and store.set keep data.",
  require: "A script is one file; write the code you need in it.",
  unpack: "Use table.unpack.",
  load: "Scripts cannot compile code at run time.",
  loadstring: "Scripts cannot compile code at run time.",
};

/** The removed names (hover only). */
const REMOVED: readonly ApiDoc[] = LUA_REMOVED.map((name) => ({
  name,
  kind: name.includes(".") ? "function" : "table",
  lua: true,
  removed: true,
  sig: name,
  doc: `Not available in scripts: the sandbox removes it. ${REMOVED_HINT[name] ?? ""}`.trim(),
}));

/** What completes as a name: the API and the Lua library. */
const ALL: readonly ApiDoc[] = [...SCRIPT_API, ...LUA_REF];
const BY_NAME = new Map(
  [...ALL, ...LUA_KEYWORDS, ...LUA_SYNTAX].map((d) => [d.name, d]),
);
const REMOVED_BY_NAME = new Map(REMOVED.map((d) => [d.name, d]));
const TAG_BY_NAME = new Map(HEADER_TAGS.map((d) => [d.name, d]));
const KEYWORD_NAMES = new Set(LUA_KEYWORDS.map((d) => d.name));
/** The string functions offered after `x:`. */
const METHODS: readonly ApiDoc[] = LUA_REF.filter(
  (d) =>
    d.kind === "function" &&
    d.name.startsWith("string.") &&
    !NOT_METHODS.has(d.name),
);

/** The doc of an API or Lua name, keyword, operator, or a header tag (`@setting`). */
export function apiDoc(name: string): ApiDoc | null {
  return BY_NAME.get(name) ?? TAG_BY_NAME.get(name) ?? null;
}

/** The pane methods (`pane:echo` …), offered after `pane:` (ADR 0053). */
const PANE_METHODS: readonly ApiDoc[] = SCRIPT_API.filter((d) => d.name.startsWith("pane:"));

/** The doc of a method name: a string method (`find` for `s:find`), else a pane method (`echo`), or null. */
export function methodDoc(name: string): ApiDoc | null {
  const d = BY_NAME.get(`string.${name}`);
  if (d && d.kind === "function" && !NOT_METHODS.has(d.name)) return d;
  return BY_NAME.get(`pane:${name}`) ?? null;
}

// ------------------------------------------------------------ completion

// ------------------------------------------------- fields of the views

/** A field of `gmcp` or `state`: its doc and its own fields. */
interface Field {
  doc: string;
  kids?: Readonly<Record<string, Field>>;
}

const msg = (name: string, what: string): Field => ({
  doc: `The last ${name} message from MUME: ${what}.`,
});

/**
 * The known levels under `gmcp` and `state`, for completion after a dot
 * (not hover, the manual or the case correction). GMCP: the messages
 * MUME sends for the modules the client subscribes to (net/gmcp.ts,
 * /home/ole/MUME/docs/gmcp.md).
 */
const FIELDS: Readonly<Record<string, Field>> = {
  gmcp: {
    doc: "",
    kids: {
      Char: {
        doc: "GMCP package Char: Name, Vitals, StatusVars.",
        kids: {
          Name: msg("Char.Name", "name, fullname"),
          Vitals: msg("Char.Vitals", "hp, maxhp, mana, mp … merged key by key"),
          StatusVars: msg("Char.StatusVars", "the status variables, merged key by key"),
        },
      },
      Comm: {
        doc: "GMCP package Comm: Channel.",
        kids: {
          Channel: {
            doc: "GMCP package Comm.Channel: List, Text.",
            kids: {
              List: msg("Comm.Channel.List", "the channels"),
              Text: msg("Comm.Channel.Text", "channel, talker, text"),
            },
          },
        },
      },
      Event: {
        doc: "GMCP package Event: world events.",
        kids: {
          Achieved: msg("Event.Achieved", "an achievement"),
          Darkness: msg("Event.Darkness", "darkness"),
          Moon: msg("Event.Moon", "the moon"),
          Moved: msg("Event.Moved", "you moved"),
          Sun: msg("Event.Sun", "the sun"),
        },
      },
      Group: {
        doc: "GMCP package Group. Read the whole group from state.group.",
        kids: {
          Set: msg("Group.Set", "the whole group"),
          Add: msg("Group.Add", "one member who joined"),
          Update: msg("Group.Update", "one member who changed"),
          Remove: msg("Group.Remove", "one member who left"),
        },
      },
      Room: {
        doc: "GMCP package Room: Info, Chars.",
        kids: {
          Info: msg("Room.Info", "the room's id, name, exits …"),
          Chars: { doc: "GMCP package Room.Chars: the characters in the room." },
        },
      },
    },
  },
  state: {
    doc: "",
    kids: {
      char: {
        doc: "The character: name, fullname, vitals (the Char.Vitals fields), status (the Char.StatusVars fields).",
        kids: {
          name: { doc: "The character's name." },
          fullname: { doc: "The character's full name." },
          vitals: { doc: "The Char.Vitals fields." },
          status: { doc: "The Char.StatusVars fields." },
        },
      },
      group: {
        doc: "The group members in your room: id, type, name, label, and hp, mana, mp as { value, max, word }.",
      },
      room: { doc: "The last Room.Info." },
    },
  },
};

/** The field at a dotted path (`gmcp.Char`), ignoring case. */
function fieldAt(path: string): Field | null {
  let kids: Readonly<Record<string, Field>> | undefined = FIELDS;
  let f: Field | null = null;
  for (const part of path.split(".")) {
    const key: string | undefined = kids && Object.keys(kids).find((k) => k.toLowerCase() === part.toLowerCase());
    if (!kids || key === undefined) return null;
    f = kids[key]!;
    kids = f.kids;
  }
  return f;
}

/** The canonical spelling of a dotted path in FIELDS (`gmcp.char` → `gmcp.Char`). */
function fieldPath(path: string): string {
  let kids: Readonly<Record<string, Field>> | undefined = FIELDS;
  return path
    .split(".")
    .map((part) => {
      const key = kids && Object.keys(kids).find((k) => k.toLowerCase() === part.toLowerCase());
      kids = key !== undefined ? kids![key]!.kids : undefined;
      return key ?? part;
    })
    .join(".");
}

/**
 * The members after `base.`: the known fields of `gmcp` and `state`, the
 * script's own @setting names after `settings.`, else null.
 */
function membersOf(base: string, settings: readonly SettingDecl[]): ApiDoc[] | null {
  if (base.toLowerCase() === "settings") {
    return settings.map((st) => ({
      name: `settings.${st.name}`,
      kind: "variable",
      sig: `settings.${st.name} (${st.type}, default ${JSON.stringify(st.default)})`,
      doc: st.label || `The @setting ${st.name}.`,
    }));
  }
  const f = fieldAt(base);
  if (!f?.kids) return null;
  const path = fieldPath(base);
  return Object.entries(f.kids).map(([k, kid]) => ({
    name: `${path}.${k}`,
    kind: kid.kids ? "table" : "variable",
    sig: `${path}.${k}`,
    doc: kid.doc,
  }));
}

export interface Completion {
  /** Offset in the line where the replaced text starts. */
  from: number;
  options: readonly ApiDoc[];
  /** Options are string methods after `x:` (labels without `string.`, no `s` parameter). */
  method?: boolean;
}

/**
 * Where the text before the cursor stands: in a comment (`--` outside a
 * string), in a string, or in code. A light scan of one line; a long
 * string or comment from an earlier line is not seen.
 */
export function lineContext(before: string): "code" | "string" | "comment" {
  let quote = "";
  for (let i = 0; i < before.length; i++) {
    const c = before[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "-" && before[i + 1] === "-") return "comment";
  }
  return quote ? "string" : "code";
}

/** Sort rank: API names, then keywords, then the Lua library. */
const rank = (d: ApiDoc): number =>
  d.kind === "keyword" ? 1 : d.lua ? 2 : 0;

/**
 * The completions for the text before the cursor on its line: header tags
 * after `-- @`, members after `store.` / `string.` / `gmcp.Char.` …,
 * the script's settings after `settings.`, string methods after `x:`,
 * else global names and keywords. A dot or colon opens the members at
 * once, without a letter after it. Null where nothing completes
 * (strings, comments, after a number, after `..`).
 * `explicit`: asked for with Ctrl+Space (an empty word completes too).
 * `settings`: the script's @setting lines (header.ts).
 */
export function completeLua(
  before: string,
  explicit = false,
  settings: readonly SettingDecl[] = [],
): Completion | null {
  const tagM = /^\s*--\s*(@\w*)$/.exec(before);
  if (tagM) {
    const word = tagM[1]!;
    const options = HEADER_TAGS.filter((t) => t.name.startsWith(word));
    return options.length
      ? { from: before.length - word.length, options }
      : null;
  }
  if (lineContext(before) !== "code") return null;
  // A method call: `line:fi`, `("x"):up`, `t[1]:lo` (not `::label`).
  // A receiver whose name says pane (`pane:`, `myPane:`) gets the pane
  // methods, any other the string methods.
  const meth = /(?:[\w\])"']):([A-Za-z_]\w*)?$/.exec(before);
  if (meth && !before.endsWith("::")) {
    const word = meth[1] ?? "";
    const receiver = /([A-Za-z_]\w*):[A-Za-z_]?\w*$/.exec(before)?.[1] ?? "";
    const pane = /pane/i.test(receiver);
    const options = (pane ? PANE_METHODS : METHODS).filter((d) =>
      d.name.slice(pane ? 5 : 7).startsWith(word),
    );
    return options.length
      ? { from: before.length - word.length, options, method: true }
      : null;
  }
  // A name, dotted or not; after `..` too (`x..math.`), but not after
  // another dot alone (`1.5`, `a..`).
  const m = /(?:^|[^\w.]|\.\.)((?:[A-Za-z_]\w*\.)*[A-Za-z_]?\w*)$/.exec(before);
  if (!m) return null;
  const word = m[1]!;
  if (/^\d/.test(word)) return null;
  if (word === "" && !explicit) return null;
  const dot = word.lastIndexOf(".");
  let options: ApiDoc[];
  if (dot >= 0) {
    const base = word.slice(0, dot);
    const lower = word.toLowerCase();
    options = (
      membersOf(base, settings) ??
      ALL.filter((d) => d.name.toLowerCase().startsWith(`${base.toLowerCase()}.`))
    ).filter((d) => d.name.toLowerCase().startsWith(lower));
  } else {
    options = ALL.filter(
      (d) =>
        !d.name.includes(".") &&
        !d.name.includes(":") &&
        d.name.toLowerCase().startsWith(word.toLowerCase()),
    );
    // Keywords by prefix, but not once a whole keyword is typed: Enter
    // after `else` or `local` must still break the line.
    if (!KEYWORD_NAMES.has(word)) {
      options.push(
        ...LUA_KEYWORDS.filter(
          (d) => d.name.startsWith(word) && d.name !== word,
        ),
      );
    }
  }
  if (options.length === 0) return null;
  options.sort((a, b) => rank(a) - rank(b));
  return { from: before.length - word.length, options };
}

/**
 * Whether a list computed for `word` (the text from the completion's
 * start to the cursor when it was asked) still holds for `text`, the
 * same span now: only while `text` is `word` with more word characters
 * typed after it. A dot or colon asks again (`math` then `.` lists the
 * members), and so does any shorter text (Backspace): the options were
 * filtered by `word`, so a list for `gmcp.Comm` must not stand for
 * `gmcp.` (stage 10 feedback round 6).
 */
export function stillCompletes(word: string, text: string): boolean {
  return text.startsWith(word) && /^\w*$/.test(text.slice(word.length));
}

// ----------------------------------------------------------------- hover

export interface NameHit {
  from: number;
  to: number;
  doc: ApiDoc;
}

/** Operators and syntax with a hover doc, longest first. */
const SYMBOLS = ["--[[", "...", "--", "[[", "..", "~=", "#"];

/** The operator under `col` (`..`, `#`, `~=`, `--` …) outside strings and comments. */
function symbolAt(line: string, col: number): NameHit | null {
  // The leftmost symbol covering `col`; at one start, the longest.
  for (let from = Math.max(0, col - 3); from <= col; from++) {
    const sym = SYMBOLS.find((s) => line.startsWith(s, from));
    if (!sym || col >= from + sym.length) continue;
    if (lineContext(line.slice(0, from)) !== "code") return null;
    const doc = BY_NAME.get(sym);
    return doc ? { from, to: from + sym.length, doc } : null;
  }
  return null;
}

/**
 * The documented name under `col` in `line`: an API or Lua name (dotted,
 * such as `store.set`), a string method after `:`, a keyword, an
 * operator, a removed name, or a header tag; with its span.
 */
export function nameAt(line: string, col: number): NameHit | null {
  const re = /@?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    const from = m.index;
    const to = from + m[0].length;
    if (col < from || col > to) continue;
    const text = m[0];
    if (text.startsWith("@")) {
      const d = TAG_BY_NAME.get(text);
      return d && /^\s*--\s*$/.test(line.slice(0, from))
        ? { from, to, doc: d }
        : null;
    }
    if (lineContext(line.slice(0, from)) !== "code") return null;
    if (line[from - 1] === ":" && line[from - 2] !== ":") {
      const name = text.split(".")[0]!;
      const d = methodDoc(name);
      return d ? { from, to: from + name.length, doc: d } : null;
    }
    if (line[from - 1] === ".") return null;
    // `store.set` over `set`, `store` over `store`; `gmcp.Char.Vitals` → `gmcp`.
    const parts = text.split(".");
    let best: NameHit | null = null;
    for (let k = 1; k <= parts.length; k++) {
      const name = parts.slice(0, k).join(".");
      const d = BY_NAME.get(name) ?? REMOVED_BY_NAME.get(name);
      if (d) best = { from, to: from + name.length, doc: d };
      if (col <= from + name.length) break;
    }
    return best;
  }
  return symbolAt(line, col);
}
