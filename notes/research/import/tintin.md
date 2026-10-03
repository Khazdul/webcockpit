# TinTin++ config files vs. the WebCockpit subset: research for an importer

## 0. What we support today (from the repo)

- **Command table:** `src/script/commands.ts` lists every tt++ 2.x command with a tier: `must`, `should`, `client`, `inert` or `unsupported`.
  - Implemented: `#action #alias #highlight #substitute #gag #macro #variable #ticker #delay`, plus their `#un…` forms; `#if/#elseif/#else` (the third-argument else works too); `#showme #nop #math #format #message`; `#class` (open, close and kill only); `#event`.
  - Inert, kept byte for byte with an editor hint: file commands (`#read #write #log #textin #scan`), session commands (`#session #gts #zap #all #snoop #port …`), screen commands (`#split #screen #draw #button #cursor #line #buffer #config #path #map #tab`…), and `#lua`/`#system`/`#script`. The exceptions are the `#script` subcommands and `#lua {script} {fn}`.
  - `unsupported` (inert, hint "Not supported yet"): `#list #foreach #loop #while #switch #case #default #break #continue #function #return #local #regexp #replace #parse #prompt #tab #echo #cat #kill`.
- **Missing from the table** compared with tt++'s `command.c`: `#killall` and the bare `#un`. In tt++, `#un` is an exact command; ours resolves it to `#unaction`.
- **Engine (ADR 0015 P2):**
  - Supported: `%0–%99`, `%%1` escaping, the pattern codes `%* %w %d %s %S %i %+n..mX {regex}`, `$var`/`${var}`, and `&var` (returns 1 when the variable is defined).
  - Not supported: nested `$var[key]` tables, `@func{}`, `*var[]`, or `&var[]` as a size.
- **Document model:** lossless. It understands top-level entries and `#nop`. A following line that starts with `{` joins the previous command, which matches the layout `#class write` produces.
  - It does **not** recognise `/* … */` block comments (see §5).
- **Load:** `loadProfile` refuses the whole profile if braces are unbalanced. Game-bound commands at top level are skipped with a warning.

## 1. What a real config looks like

A real config is almost never one file. The typical layout is:

```
mume/
  mume.tin        # entry: #config, #split, #session, then #read of the others
  aliases.tin  actions.tin  highlights.tin  gmcp.tin  vars.tin  macros.tin
  modules/*.tin   # loaded with #class {mod} {read} {modules/mod.tin}
```

Users start it with `tt++ mume.tin`. The entry file usually contains:

- `#config {…}` lines: `COMMAND ECHO`, `SPEEDWALK`, `REPEAT ENTER`, `CHARSET`, `VERBOSE`, `TINTIN CHAR`, `LOG MODE`, `MOUSE`, `SCREEN READER`.
- `#split {top} {bottom}` and `#prompt`.
- `#session {mume} {mume.org} {4242} [{file}]`. The fourth argument is a file to read after connecting.
- Event-driven loading: `#event {SESSION CONNECTED} {#read char.tin}` and `#event {PROGRAM START} {…}`.
- Hot-reload aliases: `#class {m} {kill}; #class {m} {open}; #read m.tin; #class {m} {close}`. Also `#line quiet {#read x}`.

Example from a real public config (legendmud_tintin `core.tin`):

```
#LINE quiet {#READ sys.config};
#FUNCTION {is_out_of_date} { #INFO system save; #LOCAL v {$info[SYSTEM][CLIENT_VERSION]}; … #RETURN 1; }
#EVENT {SESSION CONNECTED} { #IF {"$autologin" == "true"} { #ACTION {{^Enter your choice…}} {#SEND $login_name; …} {5}; } }
```

**Files written by `#write` / `#class save`** use upper-case words (`#ACTION {…} {…} {5}`) and one entry per line. Variables come out as nested tables: `#VARIABLE {hp} {{cur}{50}{max}{100}}`. Our document model already handles this layout.

**Commonly used commands we don't support:**

| Command | Typical use |
|---|---|
| `#path` | speedwalk recording |
| `#tab` | completion words |
| `#list`, `#foreach`, `#loop`, `#while`, `#switch` | loops and dispatch |
| `#regexp`, `#replace`, `#format` | string handling; `#format` is often used with `%c`, `%t`, `%+5s`, `%T` |
| `#function` with `@f{}` | functions |
| `#local` | local variables |
| `#line {gag\|quiet\|substitute}` | line handling |
| `#send` | raw telnet bytes for GMCP negotiation |
| `#prompt` | prompt line |
| `#map` | the mapper; MUME users often use it |

**Import consequence:** we get one file, so every `#read` is a hole. Options for the importer:

- (a) Multi-file drop or picker. Resolve `#read`, `#class {x} {read} {f}` and the `#session` fourth argument relative to the entry file, and inline them.
  - Recursion guard; cycles are reported.
  - Wrap inlined content in `#nop` markers.
  - `#class … read` becomes `#class {x} {open}` … `#class {x} {close}`.
