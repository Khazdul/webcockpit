-- @name     readability
-- @summary  Shorter, colour-coded mob, movement and exit lines
-- @api      1
-- @setting  directions boolean true "Colour who leaves and arrives, and where"
-- @setting  exits      boolean true "Colour the directions on the Exits line"
-- @setting  mobs       boolean true "Shorten and colour the mobs in a room"
-- @setting  flags      boolean true "Colour (glowing) and (hidden)"
-- @setting  arrows     boolean true "An arrow with each direction (north ▲)"
-- @setting  shortnames boolean true "Short mob names (off: MUME's own text)"
-- @help     Makes the busy lines of MUME quicker to read. Colours adapt to
-- @help     your background (Options -> Appearance), so they read on black,
-- @help     on the dark themes and on paper.
-- @help
-- @help     Mobs: about 450 known mobs get a short name, and the rest of
-- @help     the line is dimmed. Dangerous and named mobs are gold, roots
-- @help     and snares pink, the others keep the normal text colour.
-- @help       A huge, black bear is here, proud heir to the great and
-- @help         ancient mountain bears.
-- @help       becomes: The huge, black bear is here.   (name in gold)
-- @help       Some roots lie here waiting to ensnare weary travellers.
-- @help       becomes: A clump of roots is here.       (name in pink)
-- @help     Other mobs that are standing, sleeping, lying or fighting keep
-- @help     their text; only "is standing here ..." is dimmed.
-- @help
-- @help     Movement: the mover keeps its colour, "leaves" is dimmed and the
-- @help     direction is teal with an arrow.
-- @help       A young troll leaves north.   becomes: A young troll leaves north ▲
-- @help       Frodo leaves west.            becomes: Frodo leaves ◄ west
-- @help       A guard has arrived from above.  (from above in teal)
-- @help
-- @help     Exits: each direction is teal; commas, doors and marks are dim.
-- @help       Exits: (north), =east=, south, /up\.
-- @help
-- @help     Flags: (glowing) is lilac and (hidden) dim, on any line.
-- @help
-- @help     Turn a part off, for example:
-- @help       #script set readability shortnames off
-- @help       #script set readability arrows off
-- @help     With shortnames off a known mob keeps MUME's text, but its name
-- @help     still has its colour and the rest is dimmed.
-- @help
-- @help     Room descriptions and what players say are never changed.
-- @help
-- @help     The mob list is Lamia's, from Cockpit's readability module.
-- @help     Thanks, Lamia!

--[[
How it works

Four triggers, so most lines cost one regex test each and no Lua:

  " leaves <dir>."      movement out
  " has arrived ..."    movement in
  "^Exits: "            the exits line
  one big regex         every known mob line (from MOBS below), the
                        generic "is standing here" lines and lines that
                        end in a flag

The colours start with ~ : they are adaptive. WebCockpit keeps their hue
and makes them lighter or darker as far as the background needs.

Where a line's start keeps the game's own colours (a red *enemy*), the
script rebuilds only the end of the line from copy2cecho(), so the
enemy stays red.

Credits: the mob list (MOBS at the end of the file) is Lamia's, from
Cockpit's readability module: the original line, the short name and
the tier (plain, danger, roots).
]]

-- ------------------------------------------------------------ colours

local TEAL  = "<~#3fb0a0>" -- directions
local GREY  = "<~#6e6e6e>" -- the dimmed rest of a line
local GOLD  = "<~#f0c850>" -- dangerous and named mobs
local PINK  = "<~#ef6fa6>" -- roots and snares
local LILAC = "<~#da9bff>" -- (glowing)
local RESET = "<reset>"

-- Tiers of the mob list.
local P, D, R = 0, 1, 2
local TIER_COLOR = { [P] = "", [D] = GOLD, [R] = PINK }

local ARROW = {
  north = "north ▲", south = "south ▼", east = "east ►",
  west = "◄ west", up = "up ⇑", down = "down ⇓",
}
local DIRS = { north = true, south = true, east = true, west = true, up = true, down = true }

-- Flags we colour; any other (lower-case) flag keeps its text.
local FLAG_COLOR = { glowing = LILAC, hidden = GREY }

-- Lines in these MUME XML elements are prose or speech: never touched.
local SKIP_TAGS = {
  description = true, name = true, say = true, tell = true, narrate = true,
  pray = true, emote = true, social = true, yell = true, shout = true,
  song = true,
}

-- ------------------------------------------------------------ helpers

local MOBS -- the mob list, at the end of the file

-- True when the line is in a description or a say (XML mode).
local function skipped()
  for _, t in ipairs(lineTags()) do
    if SKIP_TAGS[t] then return true end
  end
  return false
end

-- cecho has no escape for "<": leave a line that has one alone.
local function unsafe()
  return line:find("<", 1, true) ~= nil
end

