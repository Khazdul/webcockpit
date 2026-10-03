# Powwow definition files: format and translation notes

Sources: the MUME/powwow GitHub repo (v1.2.23, last commit 2021-07-09), read from a local clone. Line numbers refer to that tree. Everything below is verified against source or `powwow.doc` unless marked **[unverified]**.

## 1. Where settings live

- Start with `powwow <definition-file>` (also `powwow <file> <host> <port>`). The file is plain text and has **no conventional extension or name**. Users name it after the MUD, e.g. `mume`. Typical naming is **[unverified]**: the doc only says "one file for each mud you play". If `$POWWOWDIR` is set, powwow looks for and creates files there unless the name contains `/` (doc/powwow.doc.in:20-38).
- `#save [file]` writes the file. Powwow also auto-saves on exit unless `#file =` was run. The save goes through a temp file (`tmpsav<pid><rand>`) that is then renamed (src/utils.c `save_settings`).
- `#load [file]` wipes all settings and replays the file. `#exe <file` merges a file into the current settings. Hand-written "include" files run through `#exe <` are common. They can contain anything, including `\`-newline continuations, which `#save` does not preserve.
- Loading (utils.c `read_settings`): the file is read line by line, `\`+newline is joined, and each line goes through `parse_user_input(line)`. So **a definition file is just a sequence of ordinary typed commands**. Only `#savefile-version N` is special-cased.

## 2. Saved-file syntax (exact output order of `save_settings`, SAVEFILEVER = 6)

```
#savefile-version 6
#host mume.pvv.org 4242
#delim normal                      (normal | program | custom<chars>)
#groupdelim @
#init ={#identify;#request prompt}  (commands sent on connect)
#setvar mem=1048576                 (also #setvar buffer=N)
#alias name[@group]=text           (aliases, sorted)
#action >+label[@group] pattern=command   (">" = normal, "%" = regexp; "+"/"-" = on/off)
#prompt %+label pattern=command
#mark [^]pattern=attribute
#(@-1 = 5, @-2 = 7)                (numbered numeric globals, one line)
#($-3 = "text")                    (numbered string globals)
#(@xp = 100, @tick = 61500)        (named numeric vars, one line)
#($target = "orc")                 (named string vars, quoted and escaped)
#put <history line>                (only with #option +history)
#add word word word ...            (only with #option +words)
#bind name sequence=command        (or =&edit-function [args])
#option +autoclear -autoprint +compact ...  (all 14 options on 1-2 lines)
```

Real examples (doc/Config.demo):

