# Mudlet import: research report

Sources: Mudlet `development` branch, read 2026-10-03 (`src/XMLexport.cpp`, `XMLimport.cpp`, `TTrigger.h/.cpp`, `Host.cpp`, `mudlet.cpp`, `dlgPackageExporter.cpp`), the Mudlet wiki, Qt 6 docs, and two real MUME Mudlet repos: `mikkpr/mudlet-MUME` and `MUME/Mudlet-GUI`. I parsed both repos to get the corpus numbers in section 3. **[V]** means I checked it in the source. **[U]** means unverified, inferred or from memory.

## 1. File formats a user might have

| Format | Where / what | Realistic? |
|---|---|---|
| **Profile save** | `~/.config/mudlet/profiles/<profile>/current/<yyyy-MM-dd#HH-mm-ss>.xml` (Windows: `C:\Users\<u>\.config\mudlet\...`). Every save writes a new timestamped file, so the user should pick the newest. Filename format **[V]** Host.cpp. Old saves used `dd-MM-yyyy#HH-mm-ss` **[V via forum example]**. | **Most likely** for "migrate my setup". One XML holds everything: Trigger/Timer/Alias/Action/Script/Key/VariablePackage plus `HostPackage`. |
| **Exported package `.mpackage`** (or `.zip`) | ZIP holding `config.lua`, `<name>.xml` and assets (images, sounds, fonts) **[V]**. `config.lua` holds Lua assignments: `mpackage = [[name]]`, plus `author`, `icon`, `title`, `description`, `version`, `helpURL`, `dependencies`, `created = "ISO8601"` **[V]** dlgPackageExporter.cpp:1298-1307. | Likely for shared community packages. Example: MUME's 2025-10-07.mpackage. |
| **Exported `.xml`** | Same `MudletPackage` XML, written from the editor's export or from a single-item export. | Likely. Many repos ship bare `.xml` files. |
| **Clipboard XML** | Copy/paste of one item (`exportToClipboard`) **[V]**. Same schema. | Useful as a paste box. |
| **Module** | A package (xml/mpackage) installed through the Module Manager. Mudlet syncs it back to its own file, and the profile only references it: `HostPackage/Host/mInstalledModules` has `key` / `filepath` / `zipSync` **[V]**. Module items are **not** written into the profile save (`!mModuleMasterFolder` check) **[V]**. | The user has to hand us the module file separately. |
| Map | `map/*.dat`, a binary QDataStream. | Out of scope. |

**Pitfall:** a profile save also contains the items of installed packages, tagged with `<packageName>`. Mudlet pre-installs packages into every profile **[V]** mudlet.cpp:8397: `run-lua-code`, `echo`, `deleteOldProfiles`, `enable-accessibility`, `mpkg`, `gui-drop`, plus `generic_mapper` (or the IRE mapper). `HostPackage/Host/mInstalledPackages/string` lists the package names **[V]**. Skip or flag items whose `packageName` is in that list so we don't import mapper code.

## 2. XML schema

```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE MudletPackage>
<MudletPackage version="1.001">   (1.0 in old files; importer rejects >= 2.0)
  <HostPackage>  (profile saves only)
  <TriggerPackage> <TimerPackage> <AliasPackage> <ActionPackage>
  <ScriptPackage> <KeyPackage> <VariablePackage> (<HelpPackage> in older files)
```
Each element is written as `XGroup` when it is a folder and as `X` otherwise. Children nest **inside** the parent element. All booleans are attributes with the values `yes`/`no`. **[V]** XMLexport.cpp:1038-1420.

**Trigger** (attributes): `isActive isFolder isTempTrigger isMultiline isPerlSlashGOption isColorizerTrigger isFilterTrigger isSoundTrigger isColorTrigger isColorTriggerFg isColorTriggerBg`.
Children:
- `name`, `script`, `triggerType`, `conditonLineDelta` (sic), `mStayOpen`, `mCommand` (plain text sent to the MUD), `packageName`.
- `mFgColor`/`mBgColor` (`#rrggbb` or `transparent`; used when isColorizerTrigger), `mSoundFile`, `colorTriggerFgColor`/`colorTriggerBgColor`.
- `regexCodeList/string*` and `regexCodePropertyList/integer*`, as parallel lists. **[V]**

There is **no `isFilterChain`**. The name is `isFilterTrigger`.

Pattern types (TTrigger.h:58-65) **[V]**:
`0` substring, `1` Perl regex (PCRE2), `2` begin-of-line substring, `3` exact match, `4` Lua function (the pattern is Lua code returning true/false, e.g. `return isPrompt()`), `5` line spacer (the "pattern" is a line count inside a multiline trigger), `6` colour pattern, `7` prompt (matches the GA/EOR prompt line).