-- The line as cecho, with `tail` (the plain text the line ends with)
-- replaced by `new`. Through copy2cecho, so the start keeps the game's
-- colours (a red *enemy*).
local function withTail(tail, new)
  local c = copy2cecho() or line
  if #tail <= #c and c:sub(-#tail) == tail then
    return c:sub(1, #c - #tail) .. new
  end
  return line:sub(1, #line - #tail) .. new
end

-- The same for `head`, the plain text the line starts with.
local function withHead(head, new)
  local c = copy2cecho() or line
  if c:sub(1, #head) == head then
    return new .. c:sub(#head + 1)
  end
  return new .. line:sub(#head + 1)
end

-- Moves the flags at the end of `s` to the front of `flags`.
local function takeFlags(s, flags)
  while true do
    local body, flag = s:match("^(.-) %((%l[%l ]*)%)$")
    if not body then return s end
    table.insert(flags, 1, flag)
    s = body
  end
end

-- Splits the flags off the end of a sentence:
-- "An orc stabs (hidden)." -> "An orc stabs", {"hidden"}, "."
-- (MUME puts them before the period; after it works too.)
local function splitFlags(s)
  local flags = {}
  local stop = ""
  s = takeFlags(s:gsub("%s+$", ""), flags)
  if s:sub(-1) == "." then
    stop = "."
    s = s:sub(1, -2)
  end
  return takeFlags(s, flags), flags, stop
end

-- The flags as cecho: parens in the normal colour, the word coloured.
local function flagText(flags)
  local out = ""
  for _, f in ipairs(flags) do
    local col = settings.flags and FLAG_COLOR[f]
    if col then
      out = out .. RESET .. " (" .. col .. f .. RESET .. ")"
    else
      out = out .. RESET .. " (" .. f .. ")"
    end
  end
  return out
end

-- ------------------------------------------------------------ movement

local function onLeave()
  if not settings.directions or unsafe() or skipped() then return end
  local dir, riding = matches[3], matches[4]
  local tail = " leaves " .. dir .. riding .. "."
  local out = GREY .. " leaves " .. TEAL
  if settings.arrows then
    out = out .. ARROW[dir]
    if riding ~= "" then out = out .. GREY .. riding end
  else
    out = out .. dir .. GREY .. riding .. "."
  end
  replaceLine(withTail(tail, out .. RESET))
end

local function onArrive()
  if not settings.directions or unsafe() or skipped() then return end
  local from, riding = matches[2], matches[3]
  local tail = " has arrived" .. from .. riding .. "."
  replaceLine(withTail(tail, GREY .. " has arrived" .. TEAL .. from .. GREY .. riding .. "." .. RESET))
end

-- ------------------------------------------------------------ exits

-- "Exits: (north), =east=, south, /up\. - n:door" -> the list up to the
-- first period that ends it; directions teal, everything else dim.
local function onExits()
  if not settings.exits or unsafe() then return end
  local list = line:match("^Exits: ([^.]*%.)")
  if not list then return end
  local colored = list:gsub("%a+", function(w)
    if DIRS[w] then return TEAL .. w .. GREY end
  end)
  replaceLine(withHead("Exits: " .. list, GREY .. "Exits: " .. colored .. RESET))
end

-- ------------------------------------------------------------ mobs

-- The first `n` words of `s`, and the rest (with its leading space).
local function firstWords(s, n)
  local pos = 0
  for _ = 1, n do
    local e = s:find(" ", pos + 1, true)
    if not e then return s, "" end
    pos = e
  end
  return s:sub(1, pos - 1), s:sub(pos)
end

-- A known mob: its short name (or MUME's text), coloured by tier.
local function namedMob(body, flags, stop, entry)
  local short, tier, words = entry[1], entry[2], entry[3]
  local color = TIER_COLOR[tier]
  if settings.shortnames then
    replaceLine(color .. short .. GREY .. " is here" .. flagText(flags) .. GREY .. "." .. RESET)
  else
    local name, rest = firstWords(body, words)
    if color == "" then color = RESET end
    replaceLine(color .. name .. GREY .. rest .. flagText(flags) .. GREY .. stop .. RESET)
  end
end

-- The endings of mobs the list does not know (Cockpit's fallbacks, and
-- players fighting or riding).
local GENERIC = {
  " is standing here", " is sleeping here", " is resting here",
  " is sitting here", " is lying here,", " is floating here",
  " is here fighting ", " is here riding ",
}

-- An unknown mob: the name keeps its colours, the rest is dimmed. Only
-- a sentence (a say ends in a quote, not a period).
local function genericMob(body, flags, stop)
  if stop ~= "." or not body:match("^[%u*]") then return false end
  local at
  for _, g in ipairs(GENERIC) do
    at = body:find(g, 2, true)
    if at then break end
  end
  if not at then at = body:match("^.- is .-here, fighting()") and body:find(" is ", 2, true) end
  if not at then return false end
  local tail = line:sub(at)
  local rest = body:sub(at)
  replaceLine(withTail(tail, GREY .. rest .. flagText(flags) .. GREY .. stop .. RESET))
  return true
end

-- Any other line that ends in flags: colour just the flags.
local function flagsOnly(body, flags, stop)
  if not settings.flags or #flags == 0 then return end
  local tail = line:sub(#body + 1)
  replaceLine(withTail(tail, flagText(flags) .. stop .. RESET))
end

local function onRoomLine()
  if unsafe() or skipped() then return end
  local body, flags, stop = splitFlags(line)
  if settings.mobs then
    local entry = MOBS[body]
    if entry then return namedMob(body, flags, stop, entry) end
    if genericMob(body, flags, stop) then return end
  end
  flagsOnly(body, flags, stop)
end

-- ------------------------------------------------------------ start

-- A JavaScript regex for a literal text.
local function reQuote(s)
  return (s:gsub("[%^%$%.%|%?%*%+%(%)%[%]%{%}/\\]", "\\%0"))
end

local function start()
  tempRegexTrigger("^(.+) leaves (north|south|east|west|up|down)( riding .+)?\\.$", onLeave)
  tempRegexTrigger("^.+ has arrived( from (?:the (?:north|south|east|west)|above|below))?( riding .+)?\\.$", onArrive)
  tempRegexTrigger("^Exits: ", onExits)

  -- One regex for every line onRoomLine may change, so other lines
  -- never call Lua: a known mob (flags and the period optional), an
  -- unknown one standing, sleeping ... here, and a line ending in a flag.
  local keys = {}
  for k in pairs(MOBS) do keys[#keys + 1] = reQuote(k) end
  table.sort(keys)
  tempRegexTrigger(
    "^(?:(?:" .. table.concat(keys, "|") .. ")\\.?(?: \\([a-z][a-z ]*\\))*\\.?\\s*$"
      .. "|[A-Z*].* is (?:standing|sleeping|resting|sitting|floating) here"
      .. "|[A-Z*].* is here (?:fighting|riding) "
      .. "|[A-Z*].* is lying here,"
      .. "|[A-Z*].* is .*here, fighting"
      .. "|.*\\((?:glowing|hidden)\\)\\.?\\s*$)",
    onRoomLine
  )
end

-- ------------------------------------------------------------ the mob list

-- Lamia's list, from Cockpit (Mobs.tin): MUME's line without its final
-- period = { short name, tier, words of MUME's line that name the mob }.
-- The word count is used when shortnames is off.
MOBS = {
  ["A disgusting forest troll is searching for fresh meat here"] = { "An ugly forest troll", P, 4 },
  ["A brutish forest troll is hunting here, looking for some tasty flesh"] = { "A brutish forest troll", P, 4 },
  ["A large mother hawk is here looking for prey to feed her young"] = { "A large hawk", P, 4 },
  ["A squirrel scampers around here, looking for nuts from the trees"] = { "A squirrel", P, 2 },
  ["A slender orc scans the area, his bow ready for a sudden strike"] = { "A slender orkish archer", P, 3 },
  ["An uruk of the Morgundul tribe is here commanding his soldiers"] = { "A Morgundul uruk", P, 2 },
  ["An orc-guard of the Morgundul is on patrol here"] = { "A Morgundul orc guard", P, 2 },
  ["A hungry warg stands here, sniffing around for flesh"] = { "A hungry warg", P, 3 },
  ["A tall Uruk paces about, issuing commands to his troops"] = { "A battle-hardened orc", P, 3 },
  ["A Morgundul orc snarls about here, looking for a fight"] = { "A robust orc", P, 3 },
  ["A red-eyed shaman of the Morgundul tribe is here, chanting in evil tongues"] = { "Luxzúm the Morgundul Shaman", D, 3 },
  ["A relentless uruk of the Morgundul tribe is leading his soldiers here"] = { "An orkish expedition leader", P, 7 },
  ["A huge stone giant is here, glaring at you"] = { "A huge stone giant", P, 4 },
  ["A tall and strong hunter is standing here"] = { "A hunter", P, 5 },
  ["A stone troll is standing here, scowling about"] = { "A stone troll", P, 3 },
  ["A powerful young troll stares at you"] = { "A young troll", P, 4 },
  ["A large elk is standing here, chewing grass and leaves"] = { "A large elk", P, 3 },
  ["A growling, huge ice-demon lunges about in search of victims"] = { "The ice-demon", P, 4 },
  ["The enchanting will-of-the-wisp beckons you with a blurred light"] = { "A will-of-the-wisp", P, 3 },
  ["A slobbering giant greedily lumbers towards you"] = { "A hill giant", P, 3 },
  ["A very strong orkish leader is here on patrol"] = { "An orkish patrol-leader", P, 5 },
  ["An orc soldier is standing here"] = { "An orc-soldier", P, 3 },
  ["A burly giant is here, covered with thick fur and snow"] = { "A burly snow giant", P, 3 },
  ["A big, nasty vulture is sitting here, protecting its nest"] = { "A vulture", P, 4 },
  ["A barefoot goblin pads silently over the stone"] = { "A goblin scout", P, 3 },
  ["A mountain goat is here, jumping from cliff to cliff"] = { "A mountain goat", P, 3 },
  ["A Zaugurz orc scout is standing here"] = { "A Zaugurz orc scout", P, 4 },
  ["A huge, black bear is here, proud heir to the great and ancient mountain bears"] = { "The huge, black bear", D, 4 },
  ["A grey wolf is here, salivating profusely"] = { "A rabid, grey wolf", P, 3 },
  ["An experienced orkish scout is looking for tracks on the ground"] = { "An orkish scout", P, 4 },
  ["An orc-guard is on patrol here"] = { "An orc-guard", P, 2 },
  ["A grey-skinned mountain troll stands here"] = { "A mountain troll", P, 4 },
  ["A large mean-looking troll is here"] = { "A large troll", P, 4 },
  ["An orkish chieftain is here, controlling his guards"] = { "The orkish chieftain", P, 3 },
  ["An elite orc-guard is on sentry here"] = { "An elite orc-guard", P, 3 },
  ["An orc sentry is here on patrol"] = { "An orc sentry", P, 3 },
  ["A warrior of Goblin Gate stands menacingly before you"] = { "An orkish warrior", P, 2 },
  ["An orc assassin is hiding here, waiting for a victim to stab"] = { "An orc assassin", P, 3 },
  ["A cockroach is scuttling across the floor carrying some debris"] = { "A cockroach", P, 2 },
  ["A giant slug is here, oozing around"] = { "A giant slug", P, 3 },
  ["A water moccasin slithers out of sight just below the surface of the water"] = { "A water moccasin", P, 3 },
  ["An albino fish is swimming here, looking for some food"] = { "An albino fish", P, 3 },
  ["A wet, gilled reptile-like creature lurks in the water here"] = { "A scaly reptile", P, 4 },
  ["A small, mean earth troll is standing here, thinking of something hideous"] = { "An earth troll", P, 5 },
  ["An orc is hobbling around on rudimentary crutches"] = { "A crippled orc", P, 2 },
  ["An orc is slinking around trying to look inconspicuous"] = { "A snaga orc", P, 2 },
  ["A limping orc shuffles around here. He looks miserable"] = { "A crippled orc", P, 3 },
  ["An albino salamander is here, perched on some rocks"] = { "An albino salamander", P, 3 },
  ["A demon wolf lurks here, its dark form twisting and hiding its shape"] = { "A demon wolf", P, 3 },
  ["A shadowy and lithe orc stands here, half-hidden in the darkness"] = { "A lithe orc", P, 5 },
  ["The Great Goblin is here, looking at you in disapproval"] = { "The Great Goblin", P, 3 },
  ["A huge orc bodyguard looks at you suspiciously"] = { "The orkish bodyguard", P, 4 },
  ["A heavily scarred orc is standing here"] = { "The orkish kennel master", P, 4 },
  ["A huge and awesome dealer in black leather is here"] = { "A dealer", P, 5 },
  ["A snaga is here, trying to sharpen a set of blood-encrusted needles"] = { "A snaga orc", P, 2 },
  ["The dark presence of the Monitor stands at the stone door"] = { "Zathdug the Monitor", P, 6 },
  ["The orkish loremaster is standing here, looking for his audience"] = { "The orkish loremaster", P, 3 },
  ["Guthblug the Foreman is here, scowling at you furiously"] = { "Guthblug the Foreman", P, 3 },
  ["A large bat is here, hanging in the darkness"] = { "A large bat", P, 3 },
  ["An orc slavemaster is here, looking for someone to abuse"] = { "An orc slavemaster", P, 3 },
  ["An elven slave is standing here"] = { "An elven slave", P, 3 },
  ["The Guardian is standing here, watching the treasures"] = { "The guardian", D, 2 },
  ["An officer of the Uruk-tarkhnarb stands before you"] = { "An orkish officer", P, 2 },
  ["A dark-skinned orkish veteran guard is on sentry here"] = { "An orkish veteran guard", P, 5 },
  ["An orkish warg-rider is here, riding a hungry warg"] = { "An orkish warg-rider, riding a hungry warg,", P, 3 },
  ["A very strong orkish patrol-leader is looking for enemies here"] = { "An orkish patrol-leader", P, 5 },
  ["A strong, tall orc-guard is looking for enemies here"] = { "An orc-guard", P, 4 },
  ["Brolg, shaman of the Ohurk-uai, is here, chanting some evil incantations"] = { "Brolg the orkish shaman", D, 2 },
  ["An orkish soldier is here, patrolling the area"] = { "An orkish soldier", P, 3 },
  ["A burly orc-guard is here, sniffing at the air"] = { "A burly orc", P, 3 },
  ["An orc of the Ohurk-uai stands here, cursing and grumbling"] = { "An Ohurk-uai soldier", P, 5 },
  ["A mountain ibex is jumping from rock to rock"] = { "A mountain ibex", P, 3 },
  ["A large marmot is here, scurrying in between the rocks"] = { "A marmot", P, 3 },
  ["The Black Númenórean sage is standing here"] = { "The sage", D, 4 },
  ["A hardened orkish bodyguard is here, watching the entrance"] = { "A hardened orkish bodyguard", P, 4 },
  ["A snake slithers towards you"] = { "A slithering snake", P, 2 },
  ["A ferocious warg is here, snarling angrily"] = { "A ferocious warg", P, 3 },
  ["A tall brown-skinned orc, with wide arms, examines you harshly"] = { "A brown-skinned orc", P, 4 },
  ["The ugly troll mother is roaming the cave, taking care of her loved ones"] = { "A troll mother", P, 4 },
  ["A young cave troll is here, staying close to his mother"] = { "A young cave troll", P, 4 },
  ["A fierce bat is here, lusting for your blood"] = { "A bloodthirsty bat", P, 3 },
  ["An orkish warrior of the Tarkhnarb tribe stands guard here"] = { "An orkish warrior", P, 3 },
  ["A rock lizard is here, motionless as it observes you"] = { "A rock lizard", P, 3 },
  ["A Durbûk-hai warrior is here, ill-equipped but ready to fight for his tribe"] = { "A crudely armed Durbûk-hai warrior", P, 3 },
  ["An elite Durbûk-hai guard is standing here, armed with spear and shield"] = { "An agile Durbûk-hai spear-guard", P, 4 },
  ["A shimmering glow is here, emitting pale, green, light"] = { "A shimmering glow", P, 3 },
  ["A black moth flutters around"] = { "A black moth", P, 3 },
  ["A brawny wisent is slowly striding through the vegetation"] = { "A powerful wisent", P, 3 },
  ["A young wisent is here, staying close to rest of the herd"] = { "A youthful wisent", P, 3 },
  ["A huge black fungus is here, exuding a foul stench"] = { "A black fungus", P, 4 },
  ["A mass of wriggling vines drops on you from the trees"] = { "A mass of vines", P, 5 },
  ["A huge warg is here, moving in for the kill"] = { "A huge warg", P, 3 },
  ["A young mountain lion is sizing up his next meal from the nearby cover"] = { "A young mountain lion", P, 4 },
  ["A small, helpless eaglet screams for more food"] = { "An eaglet", P, 4 },
  ["A mother eagle flies high above, looking for prey"] = { "A mother eagle", P, 3 },
  ["A rooting heap of stems is here, smothering the smaller plants"] = { "A heap of rooting stems", P, 5 },
  ["A spiky broomrape plant pokes its blooms out of the soil"] = { "A broomrape plant", P, 4 },
  ["An ancient oak is here towering above you"] = { "An ancient oak", P, 3 },
  ["An imposing beech tree sways gently in the wind"] = { "An imposing beech tree", P, 4 },
  ["A tall birch is here, watching over the landscape"] = { "A birch tree", P, 3 },
  ["A brown striated fungus hangs here, clinging to a tree trunk"] = { "A brown fungus", P, 4 },
  ["A huge millipede is writhing around here"] = { "A huge millipede", P, 3 },
  ["Some thick writhing vines whip all around you"] = { "A thick tangle of vines", P, 4 },
  ["A black alder looms threateningly over its surroundings"] = { "A black alder", P, 3 },
  ["The embodied shape of a linden tree stands shiftlessly here"] = { "A mature linden tree", P, 7 },
  ["A mass of low-spreading shrub quivers on the ground"] = { "A mass of buckthorn", P, 5 },
  ["A majestic scots pine grows tall and straight here"] = { "A tall scots pine", P, 4 },
  ["A tall, slender hornbeam Ent walks around here, keeping watch over his trees"] = { "A slender hornbeam", P, 4 },
  ["A small termite is running around making strange sounds"] = { "A small termite", P, 3 },
  ["A colony of red ants is here. The ants seem to ignore you"] = { "A red ant colony", P, 2 },
  ["A tangly shrub seems to rustle as if alert to its surroundings"] = { "A tangly shrub", P, 3 },
  ["A warrior of the Urughásh is here, guarding the gates"] = { "An orkish gate-guard", P, 5 },
  ["A short Urughásh is here, watching the area"] = { "An Urughásh warden", P, 3 },
  ["A tall, dirty Urughásh commands your attention"] = { "Throkrath the Foreman", D, 4 },
  ["An orkish soldier of the Urughásh is here"] = { "An Urughásh soldier", P, 3 },
  ["A soot-covered Urughásh is here, mining away at the rock"] = { "A soot-covered orc", P, 3 },
  ["A malicious Urughásh is here, keeping the miners in line"] = { "An Urughash overseer", P, 3 },
  ["A fierce boar is here, making grunting noises"] = { "A boar", P, 3 },
  ["A tall troll, its skin crawling with lice and ticks, is roaming around in here"] = { "A smelly troll", D, 3 },
  ["The small fierce-looking bat is hanging from the ceiling, obviously sleeping"] = { "A small bat", P, 4 },
  ["An old, strong cave troll is standing here"] = { "A cave troll", P, 5 },
  ["A large earth troll is digging here, looking for some tasty morsels"] = { "A large earth troll", P, 4 },
  ["Some ugly blow-flies are buzzing around here"] = { "A swarm of blow-flies", P, 3 },
  ["A brown fox is here, looking for some rabbits to chew up"] = { "A brown fox", P, 3 },
  ["The troll cook is here, ready to put anything into her large cauldron"] = { "Edda the cook", P, 3 },
  ["A young and vicious olog-hai eagerly awaits intruders"] = { "A vicious olog-hai", P, 5 },
  ["A huge olog-hai troll is here staring blankly at you"] = { "An olog-hai troll", P, 4 },
  ["Crusher, a huge cave-troll and expert in combat, is here wielding a great club"] = { "Crusher the huge troll", D, 4 },
  ["An infant troll, baring its teeth, snarls here"] = { "A troll infant", P, 2 },
  ["A nasty troll female crouches here, with a feral look in her eyes"] = { "A troll bitch", P, 4 },
  ["A loyal clan troll of the Grinder stands here faithfully"] = { "A grey troll", P, 4 },
  ["Grinder, the expert on all things dark is standing here"] = { "Grinder", D, 1 },
  ["A forest spider is here crawling around"] = { "A forest spider", P, 3 },
  ["A huge, poisonous spider is here"] = { "A huge, poisonous spider", P, 4 },
  ["An ancient fungus smothers the boulders"] = { "An ancient fungus", P, 3 },
  ["Clunker, a big oafish son of a cave-troll is shambling about in here"] = { "Clunker the clumsy troll", D, 8 },
  ["A small vicious black rat squeaks at you for disturbing it"] = { "A vicious rat", P, 5 },
  ["A tiny spider is here, eating a tiny bug"] = { "A tiny spider", P, 3 },
  ["A fallow deer is grazing peacefully here"] = { "A fallow deer", P, 3 },
  ["A wolf spider is here, among the trees"] = { "A wolf spider", P, 3 },
  ["The chief of smugglers is here, planning his next move"] = { "A chief of smugglers", P, 4 },
  ["An experienced husky smuggler is here, conspiring with his cohorts"] = { "A husky smuggler", P, 4 },
  ["A boar cub is playing here, and exploring the wide world"] = { "A boar cub", P, 3 },
  ["A malicious thug is here, threatening you"] = { "A thug", P, 3 },
  ["A sturdy bandit bodyguard stands here, eager to hack you to pieces"] = { "A bandit bodyguard", P, 4 },
  ["A robin is here, carrying small pieces of wood to its nest"] = { "A robin", P, 2 },
  ["A large eagle soars above you"] = { "An eagle", P, 3 },
  ["A sturdy trained horse is standing here"] = { "A trained horse", P, 4 },
  ["A sturdy pack horse is standing here"] = { "A pack horse", P, 4 },
  ["A stocky mountain mule is here, waiting to serve"] = { "A mountain mule", P, 4 },
  ["A domesticated pony, beast of burden to many, stands here"] = { "A pony", P, 3 },
  ["A hairy black spider wraps up a silken package with her hind legs"] = { "A water spider", P, 4 },
  ["A huge, poisonous tarantula extends her legs to you"] = { "A huge tarantula", P, 4 },
  ["A colourful butterfly is fluttering around here"] = { "A butterfly", P, 3 },
  ["A black wolf pads restlessly, looking for its next prey"] = { "A black wolf", P, 3 },
  ["A wolf cub happily plays here"] = { "A wolf cub", P, 3 },
  ["An elk cow gazes coldly at you, chewing on a small branch"] = { "An elk cow", P, 3 },
  ["A tall stag is here, grazing peacefully"] = { "A tall stag", P, 3 },
  ["An old, wise tree with penetrating green eyes stands here"] = { "Treebeard the Ent", D, 8 },
  ["A ruffian is sneaking around here, looking for some mischief to do"] = { "A ruffian", P, 2 },
  ["Bill Ferny is watching you with suspicious eyes"] = { "Bill Ferny", D, 2 },
  ["The mean bandit leader Barbaras grins at you and draws his sword"] = { "Barbaras", D, 5 },
  ["Bathmhûrz the ancient troll lunges at you with iron-nails"] = { "Bathmhûrz the Ancient", D, 3 },
  ["An untrustworthy man is here, eyeing your equipment"] = { "Gahruuk the half-orc", D, 3 },
  ["A huge, black wolf is here, ready to devour"] = { "A huge, black wolf", P, 4 },
  ["A great black and silver wolf is standing here, at the head of the pack"] = { "A pack leader", P, 6 },
  ["The shadowy wight of a bodyguard stands here"] = { "A wight bodyguard", P, 6 },
  ["The shadowy wight of a once noble captain is standing here"] = { "The wight captain", P, 8 },
  ["A huge, horrific spider is prowling here"] = { "A huge, hideous spider", P, 4 },
  ["A newborn spider is here"] = { "A newborn spider", P, 3 },
  ["A brown, long-legged spider swiftly charges at you"] = { "A brown, long-legged spider", P, 4 },
  ["A great brood mother hovers defiantly over her precious offspring"] = { "A great brood mother", D, 4 },
  ["A roe deer is standing here, watching the terrain while chewing the vegetation"] = { "A roe deer", P, 3 },
  ["A dark-haired warrior is here, trying to fulfil his murky tasks"] = { "A dark-haired warrior", P, 3 },
  ["A dark-haired warrior is standing here, eyeing the river"] = { "A dark-haired warrior", P, 3 },
  ["A grouchy uruk is here, lashing his whip"] = { "An orkish slavemaster", P, 3 },
  ["A bald orc is standing here, silent and focused"] = { "A bald orc", P, 3 },
  ["A muscular Morgundul outpost commander stands here"] = { "Throulhuk the Orkish commander", D, 5 },
  ["An easterling veteran dressed in light garments stands sentinel here"] = { "An easterling sentinel", P, 7 },
  ["A beautiful and docile horse is standing here"] = { "A horse", P, 5 },
  ["A jet-black raven caws from its perch with inquisitive eyes"] = { "A jet-black raven", P, 3 },
  ["A man clad in red robes mutters in a foreign tongue"] = { "Rostam the Easterling", D, 6 },
  ["A hideous, feathered beast shrieks as it attacks with frightening speed"] = { "A hideous, feathered beast", P, 4 },
  ["A small boar with big yellow tusks looks eager to fight"] = { "A tusky boar", P, 3 },
  ["A great, wild boar with large tusks is here, ready to charge"] = { "A great, wild boar", P, 4 },
  ["A small grasshopper clings to a blade of grass, ready to spring"] = { "A grasshopper", P, 3 },
  ["A small, red-spotted spider lurks here"] = { "A red-spotted spider", P, 4 },
  ["A black spider crawls here, a shiny red spot visible on its belly"] = { "A black widow", P, 3 },
  ["A grey spider is stalking here, preparing to drain you of life"] = { "A grey spider", D, 3 },
  ["A dark-green spider is here, poison dripping from its fangs"] = { "A horrible, dark-green spider", P, 3 },
  ["A giant, strange looking green fungus is here, ready to devour you in seconds"] = { "A green fungus", P, 6 },
  ["A young orc grips his weapon impatiently, eager to prove himself"] = { "A young, eager Durbûk-hai warrior", P, 3 },
  ["A squat, grizzled orc cracks his whip with trained precision"] = { "A grizzled Durbûk-scarazot", P, 4 },
  ["A gaunt, vicious-looking warg pads towards you, jaws slavering hungrily"] = { "A gaunt, vicious warg", P, 4 },
  ["A scrawny Durbûk-hai orc digs away at a mound of rubble"] = { "A scrawny Durbûk-hai orc", P, 4 },
  ["A Durbûk-hai warrior stands here with a frenzied gleam in his eyes"] = { "A reckless Durbûk-hai warrior", P, 3 },
  ["A very large, hairy man is standing here, examining you carefully"] = { "A very large man", P, 5 },
  ["A very muscular orc with a cruel and dominant gaze in her cold eyes is here"] = { "Lazrria the Orkish Commander", D, 14 },
  ["A dark-skinned man is here, watching everything suspiciously"] = { "Offa the scout", D, 3 },
  ["An orkish wolf-rider is here, riding a brown wolf"] = { "An orkish wolf rider", P, 3 },
  ["A grey wolf is here, snarling aggressively"] = { "A grey wolf", P, 3 },
  ["A grey bird with a bright orange-red belly sits here, singing a melodic tune"] = { "A red-bellied thrush", P, 8 },
  ["A moderately-sized copperhead snake is here"] = { "A copperhead snake", P, 4 },
  ["A sleuthing orc is tracking here, sniffing along the ground"] = { "A sleuthing orc", P, 3 },
  ["A subterranean lizard is here trying to blend with the surroundings"] = { "A subterranean lizard", P, 3 },
  ["Some roots lie here waiting to ensnare weary travellers"] = { "A clump of roots", R, 2 },
  ["Massive roots shift uneasily all around you"] = { "A massive tangle of roots", R, 2 },
  ["A tawny-coated bear is snuffling about"] = { "A tawny-coated bear", P, 3 },
  ["A giant form rustles among the trees"] = { "A forest giant", P, 2 },
  ["A porcupine is waddling around here, its tail full of sharp quills"] = { "A porcupine", P, 2 },
  ["A giant termite is here, crushing skulls and bones"] = { "A giant termite", P, 3 },
  ["A large, loyal falcon is circling above"] = { "A falcon", P, 4 },
  ["A large rabbit looks peacefully at you, ready to dart away"] = { "A large rabbit", P, 3 },
  ["A long-tailed bird watches you from the vegetation"] = { "A wood partridge", P, 3 },
  ["A partridge attempts to hide in the undergrowth"] = { "A partridge", P, 2 },
  ["A woodpecker is here, tapping on a tree"] = { "A woodpecker", P, 2 },
  ["A bass swims here"] = { "A bass", P, 2 },
  ["A salmon swims here"] = { "A salmon", P, 2 },
  ["A brook trout is here, swimming in the current"] = { "A brook trout", P, 3 },
  ["A trout swims here"] = { "A trout", P, 2 },
  ["A sparrow is flapping around on the ground"] = { "A sparrow", P, 2 },
  ["A great horned owl looks cautiously around it"] = { "A great, horned owl", P, 4 },
  ["A swift and agile forest cat moves silently through the vegetation"] = { "A forest cat", P, 6 },
  ["A fat rabbit is here, chewing on some grass"] = { "A fat rabbit", P, 3 },
  ["A rabbit is here eyeing your presence warily"] = { "A cute, bouncing rabbit", P, 2 },
  ["A huge bat is here, emitting piercing squeaks"] = { "A huge bat", P, 3 },
  ["A large black bat flitters near you"] = { "A black-furred bat", P, 4 },
  ["A black crow flies low to the ground here, looking for carrion to eat"] = { "A black crow", P, 3 },
  ["A nightingale is here, chirping a sweet melody"] = { "A nightingale", P, 2 },
  ["A furry, striped raccoon is here, nosing around for some berries or roots"] = { "A raccoon", P, 4 },
  ["A buck runs swiftly from place to place, looking about warily as it grazes"] = { "A swift buck", P, 2 },
  ["A small animal, all covered in spines, snuffles amongst the undergrowth"] = { "A small fat hedgehog", P, 7 },
  ["A rabid rabbit is here, frothing at the mouth"] = { "A rabid rabbit", P, 3 },
  ["A small rabbit glares angrily at you"] = { "A small rabbit", P, 3 },
  ["A badger is here, exploring for food"] = { "A badger", P, 2 },
  ["The mother wolf stands here, protecting her young cubs"] = { "A mother wolf", P, 3 },
  ["A dove rests near one of the flowers"] = { "A dove", P, 2 },
  ["A magpie is flying around looking for some food"] = { "A male magpie", P, 2 },
  ["A coloured game bird is visible in the vegetation, watching you warily"] = { "A pheasant", P, 4 },
  ["The elongated shape of a stoat can be seen darting across the terrain"] = { "A stoat", P, 6 },
  ["A small black bird with red markings on its beak is here"] = { "A moorhen", P, 10 },
  ["A brown furry gopher is here, ready to dive back underground"] = { "A gopher", P, 4 },
  ["A brown toad is here, hunting flies"] = { "A toad", P, 3 },
  ["A large beaver is here, gnawing on a piece of wood"] = { "A beaver", P, 3 },
  ["A crayfish is here, snapping its claws at you"] = { "A crayfish", P, 2 },
  ["A green frog is here, hopping around"] = { "A frog", P, 3 },
  ["A bee flies around here, collecting nectar from the flowers"] = { "A bee", P, 2 },
  ["A brown snake watches you"] = { "A brown snake", P, 3 },
  ["A wild bull seems ready to charge you"] = { "A wild bull", P, 3 },
  ["A small brown snake is slithering around here"] = { "A brown snake", P, 4 },
  ["A fat carp swims here"] = { "A carp", P, 3 },
  ["A dun-coloured grouse is sitting still in the heather"] = { "A red grouse", P, 3 },
  ["A harsh orkish veteran is here, heavily scarred but ready to fight"] = { "A harsh orkish veteran", P, 4 },
  ["An orkish captain is here, gleefully whipping his troops into obedience"] = { "A cruel orkish captain", P, 3 },
  ["A large brown bull stands here, hitched to an iron-bound wagon"] = { "A bull", P, 4 },
  ["A dread guardsman of Dol Guldur is here, riding a trained horse"] = { "A dread guardsman of Dol Guldur", P, 6 },
  ["An easterling veteran stands here, guarding the wagon"] = { "An easterling sentinel", P, 3 },
  ["An Uruk-rogtar of the Morgundul is on patrol here"] = { "A Morgundul Uruk-rogtar", P, 2 },
  ["Adrâgor the Númenórean, commander of the camp, is standing here"] = { "Adrâgor the commander", D, 4 },
  ["A Morgundul orc guard is here, relaxing off-duty"] = { "A Morgundul orc guard", P, 4 },
  ["A dreadful warg, covered in matted fur, sniffs the ground for prey"] = { "A dreadful warg", P, 3 },
  ["A warg whelp is here trying to look dangerous"] = { "A warg whelp", P, 3 },
  ["A female orc stands glaring at you"] = { "A female orc", P, 3 },
  ["A dark-skinned orc is dancing around the fire"] = { "A dark-skinned orc", P, 3 },
  ["A mottled snake is sneaking here, ready to sink its fangs into flesh"] = { "A mottled snake", P, 3 },
  ["A black snake, with red markings, is lying here"] = { "A black snake", P, 3 },
  ["An orkish wolf-rider is here, warily looking at his surroundings"] = { "An orkish wolf-rider", P, 3 },
  ["A large brown wolf stands here, its teeth partly bared"] = { "A brown wolf", P, 4 },
  ["A diamond-back rattlesnake is coiled here, ready to strike"] = { "A rattlesnake", P, 3 },
  ["A pair of tiny eyes gleam at you from the shadows"] = { "A packrat", R, 5 },
  ["A young ill-tempered stone giant is here, muttering incoherently"] = { "A young ill-tempered stone giant", P, 5 },
  ["An orc apprentice is here, going about his duties"] = { "An orc apprentice", P, 3 },
  ["Thrakghash of the Mordor Flame waits here, ready to teach his malevolent magic"] = { "Thrakghash of the Mordor Flame", D, 5 },
  ["A pitiful man, unwashed and dressed in rags, toils endlessly"] = { "A pitiful slave", P, 8 },
  ["A highwayman is here, grinning evilly at you"] = { "A highwayman", P, 2 },
  ["A female robber glares challengingly at you"] = { "Thena Shadowstalker", D, 3 },
  ["A tall blackclad man pierces you with eyes cold as steel"] = { "Morthan Blacksoul", D, 4 },
  ["A slim young woman glares at you suspiciously"] = { "A diminutive rogue", P, 4 },
  ["A sturdy guardsman is here, his weapon at the ready"] = { "Malardil's guardsman", P, 3 },
  ["A simple servant goes quietly about her duties"] = { "A servant", P, 3 },
  ["A cook is standing here, busy with her pots and pans"] = { "A woman cook", P, 2 },
  ["A scrawny, yet muscular man skulks around"] = { "A rogue", P, 5 },
  ["An old, yet beautiful woman looks piercingly at you"] = { "A gypsy woman", P, 5 },
  ["A tall, lean man follows your every move with his eyes"] = { "Malardil", D, 4 },
  ["A slender but well-muscled man seems to melt into the shadows"] = { "An experienced assassin", P, 5 },
  ["A wiry smuggler is here, attempting to avoid being seen"] = { "A wiry smuggler", P, 3 },
  ["A brown-skinned man is standing here"] = { "A brown-skinned man", P, 3 },
  ["An assassin is here looking for fresh blood and shining coins"] = { "An assassin", P, 2 },
  ["The Ohurk-uai orc chief is here, leading his tribe"] = { "The Ohurk-uai chief", D, 4 },
  ["A mean looking robber is here, demanding money from you"] = { "A robber", P, 4 },
  ["A brown donkey watches the surroundings, perhaps looking for a chance to graze"] = { "A brown donkey", P, 3 },
  ["A restless rabbit bounces around"] = { "A bouncing rabbit", P, 3 },
  ["A soft-skinned female deer wanders peacefully among the grass"] = { "A female deer", P, 4 },
  ["A tree-snake lies wrapped around one of the tree branches"] = { "A tree-snake", P, 2 },
  ["A reddish fawn romps harmlessly among the tender grass shoots"] = { "A red-coated fawn", P, 3 },
  ["A great male deer with reddish hair and twisted antlers stands here proudly"] = { "A large red deer", P, 4 },
  ["A bear is here, covered with coarse black fur"] = { "A black bear", P, 2 },
  ["The garden snake slithers harmlessly here"] = { "A garden snake", P, 3 },
  ["A strange bat-like creature is flitting around"] = { "A cavern-wing", P, 4 },
  ["A brigand, looking at your nice purse, is sneaking here"] = { "A mean brigand", P, 2 },
  ["A thief is here looking for some stranger to rob"] = { "A thief", P, 2 },
  ["A huge, old and hoary willow tree looms above you"] = { "Old Man Willow", D, 6 },
  ["A female Ohurk-uai cook is here, planning to prepare the next meal"] = { "An Ohurk-uai cook", P, 4 },
  ["The spirit of a mighty warrior greets you with an evil laughter"] = { "An undead chieftain", P, 6 },
  ["A powerful, squat orc captain eyes you with contempt and scorn"] = { "Vurgl the Orkish captain", D, 5 },
  ["A hateful wraith glares at you and groans in torment"] = { "A trapped wraith", P, 3 },
  ["A moaning ghost advances towards you, shimmering with a pale light"] = { "A ghost", P, 3 },
  ["A deft, young orc monitors the area, ready to attack any enemy"] = { "A green-cloaked Durbûk-hai archer", P, 4 },
  ["A dreadful hill troll with a skin full of warts is standing here"] = { "A warty troll", P, 4 },
  ["A black raven flies in the sky searching for flesh to prey upon"] = { "A black raven", P, 3 },
  ["A brown cow is here, contemplating a higher reality whilst chewing slowly"] = { "A brown cow", P, 3 },
  ["A barn-owl is here, looking for easy prey"] = { "A barn-owl", P, 2 },
  ["A duck is here, quacking happily"] = { "A duck", P, 2 },
  ["A shadowy haunt floats here, oblivious to your presence"] = { "A haunt", P, 3 },
  ["A wicked black witch glares at you with mad eyes"] = { "The witch", D, 4 },
  ["A swarthy, little bandit advances forward"] = { "A swarthy bandit", P, 4 },
  ["A worm is here slithering around"] = { "A worm", P, 2 },
  ["A large, dangerous-looking green snake is coiled up here"] = { "A green snake", P, 5 },
  ["Big John is swiftly moving around, hiding in the shadows"] = { "Big John, the chief brigand", D, 2 },
  ["A grey wolf is here, thin from starvation"] = { "A starved grey wolf", P, 3 },
  ["A wild sheep with a short, greyish coat grazes here"] = { "A sheep", P, 3 },
  ["A powerful ram stands here, poised and alert"] = { "A ram", P, 3 },
  ["A guard is here looking for someone to abuse"] = { "A guard", P, 2 },
  ["A guard is here looking suspiciously at everyone passing"] = { "A guard", P, 2 },
  ["A surly secretary is sitting at the desk"] = { "A secretary", P, 3 },
  ["A very large lion with a dark mane watches you lazily"] = { "A dark-maned lion", P, 4 },
  ["A powerful lioness is barely visible in the grass"] = { "A powerful lioness", P, 3 },
  ["A lion cub is here hunting grasshoppers"] = { "A fuzzy little lion cub", P, 3 },
  ["A large wild horse is here, protecting his herd"] = { "A wild stallion", P, 4 },
  ["A wild mare is watching you warily"] = { "A wild mare", P, 3 },
  ["A young filly is just learning to walk"] = { "A young filly", P, 3 },
  ["A young colt is frolicking playfully"] = { "A young colt", P, 3 },
  ["A woolly sheep is grazing here"] = { "A sheep", P, 3 },
  ["A cute rabbit is here"] = { "A cute rabbit", P, 3 },
  ["A black snake hurries towards you with sly intentions"] = { "A black snake", P, 3 },
  ["A large brown snake with black patches is coiled here"] = { "A dreadful snake", P, 4 },
  ["A cute, fluffy owlet is waiting here for its mother to return with food"] = { "A fluffy owlet", P, 4 },
  ["A shady man looks commanding"] = { "A bandit leader", D, 3 },
  ["A spirit floats towards you and howls with an evil laughter"] = { "A spirit", P, 2 },
  ["A shade is here, shrouded in an inky blackness"] = { "A shade", P, 2 },
  ["A goat is here, grazing in the hills"] = { "A goat", P, 2 },
  ["A young goat playfully charges and hops away"] = { "A kid", P, 4 },
  ["A giant forest troll, limber and strong, protects the burrow"] = { "Urgorl", D, 7 },
  ["The lowly bent shape of a forest troll stands before you"] = { "A gnarled forest troll", P, 8 },
  ["A snaga orc stares at you with interest"] = { "A snaga orc", P, 3 },
  ["A bloodthirsty orc stands here, hell-bent on battle"] = { "A bloodthirsty orc", P, 3 },
  ["An aged man with a cadaverous appearance is here"] = { "The liche", D, 7 },
  ["A big cavebear is padding around here"] = { "A cavebear", D, 3 },
  ["A shadow suddenly leaves its place on the wall, trying to reach your neck"] = { "A shadow", P, 2 },
  ["A sly cat prepares to pounce from its grassy hiding place"] = { "A sly grass cat", P, 3 },
  ["A cow stands here, chewing her cud"] = { "A cow", P, 2 },
  ["A field mouse noses about hungrily, searching for food"] = { "A field mouse", P, 3 },
  ["A small black cricket is here, chirping loudly"] = { "A cricket", P, 4 },
  ["A tiny firefly flits around the foliage"] = { "A firefly", P, 3 },
  ["An officer of the Urughásh stands here with great pride"] = { "An Urughásh officer", P, 2 },
  ["An old man, swathed in a great light-coloured cloak, is standing here"] = { "An old man", D, 3 },
  ["A lone hawk soars high above you"] = { "A hawk", P, 3 },
  ["A thin, crippled deer looks around timidly"] = { "A crippled deer", P, 4 },
  ["A young mountain lion is here"] = { "A young mountain lion", P, 4 },
  ["A mountain lion eyes you closely and prepares to pounce for his next meal"] = { "A mountain lion", P, 3 },
  ["A mountain lioness pads quietly through the terrain"] = { "A mountain lioness", P, 3 },
  ["A wild dog bares his yellow fangs at you"] = { "A wild dog", P, 3 },
  ["A black and white skunk is scuttling about here, searching for food"] = { "A skunk", P, 5 },
  ["A gigantic weasel glares at you"] = { "A weasel", P, 3 },
  ["An opossum stands here, sniffing around the ground"] = { "An opossum", P, 2 },
  ["A mole is looking out of a mole-hill here"] = { "A mole", P, 2 },
  ["An angry bee is here, collecting nectar from all the flowers of the garden"] = { "An angry bee", P, 3 },
  ["A renegade uruk is here, dirty and ragged"] = { "A dirty uruk", P, 3 },
  ["A bulky cave troll is here, looking like a massive pile of stone"] = { "A bulky cave troll", P, 4 },
  ["A blue dragonfly is circling around"] = { "A blue dragonfly", P, 3 },
  ["A big, brown, angry-looking bear is here"] = { "A brown bear", P, 5 },
  ["An elf, clad in the garments of a woodsman, moves stealthily among the trees"] = { "An elven huntsman", P, 9 },
  ["A long slender eel glides along the water, its body coiled to strike"] = { "An eel", P, 4 },
  ["A grey snake slides along the water"] = { "A watersnake", P, 3 },
  ["A grizzly cub is here, snarling loudly"] = { "A grizzly cub", P, 3 },
  ["A huge grizzly bear is here, roaming the wild"] = { "A grizzly bear", P, 4 },
  ["Rikurr, the disingenuous captain is here, observing and commanding his men"] = { "Rikurr", D, 1 },
  ["A mewlip is here, faintly wailing at you"] = { "A mewlip", P, 2 },
  ["A spirit floats around, making strange magical gestures"] = { "A spirit", P, 2 },
  ["A dark intangible shadow turns to face you"] = { "A dark wraith", P, 4 },
  ["A bear cub is here, looking around for something to play with"] = { "A bear cub", P, 3 },
  ["Bulgôtha, the Captain of the Zaugurz outpost, is standing here"] = { "Bulgôtha", D, 1 },
  ["A swallow flies high above the ground"] = { "A swallow", P, 2 },
  ["Some black, oozing vines reach out from the choked canopy towards you"] = { "A coil of oozing vines", P, 4 },
  ["A tangled creeper writhes its shoots between the forest's roots upwards"] = { "A tangled creeper", P, 3 },
  ["An elaborate red flower sits within a dark mass of briars"] = { "A mass of briars", P, 4 },
  ["A sand viper is slithering here on the ground"] = { "A sand viper", P, 3 },
  ["The wicked undergrowth rustles malevolently, shifting and widening"] = { "An entangled growth", P, 3 },
  ["A green-skinned hill troll is pacing around with a nervous zeal"] = { "A green-skinned troll", P, 4 },
  ["A massive hill troll is here, sniffing the air for the scent of enemies"] = { "A massive hill troll", P, 4 },
  ["A small, dense tangle of roots covers the ground"] = { "A tangle of roots", R, 6 },
  ["A deeply black, oddly shaped cloud of mist has gathered here"] = { "A black, freezing mist", P, 8 },
  ["A grim-looking wolverine growls threateningly"] = { "A grim wolverine", P, 3 },
  ["A black, leather-scaled reptile glances around with gleaming eyes"] = { "A black, scaled reptile", P, 4 },
  ["A moss-covered beast advances, its movement twitchy and erratic"] = { "A moss-covered beast", P, 3 },
  ["A monstrous grey, putrid fungus is growing on a large oak here"] = { "A grey, putrid fungus", P, 5 },
  ["The undergrowth rustles, shifts and widens"] = { "A malicious undergrowth", P, 2 },
  ["A swift carnivore bustles around"] = { "A black ferret", P, 3 },
  ["A small centipede is here scurrying about"] = { "A small centipede", P, 3 },
  ["A large cockroach is crawling on the ground"] = { "A cockroach", P, 3 },
  ["A huge, hungry-looking rat is here"] = { "A great rat", P, 4 },
  ["A hideous mottled spider advances with startling speed"] = { "A hideous mottled spider", P, 4 },
  ["A menacing mottled spider is here, lurking in the shadows"] = { "A menacing mottled spider", P, 4 },
  ["A spiderling skitters about, looking for small prey to devour"] = { "A mottled spiderling", P, 2 },
  ["A mottled spider crouches in the shadows, watching over her young"] = { "A mottled spider matriarch", P, 3 },
  ["A tiny, harmless centipede is here"] = { "A tiny centipede", P, 4 },
  ["A small rat runs about, oblivious to your presence"] = { "A small rat", P, 3 },
  ["A giant rat patters against you, squeaking maliciously"] = { "A giant rat", P, 3 },
  ["A dread guardsman of Dol Guldur is here, compelling the slaves to work harder"] = { "A dread guardsman of Dol Guldur", P, 6 },
  ["A vigilant bat-like creature skulks through the tunnels, alert for intruders"] = { "A vigilant bat-like creature", P, 4 },
  ["A cold shroud of dark grey mist covers the ground"] = { "A grey cloud of mist", P, 7 },
  ["A large pale fish with bulbous eyes is swimming here"] = { "A pale fish", P, 4 },
  ["A monstrous grey, putrid fungus is here entirely enveloping a large boulder"] = { "A monstrous grey, putrid fungus", P, 5 },
  ["A massive tangle of roots grows down from above, covering the walls and floor"] = { "A massive tangle of roots", R, 5 },
  ["A thick tangle of vines whip around from cracks in the earthen dome above"] = { "A thick tangle of vines", P, 5 },
  ["A goblin warrior is threatening to start a fight here"] = { "A goblin warrior", P, 3 },
  ["A nasty goblin is here walking around"] = { "A goblin", P, 3 },
  ["A large, squat goblin gestures with a black knife"] = { "A goblin shaman", P, 4 },
  ["A huge fierce goblin is here, dark as evil itself"] = { "A goblin leader", D, 4 },
  ["A well-fed cow stands here chewing her cud listlessly"] = { "A well-fed cow", P, 3 },
  ["A swarm of midges is here, humming around you"] = { "A midge swarm", P, 2 },
  ["A Beorning herder is standing here, watching around"] = { "A Beorning herder", P, 3 },
  ["A large green shrub grows in the middle of a large pool of mud"] = { "A large green shrub", P, 4 },
  ["An emaciated warg, half-mad with hunger, is here"] = { "A starving warg", P, 3 },
  ["A seasoned orkish scout is keeping an eye out for any intruders"] = { "A seasoned Durbûk-hai scout", P, 4 },
  ["A deft Durbûk-hai slinger lurks in the shadows"] = { "A deft Durbûk-hai slinger", P, 4 },
  ["A wiry elf is treading quietly here"] = { "Coubhel the elven wanderer", D, 3 },
  ["An elven scout stands here, blending in with the background"] = { "An elven scout", P, 3 },
  ["An ibex is watching you from afar"] = { "An ibex", P, 2 },
  ["A brown stag looks around with big, startled eyes"] = { "A brown stag", P, 3 },
  ["A large, black butterfly is fluttering about erratically"] = { "A black emperor butterfly", P, 4 },
  ["A huge black bear, saliva frothing from its jaws, bellows a challenge"] = { "A huge, frothing bear", P, 4 },
  ["A swarm of mosquitoes is here, humming around you"] = { "A mosquito swarm", P, 2 },
  ["A ghostly-white stag eyes its surroundings cautiously"] = { "A white stag", P, 3 },
  ["A dark wisent struggles to move through the morass"] = { "A dark wisent", P, 3 },
  ["A black squirrel peers down from the branches of the trees"] = { "A black squirrel", P, 3 },
  ["Kral the Zaugurz scout surveys the forest far below"] = { "Kral the Zaugurz scout", D, 4 },
  ["A small bat is standing here"] = { "A small bat", P, 3 },
  ["A scrawny Durbûk-hai orc struggles to clear a rockslide"] = { "A scrawny Durbûk-hai orc", P, 4 },
  ["A large hawk-like bird is here overlooking its territory"] = { "A scavenging buzzard", P, 4 },
  ["A lithe, devious-looking Durbûk-hai shaman is standing here"] = { "A cunning Durbûk-hai shaman", P, 5 },
  ["A mugger lurks here, looking for a stranger to rob"] = { "A mugger", P, 2 },
  ["Cinard the Master Thief is here looking furious"] = { "Cinard the Master Thief", D, 4 },
  ["A crazed dwarf is here, drooling down his beard"] = { "A crazed dwarf", D, 3 },
  ["A furtive footpad is here waiting for his prey"] = { "A furtive footpad", P, 3 },
  ["A sleek silver ferret darts from place to place"] = { "A silver ferret", P, 4 },
}

start()