- Alias: `#alias summ=cast 'summon' $0`, `#alias pi={remove sword;draw}`, `#alias \==score` (escaped `=` in the name).
- Labelled action, created enabled or disabled: `#action >+reply ^$1 tells you '={#print;#alias re=t $1 \$0}`, `#action >-BackFire Your spell backfired!={#print;, starts swearing loudly;EnchSet -}`.
- Action prefixes when typed: `>` define (`>` alone = `>+`), `<` delete, `=` edit, `+` enable, `-` disable. An anonymous action has no prefix: `#action ^You are hungry=eat bread`. An empty right-hand side deletes it. **Unverified:** whether anonymous actions get saved under their numeric label.
- Group: `#action >+auto-ride@non-pk ZBLAM! A &1 doesn't want you={#print;stand;ride}`, toggled with `#group non-pk off|on`. The group delimiter is set with `#groupdelim` (default `@`). Aliases can also have groups.
- Regexp action (POSIX ERE via `regcomp(REG_EXTENDED)`, enabled by default): `#action %first ^([[:alpha:]]+) ([[:digit:]]+)=#print $2 counted $3.`. In regexp actions **`$1` = the whole match and `$2..` = the groups**, so the numbering is shifted by one. Patterns are unescaped first, so backslashes are doubled: `#prompt %default ^[o\\*][^>]*>=...`.
- Pattern from an expression: `#action >joke ("^$1 says '&2;)'")= wink $1`.
- Mark: `#mark  YOU=bold red`, `#mark *an Orc*=bold yellow on red`, `#mark ^You=yellow`, `#mark {&}=inverse`. Attributes are `bold blink underline inverse|reverse`, then `[color] [on color]`. Colors are `black red green yellow blue magenta cyan white`, uppercase variants for bright colors, and `none`. Mark wildcards are an **unnumbered** `$` (one word) and `&` (any string).
- Bind: `#bind F01 ^[OP=HELP`, `#bind 2 ^[Or=s`, `#bind F06 ^[[17~=#option compact`, `#bind ^A ^A=&begin-of-line`, `#bind up ^[OA=&prev-line`. `name` is a free label, not a key identifier. The sequence is the raw bytes the terminal sends, written as: control chars as `^X`, 0x7f as `^?`, high bytes as octal `\ooo`, and special characters escaped with `\` (cmd2.c `seq_name`). Typed without a sequence, powwow asks you to press the key; saved files always include it. Built-in defaults: `KP2`..`KP9` = `\033Or`..`\033Oy` mapped to s/d/w/exits/e/look/n/u (tty.c:439).
- Timers: `#in label (ms) command` and `#at label (hhmmss) command`. A timer runs once and is then disabled. Delay 0 deletes it, and a negative delay disables it. **They are not saved by `#save`.** They appear only inside aliases, actions or `#init`, and repeating timers are built by having the command re-arm itself (Config.demo `set` alias).
- Other: `#hilite attr` sets the attribute of the *input line*. `#prompt ...` with `#isprompt N` splits off and rewrites the prompt. `#var $x=text`, `#setvar timer=0`, `#reset all|alias|action|bind|at|in|mark|prompt|var`, `#nice N`, `#if (expr) cmd; #else cmd`, `#for`, `#while`, `#do (n)`, `#N cmd` (repeat), `#send/#exe/#print/#emulate (expr)`.
- **There is no `#gag`, `#subst` or `#highlight`.** To gag, use an action without `#print`, e.g. `#action >-Ct ^Clip-clop...the riding horse=`. To substitute, catch the line and `#print` a rewritten version. Comments are written as a discarded expression: `#("Connect to MUME")`.
- Command character `#` is fixed. Commands are case-sensitive and can be abbreviated to any prefix (`#al`, `#ac`, `#opt`, `#var`). The separator is `;`. Multiple commands in a definition **must** be wrapped in `{}`. `\;`, `\{`, `\}` and `\#` are literals. A backtick reverse-escapes a backslash (`\``). Commands are recognised only at the start of a line or after `;`, `{` or `}`.

## 3. Pattern syntax (main.c `match_weak_action`)

- Literal text is matched as a substring, **unanchored and case-sensitive**. A leading `^` anchors to the line start. There is **no end anchor**: a trailing `$` would be read as a parameter.
- `$n` (1-9) captures one "word", i.e. text without delimiter characters. The delimiters are `" ;"` in `normal` mode, and `program` mode adds `<>!=(),;"'{}[]+-/*%`. `&n` captures the shortest possible string, which may contain spaces.
  - Edge rules: an unanchored pattern starting with `$n` takes the *last* word before the literal. A `$n` at the end of the pattern takes the *first* word after it. A `$n` in the middle fails if the span contains a delimiter. A `&n` at the end swallows the rest of the line.
- In the command, captures are always referenced as `$n` (never `&n`). `$0` is the whole line. In aliases, `$0` is all the arguments and `$1..$9` are words.
- `${name}` / `@{name}` / `#{expr}` are substituted into the pattern **at match time** (just-in-time substitution, not done for regexp patterns). `\$` delays substitution.
- **Only the first matching action fires** (the loop `break`s). The matched line is **suppressed unless the action runs `#print`** or `#option +autoprint` is on.

## 4. Translation gotchas vs TinTin++