Colour patterns are stored as `ANSI_COLORS_F{n}_B{m}`, where n is DEFAULT, IGNORE or a number. **The first 16 numbers are saved in a legacy scrambled order.** The mapping file→ANSI is 1→8, 2→0, 3→9, 4→1, 5→10, 6→2, 7→11, 8→3, 9→12, 10→4, 11→13, 12→5, 13→14, 14→6, 15→15, 16→7. In the file, 0 = default and -2 = ignore. **[V]** remapAnsiToColorNumber, XMLexport.cpp:1429.

**Alias**: attributes `isActive`, `isFolder`. Children: `name`, `script`, `command`, `packageName`, `regex` (always PCRE). **[V]**

**Timer**: attributes `isActive isFolder isTempTimer isOffsetTimer`. Children: `name script command packageName time`. `time` has the format `hh:mm:ss.zzz`, e.g. `00:00:30.000` **[V]**. An offset timer is a child timer that fires once, at its offset after the parent fires **[U, from wiki memory]**.

**Key**: attributes `isActive isFolder`. Children: `name packageName script command keyCode keyModifier` (decimal ints) **[V]**.

**Script**: `name packageName script eventHandlerList/string*`. These are event names such as `gmcp.Char.Vitals` or `sysLoadEvent` **[V]**.

**Action** (buttons/toolbars): `commandButtonUp/Down`, `css`, geometry. Low value for us.

