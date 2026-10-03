# Foreign profile import: research overview

Owner request (2026-10-03): import settings from JMC, Mudlet, Powwow and
TinTin++. Detect the foreign format automatically and translate what can
be translated into a new profile.

Status: research only. `intent.md` lists "Import of existing tt++ or
Cockpit profiles" as a non-goal and `spec.md` §4 repeats it, so building
this needs an intent/spec change approved by the owner first.

| Client | File the user has | Shape | Translatable share | Report |
|---|---|---|---|---|
| TinTin++ | `.tin`/`.tt`, often several files via `#read` | Our own syntax | High; gaps are `/* */` comments, multi-file, tables, `#function`/loops, tt++'s GMCP event form, 1.x syntax | `tintin.md` |
| JMC | `<profile>.set` + `global.set` (+ `#read` files), CP1251/1252 or UTF-8 | TinTin 1.5 dialect | High for rules; reversed `#highlight`, `%%n` nesting, `#hot` keys, groups, first-match-only actions, JScript not translatable | `jmc.md` |
| Powwow | Plain file passed as `powwow <file>`, starts `#savefile-version` | Own `name=value` syntax | Medium; implicit gag, first-match-only, `$n`/`&n` wildcards, C-like expressions, raw key byte sequences | `powwow.md` |
| Mudlet | Profile XML (`current/<date>.xml`), `.mpackage` zip, exported `.xml` | XML + Lua | Low as tt++ rules; most content is Lua (selectString/fg/replace, Geyser). Needs a Lua shim or goes to manual review | `mudlet.md` |

Common design points:

- Detection by signature scoring: ZIP magic / `MudletPackage` root,
  `#savefile-version` and `name=value` rules (powwow), JMC state header
  and `{prio} {group}` tails, otherwise tt++.
- Encoding: strict UTF-8 first, then a legacy codepage fallback
  (windows-1252; CP1251 for Russian JMC files), strip BOM, NFC.
- Several clients spread settings over many files; a browser import of a
  single file misses `#read` targets. Accept several files (or a zip)
  and list unresolved references.
- First-match-only semantics (JMC default, powwow) differ from tt++
  "all matching actions fire". Map to priorities and warn.
- Untranslatable lines are kept as `#nop` comments with a reason and
  shown in an import report, never silently dropped.
