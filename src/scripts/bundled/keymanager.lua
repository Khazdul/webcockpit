-- @name     keymanager
-- @summary  Keeps your port keys from locate life in a pane, and casts with them
-- @api      1
-- @alias    keys      Show or hide the Port keys pane (also: keys list, keys help)
-- @alias    locatel   locatel <name>: store your room's key; locatel <target> <name>: a target's
-- @alias    kpick     Open the last pick window again
-- @alias    nkey      nkey <name> <key>: add a key by hand
-- @alias    skey      skey <name>: make it the safe key; skey alone names the safe key
-- @alias    teleport  teleport <name>: cast teleport to a key (also portal, scry, watchr)
-- @alias    tsafe     Teleport to the safe key (qtsafe: quickly, psafe: portal)
-- @key      Ctrl+S    Teleport to the safe key (tsafe)
-- @key      Alt+S     Teleport quickly to the safe key (qtsafe)
-- @setting  hours    number  12  "Hours a key works after it was located"
-- @help     Locate life gives a key for a room: teleport, portal, scry and
-- @help     watch room take it. This script stores the keys under short
-- @help     names and casts with them. A key works only for the character
-- @help     who located it and only for 12 hours, so each character has
-- @help     its own keys, and old keys disappear by themselves.
-- @help
-- @help       locatel home          store the key of the room you stand in
-- @help       locatel troll cave    store the key of the troll's room
-- @help       teleport home         cast n 'teleport' <home's key>
-- @help       portal home, scry home, watchr home
-- @help       cast 'teleport' $home any command: $home becomes the key
-- @help
-- @help     Every locate life is caught, however you cast it (locatel, your
-- @help     own alias, or by hand), and opens the pick window: type the
-- @help     key's name and press Enter. Up and Down choose the hit (or
-- @help     click a row; a double click or OK stores it), Esc closes. The
-- @help     name is filled in: the locatel name, else one made up from the
-- @help     room type or the creature ($hill, $troll), selected so that
-- @help     typing replaces it. A locatel with a name and a single hit is
-- @help     stored at once. kpick opens the last window again.
-- @help
-- @help     The first key you store is the safe key (the star in the pane):
-- @help     Ctrl+S teleports there, Alt+S teleports quickly. Click another
-- @help     key's star, or type skey <name>, to change it. When the safe
-- @help     key expires, your freshest key takes over.
-- @help
-- @help     In the Port keys pane, click a key's name to rename it (Enter
-- @help     saves, Esc cancels). The letters are casts: t teleport,
-- @help     p portal, s scry, w watch room; x deletes (click it twice).
-- @help     Point at one to see the command. Names are 1 to 10 letters,
-- @help     digits or _. What changes in your keys is in the UI messages.