**Variable**: `Variable` or `VariableGroup` (tables, nested). Children: `name keyType value valueType`. These are Lua type numbers: 3 = number, 4 = string, 1 = boolean, 5 = table. There is also a `HiddenVariables/name*` list. Only variables the user marked "saved" are exported **[V for structure; type numbers are Lua's LUA_T* constants, U that keyType follows them identically]**.

**Script encoding (format 1.001)**: a control char is stored as U+FFFC followed by the matching Control Picture, e.g. ESC = `\uFFFC\u241B`. Decode this when version > 1.0 **[V]** XMLimport.cpp:1983.

Real example (simplified from the MUME 2025-10-07 package):
```xml
<TriggerGroup isActive="yes" isFolder="yes" isTempTrigger="no" isMultiline="no" isPerlSlashGOption="no" isColorizerTrigger="no" isFilterTrigger="no" isSoundTrigger="no" isColorTrigger="no" isColorTriggerFg="no" isColorTriggerBg="no">
  <name>combat</name><script></script><triggerType>0</triggerType>
  <conditonLineDelta>0</conditonLineDelta><mStayOpen>0</mStayOpen><mCommand></mCommand>
  <packageName></packageName><mFgColor>#ff0000</mFgColor><mBgColor>#ffffff</mBgColor>
  <mSoundFile></mSoundFile><colorTriggerFgColor>#000000</colorTriggerFgColor><colorTriggerBgColor>#000000</colorTriggerBgColor>
  <regexCodeList/><regexCodePropertyList/>
  <Trigger isActive="yes" isFolder="no" ... isColorizerTrigger="no" ...>
    <name>fighting</name>
    <script>selectString("fighting", 1)
setUnderline(true)
fg('white')
deselect()
resetFormat()</script>
    <triggerType>0</triggerType><conditonLineDelta>0</conditonLineDelta><mStayOpen>0</mStayOpen>
    <mCommand></mCommand><packageName></packageName><mFgColor>#ff0000</mFgColor><mBgColor>#ffffff</mBgColor>
    <mSoundFile></mSoundFile><colorTriggerFgColor>#000000</colorTriggerFgColor><colorTriggerBgColor>#000000</colorTriggerBgColor>
    <regexCodeList><string>, fighting </string></regexCodeList>
    <regexCodePropertyList><integer>1</integer></regexCodePropertyList>
  </Trigger>
</TriggerGroup>
<Key isActive="yes" isFolder="no"><name>quickalias 1</name><packageName></packageName><script></script>
  <command>1</command><keyCode>49</keyCode><keyModifier>134217728</keyModifier></Key>   <!-- Alt+1 -->
```

## 3. How much is translatable

Numbers from parsing the real MUME corpus (`mikkpr/mudlet-MUME`, 2025-10-07.mpackage; all values **[V, my measurement]**):

- **Triggers** (341): 0 use only `mCommand`, 2 are send-only scripts, 20 are empty (folders or colorizers; 19 are colorizers) and 319 have a Lua script. Classifying the 321 scripts by idiom:
  - highlight (`selectString`+`fg/bg`+`resetFormat`): 5
  - substitute (`selectString`+`replace`, or `creplaceLine`): 17
  - gag (`deleteLine`): 2
  - "simple API calls, no if/for" (`send`, `cecho`, `echo`, `replace`, `cinsertText`...): 168
  - short other: 55
  - complex: 74

  Roughly **60% are mechanically translatable** to `#action`/`#highlight`/`#substitute`/`#gag` or to a straight-line Lua body, and **about 40% need real Lua** (state, tables, GMCP, functions defined in Scripts).
- **Aliases** (83): 10 send-only, 73 Lua.
- **Keys** (85): 21 command-only, 64 Lua. Most of the Lua is `pushKey(...)`, which belongs to the package's own "chords" system.
- **Scripts** (79): all Lua. They hold the infrastructure: functions, GMCP handlers, Geyser UI.
- **MUME/Mudlet-GUI**: a single Script that is 100% Geyser UI (Gauge, Container, Mapper) driven by `gmcp` and `registerAnonymousEventHandler`. Not translatable. We would replace it with our own panes.

**Most common API** in the corpus (call counts): `matches` (288), `cecho` (185), `send` (151), `selectString` (170), `fg` (93), `echo`, `replace`, `decho`, `Geyser.*`, `gmcp` (60), `sendGMCP`, `cinsertText`, `expandAlias`, `deselect`, `resetFormat`, `creplaceLine`, `line`, `tempTimer`, `setUnderline`, `setLink`/`dechoLink`, `deleteLine`, `getCurrentLine`, `selectCurrentLine`, `enable/disableTrigger`, `enable/disableKey`, `registerAnonymousEventHandler`, `raiseEvent`, `getMudletHomeDir`. Mudlet's Lua stdlib extensions also appear: `string.split`, `table.contains`, `spairs`, `string.rpad`, `f"..."` interpolation.

**Mapping into our Lua layer:** this is feasible if we provide a compatibility shim for that ~25-function core. Selection-based formatting (`selectString`/`fg`/`replace` operating on the current line buffer) is the biggest semantic piece: it needs a mutable "current line with selection" model. Out of reach: Geyser, the `mmp`/mapper API, `getMudletHomeDir`/io, `mpkg`, and miniconsoles (`UserWindowWrap`). Strategy: import every item, translate the simple ones to tt++ rules, put the rest in the Lua layer with the original script, and flag unknown API calls in an import report.

## 4. Pattern translation issues

- **Substring (0)** → tt++ `%*text%*`, which is unanchored. tt++ actions already match anywhere, so emit the literal and escape `%`, `{`, `}` and `;` **[U, check our escaping rules]**.
- **Begin-of-line (2)** → `^text`. **Exact (3)** → `^text$`.
- **Perl regex (1)** → our `{regex}` form, if our regex engine accepts PCRE syntax. JS RegExp lacks possessive quantifiers, atomic groups, `\Z`/`\A`, inline `(?i)` (supported only in newer engines) and recursion. Detect these and flag them.
- **Captures:** in Mudlet `matches[1]` is the whole match and `matches[2..n]` are groups. So `matches[n+1]` ↔ tt++ `%n` and `matches[1]` ↔ `%0` **[V by corpus usage; wiki states the same]**. Named groups appear as `matches.name`. `multimatches[i][j]` is used for multiline triggers.
- **`isPerlSlashGOption`**: matches every occurrence on the line. tt++ has no direct equivalent, so keep it in Lua.
- **Multiline/AND (`isMultiline`)**: all patterns must match within `conditonLineDelta` lines. Type 5 "line spacer" entries insert gaps. tt++ has no equivalent, so put these in Lua or a special rule.
- **Several patterns, not multiline**: OR semantics. Emit one tt++ action per pattern with the same body.
- **Chains/gates**: a *non-folder* trigger with child triggers is a chain head. Children are evaluated only while the head is "open", which lasts `mStayOpen` lines after it fires. With `isFilterTrigger`, children see only the head's captured text, not the whole line **[V in TTrigger.cpp; detailed semantics U]**. These cannot be translated to tt++; tt++ `#class` enable/disable timing is only an approximation.
- **Colour triggers (6)** and **prompt (7)** depend on our ANSI and prompt model. Colour can map to tt++'s ability to match raw colour codes, but that is fragile.
- **Lua-function patterns (4)** are Lua only.
- **Colorizer (`isColorizerTrigger`)** → `#highlight {pattern} {<Frrggbb><Brrggbb>}` using mFgColor/mBgColor. It colours only the matched substring, which matches tt++ highlight semantics.
- **Aliases**: the regex is always PCRE and anchored by the user (`^k (.*)$`). They only map cleanly when written as `^word (.*)$` → `#alias {word} {...%1}`. Otherwise use a regex alias or Lua.
- **`mCommand`/`command`** is plain text that **does go through alias expansion**, since it behaves like typed input **[U]**. It may contain `;` separators only if the user's command separator is set, which defaults to `;;` in newer Mudlet **[U]**.

## 5. Key codes

`keyCode` is a Qt::Key value and `keyModifier` is a Qt::KeyboardModifiers bitmask, both decimal **[V Qt docs]**.

Modifiers:
- Shift `0x02000000` (33554432)
- Ctrl `0x04000000` (67108864)
- Alt `0x08000000` (134217728)
- Meta `0x10000000`
- Keypad `0x20000000` (536870912)

On macOS, Qt's "Control" is the Cmd key and "Meta" is the Ctrl key.

Keys:
- Printable keys use their ASCII code, with letters uppercase: `A`=65, `0`=48, Space=32, `+`=43, `-`=45, `*`=42, `/`=47, `.`=46.
- Escape `0x01000000`, Tab `+1`, Backspace `+3`, Return `+4`, Enter `+5`, Insert `+6`, Delete `+7`, Pause `+8`, Clear `+0x0b` (keypad 5 without NumLock).
- Home `+0x10`, End `+0x11`, Left `+0x12`, Up `+0x13`, Right `+0x14`, Down `+0x15`, PgUp `+0x16`, PgDn `+0x17`.
- F1 is `0x01000030` (16777264) through F12 at `0x0100003b`.

**Keypad keys** have the digit's keyCode plus the Keypad bit. Numpad 8 = keyCode 56 with keyModifier 536870912. That maps to DOM `KeyboardEvent.code` `Numpad8`. The other bits map to `shiftKey`/`ctrlKey`/`altKey`/`metaKey`.

## 6. Detection heuristics

- **ZIP**: magic bytes `50 4B 03 04` (`PK\3\4`). Extension `.mpackage` or `.zip`. If the archive has a `config.lua` containing `mpackage =`, it is Mudlet. In any case, find the `*.xml` inside (normally `<mpackage name>.xml` at the root) and parse it. A plain zip might hold multiple XMLs **[U]**.
- **XML**: `<!DOCTYPE MudletPackage>` and/or root element `MudletPackage` with a `version` attribute (1.0 or 1.001). `HostPackage` present → full profile save. The filename pattern `\d{4}-\d\d-\d\d#\d\d-\d\d-\d\d\.xml` → profile save.
- A clipboard paste starts with `<?xml` and has a `MudletPackage` root.
- `<map>` root → a Mudlet map XML. Ignore it.

## 7. Sources

- Mudlet source, exporter: https://github.com/Mudlet/Mudlet/blob/development/src/XMLexport.cpp
- Importer: https://github.com/Mudlet/Mudlet/blob/development/src/XMLimport.cpp
- Pattern types: https://github.com/Mudlet/Mudlet/blob/development/src/TTrigger.h
- Trigger engine: https://github.com/Mudlet/Mudlet/blob/development/src/TTrigger.cpp
- Save names and package install: https://github.com/Mudlet/Mudlet/blob/development/src/Host.cpp
- Default packages: https://github.com/Mudlet/Mudlet/blob/development/src/mudlet.cpp
- config.lua: https://github.com/Mudlet/Mudlet/blob/development/src/dlgPackageExporter.cpp
- Packages and modules: https://wiki.mudlet.org/w/Manual:Mudlet_Packages
- Trigger engine and API reference (matches, selectString, etc.): https://wiki.mudlet.org/w/Manual:Trigger_Engine, https://wiki.mudlet.org/w/Manual:Lua_Functions
- Profile location: https://forums.mudlet.org/viewtopic.php?t=22843, https://shakpack.fandom.com/wiki/Saving_your_settings
- Qt key enums: https://doc.qt.io/qt-6/qt.html#Key-enum, https://doc.qt.io/qt-6/qt.html#KeyboardModifier-enum
- Real MUME Mudlet content: https://github.com/mikkpr/mudlet-MUME, https://github.com/MUME/Mudlet-GUI, https://mume.org/download/clients/mudlet/

Corpus copies and the analysis scripts (`an.py`, `an2.py`, `corpus/`) are in the scratchpad directory.