1. **Implicit gag.** Every powwow action gags its line. Translate `{#print;X}` as a tt++ `#action` with X. Translate an action with no `#print` as `#action` + `#line gag`, or as `#gag` if the command is empty.
2. **Single-fire.** tt++ fires every matching action, but powwow fires only the first in list order (`#nice` controls position). Assign priorities from list order. Overlapping triggers can change behaviour.
3. **Wildcards.** Map `&n` to `%n` (non-greedy in practice). For `$n`, `%w` is too strict because MUME names contain `-`/`'`. Use `{\S+}` or `%S` **[check tt++ %S semantics]**. Map unnumbered `$`/`&` in marks to `%S`/`%*`. Regexp actions need the group indices shifted down by one (`$2` → `%1`), with `$1` = the whole match → `%0`.
4. **Variables.** `$name` (string) and `@name` (integer) are both globals. `$-50..$-1` and `@-50..@-1` are numbered globals. `$0..$9` and `@0..@9` are per-call locals/params. Map named variables to `$name`. Map numbered globals to synthetic names (`pw_n1`). Local `@0` scratch variables need `#local`.
5. **Expression language.** The expression language is C-like and integer-only, with string operators: `:` (nth word), `.` (nth char), `:> :< >: <:` slices, `.?` length, `:?` word count, `?` find, `*` (ord/chr or repeat), `%` (string↔number), `^^` (xor), `attr "bold"`/`noattr`, `rand`, `timer`, `$$1` (indirection), `#hex`. Only simple `#(@x=@x+1)` / `#if (@a > 3)` translates automatically. Flag the rest for manual review and keep the original as `#nop`.
6. **`#send ("..."+$x)` / `#exe`** builds commands from strings, so translation has to evaluate or reassemble the string. Often untranslatable.
7. **Keys.** Bindings are raw xterm byte sequences, not key names. A decode table is needed: `^[OP..^[OS` F1-F4, `^[[15~ 17~ 18~ 19~ 20~ 21~ 23~ 24~` F5-F12, `^[OA-D` arrows, `^[Op..^[Oy` keypad 0-9, `^[Oj..^[Oo` and `^[OM` keypad `* + - . / Enter`, `^[[1~..^[[6~` home/ins/del/end/pgup/pgdn, `^X` Ctrl-X, `^[x` Alt-x. The label (`F01`, `KP2`) can serve as a fallback hint. Skip `&edit-function` bindings (input-line editing) or map them to native ones.
8. **Timers.** `#in lbl (ms) cmd` is a one-shot → `#delay {lbl} {cmd} {ms/1000}`. A self-re-arming `#in` is a `#ticker`. `#at` is wall-clock; skip it or warn.
9. **`#init =cmd`** → `#event {SESSION CONNECTED}`. `#host` holds the connect target and is ignored for MUME.
10. **`#prompt`/`#isprompt`/`$prompt`, `#hilite`, `#capture`, `#!`, `#spawn`, `#module`, `#write`** have no equivalent. Drop them with a comment.
11. **Escaping.** Escapes nest (`\$0`, `\\$1`). Unescape one level per definition level.
12. **Mark attributes.** Mark attributes are words (`bold yellow on red`). Map them to `<fbg>` codes. Uppercase colour names mean the bright variants.

## 5. Detection heuristics

Strong signals, each enough on its own:
- First line `#savefile-version <n>`.
- `^#action [>%][+-]\S+ ` lines.
- `^#mark .+=(bold|underline|inverse|reverse|blink|none|[a-z]+( on [a-z]+)?)`.
- `^#bind \S+ \S*(\^\[|\\0)\S*=`.
- `^#\((@|\$)\S+ = `.
- `^#groupdelim `, `^#delim (normal|program|custom)`.
- `^#option [+-]\w+ [+-]` (many options on one line).

Weaker signals:
- `^#alias [^ {]+=` (no braces, `=` assignment).
- `^#host \S+ \d+$`.
- `#("...")` comments.
- `$1`/`&1` in action patterns and `${var}` usage.
- Absence of `{...} {...}` argument pairs.

Counter-signals:
- TinTin++: `#alias {x} {y}`, `%1`/`%*` in patterns, `#nop`, `#class`, `#var {x} {y}`, `#highlight {..}`.
- JMC: also brace-delimited, plus `%0`-`%9`, `#hot`/`#hotkey`, `#action {..} {..} {prio} {group}`, `.set` files.

Score the lines and treat a file as powwow when it has at least 3 strong hits or `#savefile-version` is present.

## 6. Links

- Repo (canonical, maintained under the MUME org): https://github.com/MUME/powwow
- Full manual: https://github.com/MUME/powwow/blob/master/doc/powwow.doc.in
- Demo definition file: https://github.com/MUME/powwow/blob/master/doc/Config.demo
- Save/load code: https://github.com/MUME/powwow/blob/master/src/utils.c (`read_settings`, `save_settings`)
- Pattern matcher: https://github.com/MUME/powwow/blob/master/src/main.c (`match_weak_action`, `search_action_or_prompt`)
- Action parsing and key sequence encoding: https://github.com/MUME/powwow/blob/master/src/cmd2.c
- Online help: https://github.com/MUME/powwow/blob/master/doc/powwow.help
- Man page: https://github.com/MUME/powwow/blob/master/man/powwow.6.utf-8.in, https://linux.die.net/man/6/powwow, https://www.mankier.com/6/powwow
- Forks: https://github.com/nschimme/powwow, https://github.com/kalev/powwow
- MUME pages: https://mume.org/download/clients/powwow/, https://www.hoopajoo.net/mud/mume.html, PowTTY help http://www.elvenrunes.com/powtty/files/powwowhelp.txt