--[[
How it works

Locate life (MUME), cast on yourself or on a target:

  > cast n 'locate life' troll
  You start to concentrate...

  A troll - Inside  Far away  key: 'abcdefghi'
  Gittan - On a hill  Very near  key: 'uxevjobve'

  !( Mana:Burning>

A row is "<creature> - <room type>  <distance>  key: '<key>'" (two or
more spaces between the columns). The block ends with a blank line. No
hit: "Your mind fails to locate any such creature."

Capture. The row trigger is always on and every locate block is handled
the same way, however it was cast: its rows are gagged, and when the
block ends the pick window opens (a temporary pane with a name field,
pane:setInput). locatel only arms the name for the next block (15 s):
the window opens with it, and a single hit is stored at once without the
window. Otherwise the field holds a suggestion: the hit's name in the
library, else a name made up from the room type (a row for your own
character, state.char.name) or the creature (autoName). The block ends
at the first line that is not a row (a temporary trigger, only while a
block is open) or 2 s after the last row. The failure lines of the
Mudlet script cancel an armed name.

Keys are per character: one store entry per character ("char.<name>",
from state.char.name), holding the safe key's name and the keys with the
wall-clock time they were located (getEpoch), so they survive a reload.
A key expires `hours` after it was located: expired keys are dropped once
a minute, on use and on load, and named once in the UI messages.

$name. An alias catches any typed command with a $word; each $word that
is a live key's name becomes the key and the command runs again through
expandAlias (profile aliases apply; this alias does not run twice). With
no key name in it, the alias returns false and the command goes on as
typed. Profile variables ($var in tt++) are substituted before any alias
sees the command, so a profile variable wins over a key of the same name.
]]

-- ------------------------------------------------------------ constants

local NAME_MAX = 10
local LOCATE_TIMEOUT = 15   -- seconds an armed locate waits for its rows
local BLOCK_END = 2         -- seconds after the last row that end a block
local FRESH = 4             -- seconds a freshly stored key is highlighted
local CONFIRM = 4           -- seconds to click x a second time

local TAG = "<ansi_light_yellow>KEYS<reset> "
local NAME_C = "ansi_light_cyan"
local DIM = "ansi_light_black"

-- ------------------------------------------------------------ helpers

local function now() return getEpoch() end

local function life()
  return math.max(0.1, tonumber(settings.hours) or 12) * 3600
end

local function trim(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end

local function len(s) return utf8.len(s) or #s end

local function pad(s, w)
  local n = len(s)
  if n >= w then return s end
  return s .. string.rep(" ", w - n)
end

local function lpad(s, w)
  local n = len(s)
  if n >= w then return s end
  return string.rep(" ", w - n) .. s
end

-- `s` cut to `w` cells with an ellipsis.
local function cut(s, w)
  if len(s) <= w then return s end
  if w <= 1 then return w == 1 and "…" or "" end
  return s:sub(1, utf8.offset(s, w) - 1) .. "…"
end

-- "12h" / "45m": the pane's time column. Hours round up (a key located
-- a minute ago shows the full 12h, as in the Mudlet script); under an
-- hour it counts minutes.
local function short(secs)
  if secs >= 3600 then return math.ceil(secs / 3600) .. "h" end
  return math.max(1, math.floor(secs / 60)) .. "m"
end

-- "11h 20m" / "45m".
local function long(secs)
  secs = math.max(0, secs)
  local h, m = math.floor(secs / 3600), math.floor(secs % 3600 / 60)
  if h > 0 then return h .. "h " .. m .. "m" end
  return math.max(1, m) .. "m"
end

local function say(text) cecho(TAG .. text) end
-- A change to the library: in the UI messages (▶ KEYS: …), plain text.
local function note(text) uiMessage("keys", text) end
local function fail(text) cecho(TAG .. "<ansi_light_red>" .. text) end
local function nm(name) return "<" .. NAME_C .. ">$" .. name .. "<reset>" end

local function validName(name)
  return type(name) == "string" and #name >= 1 and #name <= NAME_MAX and name:match("^[%w_]+$") ~= nil
end

-- ------------------------------------------------------------ state

-- The character whose keys are shown: { id = lower-case name, name }.
local char = nil
-- Its keys: { safe = id or nil, keys = { [id] = { name, key, room, dist, at } } }.
local lib = nil
-- id -> epoch when it was stored (the highlight).
local fresh = {}
-- A delete waiting for its second click: { id, at }.
local confirm = nil
-- A locatel waiting for its rows: { name, target, timer }.
local armed = nil
-- The locate block being read: { hits, arm, trig, timer }.
local block = nil
-- The last locate's hits: { hits = { { mob, room, dist, key } }, name }.
local last = nil
-- The open pick list: { pane, hits, name, sel, keys }.
local pick = nil

local draw -- the pane, below

local function storeId(id) return "char." .. id end

local function loadLib(id)
  local l = { safe = nil, keys = {} }
  local data = store.get(storeId(id))
  if type(data) ~= "table" then return l end
  for _, r in ipairs(data.keys or {}) do
    if type(r) == "table" and validName(r.name) and type(r.key) == "string" and type(r.at) == "number" then
      l.keys[r.name:lower()] = {
        name = r.name, key = r.key, at = r.at,
        room = type(r.room) == "string" and r.room or "",
        dist = type(r.dist) == "string" and r.dist or "",
      }
    end
  end
  if type(data.safe) == "string" and l.keys[data.safe:lower()] then l.safe = data.safe:lower() end
  return l
end

local function save()
  if not char or not lib then return end
  local list = {}
  for _, k in pairs(lib.keys) do
    list[#list + 1] = { name = k.name, key = k.key, room = k.room, dist = k.dist, at = k.at }
  end
  table.sort(list, function(a, b) return a.name:lower() < b.name:lower() end)
  store.set(storeId(char.id), { name = char.name, safe = lib.safe, keys = list })
end

local function sorted()
  local list = {}
  if not lib then return list end
  for id, k in pairs(lib.keys) do list[#list + 1] = { id = id, k = k } end
  table.sort(list, function(a, b) return a.id < b.id end)
  return list
end

local function count()
  local n = 0
  if lib then for _ in pairs(lib.keys) do n = n + 1 end end
  return n
end

local function expires(k) return k.at + life() end

-- The name of the key whose key text is `key`, or nil.
local function nameOfKey(key)
  if not lib then return nil end
  for _, e in ipairs(sorted()) do
    if e.k.key == key then return e.k.name end
  end
  return nil
end

-- ------------------------------------------------------------ safe key and expiry

-- The freshest key's id, or nil.
local function freshest()
  local best = nil
  for id, k in pairs(lib.keys) do
    if not best or k.at > lib.keys[best].at or (k.at == lib.keys[best].at and id < best) then best = id end
  end
  return best
end

-- Keeps the safe key on a live key. Returns the new safe key's id when it
-- had to move (false when nothing changed).
local function ensureSafe()
  if lib.safe and lib.keys[lib.safe] then return false end
  lib.safe = freshest()
  return lib.safe
end

-- Drops expired keys and re-elects the safe key; tells the player once.
local function prune()
  if not lib then return false end
  local t = now()
  local gone = {}
  local safeName = lib.safe and lib.keys[lib.safe] and lib.keys[lib.safe].name
  for id, k in pairs(lib.keys) do
    if expires(k) <= t then
      gone[#gone + 1] = k.name
      lib.keys[id] = nil
      fresh[id] = nil
    end
  end
  if #gone == 0 then return false end
  table.sort(gone, function(a, b) return a:lower() < b:lower() end)
  local names = {}
  for _, n in ipairs(gone) do names[#names + 1] = "$" .. n end
  local text = (#gone == 1 and "Key " or "Keys ") .. table.concat(names, ", ") .. " expired."
  local moved = ensureSafe()
  if moved ~= false and safeName then
    if lib.safe then
      text = text .. " The safe key is now $" .. lib.keys[lib.safe].name .. "."
    else
      text = text .. " No keys left: no safe key."
    end
  end
  uiMessage("keys", text)
  save()
  return true
end

-- ------------------------------------------------------------ the library

local function notLoggedIn()
  fail("Not logged in: keys are kept per character. Log in first.")
end

-- The live key called `name` (a leading $ is allowed), or nil with a message.
local function find(name)
  if not lib then
    notLoggedIn()
    return nil
  end
  name = (name or ""):gsub("^%$", "")
  local id = name:lower()
  local k = lib.keys[id]
  if k and expires(k) <= now() then
    prune()
    draw()
    fail("Key $" .. k.name .. " has expired. locatel " .. k.name .. " stores a new one.")
    return nil
  end
  if not k then
    fail("No key $" .. name .. ". Type keys to see your keys.")
    return nil
  end
  return k
end

local ARTICLES = { a = true, an = true, the = true }

-- A free name for a key nobody named: the room type's last word for your
-- own room, the creature's last word (after a, an, the) for a target;
-- cut to fit, then 2, 3 … while it is taken.
local function autoName(text)
  local words = {}
  for w in text:lower():gmatch("[%w_]+") do
    if not ARTICLES[w] then words[#words + 1] = w end
  end
  local base = words[#words] or "key"
  base = base:sub(1, NAME_MAX)
  if not lib.keys[base] then return base end
  for i = 2, 99 do
    local suffix = tostring(i)
    local n = base:sub(1, NAME_MAX - #suffix) .. suffix
    if not lib.keys[n] then return n end
  end
  return nil
end

local function stopFresh()
  tempTimer(FRESH + 0.1, function() draw() end)
end

-- Stores a key; tells the player what happened.
local function addKey(name, key, room, dist)
  local id = name:lower()
  local old = lib.keys[id]
  lib.keys[id] = { name = name, key = key, room = room or "", dist = dist or "", at = now() }
  local becameSafe = false
  if not lib.safe or not lib.keys[lib.safe] then
    lib.safe = id
    becameSafe = true
  end
  fresh[id] = now()
  save()
  local what = {}
  if room and room ~= "" then what[#what + 1] = room end
  if dist and dist ~= "" then what[#what + 1] = dist end
  local info = #what > 0 and (" (" .. table.concat(what, ", ") .. ")") or ""
  local other = nil
  for oid, k in pairs(lib.keys) do
    if oid ~= id and k.key == key then other = k.name end
  end
  note((old and (old.key == key and "Renewed $" or "Replaced $") or "Stored $") .. name .. info .. ": " .. key .. "."
    .. (other and (" Same key as $" .. other .. ".") or "")
    .. (becameSafe and " It is your safe key (Ctrl+S)." or ""))
  stopFresh()
  draw()
end

local function deleteKey(id)
  local k = lib.keys[id]
  if not k then return end
  local wasSafe = lib.safe == id
  lib.keys[id] = nil
  fresh[id] = nil
  if confirm and confirm.id == id then confirm = nil end
  local text = "Deleted $" .. k.name .. "."
  if wasSafe then
    ensureSafe()
    if lib.safe then
      text = text .. " The safe key is now $" .. lib.keys[lib.safe].name .. "."
    else
      text = text .. " No keys left: no safe key."
    end
  end
  save()
  note(text)
  draw()
end

-- Renames key `id` to `to`; returns an error text, or nil when done.
local function renameKey(id, to)
  to = trim(to or ""):gsub("^%$", "")
  local k = lib.keys[id]
  if not k then return "That key is gone." end
  if not validName(to) then return "A name is 1 to " .. NAME_MAX .. " letters, digits or _." end
  local nid = to:lower()
  if lib.keys[nid] and nid ~= id then return "There is a key $" .. lib.keys[nid].name .. " already." end
  if to == k.name then return nil end
  local old = k.name
  lib.keys[id] = nil
  k.name = to
  lib.keys[nid] = k
  if lib.safe == id then lib.safe = nid end
  if fresh[id] then fresh[nid], fresh[id] = fresh[id], nil end
  save()
  note("Renamed $" .. old .. " to $" .. to .. ".")
  return nil
end

local function setSafe(id)
  local k = lib.keys[id]
  if not k then return end
  if lib.safe == id then
    say(nm(k.name) .. " is already the safe key.")
    return
  end
  lib.safe = id
  save()
  note("Safe key: $" .. k.name .. " (Ctrl+S teleports, Alt+S quickly).")
  draw()
end

-- ------------------------------------------------------------ casts

local SPELLS = {
  teleport = { spell = "teleport", verb = "Teleporting", to = " to" },
  portal = { spell = "portal", verb = "Portalling", to = " to" },
  scry = { spell = "scry", verb = "Scrying", to = "" },
  watchr = { spell = "watch room", verb = "Watching", to = "" },
}

local function castCommand(what, k, quick)
  local s = SPELLS[what]
  local cmd = "cast " .. (quick and "q" or "n") .. " '" .. s.spell .. "' " .. k.key
  -- watch room labels its lines with the name: [home] ...
  if what == "watchr" then cmd = cmd .. " " .. k.name end
  return cmd
end

local function cast(what, k, quick, safe)
  local s = SPELLS[what]
  say(s.verb .. (quick and " quickly" or "") .. s.to .. (safe and " the safe key " or " ") .. nm(k.name)
    .. " <" .. DIM .. ">(" .. k.key .. ")<reset>")
  send(castCommand(what, k, quick))
end

local function castSafe(what, quick)
  if not lib then return notLoggedIn() end
  if prune() then draw() end
  if not lib.safe then
    fail("No keys, so no safe key. locatel <name> stores one.")
    return
  end
  cast(what, lib.keys[lib.safe], quick, true)
end

-- ------------------------------------------------------------ the pane

local pane = createPane{ id = "keys", title = "Port keys", dock = "right", rows = 8, cols = 44, anchor = "top" }
local width = 44

-- Writes a row from segments { text, color, fn, hint }, with links.
local function row(n, segs)
  local out, links, col = {}, {}, 1
  for _, s in ipairs(segs) do
    local w = len(s.text)
    if s.color then
      out[#out + 1] = "<" .. s.color .. ">" .. s.text .. "<reset>"
    else
      out[#out + 1] = s.text
    end
    if s.fn and w > 0 then links[#links + 1] = { col, w, s.fn, s.hint } end
    col = col + w
  end
  pane:setLine(n, table.concat(out))
  for _, l in ipairs(links) do pane:setLink(n, l[1], l[2], l[3], l[4]) end
end

local showHelp -- the alias part, below

-- A rename in the pane: { id, value, err, field, row, started }.
local renaming = nil
-- How many lines the pane has (a rename keeps its row while this holds).
local shownLines = 0

local function startRename(id)
  if not lib or not lib.keys[id] then return end
  renaming = { id = id, value = lib.keys[id].name }
  draw()
end

-- The top row: the key count and the help link, or the rename's prompt.
local function header(n)
  if renaming then
    local msg = renaming.err or "Enter renames $" .. lib.keys[renaming.id].name .. ", Esc cancels"
    row(1, { { text = " " .. cut(msg, math.max(1, width - 2)), color = renaming.err and "ansi_light_red" or DIM } })
    return
  end
  local left = " " .. (n == 1 and "1 key" or n .. " keys")
  -- The ? sits where the last letter of a key row does (one cell in).
  row(1, {
    { text = left, color = DIM },
    { text = string.rep(" ", math.max(1, width - 2 - len(left))) },
    { text = "?", color = "ansi_light_cyan", fn = function() showHelp() end, hint = "The key manager's help (keys help)" },
  })
end

-- The casts, in the order they are dropped from the right on a narrow pane.
local LETTERS = {
  { "t", "teleport", "Teleport to" },
  { "p", "portal", "Portal to" },
  { "s", "scry", "Scry" },
  { "w", "watchr", "Watch room" },
}

local function drawKey(n, id, k, t, nameW, timeW, roomW, keyW)
  local segs = {}
  -- The safe marker.
  if lib.safe == id then
    segs[#segs + 1] = { text = " " }
    segs[#segs + 1] = { text = "★", color = "ansi_light_green", fn = function() setSafe(id) end,
      hint = "$" .. k.name .. " is the safe key:\nCtrl+S teleports there, Alt+S quickly" }
  else
    segs[#segs + 1] = { text = " " }
    segs[#segs + 1] = { text = "☆", color = DIM, fn = function() setSafe(id) end,
      hint = "Make $" .. k.name .. " the safe key\n(Ctrl+S teleports to the safe key)" }
  end
  segs[#segs + 1] = { text = " " }
  -- The name; a fresh key is highlighted for a few seconds.
  local isFresh = fresh[id] and t - fresh[id] < FRESH
  local left = expires(k) - t
  segs[#segs + 1] = { text = "$" .. k.name, color = isFresh and "black:" .. NAME_C or NAME_C,
    fn = function() startRename(id) end,
    hint = "Click to rename\n$" .. k.name .. (k.room ~= "" and (": " .. k.room) or "") .. (k.dist ~= "" and (", " .. k.dist) or "")
      .. "\nkey " .. k.key .. ", located " .. long(t - k.at) .. " ago" }
  segs[#segs + 1] = { text = string.rep(" ", nameW - len(k.name) - 1) }
  if roomW > 0 then
    segs[#segs + 1] = { text = " " .. pad(cut(k.room, roomW), roomW) }
  end
  if keyW > 0 then
    segs[#segs + 1] = { text = " " .. pad(cut(k.key, keyW), keyW), color = DIM }
  end
  -- The casts and delete: as many as fit, two cells each, ending one cell
  -- before the right edge; the time sits just before them.
  local used = 3 + nameW + (roomW > 0 and roomW + 1 or 0) + (keyW > 0 and keyW + 1 or 0) + 1 + timeW
  local fit = math.max(0, math.min(#LETTERS + 1, (width - used - 1) // 2))
  local gap = math.max(0, width - used - fit * 2 - 1)
  segs[#segs + 1] = { text = string.rep(" ", 1 + gap) }
  segs[#segs + 1] = { text = lpad(short(left), timeW), color = left < 3600 and "orange" or nil }
  if confirm and confirm.id == id and fit >= 1 then
    local before = (fit - 1) * 2
    local word = before + 1 >= 9 and " delete? " or ""
    segs[#segs + 1] = { text = lpad(word, before + 1), color = "ansi_light_red" }
    segs[#segs + 1] = { text = "x", color = "ansi_light_red", fn = function()
      deleteKey(id)
    end, hint = "Click again to delete $" .. k.name }
    return row(n, segs)
  end
  for i = 1, math.min(fit, #LETTERS) do
    local l = LETTERS[i]
    segs[#segs + 1] = { text = " " }
    segs[#segs + 1] = { text = l[1], color = "ansi_light_cyan", fn = function()
      local key = find(k.name)
      if key then cast(l[2], key) end
    end, hint = l[3] .. " $" .. k.name .. ":\n" .. castCommand(l[2], k) }
  end
  if fit > #LETTERS then
    segs[#segs + 1] = { text = " " }
    segs[#segs + 1] = { text = "x", color = "ansi_light_red", fn = function()
      confirm = { id = id, at = now() }
      draw()
      local mine = confirm
      tempTimer(CONFIRM, function()
        if confirm == mine then
          confirm = nil
          draw()
        end
      end)
    end, hint = "Delete $" .. k.name .. " (click twice)" }
  end
  row(n, segs)
end

-- Puts the rename field on the name cells of row `r` (after the $).
local function renameField(r, nameW)
  local rn = renaming
  rn.row = r
  rn.field = pane:setInput(r, 5, nameW - 1, {
    value = rn.value,
    maxLength = NAME_MAX,
    onChange = function(text)
      rn.value = text
      if rn.err then
        rn.err = nil
        header(count())
      end
    end,
    onSubmit = function(text)
      if renaming ~= rn then return end
      local err = renameKey(rn.id, text)
      if err then
        rn.err = err
        header(count())
        rn.field:focus()
        return
      end
      renaming = nil
      draw()
    end,
    onCancel = function()
      if renaming ~= rn then return end
      renaming = nil
      draw()
    end,
  })
  if rn.started then
    rn.field:focus()
  else
    rn.started = true
    rn.field:select()
  end
end

draw = function()
  if not char then
    pane:clear()
    shownLines = 0
    renaming = nil
    row(1, { { text = " Not logged in", color = DIM } })
    pane:setLine(3, " <" .. DIM .. ">Keys are kept per character.")
    pane:setLine(4, " <" .. DIM .. ">Log in to see yours.")
    return
  end
  local list = sorted()
  local n = #list
  local lines = n == 0 and 4 or n + 1
  -- A rename keeps its row (and the field's text and focus) while the
  -- rows stay where they are; otherwise the field is made again.
  local rr = nil
  if renaming then
    for i, e in ipairs(list) do
      if e.id == renaming.id then rr = i + 1 end
    end
    if not rr then renaming = nil end
  end
  local keep = renaming and renaming.field and renaming.row == rr and lines == shownLines and renaming.field:value() ~= nil
  if not keep then
    pane:clear()
    if renaming then renaming.field = nil end
  end
  shownLines = lines
  header(n)
  if n == 0 then
    pane:setLine(2, "")
    pane:setLine(3, " No keys yet.")
    pane:setLine(4, " <" .. DIM .. ">locatel <name> stores your room's key.")
    return
  end
  local t = now()
  local nameW, timeW, roomMax, keyMax = 5, 3, 0, 0
  for _, e in ipairs(list) do
    nameW = math.max(nameW, len(e.k.name) + 1)
    timeW = math.max(timeW, len(short(expires(e.k) - t)))
    roomMax = math.max(roomMax, len(e.k.room))
    keyMax = math.max(keyMax, len(e.k.key))
  end
  -- Marker, name and time always; then the casts and delete (11 cells);
  -- the room type and the key get what is left, the key first to go.
  local fixed = 3 + nameW + 1 + timeW + (#LETTERS + 1) * 2 + 1
  local avail = width - fixed
  local roomW, keyW = 0, 0
  if roomMax > 0 and keyMax > 0 and avail >= roomMax + keyMax + 2 then
    roomW, keyW = roomMax, keyMax
  elseif roomMax > 0 and avail >= 7 then
    roomW = math.min(roomMax, avail - 1)
  elseif roomMax == 0 and keyMax > 0 and avail >= keyMax + 1 then
    keyW = keyMax
  end
  for i, e in ipairs(list) do
    if not (keep and i + 1 == rr) then drawKey(i + 1, e.id, e.k, t, nameW, timeW, roomW, keyW) end
  end
  if renaming and not renaming.field then renameField(rr, nameW) end
end

pane:onResize(function(rows, cols)
  width = cols
  draw()
end)

-- ------------------------------------------------------------ the pick window

-- True when `mob` is your own character (a locate of your own room).
local function isMe(mob)
  local me = state.char and state.char.name
  return type(me) == "string" and mob:lower() == me:lower()
end

-- The name a hit is offered under: its name in the library, else one made
-- up from the room type (your own room) or the creature.
local function suggest(h)
  return nameOfKey(h.key) or autoName(isMe(h.mob) and h.room or h.mob) or ""
end

local function closePick()
  local p = pick
  if not p then return end
  pick = nil
  p.pane:close()
end

-- Stores hit `i` under `name`; true when stored.
local function storeHit(hits, i, name)
  local h = hits[i]
  if not h then return false end
  if not lib then
    notLoggedIn()
    return false
  end
  addKey(name, h.key, h.room, h.dist)
  return true
end

-- The typed name without a leading $.
local function typed(p)
  local v = p.field:value() or ""
  v = trim(v):gsub("^%$", "")
  return v
end

-- What Enter will do with the typed name, or why it cannot.
local function pickStatus(p)
  local name = typed(p)
  local h = p.hits[p.sel]
  if name == "" then return "<" .. DIM .. ">Type a name for the key." end
  if not validName(name) then return "<ansi_light_red>A name is 1 to " .. NAME_MAX .. " letters, digits or _." end
  local k = lib and lib.keys[name:lower()]
  if k and k.key == h.key then return "<" .. DIM .. ">Enter renews $" .. k.name .. "." end
  if k then return "<orange>Enter replaces $" .. k.name .. " (" .. k.key .. ")." end
  return "<" .. DIM .. ">Enter stores hit " .. p.sel .. " as $" .. name .. "."
end

local drawPick

local function pickStore(p)
  local name = typed(p)
  if not validName(name) then
    drawPick(p)
    p.field:select()
    return
  end
  if storeHit(p.hits, p.sel, name) then closePick() end
end

-- Selects hit `i`; an unedited name follows the selection.
local function pickSelect(p, i)
  p.sel = math.max(1, math.min(#p.hits, i))
  if not p.edited then p.field:setValue(suggest(p.hits[p.sel])) end
  drawPick(p)
end

drawPick = function(p)
  local pn = p.pane
  local w = p.w
  local idxW = #tostring(#p.hits)
  pn:setLine(2, " " .. pickStatus(p))
  pn:setLine(3, "<" .. DIM .. ">   " .. pad("#", idxW) .. "  " .. pad("Mob", w.mob) .. "  " .. pad("Room type", w.room)
    .. "  " .. pad("Distance", w.dist) .. "  Key")
  for i, h in ipairs(p.hits) do
    local sel = i == p.sel
    local known = nameOfKey(h.key)
    local r = i + 3
    pn:setLine(r, (sel and " <ansi_light_green>▶<reset> " or "   ") .. pad(tostring(i), idxW) .. "  "
      .. (sel and "<ansi_white>" or "") .. pad(cut(h.mob, w.mob), w.mob) .. (sel and "<reset>" or "") .. "  "
      .. pad(cut(h.room, w.room), w.room) .. "  " .. pad(cut(h.dist, w.dist), w.dist) .. "  "
      .. "<" .. DIM .. ">" .. h.key .. "<reset>"
      .. (known and ("  <ansi_light_green>= $" .. known .. "<reset>") or ""))
    local hint = h.mob .. " - " .. h.room .. ", " .. h.dist .. "\nkey " .. h.key
      .. (known and ("\n(stored as $" .. known .. ")") or "") .. "\nClick: select · double-click: store"
    pn:setLink(r, 1, w.total, function()
      local t = now()
      local again = p.lastClick and p.lastClick.i == i and t - p.lastClick.at < 0.5
      p.lastClick = { i = i, at = t }
      if again and p.sel == i then
        pickStore(p)
        return
      end
      pickSelect(p, i)
      p.field:focus()
    end, hint)
  end
  local foot = #p.hits + 5
  pn:setLine(foot - 1, "")
  local keys = " ↑↓ select · Enter store · Esc close   "
  pn:setLine(foot, "<" .. DIM .. ">" .. keys .. "<reset><ansi_light_green>[ OK ]")
  pn:setLink(foot, len(keys) + 1, 6, function() pickStore(p) end, "Store the selected hit under the typed name")
end

-- Opens the pick window for `hits`, the name field filled with `name` or
-- a suggestion, selected so that typing replaces it.
local function openPick(hits, name)
  closePick()
  local w = { mob = 3, room = 9, dist = 8, key = 3 }
  for _, h in ipairs(hits) do
    w.mob = math.max(w.mob, math.min(24, len(h.mob)))
    w.room = math.max(w.room, math.min(16, len(h.room)))
    w.dist = math.max(w.dist, math.min(12, len(h.dist)))
    w.key = math.max(w.key, len(h.key) + 14) -- room for "  = $name"
  end
  w.total = 3 + #tostring(#hits) + 2 + w.mob + 2 + w.room + 2 + w.dist + 2 + w.key
  local cols = math.min(110, math.max(w.total, 48) + 1)
  local p = { hits = hits, sel = 1, w = w, edited = name ~= nil }
  p.pane = createPane{ id = "pick", temporary = true, at = "top", rows = #hits + 5, cols = cols, title = "Pick a key" }
  pick = p
  p.pane:onClose(function()
    if pick == p then pick = nil end
  end)
  p.pane:setLine(1, " Name: $")
  p.field = p.pane:setInput(1, 9, NAME_MAX + 2, {
    value = name or suggest(hits[1]),
    maxLength = NAME_MAX,
    placeholder = "name",
    onSubmit = function() pickStore(p) end,
    onCancel = function() closePick() end,
    onChange = function()
      p.edited = true
      p.pane:setLine(2, " " .. pickStatus(p))
    end,
    onKey = function(key)
      if key == "ArrowUp" or key == "PageUp" then pickSelect(p, p.sel - 1)
      elseif key == "ArrowDown" or key == "PageDown" then pickSelect(p, p.sel + 1) end
    end,
  })
  drawPick(p)
  p.field:select()
end

-- ------------------------------------------------------------ capture

local function disarm()
  local a = armed
  armed = nil
  if a and a.timer then killTimer(a.timer) end
  return a
end

-- A locate block ended: a locatel name with one hit is stored at once;
-- anything else opens the pick window.
local function finishBlock()
  local b = block
  if not b then return end
  block = nil
  killTrigger(b.trig)
  if b.timer then killTimer(b.timer) end
  local name = b.arm and b.arm.name or nil
  last = { hits = b.hits, name = name }
  if not lib then
    notLoggedIn()
    return
  end
  if name and #b.hits == 1 then
    storeHit(b.hits, 1, name)
    return
  end
  openPick(b.hits, name)
end

-- A row of a locate block.
tempRegexTrigger("^(.*?)\\s+-\\s+(.*?)\\s{2,}(.*?)\\s{2,}key: '(.*)'$", function()
  local h = { mob = trim(matches[2]), room = trim(matches[3]), dist = trim(matches[4]), key = trim(matches[5]) }
  if h.key == "" then return end
  if not block then
    block = { hits = {}, arm = disarm() }
    -- The block ends at the first line that is not a row.
    block.trig = tempRegexTrigger("^(?!.*key: '.*'$)", finishBlock)
  end
  local b = block
  b.hits[#b.hits + 1] = h
  deleteLine()
  if b.timer then killTimer(b.timer) end
  b.timer = tempTimer(BLOCK_END, finishBlock)
end)

-- Lines that end a locate before it finds anything (the Mudlet script's).
tempRegexTrigger("^(?:Argh! You cannot concentrate any more\\.\\.\\.|Nah\\.\\.\\. You feel too relaxed to do that\\.|In your dreams, or what\\?|Alas, this location is out of range!|Alas, not enough mana flows through you\\.\\.\\.|Your spell backfired!|Your mind fails to locate any such creature\\.|You feel very confused and can't concentrate any more\\.)$", function()
  if not armed then return end
  local a = disarm()
  if line:find("fails to locate", 1, true) then
    fail("Locate found nothing: no key stored for $" .. a.name .. ".")
  else
    fail("The locate failed: no key stored for $" .. a.name .. ".")
  end
end)

local function locate(target, name)
  if not validName(name) then
    fail("A key name is 1 to " .. NAME_MAX .. " letters, digits or _ (not " .. name .. ").")
    return
  end
  if not lib then return notLoggedIn() end
  disarm()
  local a = { name = name, target = target }
  a.timer = tempTimer(LOCATE_TIMEOUT, function()
    if armed == a then
      armed = nil
      fail("No locate result within " .. LOCATE_TIMEOUT .. " s: no key stored for $" .. name .. ".")
    end
  end)
  armed = a
  local old = lib.keys[name:lower()] and " (replaces the old one)" or ""
  say("Locating " .. (target and target or "your room") .. " for " .. nm(name) .. old .. ".")
  send("cast n 'locate life'" .. (target and (" " .. target) or ""))
end

-- ------------------------------------------------------------ the character

local function follow()
  local c = state.char
  local n = c and c.name
  if type(n) ~= "string" or n == "" then return end
  local id = n:lower()
  if char and char.id == id then return end
  closePick()
  disarm()
  last = nil
  confirm = nil
  fresh = {}
  char = { id = id, name = n:sub(1, 1):upper() .. n:sub(2) }
  lib = loadLib(id)
  prune()
  if ensureSafe() then save() end
  draw()
end

registerAnonymousEventHandler("gmcp.Char.Name", function()
  -- state.char is up to date once the message is handled.
  tempTimer(0, follow)
end)

-- ------------------------------------------------------------ aliases

local function list()
  if not lib then return notLoggedIn() end
  prune()
  local l = sorted()
  if #l == 0 then
    say("No keys for " .. char.name .. ". locatel <name> stores your room's key.")
    return
  end
  local t = now()
  say(char.name .. "'s keys:")
  for _, e in ipairs(l) do
    local k = e.k
    cecho("  " .. (lib.safe == e.id and "<ansi_light_green>★<reset> " or "  ") .. "<" .. NAME_C .. ">"
      .. pad("$" .. k.name, NAME_MAX + 1) .. "<reset>  " .. pad(k.room, 16) .. "  <" .. DIM .. ">" .. pad(k.key, 12)
      .. "<reset>  " .. long(expires(k) - t) .. " left")
  end
end

showHelp = function()
  expandAlias("#script help " .. scriptName)
end

tempAlias("^keys(?:\\s+(\\S+))?\\s*$", function()
  local sub = matches[2]
  if sub == "" then
    if pane:visible() then pane:hide() else pane:show() end
  elseif sub == "list" then
    list()
  elseif sub == "help" then
    showHelp()
  else
    say("keys, keys list, keys help")
  end
end)

tempAlias("^locatel(?:\\s+(\\S+))?(?:\\s+(\\S+))?\\s*$", function()
  local a, b = matches[2], matches[3]
  if a == "" then
    say("Usage: locatel <name> (your room), or locatel <target> <name>")
  elseif b == "" then
    locate(nil, a)
  else
    locate(a, b)
  end
end)

tempAlias("^kpick(?:\\s+(\\S+))?.*$", function()
  if matches[2] ~= "" then return say("kpick reopens the last pick list.") end
  if not last or #last.hits == 0 then
    fail("No locate to pick from. Cast locate life, or locatel <target> <name>.")
    return
  end
  openPick(last.hits, last.name)
end)

tempAlias("^nkey(?:\\s+(\\S+))?(?:\\s+(\\S+))?\\s*$", function()
  local name, key = matches[2], matches[3]:gsub("^'", ""):gsub("'$", "")
  if name == "" or key == "" then return say("Usage: nkey <name> <key>") end
  if not validName(name) then return fail("A key name is 1 to " .. NAME_MAX .. " letters, digits or _.") end
  if not key:match("^%w+$") then return fail("A key is letters and digits (not " .. key .. ").") end
  if not lib then return notLoggedIn() end
  addKey(name, key, "", "")
end)

tempAlias("^skey(?:\\s+(\\S+))?\\s*$", function()
  if not lib then return notLoggedIn() end
  if matches[2] == "" then
    if prune() then draw() end
    if not lib.safe then return say("No keys, so no safe key.") end
    local k = lib.keys[lib.safe]
    return say("The safe key is " .. nm(k.name) .. " <" .. DIM .. ">(" .. k.key .. ", " .. long(expires(k) - now())
      .. " left)<reset>.")
  end
  local k = find(matches[2])
  if k then setSafe(k.name:lower()) end
end)

for what in pairs(SPELLS) do
  tempAlias("^" .. what .. "\\s+\\$?(\\w+)\\s*$", function()
    local k = find(matches[2])
    if k then cast(what, k) end
  end)
end

tempAlias("^tsafe\\s*$", function() castSafe("teleport") end)
tempAlias("^qtsafe\\s*$", function() castSafe("teleport", true) end)
tempAlias("^psafe\\s*$", function() castSafe("portal") end)

tempKey("Ctrl+S", function() castSafe("teleport") end)
tempKey("Alt+S", function() castSafe("teleport", true) end)

-- $name in any command: the key. Defined last, so the aliases above take
-- their own commands (teleport $home) first.
tempAlias("^.*\\$[A-Za-z0-9_]", function()
  if not lib then return false end
  if prune() then draw() end
  local hit = false
  local out = command:gsub("%$([%w_]+)", function(w)
    local k = lib.keys[w:lower()]
    if k then
      hit = true
      return k.key
    end
    return nil
  end)
  if not hit then return false end
  expandAlias(out)
end)

-- ------------------------------------------------------------ the clock

-- `#script set keymanager hours …` (or the Scripts page): redraw now.
registerAnonymousEventHandler("sysSettingChanged", function()
  prune()
  draw()
end)

-- Once a minute: drop expired keys, redraw the time left.
tempTimer(60, function()
  prune()
  draw()
end, true)

-- ------------------------------------------------------------ start

follow()
draw()