- (b) Otherwise, list the unresolved file names to the user.

## 2. Version differences

- **TinTin++ 2.x** (2.00–2.02.6x, current). Everything above applies.
  - Breaking points listed in `NEWS`:
    - From 2.02.00, `%+` followed by a number means a range. Plain `%+` must be rewritten as `%+1..a`.
    - From 2.02.11, `%w` means `[A-Za-z0-9_]`.
    - From 2.02.04, `&target` on an undefined variable must be written `&{target}`, and variables cannot start with a digit (use `${8ball}`).
    - From 2.02.00, `${var}[1]` must be written `${var[1]}`.
    - 2.02.60 switched triggers to PCRE2.
  - Priority is the 3rd argument of `#action`, `#highlight`, `#substitute`, `#alias`. Default 5, lower runs first.
  - The 2nd/3rd argument layout `#if {c} {then} {else}` is still accepted (we support it).
- **TinTin++ 1.x (1993–2000, `mods/1.5.mods`, `1.8.mods`).**
  - `#highlight {color} {pattern}`: arguments in **reversed** order.
  - `#if {expr} {then} else {else}` with a literal `else` word.
  - `#ifexists`, `#ifmatch`, `#ifstrequal`.
  - Timers: `#tickon/#tickoff/#tickset/#ticksize` and `#tick`.
  - Gone today: `#antisubstitute`, `#presub`, `#togglesubs`, `#killall`, `#retab`, `#savepath`, `#mark`, `#toupper/#tolower`, `#random {var} {x}`, `#prepad/#postpad`, `#getitemnr`, `#verbatim`, `#speedwalk`, `#char`.
  - Escapes: `$$var` and `%%0` for delayed expansion.
  - Loops: `#loop {1,5} {… %0}`.
  - Functions: `#function {f} {…;#result …}` called as `@f{args}`.
  - Captures only `%0–%9`.
  - Startup file: `~/.tintinrc` (merged with `tt.conf` in 1.8).
- **Original TinTin (III, non-++).** Same brace syntax and `.tintinrc`. A small command set (`#action #alias #sub #var #path #tick*`).
- **WinTin++.** The Windows build of tt++ 2.x, same syntax. WinTin95/WinTin.NET are unrelated clients with a TinTin-like syntax; their files can't be imported directly.
- **JMC (Jaba Mud Client).** TinTin-like (`#action`, `#alias`, `#variable`, `%0–%9`) with old-style `#highlight {color} {pattern}`. Uses `#hotkey` instead of `#macro` and `#group` instead of `#class`. Usually cp1251. Partly importable with renames.
- **zMUD/CMUD.** Different language (`#TRIGGER`, `#KEY F1 {…}`, `@var`, `*` wildcards, `%1`). Needs a real translator. Out of scope.

**Importer recommendation:** detect old syntax with heuristics and rewrite with a warning:

- reversed `#highlight` (first argument is a colour name);
- a literal `else` keyword;
- `#tick*` commands;
- `#if*` variants.

## 3. Macro key notation

- **tt++ macros:** `#macro {\eOP} {…}`. Users get the byte sequence by pressing Ctrl+V then the key, so files hold either `\e…` text or a **literal ESC byte**. Some configs have `^[[11~`, copied from `cat -v`.
- **What `keys.ts` already accepts:** `\e`, `\x1b`, `\033` and a raw ESC, followed by any of:
  - SS3 forms (`\eOp…y` numpad, `\eOP–S` F1–F4, `\eOA–D`);
  - `\e[n~` with xterm `;mod`;
  - CSI letters, `\e[Z`;
  - `\e<letter>` for Alt;
  - `^X` for Ctrl.
- **Gaps to add:**
  - `^[` written as two characters for ESC, e.g. `^[[15~`, `^[OP`.
  - Linux console F1–F5: `\e[[A…\e[[E`.
  - rxvt Shift+F-keys `\e[23~…\e[34~`. These collide: `\e[23~`/`\e[24~` are F11/F12 in xterm. Treat as xterm and warn.
  - rxvt `\e[7~`/`\e[8~` for Home/End, and rxvt modifier suffixes `$` (Shift) and `^` (Ctrl), as in `\e[11^`.
  - rxvt Shift/Ctrl arrows `\e[a…d` and `\eOa…d`.
  - `\e\e[A` (Alt+arrow, ESC-prefixed) and `\c` control escapes.
- **Rule:** keep the text exactly as written (ADR 0005). Flag macros that are unknown or not bindable in the editor instead of dropping them.

## 4. Gap list and what to do with each

