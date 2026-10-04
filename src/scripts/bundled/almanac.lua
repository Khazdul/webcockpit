-- @name     almanac
-- @summary  MUME's seasons, moon and time-bound events in a pane, with a planner
-- @api      1
-- @alias    almanac  Show or hide the Almanac pane (also: almanac now, plan, lore, list, find, add, remove, remind, export, import)
-- @setting  remind  number  2  "Real minutes before an event that a reminder comes"
-- @help     The Almanac pane follows MUME's clock: the game date and time,
-- @help     the moon, day and night, the seasons, and the things in Arda
-- @help     that only happen at certain times (the Dead Knight's slab at
-- @help     moonrise, the Ingrove wargs at a winter full moon, the Spirit
-- @help     Knight's door after midnight …). Three tabs:
-- @help
-- @help       NOW   the moon, the time, the daylight band, the year band
-- @help             and COMING UP: each event with a countdown, or "now".
-- @help             Click an event to get a reminder (a line in the game
-- @help             window and a UI message) a few minutes before.
-- @help       PLAN  a calendar of real days: each day shows the seasons it
-- @help             passes through. Click a day for its full moons, Dead
-- @help             Knight windows and season start. The wheel or ◂ ▸
-- @help             change the month.
-- @help       LORE  every event with its condition and place; point at a
-- @help             name for the note and the source. [+ add] adds your own.
-- @help
-- @help     The clock must know the hour: type time in the game, or wait
-- @help     for the next sunrise or sunset.
-- @help
-- @help     A condition is a few words, all of which must hold:
-- @help       seasons      winter spring summer autumn, not winter
-- @help       months       Afteryule … Foreyule (or the Sindarin names)
-- @help       day parts    dawn day dusk night, daylight (dawn or day),
-- @help                    dark (dusk or night)
-- @help       hours        hours 0-3 (to 3:00), hours 22-2, hour 5
-- @help       moon         new, waxing crescent, first quarter, waxing
-- @help                    gibbous, full, waning gibbous, third quarter,
-- @help                    waning crescent; waxing, waning, crescent,
-- @help                    gibbous and quarter for both kinds; moon up,
-- @help                    moon down
-- @help       one moment   sunrise, sunset, midnight, moonrise, moonset,
-- @help                    season start
-- @help     Join choices of one kind with | or "or": autumn|winter,
-- @help     moonrise waxing gibbous or full. Words such as in, at, during,
-- @help     and, moon are skipped: "full moon in winter" works.
-- @help
-- @help       almanac             show or hide the pane
-- @help       almanac now|plan|lore   show the pane on that tab
-- @help       almanac list        the events and when they come, as text
-- @help       almanac find <when> test a condition: when it comes next
-- @help       almanac add <name> = <when> [@ <place>] [// <note>]
-- @help                           for example: almanac add Bree market =
-- @help                           day not winter @ Bree // buy rope
-- @help       almanac remove <name>   remove one of your events
-- @help       almanac remind <name>   turn its reminder on or off
-- @help       almanac export      one line with your events, to share
-- @help       almanac import <line>   add the events of such a line
-- @help
-- @help     The bundled list is a first draft. Your own events and
-- @help     reminders are kept over a reload.

--[[
How it works

Every time comes from the game time API: gameTime() for the time now or at
any real time, gameTimeFind(cond) for the next window where a condition
holds, localTime() for real dates, and the event sysGameTimeEvent, which
says when the hour, the moon or the season changes and when the clock was
set from the game.

An event's condition is a gameTimeFind table. The bundled events are the
EVENTS table below; the player's own are kept in the store as text
("winter full", "hours 0-3 not winter") and turned into a table by
parseWhen, which also gives the error messages the LORE form shows.

The pane is a grid of cells, as the mock-up: put() writes text with a
style (colour, background, bold, a click action, a tooltip), flush() turns
each row into a pane line with colour tags and links, and writes only the
rows that changed. The NOW tab ticks once a second while the pane is on;
nothing runs while it is off, except the timer of a reminder you set.
gameTimeFind answers are kept until the next sysGameTimeEvent or until
their window has passed.

The export line is "ALM1:" and the events separated by ~, the fields of one
event (name, when, place, note) by ^. Characters the input line would take
(; $ & { } \ and %), the separators and = are written as =XX (hex).
]]

-- ------------------------------------------------------------ events

-- The bundled events (notes/research/almanac-events.md; a first draft).
-- when: a gameTimeFind condition, or nil for a row that is only lore
-- (about then says what it depends on). color: the event's text colour.
local EVENTS = {
  { name = "Dead Knight slab", icon = "☾", color = "#d8d2ff", where = "Barrow by Nen-i-Sul",
    when = { at = "moonrise", moon = { "waxing gibbous", "full" } },
    note = "The slab opens at moonrise while the moon is 3/4 waxing or full: two moonrises a cycle.",
    source = "Faine, strategy.txt (Dead Knight)" },
  { name = "Ingrove warg pack", icon = "❄", color = "#9cc8ff", where = "Wolf Glade SE of NOC → Beorning village",
    when = { moon = { "full" }, season = { "winter" } },
    note = "Comes at every full moon in Afteryule, Solmath and Rethe (3–4 a year). Ingrove citizenship.",
    source = "Faine, quest.html (Ingrove citizenship)" },
  { name = "Moria West Gate", icon = "⌂", color = "#c0c8d4", where = "West Gate, wait some n",
    when = { period = { "night" }, moonVisible = true },
    note = "At night after moonrise: cast detect magic and exa inscription. If the month is wrong the moon can rise after the sun.",
    source = "Faine, strategy.txt (Moria)" },
  { name = "Hrivesur's tomb", icon = "⚱", color = "#e8e2c8", where = "sw of Hrivesur, near Grey Havens",
    when = { period = { "night" }, moonVisible = true },
    note = "Ancient Dwarven Home: needs a cloudless night and moonlight.",
    source = "Faine, strategy.txt" },
  { name = "Sundeath", icon = "☼", color = "#ffb000", where = "Anywhere outdoors",
    when = { period = { "dawn", "day" } },
    note = "Trolls in a sunlit room die. Get indoors before dawn.",
    source = "mume.org wiki" },
  { name = "Spirit Knight door", icon = "⚔", color = "#c0c8d4", where = "Morthan s 2w 4s e 2s w",
    when = { hours = { from = 0, to = 3 }, notSeason = { "winter" } },
    note = "Say 'open durin' after midnight (dwarves any time). Impossible in winter: the water is frozen.",
    source = "Faine, strategy.txt" },
  { name = "Overseer slab", icon = "⚒", color = "#e0b070", where = "Wyrdda ford 4n 4e 4n 5w n, turf",
    when = { at = "dawn" },
    note = "At sunrise say 'By the might of Aule I command thee to open' in Khuzdul.",
    source = "Faine, strategy.txt (Overseer)" },
  { name = "White Ship", icon = "⚓", color = "#e0e8f0", where = "Harlond, after 'sail west' to Cirdan",
    when = { at = "midnight" },
    note = "The White Ship arrives at midnight.",
    source = "Faine, miscinfo.txt" },
  { name = "Sun pool", icon = "☉", color = "#ffd060", where = "Valinor",
    when = { period = { "dawn" } },
    note = "Ring focus: dip the ring during sunrise.",
    source = "Faine, miscinfo.txt" },
  { name = "Galadriel's mirror", icon = "◈", color = "#a8d8ff", where = "Lorien",
    when = { period = { "night" } },
    note = "Witch-King quest: the mirror at night.",
    source = "Faine, strategy.txt" },
  { name = "Enidale's ghost", icon = "✝", color = "#b8c0d0", where = "Ruined barn e/n of the orc rider camp across Anduin",
    when = { at = "dusk" },
    note = "Appears at nightfall.",
    source = "Faine, quest.html" },
  { name = "Dagnir's ghost", icon = "✝", color = "#9aa7b8", where = "South of Lorien, the marshes",
    when = { period = { "night" } },
    note = "Visible at night only.",
    source = "Faine, quest.html" },
  { name = "Shire wolfpack", icon = "⚑", color = "#9fd18a", where = "Dwaling",
    when = { season = { "winter" } },
    note = "Repops once each winter. Shire citizenship.",
    source = "Faine, quest.html (Shire citizenship)" },
  { name = "Baneberries", icon = "✿", color = "#d58bd8", where = "6e from Amanrandil, vines n of Tharbad, …",
    when = { season = { "autumn", "winter" } },
    note = "Autumn and winter only.",
    source = "Faine, Herbs.txt" },
  { name = "Burnished hewing-spear", icon = "♠", color = "#e88a42", where = "Rushak, Dunland",
    when = { season = { "spring", "summer" } },
    note = "Once a year, in spring or summer.",
    source = "yllemo wiki (not in Faine)" },
  { name = "Black Ice open", icon = "≈", color = "#9cc8ff", where = "Reached by swimming underwater",
    when = { notSeason = { "winter" } },
    note = "The zone is closed in winter: the water is frozen.",
    source = "Mumepedia (not in Faine)" },
  { name = "Juniper", icon = "☘", color = "#9fd18a", where = "Hills of Scary, 3e from 'A Spring'",
    about = "season unknown",
    note = "Grows only at a certain time of the year; which is not known.",
    source = "Faine, Herbs.txt" },
  { name = "Moon pool", icon = "☽", color = "#e8e2c8", where = "Eressea tower",
    about = "the moon",
    note = "Ring focus: dip the ring at the proper time of the moon.",
    source = "Faine, miscinfo.txt" },
  { name = "Faintly glowing stone", icon = "◊", color = "#c0c8d4", where = "Item",
    about = "item, moon down",
    note = "Turns to a dark stone when the moon is set.",
    source = "Faine, misc.txt" },
  { name = "Cold-proof shoes", icon = "▪", color = "#9cc8ff", where = "Item",
    about = "item, winter",
    note = "Fewer moves in winter.",
    source = "Faine, misc.txt" },
}

-- ------------------------------------------------------------ constants

local MONTHS = {
  { "Afteryule", "Narwain" }, { "Solmath", "Ninui" }, { "Rethe", "Gwaeron" },
  { "Astron", "Gwirith" }, { "Thrimidge", "Lothron" }, { "Forelithe", "Norui" },
  { "Afterlithe", "Cerveth" }, { "Wedmath", "Urui" }, { "Halimath", "Ivanneth" },
  { "Winterfilth", "Narbeleth" }, { "Blotmath", "Hithui" }, { "Foreyule", "Girithron" },
}
local SEASONS = { "winter", "spring", "summer", "autumn" }
local SEASON_RGB = {
  winter = { 106, 165, 232 }, spring = { 89, 191, 132 }, summer = { 246, 207, 76 }, autumn = { 232, 138, 66 },
}
local PHASES = {
  "new", "waxing crescent", "first quarter", "waxing gibbous", "full", "waning gibbous", "third quarter", "waning crescent",
}
local PHASE_ICON = {
  ["new"] = "○", ["waxing crescent"] = "☽", ["first quarter"] = "◐", ["waxing gibbous"] = "◕",
  ["full"] = "●", ["waning gibbous"] = "◕", ["third quarter"] = "◑", ["waning crescent"] = "☾",
}
local AT_TEXT = {
  dawn = "sunrise", dusk = "sunset", midnight = "midnight", moonrise = "moonrise", moonset = "moonset",
  seasonStart = "season start",
}
local REAL_MONTHS = {
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
}
-- Monday first; localTime's wday is 1 for Sunday.
local WEEKDAYS = { "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday" }

-- Text colours: the pane's shades, and adaptive colours that read on dark
-- and on paper. Backgrounds (bands, the moon, the calendar) are literal.
local C = {
  text = "@text", label = "@label", dim = "@mid", rule = "@dim",
  glow = "~#ffe9a8", gold = "~#ffb000", night = "~#4a90e2", red = "~#ff6b6b", green = "~#7ee0a1",
  moon = "~#e8e2c8", own = "#c0c8d4", ink = "#11161f", bg = "#0e131c",
}
local TAG = "<ansi_light_yellow>ALMANAC<reset> "
local SEP = "~"   -- between events in an export line
local FSEP = "^"  -- between the fields of one event

-- ------------------------------------------------------------ small helpers

local function trim(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end
local function cap(s) return (s:gsub("^%l", string.upper)) end
local function pad2(n) return string.format("%02d", n) end

local function cut(s, n)
  if n <= 0 then return "" end
  if utf8.len(s) <= n then return s end
  if n == 1 then return "…" end
  return s:sub(1, utf8.offset(s, n) - 1) .. "…"
end

local function clamp(v, lo, hi) return math.max(lo, math.min(hi, v)) end
local function hex(rgb)
  return string.format("#%02x%02x%02x", clamp(math.floor(rgb[1] + 0.5), 0, 255),
    clamp(math.floor(rgb[2] + 0.5), 0, 255), clamp(math.floor(rgb[3] + 0.5), 0, 255))
end
local function shade(rgb, f) return { rgb[1] * f, rgb[2] * f, rgb[3] * f } end
local function mix(a, b, f) return { a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f } end

-- A countdown: "2d 05h", "3h 07m", "4m 09s", "12s".
local function dur(secs)
  local s = math.max(0, math.floor(secs))
  local d, h, m = s // 86400, s % 86400 // 3600, s % 3600 // 60
  if d > 0 then return d .. "d " .. pad2(h) .. "h" end
  if h > 0 then return h .. "h " .. pad2(m) .. "m" end
  if m > 0 then return m .. "m " .. pad2(s % 60) .. "s" end
  return (s % 60) .. "s"
end

-- Real local time "14:05", with the weekday when it is more than 20 hours away.
-- Kept per real minute: the pane asks for the same times every second.
local SHORT_DAYS = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" }
local hmCache, hmCount = {}, 0
local function localMinute(epoch)
  local k = math.floor(epoch / 60)
  local v = hmCache[k]
  if not v then
    if hmCount > 400 then hmCache, hmCount = {}, 0 end
    local l = localTime(k * 60)
    v = { pad2(l.hour) .. ":" .. pad2(l.min), SHORT_DAYS[l.wday] }
    hmCache[k] = v
    hmCount = hmCount + 1
  end
  return v
end
local function hm(epoch) return localMinute(epoch)[1] end
local function whenText(epoch, now)
  local v = localMinute(epoch)
  if epoch - now > 20 * 3600 then return v[2] .. " " .. v[1] end
  return v[1]
end

-- Text a player typed, made safe for colour tags.
local function clean(s)
  return trim((s or ""):gsub("%c", " "):gsub("<", "‹"):gsub(">", "›"))
end

local function say(text) cecho(TAG .. text) end

-- ------------------------------------------------------------ conditions as text

-- Words of the condition syntax: phrase -> { kind, value }. Two-word
-- phrases are tried before one word.
local WORDS = {}
for _, s in ipairs(SEASONS) do WORDS[s] = { "season", { s } } end
WORDS.fall = { "season", { "autumn" } }
for _, m in ipairs(MONTHS) do
  WORDS[m[1]:lower()] = { "month", { m[1] } }
  WORDS[m[2]:lower()] = { "month", { m[1] } }
end
for _, p in ipairs({ "dawn", "day", "dusk", "night" }) do WORDS[p] = { "period", { p } } end
WORDS.daylight = { "period", { "dawn", "day" } }
WORDS.dark = { "period", { "dusk", "night" } }
WORDS.sunrise = { "at", "dawn" }
WORDS.sunset = { "at", "dusk" }
WORDS["at dawn"] = { "at", "dawn" }
WORDS["at dusk"] = { "at", "dusk" }
WORDS.midnight = { "at", "midnight" }
WORDS.moonrise = { "at", "moonrise" }
WORDS.moonset = { "at", "moonset" }
WORDS["season start"] = { "at", "seasonStart" }
WORDS.seasonstart = { "at", "seasonStart" }
for _, p in ipairs(PHASES) do WORDS[p] = { "moon", { p } } end
WORDS["last quarter"] = { "moon", { "third quarter" } }
WORDS.waxing = { "moon", { "waxing crescent", "first quarter", "waxing gibbous" } }
WORDS.waning = { "moon", { "waning gibbous", "third quarter", "waning crescent" } }
WORDS.crescent = { "moon", { "waxing crescent", "waning crescent" } }
WORDS.gibbous = { "moon", { "waxing gibbous", "waning gibbous" } }
WORDS.quarter = { "moon", { "first quarter", "third quarter" } }
WORDS.half = WORDS.quarter
WORDS["moon up"] = { "moonVisible", true }
WORDS["moon visible"] = { "moonVisible", true }
WORDS.moonlight = { "moonVisible", true }
WORDS.moonlit = { "moonVisible", true }
WORDS["moon down"] = { "moonVisible", false }
WORDS["no moon"] = { "moonVisible", false }
WORDS.moonless = { "moonVisible", false }
for _, w in ipairs({ "not", "no", "except", "outside", "without" }) do WORDS[w] = { "not" } end
WORDS["or"] = { "or" }
for w in ("and in at on during while when the of is a an with moon hours hour time phase"):gmatch("%S+") do
  WORDS[w] = { "skip" }
end

local KIND_TEXT = {
  season = "seasons", notSeason = "seasons", month = "months", period = "day parts", moon = "moon phases",
  moonVisible = "moon up or down", at = "moments", hours = "hours",
}
local HINT = "seasons (winter …), months, dawn, day, dusk, night, hours 0-3, moon phases (new … full), "
  .. "moon up, moon down, or one moment: sunrise, sunset, midnight, moonrise, moonset, season start"

local function addAll(list, vals)
  for _, v in ipairs(vals) do
    local seen = false
    for _, x in ipairs(list) do if x == v then seen = true end end
    if not seen then list[#list + 1] = v end
  end
end

-- An hour range token: "0-3", "22-2", "00:00-03:00", "5" (one hour).
local function hoursOf(tok)
  if not tok:match("^[%d:h%-]+$") or not tok:match("%d") then return nil end
  local t = tok:gsub(":00", ""):gsub("h", "")
  local a, b = t:match("^(%d+)%-(%d+)$")
  if not a then
    a = t:match("^(%d+)$")
    if not a then return nil, "hours: write a range such as 0-3 or 22-2" end
    a = tonumber(a)
    if a > 23 then return nil, "hours: an hour is 0 to 23" end
    return { from = a, to = (a + 1) % 24 }
  end
  a, b = tonumber(a), tonumber(b)
  if a > 23 or b > 24 then return nil, "hours: 0 to 24, such as 0-3 or 22-2" end
  b = b % 24
  if a == b then return nil, "hours: from and to must differ (to is not included: 0-3 ends at 3:00)" end
  return { from = a, to = b }
end

-- "winter full", "moonrise waxing gibbous|full", "hours 0-3 not winter" ->
-- a gameTimeFind table, or nil and a message.
local function parseWhen(text)
  local s = " " .. (text or ""):lower() .. " "
  s = s:gsub("–", "-"):gsub("—", "-"):gsub("(%d)%s*%-%s*(%d)", "%1-%2")
  s = s:gsub("[|/]", " or "):gsub("[,+&]", " ")
  local toks = {}
  for w in s:gmatch("%S+") do toks[#toks + 1] = w end
  local cond = {}
  local lastKind, orKind, negate = nil, nil, false
  local i = 1
  while i <= #toks do
    local w, word = toks[i], nil
    local two = toks[i + 1] and (w .. " " .. toks[i + 1])
    if two and WORDS[two] then
      word, w = WORDS[two], two
      i = i + 2
    else
      word = WORDS[w]
      i = i + 1
    end
    local kind, value
    if word then
      kind, value = word[1], word[2]
    else
      local h, err = hoursOf(w)
      if err then return nil, err end
      if not h then return nil, 'unknown word "' .. w .. '": use ' .. HINT end
      kind, value = "hours", h
    end
    if kind == "skip" then
      -- nothing
    elseif kind == "or" then
      if not lastKind then return nil, '"or" needs a choice before it' end
      if orKind then return nil, '"or or": one choice is missing' end
      orKind = lastKind
      negate = lastKind == "notSeason"
    elseif kind == "not" then
      negate = true
    else
      if negate then
        if kind ~= "season" then return nil, '"not" works with seasons: not winter' end
        kind = "notSeason"
        negate = false
      end
      if orKind and orKind ~= kind then
        return nil, '"or" joins choices of one kind (' .. KIND_TEXT[orKind] .. "), not " .. KIND_TEXT[orKind]
          .. " and " .. KIND_TEXT[kind]
      end
      if orKind and (kind == "at" or kind == "hours" or kind == "moonVisible") then
        return nil, '"or" does not work with ' .. KIND_TEXT[kind] .. ": give one"
      end
      orKind = nil
      if kind == "at" then
        if cond.at and cond.at ~= value then
          return nil, "one moment per event: " .. AT_TEXT[cond.at] .. " and " .. AT_TEXT[value] .. " both given"
        end
        cond.at = value
      elseif kind == "moonVisible" then
        if cond.moonVisible ~= nil and cond.moonVisible ~= value then return nil, "moon up and moon down both given" end
        cond.moonVisible = value
      elseif kind == "hours" then
        if cond.hours then return nil, "one hour range per event" end
        cond.hours = value
      else
        cond[kind] = cond[kind] or {}
        addAll(cond[kind], value)
      end
      lastKind = kind
    end
  end
  if orKind then return nil, '"or" needs a choice after it' end
  if negate then return nil, '"not" needs a season after it: not winter' end
  if next(cond) == nil then return nil, "say when: " .. HINT end
  if cond.season and cond.notSeason then
    for _, a in ipairs(cond.season) do
      for _, b in ipairs(cond.notSeason) do
        if a == b then return nil, a .. " and not " .. a .. " both given" end
      end
    end
  end
  return cond
end

-- A condition as text that parseWhen reads back to the same table.
local function condText(c)
  local out = {}
  if c.at then out[#out + 1] = AT_TEXT[c.at] end
  if c.moon then out[#out + 1] = table.concat(c.moon, "|") end
  if c.moonVisible ~= nil then out[#out + 1] = c.moonVisible and "moon up" or "moon down" end
  if c.season then out[#out + 1] = table.concat(c.season, "|") end
  if c.notSeason then out[#out + 1] = "not " .. table.concat(c.notSeason, "|") end
  if c.month then out[#out + 1] = table.concat(c.month, "|") end
  if c.hours then out[#out + 1] = "hours " .. c.hours.from .. "-" .. c.hours.to end
  if c.period then out[#out + 1] = table.concat(c.period, "|") end
  return table.concat(out, " ")
end

-- A short form for COMING UP: moon phases as their signs.
local function shortText(c)
  local out = {}
  if c.at then out[#out + 1] = AT_TEXT[c.at] end
  if c.moon then
    local signs = {}
    for _, p in ipairs(c.moon) do signs[#signs + 1] = PHASE_ICON[p] end
    out[#out + 1] = table.concat(signs, "|")
  end
  if c.moonVisible ~= nil then out[#out + 1] = c.moonVisible and "moon up" or "moon down" end
  if c.season then out[#out + 1] = table.concat(c.season, "|") end
  if c.notSeason then out[#out + 1] = "no " .. table.concat(c.notSeason, "|") end
  if c.month then out[#out + 1] = table.concat(c.month, "|") end
  if c.hours then out[#out + 1] = pad2(c.hours.from) .. "–" .. pad2(c.hours.to) end
  if c.period then out[#out + 1] = table.concat(c.period, "|") end
  return table.concat(out, " ")
end

-- ------------------------------------------------------------ the event list

-- The player's own events: { name, when (text), where, note } in the store.
local own = {}
local reminders = {}   -- event name -> true
local fired = {}       -- event name -> start of the window already reminded

local function allEvents()
  local list = {}
  for _, e in ipairs(EVENTS) do list[#list + 1] = e end
  for _, e in ipairs(own) do list[#list + 1] = e end
  return list
end

local function findEvent(name)
  local key = trim(name or ""):lower()
  for _, e in ipairs(allEvents()) do
    if e.name:lower() == key then return e end
  end
  return nil
end

-- An own event from its stored record (its condition parsed).
local function ownEvent(r)
  local cond, err = parseWhen(r.when)
  return { name = r.name, when = cond, whenText = r.when, bad = err, where = r.where or "", note = r.note or "",
    icon = "✧", color = C.own, own = true, source = "Your own event" }
end

local function saveOwn()
  local list = {}
  for _, e in ipairs(own) do list[#list + 1] = { name = e.name, when = e.whenText, where = e.where, note = e.note } end
  store.set("events", list)
end

local function saveReminders()
  local list = {}
  for n in pairs(reminders) do list[#list + 1] = n end
  table.sort(list)
  store.set("remind", list)
end

-- Adds an own event; returns it, or nil and a message.
local function addEvent(name, when, where, note)
  name, when, where, note = clean(name), trim(when or ""), clean(where), clean(note)
  if name == "" then return nil, "give the event a name" end
  if utf8.len(name) > 40 then return nil, "the name is longer than 40 characters" end
  if findEvent(name) then return nil, '"' .. name .. '" is already in the list' end
  local cond, err = parseWhen(when)
  if not cond then return nil, err end
  local e = ownEvent({ name = name, when = condText(cond), where = where, note = note })
  own[#own + 1] = e
  saveOwn()
  return e
end

local function removeEvent(name)
  local key = trim(name or ""):lower()
  for i, e in ipairs(own) do
    if e.name:lower() == key then
      table.remove(own, i)
      reminders[e.name] = nil
      saveOwn()
      saveReminders()
      return e
    end
  end
  return nil
end

-- ------------------------------------------------------------ export and import

local function esc(s)
  return (s:gsub("[=%^~;\\{}%$&%%#%c]", function(ch) return string.format("=%02X", ch:byte()) end))
end
local function unesc(s)
  return (s:gsub("=(%x%x)", function(h) return string.char(tonumber(h, 16)) end))
end

-- Splits on a plain separator, keeping empty parts.
local function split(s, sep)
  local out, from = {}, 1
  while true do
    local i = s:find(sep, from, true)
    if not i then
      out[#out + 1] = s:sub(from)
      return out
    end
    out[#out + 1] = s:sub(from, i - 1)
    from = i + #sep
  end
end

local function exportLine()
  local parts = {}
  for _, e in ipairs(own) do
    local f = { esc(e.name), esc(e.whenText), esc(e.where or ""), esc(e.note or "") }
    while #f > 2 and f[#f] == "" do f[#f] = nil end
    parts[#parts + 1] = table.concat(f, FSEP)
  end
  return "ALM1:" .. table.concat(parts, SEP)
end

-- Adds the events of an export line that are not in the list yet.
-- Returns added, already there, bad (a list of messages); or nil and a message.
local function importLine(line)
  local version, body = (line or ""):match("ALM(%d+):(%S.*)$")
  if not version then return nil, "no ALM1: line found" end
  if tonumber(version) > 1 then return nil, "this line is from a newer almanac (ALM" .. version .. ")" end
  body = trim(body)
  local added, there, bad = 0, 0, {}
  for _, part in ipairs(split(body, SEP)) do
    if part ~= "" then
      local f = split(part, FSEP)
      local name, when = clean(unesc(f[1] or "")), unesc(f[2] or "")
      if findEvent(name) then
        there = there + 1
      else
        local e, err = addEvent(name, when, unesc(f[3] or ""), unesc(f[4] or ""))
        if e then added = added + 1 else bad[#bad + 1] = (name ~= "" and name or "?") .. ": " .. err end
      end
    end
  end
  return added, there, bad
end

-- ------------------------------------------------------------ game time, cached

local cache = {}   -- key -> { s, e } or { false }

local function ready()
  local g = gameTime()
  return g ~= nil and (g.precision == "hour" or g.precision == "minute"), g
end

-- The next window of `cond` from now, kept until the next sysGameTimeEvent
-- or until the window has passed.
local function findNow(key, cond, t)
  local c = cache[key]
  if c then
    if c[1] == false then return nil end
    if t < c[2] or (c[1] == c[2] and t < c[1]) then return c[1], c[2] end
  end
  local s, e = gameTimeFind(cond)
  cache[key] = s and { s, e } or { false }
  return s, e
end

-- The start of the next window of `cond` that starts after `t` (not one
-- that is open now).
local function nextStart(cond, t)
  local s, e = gameTimeFind(cond, t)
  if s and s <= t then s, e = gameTimeFind(cond, s == e and s + 1 or e) end
  return s, e
end

-- ------------------------------------------------------------ the pane

local pane = createPane{ id = "main", title = "Almanac", short = "ALMA", dock = "right", lane = "own", rows = 27, cols = 50, anchor = "top" }
local W, H = 50, 27
local tab = "now"
local loreForm = false
local status = { text = "", err = false }
local form = { name = "", when = "", place = "", note = "" }
local plan = nil   -- { y, m, sel }

-- The grid: rows of cells, each a character and a style table
-- { fg, bg, b, act, tip }. Cells of one put() share a style.
local NONE = {}
local grid = { n = 0 }

local function newGrid() grid = { n = 0 } end

-- Writes text from column x of row y; returns the column after it. A row
-- keeps the list of its writes; flush() lays them into cells only when
-- the list differs from the last one.
local function put(x, y, text, st)
  local r = grid[y]
  if not r then
    r = {}
    grid[y] = r
    if y > grid.n then grid.n = y end
  end
  r[#r + 1] = { x, text, st or NONE }
  return x + utf8.len(text)
end

-- A style as text, for comparing rows.
local function styleKey(st)
  local k = st.k
  if not k then
    k = (st.fg or "") .. "\2" .. (st.bg or "") .. "\2" .. (st.b and "b" or "") .. "\2" .. (st.act or "") .. "\2" .. (st.tip or "")
    st.k = k
  end
  return k
end

local function rowKey(r)
  local parts = {}
  for i, p in ipairs(r) do parts[i] = p[1] .. "\3" .. p[2] .. "\3" .. styleKey(p[3]) end
  return table.concat(parts, "\1")
end

-- The cells of a row from its writes (later writes win).
local function rowCells(r)
  local ch, st = {}, {}
  for x = 1, W do
    ch[x] = " "
    st[x] = NONE
  end
  for _, p in ipairs(r) do
    local x, s = p[1], p[3]
    for _, cp in utf8.codes(p[2]) do
      if x >= 1 and x <= W then
        ch[x] = utf8.char(cp)
        st[x] = s
      elseif x == W + 1 and ch[W] ~= " " and st[W] == s then
        ch[W] = "…"
      end
      x = x + 1
    end
  end
  return { ch = ch, st = st }
end

-- Writes text ending one cell before the right edge.
local function right(y, text, st, margin)
  return put(W - (margin or 1) - utf8.len(text) + 1, y, text, st)
end

-- As right(), but only when it leaves a cell free after column `after`
-- (the end of the row's left part); false when it does not fit.
local function rightAfter(y, after, text, st)
  local x = W - utf8.len(text)
  if x <= after then return false end
  put(x, y, text, st)
  return true
end

-- Text word-wrapped to `width` cells, as a list of lines.
local function wrapLines(text, width)
  local out, line = {}, ""
  for word in text:gmatch("%S+") do
    if line ~= "" and utf8.len(line) + 1 + utf8.len(word) > width then
      out[#out + 1] = line
      line = word
    else
      line = line == "" and word or (line .. " " .. word)
    end
  end
  if line ~= "" then out[#out + 1] = line end
  return out
end

-- Writes text word-wrapped to `width` cells from row y; returns the row after it.
local function wrapPut(x, y, text, st, width)
  for _, line in ipairs(wrapLines(text, width)) do
    put(x, y, line, st)
    y = y + 1
  end
  return y
end

local doAction -- defined below
local actFns = {}
local function actFn(act)
  local f = actFns[act]
  if not f then
    f = function() doAction(act) end
    actFns[act] = f
  end
  return f
end

local shown = {}      -- row -> what it holds now (text and links)
local shownN = 0
local fields = {}     -- form key -> { field, row }
local wantFields = {} -- this draw's fields: { key, row, col, len, placeholder }
local touched = {}    -- rows written by the last flush

local function dropFields()
  for _, f in pairs(fields) do pcall(function() f.field:remove() end) end
  fields = {}
end

local function renderRow(r)
  local out, links = {}, {}
  local x = 1
  while x <= W do
    local st = r.st[x]
    local x2 = x
    local text = {}
    while x2 <= W and r.st[x2] == st do
      text[#text + 1] = r.ch[x2]
      x2 = x2 + 1
    end
    local open = ""
    if st.b then open = "<b>" end
    if st.fg or st.bg then open = open .. "<" .. (st.fg or "") .. (st.bg and (":" .. st.bg) or "") .. ">" end
    out[#out + 1] = open .. table.concat(text) .. (open ~= "" and "<reset>" or "")
    if st.act or st.tip then
      local last = links[#links]
      if last and last[1] + last[2] == x and last[3] == st.act and last[4] == st.tip then
        last[2] = last[2] + (x2 - x)
      else
        links[#links + 1] = { x, x2 - x, st.act, st.tip }
      end
    end
    x = x2
  end
  local line = table.concat(out):gsub("%s+$", "")
  return line, links
end

-- A row from its writes; when they overlap, cell by cell.
local function renderPuts(r)
  local list = {}
  for i, p in ipairs(r) do list[i] = p end
  table.sort(list, function(a, b) return a[1] < b[1] end)
  local x = 1
  for _, p in ipairs(list) do
    if p[1] < x or p[1] < 1 then return renderRow(rowCells(r)) end
    x = p[1] + utf8.len(p[2])
  end
  local out, links = {}, {}
  x = 1
  for _, p in ipairs(list) do
    if p[1] > W then break end
    local text, st = p[2], p[3]
    local n = utf8.len(text)
    if p[1] + n - 1 > W then
      -- Cut at the edge, with … when text is cut (not a band of spaces).
      n = W - p[1] + 1
      text = text:sub(1, utf8.offset(text, n + 1) - 1)
      if n > 0 and text:find("%S") then text = text:sub(1, utf8.offset(text, n) - 1) .. "…" end
    end
    if p[1] > x then out[#out + 1] = string.rep(" ", p[1] - x) end
    local open = ""
    if st.b then open = "<b>" end
    if st.fg or st.bg then open = open .. "<" .. (st.fg or "") .. (st.bg and (":" .. st.bg) or "") .. ">" end
    out[#out + 1] = open .. text .. (open ~= "" and "<reset>" or "")
    if (st.act or st.tip) and n > 0 then
      local last = links[#links]
      if last and last[1] + last[2] == p[1] and last[3] == st.act and last[4] == st.tip then
        last[2] = last[2] + n
      else
        links[#links + 1] = { p[1], n, st.act, st.tip }
      end
    end
    x = p[1] + n
  end
  return (table.concat(out):gsub("%s+$", "")), links
end

-- Writes the grid to the pane: only the rows that changed.
local function flush()
  touched = {}
  if grid.n < shownN then
    pane:clear()
    shown = {}
    fields = {}
  end
  for y = 1, grid.n do
    local sig = grid[y] and rowKey(grid[y]) or ""
    if shown[y] ~= sig then
      local line, links = "", {}
      if grid[y] then line, links = renderPuts(grid[y]) end
      pane:setLine(y, line)
      for _, l in ipairs(links) do
        pane:setLink(y, l[1], l[2], l[3] and actFn(l[3]) or nil, l[4])
      end
      shown[y] = sig
      touched[y] = true
    end
  end
  shownN = grid.n
  -- The form's fields: kept while their row stays, else made again.
  local want = {}
  for _, w in ipairs(wantFields) do want[w.key] = w end
  for key, f in pairs(fields) do
    local w = want[key]
    if not w or w.row ~= f.row or touched[f.row] then
      if not touched[f.row] then pcall(function() f.field:remove() end) end
      fields[key] = nil
    end
  end
  for _, w in ipairs(wantFields) do
    if not fields[w.key] then
      local key = w.key
      local f = pane:setInput(w.row, w.col, w.len, {
        value = form[key], placeholder = w.placeholder, maxLength = w.max,
        onChange = function(text) form[key] = text; if key == "when" then doAction("check") end end,
        onSubmit = function(text) form[key] = text; doAction("submit") end,
        onCancel = function() doAction("form") end,
        onKey = function(k) doAction((k == "Shift+Tab" or k == "ArrowUp") and "prev:" .. key or "next:" .. key) end,
      })
      fields[key] = { field = f, row = w.row }
    end
  end
end

local function resetShown()
  pane:clear()
  shown, shownN, fields = {}, 0, {}
end

-- ------------------------------------------------------------ drawing: shared

local TABS = {
  { "now", "NOW", "Now: the clock, the moon, daylight and what is coming" },
  { "plan", "PLAN", "Planner: pick a real day" },
  { "lore", "LORE", "What in Arda depends on the time; add your own" },
}

local function seasonHex(season) return hex(SEASON_RGB[season] or { 160, 160, 160 }) end

local TABS_END = 21 -- the column after the tabs
local function drawTabs(sc)
  local x = 2
  for _, t in ipairs(TABS) do
    if tab == t[1] then
      x = put(x, 1, " " .. t[2] .. " ", { fg = C.bg, bg = sc, b = true }) + 1
    else
      x = put(x, 1, " " .. t[2] .. " ", { fg = C.label, act = "tab:" .. t[1], tip = t[3] }) + 1
    end
  end
end

local function drawUnset(g)
  drawTabs("#9aa7b8")
  local width = W - 3
  local y = wrapPut(2, 3, "The game clock does not know the hour yet.", { fg = C.text, b = true }, width) + 1
  if g then
    y = wrapPut(2, y, "It is " .. g.day .. " " .. g.monthName .. " " .. g.year .. ", hour unknown.", { fg = C.label }, width) + 1
  end
  wrapPut(2, y, "Type time in the game, or wait for the next sunrise or sunset: the almanac fills in by itself. "
    .. "LORE works without the clock.", { fg = C.label }, width)
end

-- ------------------------------------------------------------ drawing: NOW

-- The moon in half blocks: 14 × 14 pixels on 14 cells × 7 rows. Kept per
-- level and waxing.
local MOON_LIT, MOON_DARK = { 239, 233, 210 }, { 36, 44, 62 }
local CRATERS = { { -0.35, -0.3, 0.22 }, { 0.2, 0.25, 0.18 }, { 0.38, -0.35, 0.12 }, { -0.1, 0.5, 0.14 }, { -0.55, 0.2, 0.1 } }
local moonCells = {}

local function moonPicture(level, waxing, N)
  local key = level .. (waxing and "+" or "-") .. N
  if moonCells[key] then return moonCells[key] end
  local age = waxing and level / 24 or 1 - level / 24
  local theta = age * 2 * math.pi
  local function px(i, j)
    local x, y = (i + 0.5 - N / 2) / (N / 2), (j + 0.5 - N / 2) / (N / 2)
    local r2 = x * x + y * y
    if r2 > 1.02 then return nil end
    local w = math.sqrt(math.max(0, 1 - y * y))
    local xt = w * math.cos(theta)
    local lit
    if theta < math.pi then lit = x > xt else lit = x < -xt end
    local col = lit and shade(MOON_LIT, 0.72 + 0.28 * math.sqrt(math.max(0, 1 - r2))) or MOON_DARK
    for _, c in ipairs(CRATERS) do
      if (x - c[1]) ^ 2 + (y - c[2]) ^ 2 < c[3] * c[3] then col = shade(col, lit and 0.82 or 0.9) end
    end
    return hex(col)
  end
  local rows = {}
  for r = 0, N / 2 - 1 do
    local cells = {}
    for i = 0, N - 1 do
      local top, bot = px(i, r * 2), px(i, r * 2 + 1)
      if top and bot then cells[#cells + 1] = { "▀", { fg = top, bg = bot } }
      elseif top then cells[#cells + 1] = { "▀", { fg = top } }
      elseif bot then cells[#cells + 1] = { "▄", { fg = bot } }
      else cells[#cells + 1] = { " ", NONE } end
    end
    rows[#rows + 1] = cells
  end
  moonCells[key] = rows
  return rows
end

local function drawMoon(x0, y0, moon, N)
  for r, cells in ipairs(moonPicture(moon.level, moon.waxing, N)) do
    for i, c in ipairs(cells) do put(x0 + i - 1, y0 + r - 1, c[1], c[2]) end
  end
end

-- Parts of the NOW tab that change rarely (bands, an event's name and
-- condition), kept so that the once-a-second redraw builds little.
local memo, memoCount = {}, 0
local function memoized(key, make)
  local v = memo[key]
  if v == nil then
    if memoCount > 300 then memo, memoCount = {}, 0 end
    v = make()
    memo[key] = v
    memoCount = memoCount + 1
  end
  return v
end

local NIGHT, NIGHT_DEEP, DAY_LO, DAY_HI = { 22, 33, 62 }, { 12, 18, 40 }, { 214, 170, 70 }, { 255, 228, 130 }
local function hourColour(h, dawn, dusk)
  if h == dawn then return { 227, 146, 74 } end
  if h == dusk - 1 then return { 196, 96, 104 } end
  if h > dawn and h < dusk - 1 then
    local mid = (dawn + dusk) / 2
    return mix(DAY_LO, DAY_HI, 1 - math.abs(h + 0.5 - mid) / ((dusk - dawn) / 2))
  end
  return mix(NIGHT_DEEP, NIGHT, math.abs(((h + 12) % 24) - 12) / 12)
end

-- The events with a condition, with their next window, "now" first.
local function comingUp(t)
  local list = {}
  for _, e in ipairs(allEvents()) do
    if e.when then
      local s, en = findNow("ev:" .. e.name, e.when, t)
      if s then list[#list + 1] = { ev = e, s = s, e = en, now = s <= t and t < en } end
    end
  end
  table.sort(list, function(a, b)
    if a.now ~= b.now then return a.now end
    if a.now then return a.e < b.e end
    if a.s ~= b.s then return a.s < b.s end
    return a.ev.name < b.ev.name
  end)
  return list
end

local function drawNow(g, t)
  local sc = seasonHex(g.season)
  drawTabs(sc)
  rightAfter(1, TABS_END, hm(t) .. " local", { fg = C.dim })

  -- The moon (14 cells, 10 in a narrow pane) and the date.
  local N = W >= 46 and 14 or 10
  drawMoon(3, 3, g.moon, N)
  local X = 3 + N + 3
  put(X, 3, g.day .. " " .. g.monthName .. " " .. g.year, { fg = "~" .. sc, b = true,
    tip = g.weekday .. ", " .. g.day .. " " .. g.monthName .. " (" .. g.sindarin .. " in Sindarin), year " .. g.year .. " of the Third Age" })
  local sub = g.sindarin .. " · " .. cap(g.season) .. " · " .. g.weekday
  if X + utf8.len(sub) > W then sub = g.sindarin .. " · " .. cap(g.season) end
  put(X, 4, sub, { fg = C.dim })
  local x2 = put(X, 6, pad2(g.hour) .. ":" .. pad2(g.minute), { fg = C.glow, b = true })
  if g.precision == "hour" then
    x2 = put(x2, 6, "≈", { fg = C.dim, tip = "The minute is not synced yet: it comes with the next sunrise or sunset" })
  end
  local sun = g.period == "dawn" or g.period == "day"
  put(x2 + 1, 6, (sun and "☼ " or "☾ ") .. g.period, { fg = sun and C.gold or C.night })

  local m = g.moon
  local px = put(X, 8, PHASE_ICON[m.phase] .. " " .. cap(m.phase), { fg = C.moon,
    tip = "Moon level " .. m.level .. " of 12, " .. (m.waxing and "waxing" or "waning")
      .. (m.position == "below" and ", below the horizon" or (", in the " .. m.position))
      .. (m.visible and (m.bright and ", bright" or ", dim") or ", not visible") })
  local age = m.waxing and m.level / 24 or 1 - m.level / 24
  rightAfter(8, px, math.floor((1 - math.cos(age * 2 * math.pi)) / 2 * 100 + 0.5) .. "% lit", { fg = C.dim })
  local target = m.phase == "full" and "new" or (m.waxing and "full" or "new")
  local ps = findNow("moon:" .. target, { moon = target }, t)
  local fx = X
  if ps then
    fx = put(X, 9, target .. " in " .. dur(ps - t), { fg = C.label, tip = (target == "full" and "Full" or "New") .. " moon at " .. whenText(ps, t) .. " local" })
  end
  local mr = findNow("at:moonrise", { at = "moonrise" }, t)
  local ms = findNow("at:moonset", { at = "moonset" }, t)
  if mr and ms then
    local up = m.position ~= "below"
    local at = up and ms or mr
    rightAfter(9, fx, (up and "↓ " or "↑ ") .. dur(at - t), { fg = C.dim,
      tip = (up and "Moonset" or "Moonrise") .. " at " .. whenText(at, t) .. " local" })
  end

  -- Daylight: 24 game hours.
  local cph = W >= 50 and 2 or 1
  local dx = put(2, 11, "DAYLIGHT", { fg = C.dim, b = true })
  if not rightAfter(11, dx, "dawn " .. pad2(g.dawn) .. " · dusk " .. pad2(g.dusk) .. " · " .. (g.dusk - g.dawn) .. "h light", { fg = C.dim }) then
    rightAfter(11, dx, pad2(g.dawn) .. "–" .. pad2(g.dusk) .. " · " .. (g.dusk - g.dawn) .. "h", { fg = C.dim,
      tip = "Dawn " .. pad2(g.dawn) .. ":00, dusk " .. pad2(g.dusk) .. ":00: " .. (g.dusk - g.dawn) .. " hours of light" })
  end
  local band = memoized("day:" .. g.dawn .. ":" .. g.dusk .. ":" .. cph, function()
    local list = {}
    for h = 0, 23 do
      list[#list + 1] = { 2 + h * cph, string.rep(" ", cph), { bg = hex(hourColour(h, g.dawn, g.dusk)),
        tip = pad2(h) .. ":00 " .. ((h >= g.dawn and h < g.dusk) and "day" or "night") } }
    end
    return list
  end)
  for _, p in ipairs(band) do put(p[1], 12, p[2], p[3]) end
  local mk = 2 + g.hour * cph + ((cph == 2 and g.minute >= 30) and 1 or 0)
  for _, l in ipairs({ { "00", 0 }, { "06", 6 }, { "12", 12 }, { "18", 18 }, { "24", 24 } }) do
    local c = 2 + l[2] * cph - (l[2] == 24 and 2 or 0)
    if math.abs(c - mk) > 1 and math.abs(c + 1 - mk) > 1 then put(c, 13, l[1], { fg = C.dim }) end
  end
  put(mk, 13, "▲", { fg = C.glow, b = true })
  local dawnAt = findNow("at:dawn", { at = "dawn" }, t)
  local duskAt = findNow("at:dusk", { at = "dusk" }, t)
  if dawnAt and duskAt then
    local rise = dawnAt < duskAt
    local at = rise and dawnAt or duskAt
    local hh = gameTime(at).hour
    local xx = put(2, 14, rise and ("☼ Sunrise " .. pad2(hh) .. ":00") or ("☾ Sunset " .. pad2(hh) .. ":00"),
      { fg = rise and C.gold or C.night, b = true })
    local left = at - t
    local hot = rise and left < 300
    local ex = put(xx + 2, 14, "in " .. dur(left), { fg = hot and C.red or C.text, b = hot,
      tip = (hot and "Trolls: get indoors, the sun is coming.\n" or "") .. "At " .. hm(at) .. " local" })
    rightAfter(14, ex, "real " .. hm(at), { fg = C.dim })
  end

  -- The year: 12 months.
  local cpm = clamp((W - 2) // 12, 2, 4)
  put(2, 16, "YEAR", { fg = C.dim, b = true })
  local ns = findNow("at:seasonStart", { at = "seasonStart" }, t)
  if ns then
    local nextSeason = gameTime(ns).season
    rightAfter(16, 6, cap(nextSeason) .. " in " .. dur(ns - t), { fg = "~" .. seasonHex(nextSeason),
      tip = cap(nextSeason) .. " starts " .. whenText(ns, t) .. " local" })
  end
  local year = memoized("year:" .. g.month .. ":" .. cpm, function()
    local list = {}
    for i, mm in ipairs(MONTHS) do
      local rgb = SEASON_RGB[SEASONS[(i - 1) // 3 + 1]]
      local label = (mm[1]:sub(1, cpm - 1) .. "    "):sub(1, cpm)
      list[#list + 1] = { 2 + (i - 1) * cpm, label, { bg = hex(shade(rgb, i % 2 == 0 and 0.78 or 0.92)), fg = C.ink,
        b = i == g.month, tip = mm[1] .. " / " .. mm[2] } }
    end
    return list
  end)
  for _, p in ipairs(year) do put(p[1], 17, p[2], p[3]) end
  put(2 + (g.month - 1) * cpm + math.min(cpm - 1, (g.day - 1) * cpm // 30), 18, "▲", { fg = C.glow, b = true })
  if W >= 50 then right(18, "month = 12h real · year = 6 days", { fg = C.dim }) end

  -- Coming up.
  put(2, 20, "COMING UP", { fg = C.dim, b = true })
  right(20, "click = remind", { fg = C.dim })
  local labelW = 8
  local condW = W >= 46 and 16 or 0
  local nameW = W - 4 - labelW - (condW > 0 and condW + 1 or 0) - 1
  local lead = math.max(0, tonumber(settings.remind) or 2)
  for i, it in ipairs(comingUp(t)) do
    local y = 20 + i
    local e = it.ev
    local on = reminders[e.name] == true
    local part = memoized("ev:" .. e.name .. ":" .. tostring(on) .. ":" .. tostring(it.now) .. ":" .. lead .. ":" .. W, function()
      local tip = (e.note ~= "" and e.note .. "\n" or "") .. (e.where ~= "" and "Where: " .. e.where .. "\n" or "")
        .. (on and "Reminder on, " .. lead .. " min before. Click to turn it off."
          or "Click: remind me " .. lead .. " min before")
      return {
        { 2, on and "♪" or e.icon, { fg = on and C.gold or "~" .. e.color, tip = on and "Reminder on" or nil } },
        { 4, cut(e.name, nameW), { fg = C.text, b = it.now, act = "remind:" .. e.name, tip = tip } },
        condW > 0 and { 4 + nameW + 1, cut(shortText(e.when), condW), { fg = C.dim, tip = condText(e.when) } } or nil,
      }
    end)
    for _, p in ipairs(part) do put(p[1], y, p[2], p[3]) end
    local soon = not it.now and it.s - t < 600
    local label = it.now and "now" or dur(it.s - t)
    right(y, label, { fg = it.now and C.green or (soon and C.gold or C.label), b = it.now or soon,
      tip = it.now and ("Until " .. whenText(it.e, t) .. " local") or ("At " .. whenText(it.s, t) .. " local") })
  end
end

-- ------------------------------------------------------------ drawing: PLAN

-- Days since 1970-01-01 of a calendar date (proleptic Gregorian).
local function daysFromCivil(y, m, d)
  if m <= 2 then y = y - 1 end
  local era = (y >= 0 and y or y - 399) // 400
  local yoe = y - era * 400
  local mp = (m + 9) % 12
  local doy = (153 * mp + 2) // 5 + d - 1
  local doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
  return era * 146097 + doe - 719468
end

-- The real time of local midnight at the start of a date.
local function localMidnight(y, m, d)
  local want = daysFromCivil(y, m, d)
  local t = want * 86400
  for _ = 1, 4 do
    local l = localTime(t)
    local diff = (want - daysFromCivil(l.year, l.month, l.day)) * 86400 - (l.hour * 3600 + l.min * 60 + l.sec)
    if diff == 0 then break end
    t = t + diff
  end
  return t
end

-- Minutes into the game year at real time `t`, from one gameTime.
local function yearMinute(g)
  return (((g.month - 1) * 30 + g.day - 1) * 1440 + g.hour * 60 + g.minute)
end

-- The season colour at a minute of the year, blending into the next.
local function seasonColour(ym)
  local s = (ym % 518400) / (90 * 1440) - 0.5
  local b = math.floor(s)
  local f = s - b
  return mix(SEASON_RGB[SEASONS[b % 4 + 1]], SEASON_RGB[SEASONS[(b + 1) % 4 + 1]], f)
end

local planCache = {}

local function eventCond(name)
  local e = findEvent(name)
  return e and e.when or nil
end

-- What a real day holds: its cells' colours, the winter full moon and the
-- season start. Kept per month until the clock is set again.
local function monthDays(y, m)
  local key = y * 100 + m
  if planCache[key] then return planCache[key] end
  local n = daysFromCivil(m == 12 and y + 1 or y, m == 12 and 1 or m + 1, 1) - daysFromCivil(y, m, 1)
  local ingrove = eventCond("Ingrove warg pack")
  local days = { n = n, lead = (daysFromCivil(y, m, 1) + 3) % 7 }
  local s0 = localMidnight(y, m, 1)
  for d = 1, n do
    local s1 = localMidnight(y, m, d + 1)
    local g0, g1 = gameTime(s0), gameTime(s1 - 1)
    local ss = gameTimeFind({ at = "seasonStart" }, s0, s1 - s0)
    days[d] = {
      s0 = s0, s1 = s1, ym = yearMinute(g0),
      from = g0.season, to = g1.season,
      seasonStart = ss and ss < s1 and ss or nil,
      ingrove = ingrove and gameTimeFind(ingrove, s0, s1 - s0) ~= nil or false,
    }
    s0 = s1
  end
  planCache[key] = days
  return days
end

local function seasonLine(day)
  if day.seasonStart then
    return cap(day.from) .. " → " .. cap(day.to) .. " at " .. hm(day.seasonStart)
  end
  return cap(day.from) .. " all day"
end

local function planShift(n)
  local y, m = plan.y, plan.m + n
  while m > 12 do m, y = m - 12, y + 1 end
  while m < 1 do m, y = m + 12, y - 1 end
  plan.y, plan.m = y, m
  local today = localTime(getEpoch())
  plan.sel = (today.year == y and today.month == m) and today.day or 1
end

local function drawPlan(g, t)
  drawTabs(seasonHex(g.season))
  rightAfter(1, TABS_END, "wheel = month", { fg = C.dim })
  local today = localTime(t)
  if not plan then plan = { y = today.year, m = today.month, sel = today.day } end
  local days = monthDays(plan.y, plan.m)
  if plan.sel > days.n then plan.sel = days.n end

  put(2, 3, " ◂ ", { fg = C.glow, act = "month:-1", tip = "Previous month" })
  local title = REAL_MONTHS[plan.m] .. " " .. plan.y
  put((W - utf8.len(title)) // 2 + 1, 3, title, { fg = C.text, b = true })
  right(3, " ▸ ", { fg = C.glow, act = "month:1", tip = "Next month" })

  local cw = clamp((W - 1) // 7, 4, 7)
  for i, wd in ipairs(WEEKDAYS) do put(2 + (i - 1) * cw + (cw - 2) // 2, 4, wd:sub(1, 2), { fg = C.dim }) end
  for d = 1, days.n do
    local day = days[d]
    local idx = days.lead + d - 1
    local x, y = 2 + (idx % 7) * cw, 5 + idx // 7
    local sel = plan.sel == d
    local isToday = today.year == plan.y and today.month == plan.m and today.day == d
    local f = sel and 0.45 or 0.9
    local ink = sel and "#ffffff" or C.ink
    local tip = WEEKDAYS[idx % 7 + 1]:sub(1, 3) .. " " .. d .. " " .. REAL_MONTHS[plan.m]:sub(1, 3) .. " · " .. seasonLine(day)
      .. (isToday and " · today" or "") .. (day.ingrove and " · Ingrove pack" or "")
      .. (day.seasonStart and " · season changes" or "")
    local span = day.s1 - day.s0
    local num = string.format("%2d", d)
    local numAt = (cw - 2) // 2
    for j = 0, cw - 1 do
      local ch = " "
      if j == numAt then ch = num:sub(1, 1) elseif j == numAt + 1 then ch = num:sub(2, 2) end
      if j == 0 and isToday then ch = "•" end
      if j == (cw >= 6 and cw - 2 or cw - 1) then
        if day.ingrove then ch = "❄" elseif day.seasonStart then ch = "◆" end
      end
      local bg = hex(shade(seasonColour(day.ym + math.floor((j + 0.5) / cw * span)), f))
      put(x + j, y, ch, { bg = bg, fg = ink, b = sel or isToday, act = "day:" .. d, tip = tip })
    end
  end
  put(2, 11, W >= 43 and "❄ Ingrove pack  ◆ season starts  • today" or "❄ Ingrove  ◆ season  • today", { fg = C.dim })
  put(2, 12, string.rep("─", W - 2), { fg = C.rule })

  -- The selected day.
  local day = days[plan.sel]
  local wd = WEEKDAYS[(days.lead + plan.sel - 1) % 7 + 1]
  put(2, 13, wd .. " " .. plan.sel .. " " .. REAL_MONTHS[plan.m], { fg = C.text, b = true })
  local mid = gameTime(day.s0 + (day.s1 - day.s0) // 2)
  put(2, 14, seasonLine(day), { fg = "~" .. seasonHex(mid.season) })
  local light, last = {}, nil
  for k = 0, 24 do
    local gk = gameTime(math.min(day.s1 - 1, day.s0 + k * 3600))
    local v = gk.dusk - gk.dawn
    if v ~= last then
      light[#light + 1] = v
      last = v
    end
  end
  local lt, nt = {}, {}
  for _, v in ipairs(light) do
    lt[#lt + 1] = v .. "h"
    nt[#nt + 1] = (24 - v) .. "h"
  end
  put(2, 15, "Daylight " .. table.concat(lt, " → ") .. " · night " .. table.concat(nt, " → "), { fg = C.label,
    tip = "Game hours of daylight in the game months this day passes through" })

  local y = 17
  local function line(icon, color, text, tip)
    put(2, y, icon, { fg = color })
    put(4, y, cut(text, W - 5), { fg = C.text, tip = tip })
    y = y + 1
  end
  -- Full moons.
  local from = day.s0
  for _ = 1, 4 do
    local s, e = gameTimeFind({ moon = "full" }, from, day.s1 - from)
    if not s then break end
    local winter = gameTime(s).season == "winter" or gameTime(math.min(e, day.s1) - 1).season == "winter"
    local text = s <= day.s0 and ("Full moon until " .. hm(e)) or ("Full moon " .. hm(s) .. "–" .. hm(e))
    line("●", C.moon, text .. (winter and "  → Ingrove warg pack" or ""),
      "Full moon from " .. whenText(s, t) .. " to " .. whenText(e, t) .. " local")
    from = e
    if from >= day.s1 then break end
  end
  -- Dead Knight windows: the moonrises while the moon is waxing gibbous or
  -- full, one line per run of them (a moonrise every game day, 24 real min).
  local dk = eventCond("Dead Knight slab")
  if dk then
    local groups = {}
    from = day.s0
    for _ = 1, 24 do
      if from >= day.s1 then break end
      local s = gameTimeFind(dk, from, day.s1 - from)
      if not s or s >= day.s1 then break end
      local last = groups[#groups]
      if last and s - last[2] < 3600 then
        last[2], last[3] = s, last[3] + 1
      else
        groups[#groups + 1] = { s, s, 1 }
      end
      from = s + 1
    end
    for _, gr in ipairs(groups) do
      local text = gr[3] == 1 and hm(gr[1]) or (hm(gr[1]) .. "–" .. hm(gr[2]) .. " (" .. gr[3] .. "×)")
      line("☾", "~#d8d2ff", "Dead Knight slab, moonrise " .. text,
        "The slab opens at moonrise while the moon is waxing gibbous or full: a moonrise every game day (24 real minutes)")
    end
  end
  if day.seasonStart then
    line("◆", "~" .. seasonHex(day.to), cap(day.to) .. " starts " .. hm(day.seasonStart))
  end
  if y == 17 then put(2, y, "No full moon, Dead Knight window or new season.", { fg = C.dim }) end
end

-- ------------------------------------------------------------ drawing: LORE

local FORM_ROWS = {
  { "name", "Name", "Troll bridge", 40 },
  { "when", "When", "winter full · hours 0-3 not winter", 80 },
  { "place", "Place", "where it happens", 80 },
  { "note", "Note", "what to do (optional)", 200 },
}

local function drawLore()
  local g = gameTime()
  drawTabs(g and seasonHex(g.season) or "#9aa7b8")
  if loreForm then
    rightAfter(1, TABS_END, "[× close]", { fg = C.label, act = "form", tip = "Close the form" })
  else
    rightAfter(1, TABS_END, "[+ add]", { fg = C.glow, act = "form", tip = "Add an event of your own" })
  end
  wantFields = {}
  local y = 3
  if loreForm then
    for _, f in ipairs(FORM_ROWS) do
      put(2, y, f[2], { fg = C.label })
      wantFields[#wantFields + 1] = { key = f[1], row = y, col = 8, len = W - 9, placeholder = f[3], max = f[4] }
      y = y + 1
    end
    -- Two rows for what the form says, always: the fields above must not
    -- move while the player types.
    local lines = wrapLines(status.text, W - 3)
    local st = { fg = status.err and C.red or C.green, tip = #lines > 2 and status.text or nil }
    if #lines > 2 then lines[2] = cut(lines[2] .. " " .. lines[3], W - 3) end
    if lines[1] then put(2, y, lines[1], st) end
    if lines[2] then put(2, y + 1, lines[2], st) end
    y = y + 2
    local x = put(2, y, "[add]", { fg = C.glow, b = true, act = "submit", tip = "Add the event (Enter in a field)" })
    put(x + 2, y, "e.g. winter full, moonrise waxing|full", { fg = C.dim,
      tip = "Seasons, months, dawn/day/dusk/night, hours 0-3, moon phases,\nmoon up/down, not <season>, or one moment:\n"
        .. "sunrise, sunset, midnight, moonrise, moonset, season start.\n| or \"or\" joins choices of one kind." })
    y = y + 1
    put(2, y, string.rep("─", W - 2), { fg = C.rule })
    y = y + 2
  end
  for _, e in ipairs(allEvents()) do
    local cond = e.bad and ("? " .. e.whenText) or (e.when and condText(e.when) or (e.about or ""))
    local col = "~" .. e.color
    put(2, y, e.icon, { fg = col })
    local tip = (e.note ~= "" and e.note .. "\n" or "") .. "Source: " .. e.source
    if e.bad then tip = "This condition does not work: " .. e.bad end
    local name = cut(e.name, W - 5)
    put(4, y, name, { fg = C.text, b = true, tip = tip })
    local room = W - 5 - utf8.len(name)
    if room >= 4 then
      local shownCond = cut(cond, room)
      local ctip = nil
      if shownCond ~= cond then ctip = cond elseif not e.when and not e.bad then ctip = "Not on a clock: lore only" end
      right(y, shownCond, { fg = e.bad and C.red or (e.when and col or C.dim), tip = ctip })
    end
    put(4, y + 1, cut(e.where ~= "" and e.where or "—", W - 7), { fg = C.dim, tip = e.where ~= "" and e.where or nil })
    if e.own then
      right(y + 1, "✖", { fg = C.red, act = "delete:" .. e.name, tip = "Delete " .. e.name })
    end
    y = y + 2
  end
  put(2, y, #EVENTS .. " bundled, " .. #own .. " your own · almanac export", { fg = C.dim,
    tip = "almanac export gives one line with your events to share;\nalmanac import <line> adds the events of such a line" })
end

-- ------------------------------------------------------------ draw, ticking

local ticker = nil
local draw -- forward

local function syncTicker()
  local want = pane:visible() and tab == "now" and ready()
  if want and not ticker then
    ticker = tempTimer(1, function()
      if not pane:visible() then
        killTimer(ticker)
        ticker = nil
        return
      end
      draw()
    end, true)
  elseif not want and ticker then
    killTimer(ticker)
    ticker = nil
  end
end

draw = function()
  if not pane:visible() then
    syncTicker()
    return
  end
  newGrid()
  wantFields = {}
  local ok, g = ready()
  local t = getEpoch()
  if tab == "lore" then
    drawLore()
  elseif not ok then
    drawUnset(g)
  elseif tab == "now" then
    drawNow(g, t)
  else
    drawPlan(g, t)
  end
  flush()
  syncTicker()
end

pane:onResize(function(rows, cols)
  W, H = math.max(20, cols), rows
  resetShown()
  draw()
end)

pane:onWheel(function(_, dy)
  if tab ~= "plan" or dy == 0 or not plan or not ready() then return false end
  planShift(dy > 0 and 1 or -1)
  draw()
  return true
end)

-- ------------------------------------------------------------ reminders

local remindTimer = nil

local function remind(e, s)
  fired[e.name] = s
  local t = getEpoch()
  local text = e.name .. " in " .. dur(s - t) .. " (" .. hm(s) .. " local)" .. (e.where ~= "" and (", " .. e.where) or "")
  cecho(TAG .. "<~#ffb000>♪ " .. e.name .. "<reset> in " .. dur(s - t) .. " (" .. hm(s) .. " local)"
    .. (e.where ~= "" and (", " .. e.where) or ""))
  uiMessage("almanac", text)
end

-- One timer for the soonest reminder; planned again after it and on a sync.
local function planReminders()
  if remindTimer then
    killTimer(remindTimer)
    remindTimer = nil
  end
  if not ready() then return end
  local t = getEpoch()
  local lead = math.max(0, tonumber(settings.remind) or 2) * 60
  local soonest = nil
  for name in pairs(reminders) do
    local e = findEvent(name)
    if e and e.when then
      local s, en = nextStart(e.when, t)
      if s and fired[name] == s then s, en = gameTimeFind(e.when, s == en and s + 1 or en) end
      if s and s - lead <= t then
        remind(e, s)
        s, en = gameTimeFind(e.when, s == en and s + 1 or en)
      end
      if s and s - lead > t then soonest = math.min(soonest or math.huge, s - lead) end
    end
  end
  if soonest then remindTimer = tempTimer(soonest - t + 0.05, planReminders) end
end

local function toggleReminder(e)
  if reminders[e.name] then
    reminders[e.name] = nil
    say("No reminder for " .. e.name .. ".")
  else
    if not e.when then return say(e.name .. " is not on a clock: no reminder.") end
    reminders[e.name] = true
    say("Reminder " .. settings.remind .. " min before " .. e.name .. ".")
  end
  saveReminders()
  planReminders()
end

-- ------------------------------------------------------------ actions

local FORM_ORDER = { "name", "when", "place", "note" }

local function checkForm()
  if trim(form.when) == "" then
    status = { text = "", err = false }
    return
  end
  local cond, err = parseWhen(form.when)
  if cond then
    status = { text = "→ " .. condText(cond), err = false }
  else
    status = { text = err, err = true }
  end
end

local function submitForm()
  local e, err = addEvent(form.name, form.when, form.place, form.note)
  if not e then
    status = { text = err, err = true }
    draw()
    if fields.name and trim(form.name) == "" then fields.name.field:focus() end
    return
  end
  form = { name = "", when = "", place = "", note = "" }
  status = { text = "", err = false }
  loreForm = false
  say("Added " .. e.name .. ": " .. e.whenText .. ".")
  draw()
end

doAction = function(act)
  local kind, arg = act:match("^(%w+):?(.*)$")
  if kind == "tab" then
    tab = arg
    resetShown()
  elseif kind == "remind" then
    local e = findEvent(arg)
    if e then toggleReminder(e) end
  elseif kind == "month" then
    planShift(tonumber(arg))
  elseif kind == "day" then
    plan.sel = tonumber(arg)
  elseif kind == "form" then
    loreForm = not loreForm
    status = { text = "", err = false }
    if loreForm then checkForm() end
    resetShown()
    draw()
    if loreForm and fields.name then fields.name.field:focus() end
    return
  elseif kind == "check" then
    checkForm()
  elseif kind == "submit" then
    return submitForm()
  elseif kind == "next" or kind == "prev" then
    for i, k in ipairs(FORM_ORDER) do
      if k == arg then
        local j = (i + (kind == "next" and 1 or -1) - 1) % #FORM_ORDER + 1
        local f = fields[FORM_ORDER[j]]
        if f then f.field:focus() end
      end
    end
    return
  elseif kind == "delete" then
    local e = removeEvent(arg)
    if e then say("Removed " .. e.name .. ".") end
    planReminders()
  end
  draw()
end

-- ------------------------------------------------------------ events

registerAnonymousEventHandler("sysGameTimeEvent", function(_, kind)
  cache = {}
  if kind == "sync" then
    planCache = {}
    planReminders()
  end
  if tab ~= "lore" then draw() else syncTicker() end
end)

registerAnonymousEventHandler("sysPanesChanged", function()
  if pane:visible() then
    if not ticker then draw() end
  else
    syncTicker()
  end
end)

registerAnonymousEventHandler("sysSettingChanged", function()
  planReminders()
  draw()
end)

-- ------------------------------------------------------------ alias

local function listEvents()
  local ok = ready()
  local t = getEpoch()
  for _, e in ipairs(allEvents()) do
    local what
    if not e.when then
      what = "<ansi_light_black>" .. (e.about or "lore") .. "<reset>"
    elseif not ok then
      what = condText(e.when)
    else
      local s, en = findNow("ev:" .. e.name, e.when, t)
      if not s then what = condText(e.when) .. ", not within a game year"
      elseif s <= t and t < en then what = condText(e.when) .. ", <~#7ee0a1>now<reset> until " .. whenText(en, t)
      else what = condText(e.when) .. ", in " .. dur(s - t) .. " (" .. whenText(s, t) .. ")" end
    end
    say((reminders[e.name] and "♪ " or "") .. e.name .. (e.own and " (yours)" or "") .. ": " .. what)
  end
  if not ok then say("The clock does not know the hour: type time in the game.") end
end

local function findCommand(text)
  local cond, err = parseWhen(text)
  if not cond then return say("<~#ff6b6b>" .. err .. "<reset>") end
  local c = condText(cond)
  if not ready() then return say(c .. ": the clock does not know the hour yet (type time).") end
  local t = getEpoch()
  local s, e = gameTimeFind(cond)
  if not s then return say(c .. ": not within a game year.") end
  if s <= t and t < e then return say(c .. ": now, until " .. whenText(e, t) .. " (" .. dur(e - t) .. ").") end
  local g = gameTime(s)
  say(c .. ": in " .. dur(s - t) .. ", at " .. whenText(s, t) .. " local (" .. g.day .. " " .. g.monthName .. " "
    .. pad2(g.hour) .. ":" .. pad2(g.minute) .. ")" .. (e > s and (" for " .. dur(e - s)) or "") .. ".")
end

local function show(which)
  if which then tab = which end
  pane:show()
  resetShown()
  draw()
end

local USAGE = "almanac [now|plan|lore], list, find <when>, add <name> = <when> [@ <place>] [// <note>], "
  .. "remove <name>, remind <name>, export, import <line>"

tempAlias("^almanac(?:\\s+(.*))?$", function()
  local rest = trim(matches[2] or "")
  local sub, arg = rest:match("^(%S+)%s*(.*)$")
  sub = sub and sub:lower() or ""
  if sub == "" then
    if pane:visible() then
      pane:hide()
      syncTicker()
    else
      show()
    end
  elseif sub == "now" or sub == "plan" or sub == "lore" then
    show(sub)
  elseif sub == "list" then
    listEvents()
  elseif sub == "find" or sub == "when" then
    findCommand(arg)
  elseif sub == "add" then
    local name, def = arg:match("^(.-)%s*=%s*(.*)$")
    if not name then return say("Usage: almanac add <name> = <when> [@ <place>] [// <note>]") end
    local note
    local d, n = def:match("^(.-)%s*//%s*(.*)$")
    if d then def, note = d, n end
    local place
    local w, p = def:match("^(.-)%s*@%s*(.*)$")
    if w then def, place = w, p end
    local e, err = addEvent(name, def, place, note)
    if not e then return say("<~#ff6b6b>" .. err .. "<reset>") end
    say("Added " .. e.name .. ": " .. e.whenText .. (e.where ~= "" and (" @ " .. e.where) or "") .. ".")
    draw()
  elseif sub == "remove" or sub == "delete" then
    local e = removeEvent(arg)
    if not e then
      return say(findEvent(arg) and (arg .. " is bundled: only your own events can be removed.") or ("No event of yours called " .. arg .. "."))
    end
    say("Removed " .. e.name .. ".")
    planReminders()
    draw()
  elseif sub == "remind" then
    local e = findEvent(arg)
    if not e then return say("No event called " .. arg .. ".") end
    toggleReminder(e)
    draw()
  elseif sub == "export" then
    if #own == 0 then return say("You have no events of your own to export. Add one: almanac add <name> = <when>") end
    say("Your " .. #own .. " event" .. (#own == 1 and "" or "s") .. " as one line; copy it and share it:")
    echo(exportLine())
  elseif sub == "import" then
    local added, there, bad = importLine(arg)
    if not added then return say("<~#ff6b6b>Import: " .. there .. ".<reset> Usage: almanac import ALM1:…") end
    say("Imported " .. added .. " event" .. (added == 1 and "" or "s") .. ", " .. there .. " already there"
      .. (#bad > 0 and (", " .. #bad .. " skipped") or "") .. ".")
    for _, b in ipairs(bad) do say("<~#ff6b6b>Skipped " .. b .. "<reset>") end
    draw()
  elseif sub == "help" then
    expandAlias("#script help " .. scriptName)
  else
    say(USAGE)
  end
end)

-- ------------------------------------------------------------ start

do
  for _, r in ipairs(store.get("events") or {}) do
    if type(r) == "table" and type(r.name) == "string" and type(r.when) == "string" then
      own[#own + 1] = ownEvent(r)
    end
  end
  for _, n in ipairs(store.get("remind") or {}) do
    if type(n) == "string" and findEvent(n) then reminders[n] = true end
  end
  planReminders()
  draw()
end