| Feature | Frequency in real configs | Importer action |
|---|---|---|
| `#read`, `#class {x} {read} {f}`, `#session … {file}` | very common | **Translate** by inlining when files are available; otherwise keep inert and list the missing files |
| `#session`, `#gts`, `#zap`, `#ses` | always in the entry file | Keep inert (already) |
| `#config`, `#split`, `#screen`, `#line quiet`, `#prompt` | very common | Keep inert. Optionally map `#config {REPEAT ENTER}` and `{COMMAND ECHO}` to settings, with a note |
| `#event {IAC SB GMCP X IAC SE}` | **very common** in GMCP configs | **Translate/alias.** tt++'s event name ends in ` IAC SE`, and the arguments are `%0`/`%1` = data as a tt++ table, `%2` = raw JSON. Ours is `IAC SB GMCP X` with `%0` = package and `%1` = JSON. Accept the ` IAC SE` suffix, and only advertise compatibility once tables exist. Generic `IAC SB GMCP`: tt++ `%0` = module, `%1` = table, `%2` = JSON |
| `#event {SESSION CONNECTED}` | common | Supported. tt++ arguments are `%0` name, `%1` host, `%2` ip, `%3` port (ours: `%1` = reason on disconnect) |
| `$var[key]`, `&var[]`, `*var[]`, `#var {x} {{a}{1}{b}{2}}` | common in GMCP configs | **Unsupported, a real semantic gap.** Keep the text; warn |
| `#send` (telnet bytes for GMCP) | common | **Drop with warning.** WebCockpit negotiates GMCP itself |
| `#function` with `@f{}`, `#local`, `#return` | medium | Keep inert; warn (`@f{}` silently stays literal text) |
| `#list`, `#foreach`, `#loop`, `#while`, `#switch`/`#case` | medium | Keep inert; warn |
| `#regexp`, `#replace`, `#format` with advanced codes | medium | Keep inert; warn |
| `#path`, `#map`, `#pathdir` | medium (MUME players) | Keep inert. The map is ours |
| `#tab` | low | Keep inert, or translate later to autosuggest words |
| `#log`, `#write`, `#system`, `#run`, `#script` | low | Keep inert |
| `#killall`, `#un` | rare | Add to the command table as inert |
| 1.x syntax (see §2) | old configs | Translate with a warning |
| `#ticker {n} {cmd} {sec}` | common | Supported |

## 5. Lexical details: encoding, comments, continuation

From tt++ `src/files.c`, `read_file()`:

- **First character** must be punctuation. **It sets the command character** (`#CONFIG {TINTIN CHAR}`), so a file that starts with `/action…` uses `/` throughout.
  - Importer: if the first non-comment character is not `#`, warn, or map that character to `#`.
- **`/* … */`** is stripped by `#read` only at brace level 0 and can nest. Braces and `#` inside a comment don't count.
  - We don't handle it at all. A multi-line block comment around old `#action` lines would be **run**, and a lone `{` inside one makes `loadProfile` refuse the whole profile.
  - Must fix: the document model needs a comment node type.
- **`#nop`** is a real command. Its argument is still split on `;` and brace-counted. `#nop old stuff; say hi` sends `say hi` at runtime, and an unbalanced brace inside `#nop` breaks the file.
- **Newlines:**
  - At level 0, a newline ends a command unless the next non-blank line starts with `{`.
  - Inside braces, newlines and leading indentation are removed. A newline is **not** a separator: tt++ warns "MISSING SEMICOLON" when the next line starts with `#`.
  - `\r` is dropped (CRLF is fine). We match this (newline is whitespace).
- **Encoding:** tt++ reads raw bytes. `#config {CHARSET}` (UTF-8, `ISO1TOUTF8`, `CP1251TOUTF8`, …) applies to MUD I/O, not the file. Older European configs are often latin-1 or cp1252, and JMC configs are often cp1251.
  - Importer: decode with `TextDecoder('utf-8', {fatal:true})`; on failure fall back to `windows-1252` and tell the user.
  - Strip a UTF-8 BOM (otherwise the first character is not `#`).
  - Normalise to NFC, because alias names use accented letters (Inv §6.3).

## 6. Sources

- TinTin++ manual: https://tintin.mudhalla.net/manual/ (`read.php`, `event`, `class`, `macro`, `config`)
- Source: https://github.com/scandum/tintin
  - `src/files.c` (`read_file`)
  - `src/command.c` (command table)
  - `src/help.c` (event argument tables, lines ~1680–1820)
  - `src/config.c` (CHARSET)
  - `NEWS` (2.x compatibility breaks)
  - `mods/1.5.mods`, `mods/1.8.mods` (1.x history)
  - `FAQ` (Q17 `%%0`)
- Real configs:
  - https://github.com/steventhorne/legendmud_tintin/blob/master/core.tin
  - https://github.com/binaryatrocity/aardwolf-tintin
  - https://www.legendmud.org/index.php/GMCP_TinTin++_Tutorial
  - https://dunemud.net/tintin/gmcp_setup
- Repo: `spec.md` §3, `notes/research/cockpit-inventory.md` §6, ADR 0005, ADR 0015, `src/script/commands.ts`, `src/script/keys.ts`, `src/script/engine/{engine,text}.ts`
